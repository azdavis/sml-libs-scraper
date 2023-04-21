import { load, type CheerioAPI, type SelectorType } from "cheerio";
import type { File, Info, Merged, MergedInfoMap, MultiDef } from "./types.js";
import {
  assert,
  breakSmlAcrossLines,
  fetchText,
  getCleanText,
  getNoDupeNoHashUrls,
  mkSmlFile,
  readHtmlFiles,
  smlStarter,
  writeSmlFiles,
} from "./util.js";

export interface Args {
  libName: string;
  rootUrl: string;
  index: string;
  linkSelector: SelectorType;
}

async function getFiles(args: Args): Promise<File[]> {
  const $ = load(await fetchText(`${args.rootUrl}/${args.index}`));
  const urls = getNoDupeNoHashUrls($(args.linkSelector));
  const ps = Array.from(urls).map(async (name) => {
    const text = await fetchText(`${args.rootUrl}/${name}`);
    return { name, text };
  });
  return Promise.all(ps);
}

function processFiles(files: File[]): MergedInfoMap {
  const ret: MergedInfoMap = new Map();
  for (const file of files) {
    assert(!ret.has(file.name));
    const info = getInfo(file.name, load(file.text));
    const merged = mergeDecsAndDefs(info.specs, info.defs);
    const hasNoSpecs = merged.specs.length === 0;
    const hasNoSignature = info.signatureName === null;
    assert(hasNoSpecs === hasNoSignature);
    ret.set(file.name, {
      signature:
        info.signatureName === null
          ? null
          : { name: info.signatureName, specs: merged.specs },
      structsAndFunctors: info.structsAndFunctors,
      comment: info.comment,
      extra: merged.extra,
    });
  }
  return ret;
}

function getInfo(name: string, $: CheerioAPI): Info {
  const headers = $("h4").toArray();
  const synopsisHeader = headers.find((x) => getCleanText($(x)) == "Synopsis");
  const comment: string[] = [];
  let signatureName: string | null = null;
  let structsAndFunctors: string[] = [];
  if (synopsisHeader === undefined) {
    console.warn(`${name}: missing synopsis`);
  } else {
    let cur = $(synopsisHeader).next();
    assert(cur.length === 1 && cur.is("blockquote"));
    const synopsis: string[] = [];
    breakSmlAcrossLines(synopsis, getCleanText(cur));
    const fst = synopsis.shift();
    if (fst === undefined) {
      throw new Error("empty synopsis");
    }
    if (fst.split(" ")[0] === "signature") {
      signatureName = fst;
    } else {
      console.warn(`${name}: missing signature in synopsis`);
    }
    structsAndFunctors = synopsis;
    for (;;) {
      cur = cur.next();
      assert(cur.length === 1);
      if (cur.is("p")) {
        const cleaned = getCleanText(cur);
        if (cleaned.length !== 0) {
          comment.push(cleaned);
        }
      } else if (cur.is("hr")) {
        break;
      } else {
        console.warn(`${name}: non-p non-hr in synopsis, ignoring`);
      }
    }
  }
  const interfaceHeader = headers.find(
    (x) => getCleanText($(x)) == "Interface",
  );
  let specs: string[] = [];
  if (interfaceHeader === undefined) {
    console.warn(`${name}: missing interface`);
  } else {
    const elem = $(interfaceHeader).next();
    assert(elem.length === 1 && elem.is("blockquote"));
    breakSmlAcrossLines(specs, getCleanText(elem));
  }
  const descriptionHeader = headers.find(
    (x) => getCleanText($(x)) == "Description",
  );
  const defs: MultiDef[] = [];
  if (descriptionHeader === undefined) {
    console.warn(`${name}: missing description`);
  } else {
    const descriptionDl = $(descriptionHeader).next();
    assert(descriptionDl.length === 1 && descriptionDl.is("dl"));
    let items: string[] = [];
    for (const ch of descriptionDl.children().toArray()) {
      const child = $(ch);
      if (child.is("dt")) {
        const t = getCleanText(child);
        if (t.length !== 0) {
          items.push(t);
        }
      } else if (child.is("dd")) {
        const t = getCleanText(child);
        defs.push({ items, comment: t.length === 0 ? null : t });
        items = [];
      } else {
        console.warn(`${name}: non-dt non-dd child in description, ignoring`);
      }
    }
    assert(items.length === 0);
  }
  return { signatureName, structsAndFunctors, comment, specs, defs };
}

function getName(s: string): string {
  const name = s
    .split(" ")
    .find((x) => !smlStarter.has(x) && !x.startsWith("'"));
  if (name === undefined) {
    throw new Error(`couldn't get name for: ${s}`);
  }
  return name;
}

function mergeDecsAndDefs(rawSpecs: string[], multiDefs: MultiDef[]): Merged {
  const map = new Map<string, string>();
  const duplicate = new Map<string, string>();
  const used = new Set<string>();
  const usedMultiple = new Set<string>();
  for (const def of multiDefs) {
    assert(def.items.length !== 0);
    const fst = def.items[0];
    const fstName = getName(fst);
    const existingEntry = map.get(fstName);
    if (existingEntry) {
      duplicate.set(fstName, existingEntry);
    }
    if (def.items.length === 1) {
      let comment: string | null;
      if (smlStarter.has(fst.split(" ")[0])) {
        comment = def.comment;
      } else {
        comment =
          def.items[0] + (def.comment === null ? "" : " " + def.comment);
      }
      if (comment !== null) {
        map.set(fstName, comment);
      }
    } else {
      if (def.comment !== null) {
        map.set(fstName, def.comment);
      }
      for (let i = 1; i < def.items.length; i++) {
        const name = getName(def.items[i]);
        map.set(name, `See ${fstName}.`);
      }
    }
  }
  const specs = rawSpecs.map((def) => {
    const name = getName(def);
    const val = map.get(name);
    if (used.has(name)) {
      usedMultiple.add(name);
    }
    used.add(name);
    return { def, comment: val === undefined ? null : val };
  });
  for (const k of used.values()) {
    if (used.has(k)) {
      map.delete(k);
    }
  }
  return { specs, extra: { unused: map, duplicate, usedMultiple } };
}

export async function stdBasisLike(args: Args) {
  const files = await readHtmlFiles(args.libName, () => getFiles(args));
  const processed = Array.from(processFiles(files).entries());
  const newFiles = processed.map(([name, val]) => {
    let lines: string[] = [];
    mkSmlFile(lines, name, val);
    return { name, text: lines.join("\n") };
  });
  writeSmlFiles(args.libName, newFiles);
}

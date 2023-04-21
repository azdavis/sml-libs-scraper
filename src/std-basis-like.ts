import { load, type CheerioAPI, type SelectorType } from "cheerio";
import type {
  File,
  Info,
  Merged,
  MergedInfo,
  MergedInfoMap,
  MultiDef,
} from "./types.js";
import {
  assert,
  breakSmlAcrossLines,
  emitComments,
  fetchText,
  getCleanText,
  getNoDupeNoHashUrls,
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
    ret.set(file.name, {
      signatureName: info.signatureName,
      otherNames: info.otherNames,
      comment: info.comment,
      defs: merged.defs,
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
  let otherNames: string[] = [];
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
    otherNames = synopsis;
    for (;;) {
      cur = cur.next();
      assert(cur.length === 1);
      if (cur.is("p")) {
        comment.push(getCleanText(cur));
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
        defs.push({ items, comment: getCleanText(child) });
        items = [];
      } else {
        console.warn(`${name}: non-dt non-dd child in description, ignoring`);
      }
    }
    assert(items.length === 0);
  }
  return { signatureName, otherNames, comment, specs, defs };
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

function mergeDecsAndDefs(specs: string[], multiDefs: MultiDef[]): Merged {
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
      let comment: string;
      if (smlStarter.has(fst.split(" ")[0])) {
        comment = def.comment;
      } else {
        comment = def.items[0] + " " + def.comment;
      }
      map.set(fstName, comment);
    } else {
      map.set(fstName, def.comment);
      for (let i = 1; i < def.items.length; i++) {
        const name = getName(def.items[i]);
        map.set(name, `See ${fstName}.`);
      }
    }
  }
  const defs = specs.map((spec) => {
    const name = getName(spec);
    const val = map.get(name);
    if (used.has(name)) {
      usedMultiple.add(name);
    }
    used.add(name);
    return { spec, comment: val === undefined ? null : val };
  });
  for (const k of used.values()) {
    if (used.has(k)) {
      map.delete(k);
    }
  }
  return { defs, extra: { unused: map, duplicate, usedMultiple } };
}

const maxLineWidth = 100;

// mutates lines to add the comment indented with indent.
function writeComment(lines: string[], indent: string, paragraphs: string[]) {
  if (!emitComments) {
    return;
  }
  const lineStart = indent + " *";
  lines.push(indent + "(*!");
  for (let i = 0; i < paragraphs.length; i++) {
    let cur = lineStart;
    const paragraph = paragraphs[i];
    for (const word of paragraph.split(" ")) {
      const toAdd = " " + word;
      if (cur.length + toAdd.length > maxLineWidth) {
        lines.push(cur);
        cur = lineStart + toAdd;
      } else {
        cur += toAdd;
      }
    }
    lines.push(cur);
    if (i + 1 !== paragraphs.length) {
      lines.push("");
    }
  }
  lines.push(indent + " *)");
}

const indentStr = "  ";
const whereType = "where type";

function splitWhereType(lines: string[], indent: string, s: string) {
  const parts = s.split(whereType);
  const fst = parts.shift();
  if (fst === undefined) {
    throw new Error(`splitting on ${whereType} yielded []`);
  }
  const fstTrim = fst.trim();
  lines.push(indent + fstTrim);
  for (const wt of parts) {
    lines.push(indent + indentStr + whereType + " " + wt.trim());
  }
}

function indent(n: number): string {
  return Array(n).fill(indentStr).join("");
}

function mkSmlFile(lines: string[], name: string, info: MergedInfo) {
  writeComment(lines, "", info.comment);
  if (info.signatureName === null) {
    if (info.defs.length !== 0) {
      console.warn(`${name}: no signature name but yes defs`);
    }
  } else {
    lines.push(info.signatureName + " = sig");
    let level = 1;
    for (const def of info.defs) {
      if (def.comment !== null) {
        writeComment(lines, indent(level), [def.comment]);
      }
      const trimSpec = def.spec.trim();
      if (trimSpec.endsWith("end")) {
        level -= 1;
      }
      splitWhereType(lines, indent(level), def.spec);
      if (trimSpec.endsWith(": sig")) {
        level += 1;
      }
    }
    lines.push("end");
  }
  lines.push("");
  for (const other of info.otherNames) {
    splitWhereType(lines, "", other + " = struct end");
  }
  if (info.otherNames.length !== 0) {
    lines.push("");
  }
  if (info.extra.unused.size !== 0) {
    console.warn(`${name}: unused:`, info.extra.unused);
  }
  if (info.extra.duplicate.size !== 0) {
    console.warn(`${name}: duplicate:`, info.extra.duplicate);
  }
  if (info.extra.usedMultiple.size !== 0) {
    console.warn(`${name}: used multiple times:`, info.extra.usedMultiple);
  }
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

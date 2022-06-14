import { Cheerio, load, type CheerioAPI, type Element } from "cheerio";
import { access, mkdir, readdir, readFile, writeFile } from "fs/promises";
import fetch from "node-fetch";
import path from "path";

const EMIT_COMMENTS = false;

function assert(x: boolean) {
  if (!x) {
    throw new Error("assert failed");
  }
}

function filterMap<T, U>(f: (x: T) => U | undefined, xs: T[]): U[] {
  const ret = [];
  for (const x of xs) {
    const res = f(x);
    if (res !== undefined) {
      ret.push(res);
    }
  }
  return ret;
}

function id<T>(x: T): T {
  return x;
}

const rootUrl = "https://smlfamily.github.io/Basis";
const htmlOut = "html";

async function fetchAndWriteFiles(): Promise<File[]> {
  const resp = await fetch(`${rootUrl}/manpages.html`);
  const text = await resp.text();
  const $ = load(text);
  const urls = filterMap(
    id,
    $("h4 a")
      .toArray()
      .map((x) => x.attribs["href"]),
  );
  await mkdir(htmlOut, { recursive: true });
  return Promise.all(
    urls.map(async (name) => {
      const resp = await fetch(`${rootUrl}/${name}`);
      const text = await resp.text();
      await writeFile(path.join(htmlOut, name), text);
      return { name, text };
    }),
  );
}

interface File {
  name: string;
  text: string;
}

type MergedInfoMap = Map<string, MergedInfo>;

function processFiles(files: File[]): MergedInfoMap {
  const ret: MergedInfoMap = new Map();
  for (const file of files) {
    const name = file.name.replace(/\.html$/, "");
    assert(!ret.has(name));
    const info = getInfo(file.name, load(file.text));
    const merged = mergeDecsAndDefs(info.specs, info.defs);
    ret.set(name, {
      signatureName: info.signatureName,
      otherNames: info.otherNames,
      comment: info.comment,
      defs: merged.defs,
      unused: merged.unused,
    });
  }
  return ret;
}

interface MultiDef {
  items: string[];
  comment: string;
}

interface Info {
  signatureName: string | null;
  otherNames: string[];
  comment: string[];
  specs: string[];
  defs: MultiDef[];
}

function getCleanText(x: Cheerio<Element>): string {
  // \s includes regular space, non-breaking space, newline, and others
  return x.text().trim().replaceAll(/\s+/g, " ");
}

const starter = new Set([
  "type",
  "eqtype",
  "datatype",
  "exception",
  "val",
  "structure",
  "signature",
  "functor",
  "include",
]);

const precedesType = new Set(["where", "and", "sharing"]);

function breakSmlAcrossLines(text: string): string[] {
  const ret: string[] = [];
  const tokens = text.split(" ");
  let cur: string[] = [];
  let prev: string | null = null;
  for (const token of tokens) {
    // hack to not split on things like 'where type'
    if (
      starter.has(token) &&
      (token !== "type" || prev === null || !precedesType.has(prev))
    ) {
      if (cur.length !== 0) {
        ret.push(cur.join(" "));
      }
      cur = [token];
    } else {
      cur.push(token);
    }
    prev = token;
  }
  ret.push(cur.join(" "));
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
    const synopsis = breakSmlAcrossLines(getCleanText(cur));
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
    specs = breakSmlAcrossLines(getCleanText(elem));
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

interface MergedInfo {
  signatureName: string | null;
  otherNames: string[];
  comment: string[];
  defs: Def[];
  unused: Map<string, string>;
}

interface Def {
  spec: string;
  comment: string | null;
}

function getName(s: string): string {
  const name = s.split(" ").find((x) => !starter.has(x) && !x.startsWith("'"));
  if (name === undefined) {
    throw new Error(`couldn't get name for: ${s}`);
  }
  return name;
}

interface Merged {
  defs: Def[];
  unused: Map<string, string>;
}

function mergeDecsAndDefs(specs: string[], multiDefs: MultiDef[]): Merged {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const def of multiDefs) {
    assert(def.items.length !== 0);
    const fst = def.items[0];
    const fstName = getName(fst);
    if (def.items.length === 1) {
      let comment: string;
      if (starter.has(fst.split(" ")[0])) {
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
    used.add(name);
    return { spec, comment: val === undefined ? null : val };
  });
  for (const k of used.values()) {
    if (used.has(k)) {
      map.delete(k);
    }
  }
  return { defs, unused: map };
}

async function getFilesFromDir(): Promise<File[]> {
  const fileNames = await readdir(htmlOut);
  return Promise.all(
    fileNames.map((name) =>
      readFile(path.join(htmlOut, name)).then((text) => ({
        name,
        text: text.toString(),
      })),
    ),
  );
}

const MAX_LINE_WIDTH = 100;
// mutates lines to add the comment indented with indent.
function writeComment(lines: string[], indent: string, paragraphs: string[]) {
  if (!EMIT_COMMENTS) {
    return;
  }
  lines.push(indent + "(*!");
  for (let i = 0; i < paragraphs.length; i++) {
    let cur = indent;
    const paragraph = paragraphs[i];
    for (const word of paragraph.split(" ")) {
      const toAdd = (cur === indent ? "" : " ") + word;
      if (cur.length + toAdd.length > MAX_LINE_WIDTH) {
        lines.push(cur);
        cur = indent + word;
      } else {
        cur += toAdd;
      }
    }
    lines.push(cur);
    if (i + 1 !== paragraphs.length) {
      lines.push("");
    }
  }
  lines.push(indent + "!*)");
}

const INDENT = "  ";
const WHERE_TYPE = "where type";

function splitWhereType(lines: string[], indent: string, s: string) {
  const parts = s.split(WHERE_TYPE);
  const fst = parts.shift();
  if (fst === undefined) {
    throw new Error(`splitting on ${WHERE_TYPE} yielded []`);
  }
  lines.push(indent + fst.trim());
  for (const wt of parts) {
    lines.push(indent + INDENT + WHERE_TYPE + " " + wt.trim());
  }
}

function mkSmlFile(lines: string[], name: string, info: MergedInfo) {
  writeComment(lines, "", info.comment);
  if (info.signatureName === null) {
    if (info.defs.length !== 0) {
      console.warn(`${name}: no signature name but yes defs`);
    }
  } else {
    lines.push(info.signatureName + " = sig");
    for (const def of info.defs) {
      if (def.comment !== null) {
        writeComment(lines, INDENT, [def.comment]);
      }
      splitWhereType(lines, INDENT, def.spec);
    }
    lines.push("end");
  }
  lines.push("");
  for (const other of info.otherNames) {
    splitWhereType(lines, "", other + " = struct end");
  }
  if (info.unused.size !== 0) {
    console.warn(`${name}: unused:`, info.unused);
  }
}

const smlOut = "sml";

async function main() {
  try {
    await access(htmlOut);
  } catch {
    await fetchAndWriteFiles();
  }
  const files = await getFilesFromDir();
  const map = processFiles(files);
  await mkdir(smlOut, { recursive: true });
  for (const [name, val] of map.entries()) {
    let lines: string[] = [];
    mkSmlFile(lines, name, val);
    await writeFile(path.join(smlOut, name + ".sml"), lines.join("\n"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { Cheerio, load, type CheerioAPI, type Element } from "cheerio";
import { readdir, readFile, writeFile } from "fs/promises";
import fetch from "node-fetch";
import path from "path";

const rootUrl = "https://smlfamily.github.io/Basis";

const outDir = "html";

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

async function fetchAndWriteFiles(): Promise<File[]> {
  const resp = await fetch(`${rootUrl}/manpages.html`);
  const text = await resp.text();
  const body = load(text);
  const urls = filterMap(
    id,
    body("h4 a")
      .toArray()
      .map((x) => x.attribs["href"]),
  );
  return Promise.all(
    urls.map(async (name) => {
      const resp = await fetch(`${rootUrl}/${name}`);
      const text = await resp.text();
      await writeFile(path.join(outDir, name), text);
      return { name, text };
    }),
  );
}

interface File {
  name: string;
  text: string;
}

interface InfoMap {
  [k: string]: Info;
}

function processFiles(files: File[]): InfoMap {
  const map: InfoMap = {};
  for (const file of files) {
    const info = getInfo(file.name, load(file.text));
    const name = file.name.replace(/\.html$/, "");
    assert(!(name in map));
    map[name] = info;
  }
  return map;
}

interface MultiDef {
  items: string[];
  desc: string;
}

interface Info {
  synopsis: string | null;
  desc: string[];
  sigDecs: string[] | null;
  defs: MultiDef[];
}

function getCleanText(x: Cheerio<Element>): string {
  // \s includes regular space, non-breaking space, newline, and others
  return x.text().trim().replaceAll(/\s+/g, " ");
}

const decStart = new Set(["type", "eqtype", "datatype", "exception", "val"]);

function getInfo(name: string, $: CheerioAPI): Info {
  const headers = $("h4").toArray();
  const synopsisHeader = headers.find((x) => getCleanText($(x)) == "Synopsis");
  const desc: string[] = [];
  let synopsis: string | null = null;
  if (synopsisHeader === undefined) {
    console.error(`${name}: missing synopsis`);
  } else {
    let cur = $(synopsisHeader).next();
    assert(cur.length === 1 && cur.is("blockquote"));
    synopsis = getCleanText(cur);
    for (;;) {
      cur = cur.next();
      assert(cur.length === 1);
      if (cur.is("p")) {
        desc.push(getCleanText(cur));
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
  let sigDecs: string[] | null = null;
  if (interfaceHeader === undefined) {
    console.error(`${name}: missing interface`);
  } else {
    const elem = $(interfaceHeader).next();
    assert(elem.length === 1 && elem.is("blockquote"));
    const tokens = getCleanText(elem).split(" ");
    let cur: string[] = [];
    const overall: string[] = [];
    let prev: string | null = null;
    for (const token of tokens) {
      // hack to not split on 'where type' or 'and type'
      if (
        decStart.has(token) &&
        (prev === null ||
          (prev !== "where" && prev !== "and") ||
          token !== "type")
      ) {
        if (cur.length !== 0) {
          overall.push(cur.join(" "));
        }
        cur = [token];
      } else {
        cur.push(token);
      }
      prev = token;
    }
    overall.push(cur.join(" "));
    sigDecs = overall;
  }
  const descriptionHeader = headers.find(
    (x) => getCleanText($(x)) == "Description",
  );
  const defs: MultiDef[] = [];
  if (descriptionHeader === undefined) {
    console.error(`${name}: missing description`);
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
        defs.push({ items, desc: getCleanText(child) });
        items = [];
      } else {
        console.warn(`${name}: non-dt non-dd child in description, ignoring`);
      }
    }
    assert(items.length === 0);
  }
  return {
    synopsis,
    desc,
    sigDecs,
    defs,
  };
}

async function getFilesFromDir(): Promise<File[]> {
  const fileNames = await readdir(outDir);
  return Promise.all(
    fileNames.map((name) =>
      readFile(path.join(outDir, name)).then((text) => ({
        name,
        text: text.toString(),
      })),
    ),
  );
}

async function main() {
  // await fetchAndWriteFiles();
  const files = await getFilesFromDir();
  const map = processFiles(files);
  await writeFile("out.json", JSON.stringify(map, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

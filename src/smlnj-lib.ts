import { load } from "cheerio";
import { access, mkdir, writeFile } from "fs/promises";
import fetch from "node-fetch";
import path from "path";
import {
  breakSmlAcrossLines,
  getCleanText,
  getUrls,
  htmlOut,
  readHtmlFiles,
  rootOut,
  smlOut,
  toText,
  writeHtmlFiles,
} from "./util.js";

const libName = "smlnj-lib";
const rootDir = path.join(rootOut, libName);
const rootUrl = "https://www.smlnj.org/doc/smlnj-lib/";

async function fetchAndWriteFiles() {
  const $ = load(await fetch(rootUrl).then(toText));
  // rm dupes and ignore hash
  const dirUrls = new Set(
    getUrls($("#toc a")).map((x) => x.replace(/#.*/, "")),
  );
  const map = new Map<string, string>();
  for (const dirUrl of dirUrls) {
    const $ = load(await fetch(`${rootUrl}/${dirUrl}`).then(toText));
    const dir = path.dirname(dirUrl);
    for (const name of getUrls($("dt a"))) {
      if (name.includes("#")) {
        continue;
      }
      const text = await fetch(`${rootUrl}/${dir}/${name}`).then(toText);
      map.set(name, text);
    }
  }
  await writeHtmlFiles(libName, map);
}

export async function smlnjLib() {
  try {
    await access(path.join(rootDir, htmlOut));
  } catch {
    await fetchAndWriteFiles();
  }
  const files = await readHtmlFiles(rootDir);
  await mkdir(path.join(rootDir, smlOut), { recursive: true });
  const ps = files.map(async ({ name, text }) => {
    const $ = load(text);
    const lines: string[] = ["(* synopsis *)"];
    breakSmlAcrossLines(lines, getCleanText($("#_synopsis").next()));
    lines.push("(* interface *)");
    breakSmlAcrossLines(lines, getCleanText($("#_interface").next()));
    const smlBaseName = path.basename(name).replace(/\.html$/, ".sml");
    const out = path.join(rootDir, smlOut, smlBaseName);
    await writeFile(out, lines.join("\n"));
  });
  await Promise.all(ps);
}

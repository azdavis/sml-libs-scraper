import { load } from "cheerio";
import { access, mkdir, writeFile } from "fs/promises";
import path from "path";
import {
  breakSmlAcrossLines,
  fetchText,
  getCleanText,
  getUrls,
  htmlOut,
  readHtmlFiles,
  rootOut,
  smlOut,
  writeHtmlFiles,
} from "./util.js";

const libName = "smlnj-lib";
const rootUrl = "https://www.smlnj.org/doc/smlnj-lib/";

async function fetchAndWriteFiles() {
  const $ = load(await fetchText(rootUrl));
  // rm dupes and ignore hash
  const dirUrls = new Set(
    getUrls($("#toc a")).map((x) => x.replace(/#.*/, "")),
  );
  const map = new Map<string, string>();
  for (const dirUrl of dirUrls) {
    const $ = load(await fetchText(`${rootUrl}/${dirUrl}`));
    const dir = path.dirname(dirUrl);
    for (const name of getUrls($("dt a"))) {
      if (name.includes("#")) {
        continue;
      }
      const text = await fetchText(`${rootUrl}/${dir}/${name}`);
      map.set(name, text);
    }
  }
  await writeHtmlFiles(libName, map);
}

export async function smlnjLib() {
  try {
    await access(path.join(rootOut, libName, htmlOut));
  } catch {
    await fetchAndWriteFiles();
  }
  const files = await readHtmlFiles(libName);
  await mkdir(path.join(rootOut, libName, smlOut), { recursive: true });
  const ps = files.map(async ({ name, text }) => {
    const $ = load(text);
    const lines: string[] = ["(* synopsis *)"];
    breakSmlAcrossLines(lines, getCleanText($("#_synopsis").next()));
    lines.push("(* interface *)");
    breakSmlAcrossLines(lines, getCleanText($("#_interface").next()));
    const smlBaseName = path.basename(name).replace(/\.html$/, ".sml");
    const out = path.join(rootOut, libName, smlOut, smlBaseName);
    await writeFile(out, lines.join("\n"));
  });
  await Promise.all(ps);
}

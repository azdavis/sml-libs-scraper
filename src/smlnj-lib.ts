import { load } from "cheerio";
import { access, mkdir, writeFile } from "fs/promises";
import fetch from "node-fetch";
import path from "path";
import type { File } from "./types.js";
import {
  breakSmlAcrossLines,
  compact,
  getCleanText,
  getFilesFromDir,
  getUrls,
  htmlOut,
  rootOut,
  smlOut,
  toText,
} from "./util.js";

const rootDir = path.join(rootOut, "smlnj-lib");
const rootUrl = "https://www.smlnj.org/doc/smlnj-lib/";

async function fetchAndWriteFiles(): Promise<File[]> {
  const $ = load(await fetch(rootUrl).then(toText));
  // rm dupes and ignore hash
  const urls = Array.from(
    new Set(getUrls($("#toc a")).map((x) => x.replace(/#.*/, ""))),
  );
  await mkdir(path.join(rootDir, htmlOut), { recursive: true });
  const ps = urls.map(async (url) => {
    const $ = load(await fetch(`${rootUrl}/${url}`).then(toText));
    const dir = path.dirname(url);
    return Promise.all(
      getUrls($("dt a")).map(async (name) => {
        if (name.includes("#")) {
          return undefined;
        }
        const text = await fetch(`${rootUrl}/${dir}/${name}`).then(toText);
        await writeFile(path.join(rootDir, htmlOut, name), text);
        return { name, text };
      }),
    );
  });
  return compact((await Promise.all(ps)).flat());
}

export async function smlnjLib() {
  try {
    await access(path.join(rootDir, htmlOut));
  } catch {
    await fetchAndWriteFiles();
  }
  const files = await getFilesFromDir(rootDir);
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

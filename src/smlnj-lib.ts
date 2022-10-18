import { load } from "cheerio";
import path from "path";
import {
  breakSmlAcrossLines,
  fetchText,
  getCleanText,
  getNoDupeNoHashUrls,
  getUrls,
  readHtmlFiles,
  writeSmlFiles,
} from "./util.js";

const libName = "smlnj-lib";
const rootUrl = "https://www.smlnj.org/doc/smlnj-lib";

async function getFiles(): Promise<Map<string, string>> {
  const $ = load(await fetchText(rootUrl));
  const dirUrls = getNoDupeNoHashUrls($("#toc a"));
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
  return map;
}

export async function smlnjLib() {
  const files = await readHtmlFiles(libName, getFiles);
  const newFiles = files.map(({ name, text }) => {
    const $ = load(text);
    const lines: string[] = ["(* synopsis *)"];
    breakSmlAcrossLines(lines, getCleanText($("#_synopsis").next()));
    lines.push("(* interface *)");
    breakSmlAcrossLines(lines, getCleanText($("#_interface").next()));
    return { name, text: lines.join("\n") };
  });
  await writeSmlFiles(libName, newFiles);
}

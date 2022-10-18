import { load } from "cheerio";
import path from "path";
import { File } from "./types.js";
import {
  breakSmlAcrossLines,
  fetchText,
  getCleanText,
  getNoDupeNoHashUrls,
  readHtmlFiles,
  writeSmlFiles,
} from "./util.js";

const libName = "smlnj-lib";
const rootUrl = "https://www.smlnj.org/doc/smlnj-lib";

async function getFiles(): Promise<File[]> {
  const $ = load(await fetchText(rootUrl));
  const dirUrls = getNoDupeNoHashUrls($("#toc a"));
  const ps = Array.from(dirUrls).map(async (dirUrl) => {
    const $ = load(await fetchText(`${rootUrl}/${dirUrl}`));
    const dir = path.dirname(dirUrl);
    const nameUrls = getNoDupeNoHashUrls($("dt a"));
    const ps = Array.from(nameUrls).map(async (name) => {
      const text = await fetchText(`${rootUrl}/${dir}/${name}`);
      return { name, text };
    });
    return Promise.all(ps);
  });
  const xs = await Promise.all(ps);
  return xs.flat();
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

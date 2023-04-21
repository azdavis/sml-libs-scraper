import { load } from "cheerio";
import path from "path";
import type { File, Signature } from "./types.js";
import {
  breakSmlAcrossLines,
  fetchText,
  getCleanText,
  getNoDupeNoHashUrls,
  mkSmlFile,
  readHtmlFiles,
  writeSmlFiles,
} from "./util.js";

const libName = "smlnj_lib";
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

const sigRe = /^signature /;
export async function smlnjLib() {
  const files = await readHtmlFiles(libName, getFiles);
  const newFiles = files.map(({ name, text }) => {
    const $ = load(text);
    const synopsis: string[] = [];
    breakSmlAcrossLines(synopsis, getCleanText($("#_synopsis").next()));
    const signatures = synopsis.filter((x) => x.match(sigRe));
    const interFace: string[] = [];
    breakSmlAcrossLines(interFace, getCleanText($("#_interface").next()));
    let signature: Signature | null = null;
    const lines: string[] = [];
    if (signatures.length === 1) {
      signature = {
        name: signatures[0].replace(sigRe, ""),
        specs: interFace.map((def) => ({ def, comment: null })),
      };
    } else {
      lines.push(...signatures);
    }
    const structure = synopsis.filter((x) => x.match(/^structure /));
    const functor = synopsis.filter((x) => x.match(/^functor /));
    mkSmlFile(lines, name, {
      signature,
      structsAndFunctors: structure.concat(functor),
      comment: [],
      extra: null,
    });
    return { name, text: lines.join("\n") };
  });
  await writeSmlFiles(libName, newFiles);
}

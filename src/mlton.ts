import { load, type Cheerio, type Element } from "cheerio";
import { File } from "./types.js";
import {
  breakSmlAcrossLines,
  fetchText,
  getCleanText,
  getNoDupeNoHashUrls,
  readHtmlFiles,
  writeSmlFiles,
} from "./util.js";

const libName = "mlton";

const rootUrl = "http://mlton.org/";
function mltonUrl(x: string): string {
  return rootUrl + x;
}

async function getFiles(): Promise<File[]> {
  const rootText = await fetchText(mltonUrl("MLtonStructure"));
  const $ = load(rootText);
  // something wrong with the selector string (because of the _ to start, I
  // think), need to cast
  const elements = $("#_substructures ~ div a") as any as Cheerio<Element>;
  const urls = getNoDupeNoHashUrls(elements);
  const ps = Array.from(urls).map(async (name) => {
    const text = await fetchText(mltonUrl(name));
    return { name, text };
  });
  const files = await Promise.all(ps);
  files.push({ name: "MLton", text: rootText });
  return files;
}

export async function mlton() {
  const files = await readHtmlFiles(libName, getFiles);
  const newFiles = files.map(({ name, text }) => {
    const $ = load(text);
    const code = getCleanText($(".listingblock").first());
    const lines: string[] = [];
    breakSmlAcrossLines(lines, code);
    return { name, text: lines.join("\n") };
  });
  await writeSmlFiles(libName, newFiles);
}

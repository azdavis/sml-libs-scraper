import { load, type Cheerio, type Element } from "cheerio";
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

async function getFiles(): Promise<Map<string, string>> {
  const rootText = await fetchText(mltonUrl("MLtonStructure"));
  const $ = load(rootText);
  // something wrong with the selector string (because of the _ to start, I
  // think), need to cast
  const elements = $("#_substructures ~ div a") as any as Cheerio<Element>;
  const urls = getNoDupeNoHashUrls(elements);
  const map = new Map<string, string>();
  for (const url of urls) {
    const text = await fetchText(mltonUrl(url));
    map.set(url, text);
  }
  map.set("MLton", rootText);
  return map;
}

export async function mlton() {
  const files = await readHtmlFiles(libName, getFiles);
  const newFiles = files.map(({ name, text }) => {
    const $ = load(text);
    const code = getCleanText($(".listingblock").first());
    console.log({ name, text, code });
    const lines: string[] = [];
    breakSmlAcrossLines(lines, code);
    return { name, text: lines.join("\n") };
  });
  await writeSmlFiles(libName, newFiles);
}

import { type Cheerio, type Element } from "cheerio";
import { access, mkdir, readdir, readFile, writeFile } from "fs/promises";
import fetch from "node-fetch";
import path from "path";
import type { File } from "./types";

export const emitComments = true;

export function assert(x: boolean) {
  if (!x) {
    throw new Error("assert failed");
  }
}

function compact<T>(xs: (T | undefined)[]): T[] {
  const ret = [];
  for (const x of xs) {
    if (x !== undefined) {
      ret.push(x);
    }
  }
  return ret;
}

export function getUrls(ch: Cheerio<Element>): string[] {
  return compact(ch.toArray().map((x) => x.attribs["href"]));
}

const hash = /#.*/;
function rmHash(x: string): string {
  return x.replace(hash, "");
}

export function getNoDupeNoHashUrls(ch: Cheerio<Element>): Set<string> {
  return new Set(getUrls(ch).map(rmHash));
}

export async function fetchText(x: string): Promise<string> {
  const res = await fetch(x);
  return res.text();
}

// \s includes regular space, non-breaking space, newline, and others
const manySpace = /\s+/g;
export function getCleanText(x: Cheerio<Element>): string {
  return x.text().trim().replaceAll(manySpace, " ");
}

export const smlStarter = new Set([
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

export function breakSmlAcrossLines(ac: string[], text: string) {
  const tokens = text.split(" ");
  let cur: string[] = [];
  let prev: string | null = null;
  for (const token of tokens) {
    // hack to not split on things like 'where type'
    if (
      token === "end" ||
      (smlStarter.has(token) &&
        (token !== "type" || prev === null || !precedesType.has(prev)))
    ) {
      if (cur.length !== 0) {
        ac.push(cur.join(" "));
      }
      cur = [token];
    } else {
      cur.push(token);
    }
    prev = token;
  }
  ac.push(cur.join(" "));
}

const htmlEnd = /\.html$/;
const outDir = "out";
const htmlDir = "html";
const smlDir = "sml";

/**
 * writes the html files if needed, loads them, and makes the sml out dir.
 * returns the loaded files.
 */
export async function prepare(
  libName: string,
  getFiles: () => Promise<Map<string, string>>,
): Promise<File[]> {
  try {
    await access(path.join(outDir, libName, htmlDir));
  } catch {
    const files = await getFiles();
    await mkdir(path.join(outDir, libName, htmlDir), { recursive: true });
    const ps = Array.from(files.entries()).map(([name, text]) => {
      const p = path.join(outDir, libName, htmlDir, name);
      return writeFile(p, text);
    });
    await Promise.all(ps);
  }
  const fileNames = await readdir(path.join(outDir, libName, htmlDir));
  const ps = fileNames.map(async (name) => {
    const buf = await readFile(path.join(outDir, libName, htmlDir, name));
    return { name: name.replace(htmlEnd, ""), text: buf.toString() };
  });
  return Promise.all(ps);
}

export async function writeSmlFiles(libName: string, files: File[]) {
  await mkdir(path.join(outDir, libName, smlDir), { recursive: true });
  const ps = files.map(({ name, text }) => {
    const p = path.join(outDir, libName, smlDir, name + ".sml");
    return writeFile(p, text);
  });
  await Promise.all(ps);
}

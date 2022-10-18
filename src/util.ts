import { type Cheerio, type Element } from "cheerio";
import { access, mkdir, readdir, readFile, writeFile } from "fs/promises";
import fetch from "node-fetch";
import path from "path";
import type { File } from "./types";

export const emitComments = true;
export const rootOut = "out";
export const htmlOut = "html";
export const smlOut = "sml";

export function assert(x: boolean) {
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

function compact<T>(xs: (T | undefined)[]): T[] {
  return filterMap(id, xs);
}

export function getUrls(ch: Cheerio<Element>): string[] {
  return compact(ch.toArray().map((x) => x.attribs["href"]));
}

export async function fetchText(x: string): Promise<string> {
  const res = await fetch(x);
  return res.text();
}

export function getCleanText(x: Cheerio<Element>): string {
  // \s includes regular space, non-breaking space, newline, and others
  return x.text().trim().replaceAll(/\s+/g, " ");
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

/**
 * writes the html files if needed, loads them, and makes the sml out dir.
 * returns the loaded files.
 */
export async function prepare(
  libName: string,
  getFiles: () => Promise<Map<string, string>>,
): Promise<File[]> {
  try {
    await access(path.join(rootOut, libName, htmlOut));
  } catch {
    const files = await getFiles();
    await mkdir(path.join(rootOut, libName, htmlOut), { recursive: true });
    const ps = Array.from(files.entries()).map(async ([name, text]) => {
      const p = path.join(rootOut, libName, htmlOut, name);
      await writeFile(p, text);
    });
    await Promise.all(ps);
  }
  const fileNames = await readdir(path.join(rootOut, libName, htmlOut));
  const ps = fileNames.map((name) =>
    readFile(path.join(rootOut, libName, htmlOut, name)).then((text) => ({
      name,
      text: text.toString(),
    })),
  );
  await mkdir(path.join(rootOut, libName, smlOut), { recursive: true });
  return Promise.all(ps);
}

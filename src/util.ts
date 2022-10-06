import { Cheerio, type Element } from "cheerio";
import { readdir, readFile } from "fs/promises";
import { type Response } from "node-fetch";
import path from "path";
import { type File } from "./types.js";

export const emitComments = false;
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

export function compact<T>(xs: (T | undefined)[]): T[] {
  return filterMap(id, xs);
}

export function getUrls(ch: Cheerio<Element>): string[] {
  return compact(ch.toArray().map((x) => x.attribs["href"]));
}

export function toText(x: Response): Promise<string> {
  return x.text();
}

export async function getFilesFromDir(rootDir: string): Promise<File[]> {
  const fileNames = await readdir(path.join(rootDir, htmlOut));
  return Promise.all(
    fileNames.map((name) =>
      readFile(path.join(rootDir, htmlOut, name)).then((text) => ({
        name,
        text: text.toString(),
      })),
    ),
  );
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

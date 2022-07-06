import { Cheerio, type Element } from "cheerio";
import { type Response } from "node-fetch";

export const emitComments = false;
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

export function getUrls(ch: Cheerio<Element>): string[] {
  return filterMap(
    id,
    ch.toArray().map((x) => x.attribs["href"]),
  );
}

export function toText(x: Response): Promise<string> {
  return x.text();
}

import { type Cheerio, type Element } from "cheerio";
import { access, mkdir, readFile, readdir, writeFile } from "fs/promises";
import fetch from "node-fetch";
import path from "path";
import type { File, MergedInfo } from "./types";

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

const manySpace = /\s+/g;

/**
 * compresses many whitespace (space, newline, etc) into one
 */
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

/**
 * breaks `text` which contains the text of sml decs in sequence into one dec per line, and writes
 * that into `lines`.
 */
export function breakSmlAcrossLines(lines: string[], text: string) {
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
        lines.push(cur.join(" "));
      }
      cur = [token];
    } else {
      cur.push(token);
    }
    prev = token;
  }
  lines.push(cur.join(" "));
}

const htmlEnd = /\.html$/;
const outDir = "out";
const htmlDir = "html";
const smlDir = "sml";

/**
 * writes the html files to the fs if needed, then reads and returns them.
 */
export async function readHtmlFiles(
  libName: string,
  getFiles: () => Promise<File[]>,
): Promise<File[]> {
  try {
    await access(path.join(outDir, libName, htmlDir));
  } catch {
    const files = await getFiles();
    await mkdir(path.join(outDir, libName, htmlDir), { recursive: true });
    const ps = files.map(({ name, text }) => {
      // name may or may not have a html suffix already, but this definitely
      // will have exactly one html suffix.
      const nameWithHtmlExt = name.replace(htmlEnd, "") + ".html";
      const p = path.join(outDir, libName, htmlDir, nameWithHtmlExt);
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

const maxLineWidth = 100;

/**
 * writes the comment given by the `paragraphs` into `lines`, indented with `indent`.
 */
function writeComment(lines: string[], indent: string, paragraphs: string[]) {
  if (!emitComments || paragraphs.length === 0) {
    return;
  }
  const lineStart = indent + " *";
  lines.push(indent + "(*!");
  for (let i = 0; i < paragraphs.length; i++) {
    let cur = lineStart;
    const paragraph = paragraphs[i];
    for (const word of paragraph.split(" ")) {
      const toAdd = " " + word;
      if (cur.length + toAdd.length > maxLineWidth) {
        lines.push(cur);
        cur = lineStart + toAdd;
      } else {
        cur += toAdd;
      }
    }
    lines.push(cur);
    if (i + 1 !== paragraphs.length) {
      lines.push("");
    }
  }
  lines.push(indent + " *)");
}

const whereType = "where type";

/**
 * writes the `dec` into `lines`, splitting any "where type"s across different lines, indented by
 * `indent`.
 */
function splitWhereType(lines: string[], indent: string, dec: string) {
  const parts = dec.split(whereType);
  const fst = parts.shift();
  if (fst === undefined) {
    throw new Error(`splitting on ${whereType} yielded []`);
  }
  const fstTrim = fst.trim();
  lines.push(indent + fstTrim);
  for (const wt of parts) {
    lines.push(indent + indentStr + whereType + " " + wt.trim());
  }
}

const indentStr = "  ";

function indent(n: number): string {
  return Array(n).fill(indentStr).join("");
}

/**
 * makes an sml file and writes it into the `lines` from the `info`. `name` is for debug only.
 */
export function mkSmlFile(lines: string[], name: string, info: MergedInfo) {
  writeComment(lines, "", info.comment);
  if (info.signatureName === null) {
    if (info.defs.length !== 0) {
      console.warn(`${name}: no signature name but yes defs`);
    }
  } else {
    lines.push(info.signatureName + " = sig");
    let level = 1;
    for (const def of info.defs) {
      if (def.comment !== null) {
        writeComment(lines, indent(level), [def.comment]);
      }
      const trimSpec = def.spec.trim();
      if (trimSpec.endsWith("end")) {
        level -= 1;
      }
      splitWhereType(lines, indent(level), def.spec);
      if (trimSpec.endsWith(": sig")) {
        level += 1;
      }
    }
    lines.push("end");
  }
  lines.push("");
  for (const other of info.structsAndFunctors) {
    splitWhereType(lines, "", other + " = struct end");
  }
  if (info.structsAndFunctors.length !== 0) {
    lines.push("");
  }
  const extra = info.extra;
  if (extra !== null) {
    if (extra.unused.size !== 0) {
      console.warn(`${name}: unused:`, extra.unused);
    }
    if (extra.duplicate.size !== 0) {
      console.warn(`${name}: duplicate:`, extra.duplicate);
    }
    if (extra.usedMultiple.size !== 0) {
      console.warn(`${name}: used multiple times:`, extra.usedMultiple);
    }
  }
}

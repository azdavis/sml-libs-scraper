export function assert(x: boolean) {
  if (!x) {
    throw new Error("assert failed");
  }
}

export function filterMap<T, U>(f: (x: T) => U | undefined, xs: T[]): U[] {
  const ret = [];
  for (const x of xs) {
    const res = f(x);
    if (res !== undefined) {
      ret.push(res);
    }
  }
  return ret;
}

export function id<T>(x: T): T {
  return x;
}

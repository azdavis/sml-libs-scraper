import { get as smlNj } from "./sml-nj.js";
import { get as stdBasis } from "./std-basis-like.js";

async function main() {
  await Promise.all([stdBasis(), smlNj()]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

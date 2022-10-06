import { smlnjLib } from "./smlnj-lib.js";
import { stdBasis } from "./std-basis-like.js";

async function main() {
  await Promise.all([stdBasis(), smlnjLib()]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

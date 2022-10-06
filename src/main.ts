import { smlnjLib } from "./smlnj-lib.js";
import { stdBasisLike } from "./std-basis-like.js";

async function main() {
  await Promise.all([
    stdBasisLike({
      dirName: "std-basis",
      rootUrl: "https://smlfamily.github.io/Basis",
      index: "manpages.html",
      linkSelector: "h4 a",
    }),
    smlnjLib(),
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

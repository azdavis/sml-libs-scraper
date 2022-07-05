import { get as stdBasis } from "./std-basis";

async function main() {
  await stdBasis();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

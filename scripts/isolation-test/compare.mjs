// Usage: node compare.mjs before.json after.json
// Fails if company BRAVO's data changed after ALPHA's attack attempts.
import fs from "node:fs";
const [b, a] = [process.argv[2], process.argv[3]].map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
const diffs = Object.keys(b.BRAVO).filter((k) => String(b.BRAVO[k]) !== String(a.BRAVO[k]));
if (diffs.length) {
  console.log("BRAVO CHANGED:");
  diffs.forEach((k) => console.log(`  ${k}: ${b.BRAVO[k]} -> ${a.BRAVO[k]}`));
  process.exit(1);
}
console.log("BRAVO data unchanged. Cross-company writes were blocked.");

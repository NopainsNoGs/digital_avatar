import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SLIDES } from "./content.mjs";

const buildDir = path.dirname(fileURLToPath(import.meta.url));
const audioDir = path.join(buildDir, "audio");

for (const slide of SLIDES) {
  const file = path.join(audioDir, `slide_${slide.number}.txt`);
  const actual = readFileSync(file, "utf8").trim();
  assert.equal(
    actual,
    slide.narration,
    `slide ${slide.number} narration export differs from content source`,
  );
}

console.log("audio input contract: PASS");

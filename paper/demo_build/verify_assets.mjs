import assert from "node:assert/strict";
import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const buildDir = path.dirname(fileURLToPath(import.meta.url));
const assetDir = path.join(buildDir, "assets");
const expected = [
  "system_interface.png",
  "avatar_idle.png",
  "avatar_wave.png",
  "multimodal_ablation.png",
  "ttfa_breakdown.png",
  "user_study.png",
];

function readPngDimensions(file) {
  const header = Buffer.alloc(24);
  const descriptor = openSync(file, "r");
  try {
    readSync(descriptor, header, 0, header.length, 0);
  } finally {
    closeSync(descriptor);
  }
  assert.equal(
    header.subarray(1, 4).toString("ascii"),
    "PNG",
    `${path.basename(file)} is not PNG`,
  );
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

for (const name of expected) {
  const file = path.join(assetDir, name);
  assert.ok(existsSync(file), `${name} missing`);
  assert.ok(statSync(file).size > 10_000, `${name} unexpectedly small`);
  const dimensions = readPngDimensions(file);
  assert.ok(dimensions[0] >= 240, `${name} width too small`);
  assert.ok(dimensions[1] >= 200, `${name} height too small`);
}

console.log("asset contract: PASS");

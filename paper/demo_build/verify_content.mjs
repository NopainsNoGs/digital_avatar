import assert from "node:assert/strict";
import { METRICS, SLIDES } from "./content.mjs";

assert.equal(SLIDES.length, 6);
assert.deepEqual(
  SLIDES.map((slide) => slide.number),
  [1, 2, 3, 4, 5, 6],
);
assert.equal(
  SLIDES.reduce((sum, slide) => sum + slide.targetSeconds, 0),
  112,
);
assert.equal(METRICS.adaptiveFusionAccuracy, "95.83%");
assert.equal(METRICS.fixedFusionGain, "5.00 个百分点");
assert.equal(METRICS.ttfaMedian, "813.13 ms");
assert.equal(METRICS.satisfaction, "2.79 → 4.19");
assert.equal(METRICS.domainShift, "99.83% → 55.56%");
assert.match(SLIDES[5].narration, /跨说话人/);
assert.match(SLIDES[5].narration, /多噪声/);
assert.match(SLIDES[5].narration, /自然交互/);

console.log("content contract: PASS");

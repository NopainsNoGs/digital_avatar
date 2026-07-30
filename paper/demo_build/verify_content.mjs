import assert from "node:assert/strict";
import { METRICS, SLIDES } from "./content.mjs";

assert.equal(SLIDES.length, 6);
assert.deepEqual(
  SLIDES.map((slide) => slide.number),
  [1, 2, 3, 4, 5, 6],
);
assert.equal(
  SLIDES.reduce((sum, slide) => sum + slide.targetSeconds, 0),
  108,
);
assert.equal(METRICS.adaptiveFusionAccuracy, "95.83%");
assert.equal(METRICS.fixedFusionGain, "5.00 个百分点");
assert.equal(METRICS.ttfaMedian, "813.13 ms");
assert.equal(METRICS.satisfaction, "2.79 → 4.19");
assert.equal(METRICS.domainShift, "99.83% → 55.56%");
assert.match(
  SLIDES[0].narration,
  /^大家好，我们面向机场和车站，设计了一套/,
);
assert.match(
  SLIDES[0].narration,
  /多模态情感感知与流式驱动数字人系统/,
);
assert.doesNotMatch(SLIDES[0].narration, /能否/);
assert.match(SLIDES[1].narration, /左侧.*中间.*右侧/);
assert.match(SLIDES[2].narration, /左侧.*中间.*右侧/);
assert.match(SLIDES[3].narration, /上方.*中部.*下方/);
assert.match(SLIDES[4].narration, /左侧.*中间.*右侧.*底部/);
assert.match(SLIDES[5].narration, /跨说话人/);
assert.match(SLIDES[5].narration, /多噪声/);
assert.match(SLIDES[5].narration, /自然交互/);
assert.match(SLIDES[5].narration, /感谢观看。$/);

console.log("content contract: PASS");

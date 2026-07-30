import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const buildDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(buildDir, "../..");
const pptx = path.join(rootDir, "dome", "ChinaVR_Awatar_论文Demo.pptx");
const docx = path.join(rootDir, "dome", "ChinaVR_Awatar_逐页中文讲述词.docx");

for (const file of [pptx, docx]) {
  assert.ok(existsSync(file), `${path.basename(file)} missing`);
  assert.ok(statSync(file).size > 50_000, `${path.basename(file)} unexpectedly small`);
}

const pptxArchive = new AdmZip(pptx);
const slides = pptxArchive
  .getEntries()
  .map((entry) => entry.entryName)
  .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
assert.equal(slides.length, 6, "PPTX must contain exactly 6 slides");
const firstSlideEntry = pptxArchive.getEntry("ppt/slides/slide1.xml");
assert.ok(firstSlideEntry, "PPTX slide 1 XML missing");
const firstSlideXml = firstSlideEntry.getData().toString("utf8");
const firstSlideText = [...firstSlideXml.matchAll(/<a:t>(.*?)<\/a:t>/g)]
  .map((match) => match[1])
  .join("");
for (const required of [
  "面向交通枢纽的情感感知流式数字人",
  "多模态情感感知与流式驱动数字人交互方法",
  "面部",
  "语音",
  "文本",
  "融合情感",
  "首响",
  "同步",
]) {
  assert.ok(firstSlideText.includes(required), `slide 1 missing: ${required}`);
}
assert.ok(
  !firstSlideText.includes("面向交通枢纽服务的"),
  "slide 1 still contains the old long title",
);
assert.ok(
  !firstSlideText.includes("TRANSIT HUB DIGITAL HUMAN"),
  "slide 1 still contains the old screenshot caption",
);

const docxArchive = new AdmZip(docx);
const documentEntry = docxArchive.getEntry("word/document.xml");
assert.ok(documentEntry, "DOCX word/document.xml missing");
const documentXml = documentEntry.getData().toString("utf8");
assert.equal(
  documentXml.match(/实测配音：/g)?.length ?? 0,
  6,
  "DOCX must record the measured narration duration for all six slides",
);
const stylesXml = docxArchive
  .readAsText("word/styles.xml");
assert.match(
  stylesXml,
  /<w:spacing[^>]*w:line="360"[^>]*w:lineRule="auto"/,
  "DOCX default line spacing must be automatic so inline images are not clipped",
);

console.log("document structure: PASS");

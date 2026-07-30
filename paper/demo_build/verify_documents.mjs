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

const docxArchive = new AdmZip(docx);
assert.ok(
  docxArchive.getEntry("word/document.xml"),
  "DOCX word/document.xml missing",
);
const stylesXml = docxArchive
  .readAsText("word/styles.xml");
assert.match(
  stylesXml,
  /<w:spacing[^>]*w:line="360"[^>]*w:lineRule="auto"/,
  "DOCX default line spacing must be automatic so inline images are not clipped",
);

console.log("document structure: PASS");

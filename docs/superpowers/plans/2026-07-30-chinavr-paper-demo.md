# ChinaVR Awatar Paper Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an anonymous six-slide ChinaVR review demo with a per-slide Chinese narration document and a male-baritone narrated MP4 that is strictly shorter than 120 seconds.

**Architecture:** A small reproducible Node.js build package owns the slide data, narration, editable PPTX generation, and DOCX generation. LibreOffice renders the PPTX to page images; Edge TTS produces one audio file per slide; FFmpeg composes the rendered slides and narration into the final H.264/AAC video. A Python verifier treats the final `dome/` directory as the public interface and checks page count, dimensions, codecs, required metrics, and duration.

**Tech Stack:** Node.js 24, PptxGenJS, `docx`, LibreOffice headless, Edge TTS, FFmpeg/ffprobe, Python 3 standard library, Poppler, ImageMagick

## Global Constraints

- Source of truth: `paper/ChinaVR_Awatar_Final_20260730.pdf` and `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/`.
- Output directory name must be exactly `dome/`.
- Public deliverables are exactly `ChinaVR_Awatar_论文Demo.pptx`, `ChinaVR_Awatar_逐页中文讲述词.docx`, and `ChinaVR_Awatar_论文Demo.mp4`.
- The presentation has exactly 6 anonymous 16:9 slides.
- The video is 1920×1080 H.264/AAC and must be shorter than 115 seconds, providing a five-second safety margin below the absolute 120-second limit.
- The narration uses a calm Mandarin male voice with no background music.
- Required results are 95.83%, +5.00 percentage points, 813.13 ms, 2.79→4.19, and 99.83%→55.56%.
- The conclusion explicitly limits generalization and calls for cross-speaker, multi-noise, and natural-interaction evaluation.

---

### Task 1: Create the Reproducible Demo Build Package

**Files:**
- Create: `paper/demo_build/package.json`
- Create: `paper/demo_build/verify_content.mjs`
- Create: `paper/demo_build/content.mjs`
- Create: `paper/demo_build/package-lock.json` through `npm install`

**Interfaces:**
- Consumes: final-paper metrics and narrative constraints from the approved design.
- Produces: `SLIDES`, an array of six objects with `number`, `title`, `targetSeconds`, `narration`, and `requiredFacts`; and `METRICS`, an immutable object used by later builders.

- [ ] **Step 1: Write the failing content contract test**

```javascript
// paper/demo_build/verify_content.mjs
import assert from "node:assert/strict";
import { METRICS, SLIDES } from "./content.mjs";

assert.equal(SLIDES.length, 6);
assert.deepEqual(SLIDES.map((slide) => slide.number), [1, 2, 3, 4, 5, 6]);
assert.equal(SLIDES.reduce((sum, slide) => sum + slide.targetSeconds, 0), 112);
assert.equal(METRICS.adaptiveFusionAccuracy, "95.83%");
assert.equal(METRICS.fixedFusionGain, "5.00 个百分点");
assert.equal(METRICS.ttfaMedian, "813.13 ms");
assert.equal(METRICS.satisfaction, "2.79 → 4.19");
assert.equal(METRICS.domainShift, "99.83% → 55.56%");
assert.match(SLIDES[5].narration, /跨说话人/);
assert.match(SLIDES[5].narration, /多噪声/);
assert.match(SLIDES[5].narration, /自然交互/);
console.log("content contract: PASS");
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `node paper/demo_build/verify_content.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `content.mjs`.

- [ ] **Step 3: Add package metadata and the exact six-slide narration**

```json
{
  "name": "chinavr-awatar-demo-build",
  "private": true,
  "type": "module",
  "dependencies": {
    "docx": "^9.5.1",
    "pptxgenjs": "^4.0.1"
  }
}
```

```javascript
// paper/demo_build/content.mjs
export const METRICS = Object.freeze({
  adaptiveFusionAccuracy: "95.83%",
  fixedFusionGain: "5.00 个百分点",
  ttfaMedian: "813.13 ms",
  satisfaction: "2.79 → 4.19",
  domainShift: "99.83% → 55.56%",
});

export const SLIDES = [
  {
    number: 1,
    title: "让交通枢纽数字人既懂情绪，也能尽早开口",
    targetSeconds: 10,
    narration: "面向机场和车站的数字人，不仅要回答正确，还要在噪声与遮挡条件下理解旅客状态，并尽早给出语音、表情和动作一致的反馈。",
    requiredFacts: [],
  },
  {
    number: 2,
    title: "真实终端中的三类断点",
    targetSeconds: 15,
    narration: "现有系统有三类断点：单一面部、语音或文本通道容易因环境失效；串行的识别、生成、合成与动画链路必须等待完整回复；音频和口型分开生成，还可能造成时间轴漂移。",
    requiredFacts: [],
  },
  {
    number: 3,
    title: "质量感知的多模态情感融合",
    targetSeconds: 22,
    narration: "我们并行提取四百六十八点面部几何、语音能量与过零率，以及文本语义的六类情感分数。融合权重同时考虑基础权重、置信度和有效样本量；任一模态缺失时，将其权重置零，其余通道重新归一化，因此系统可以平滑退化，而不是整条链路失效。",
    requiredFacts: [],
  },
  {
    number: 4,
    title: "首响优先的流式音画流水线",
    targetSeconds: 22,
    narration: "回复生成采用结构化增量协议，先恢复情绪字段，再按标点和超时条件切出可播句段。语言模型是生产者，语音合成是消费者，两者并行运行。每个音频块与口型轨迹共享流编号、块序号和播放时钟，使语音、字幕、表情与动作在完整回复结束前就能渐进输出。",
    requiredFacts: [],
  },
  {
    number: 5,
    title: "三组证据与一个必须正视的边界",
    targetSeconds: 30,
    narration: "在一百二十条均衡三模态引导样本上，自适应融合准确率为百分之九十五点八三，比固定权重提高五个百分点。三十轮本地热启动文本测试中，首音频块时延中位数为八百一十三点一三毫秒。二十名参与者的一百六十条任务记录中，总体满意度由二点七九提升到四点一九。与此同时，文本模型从内部验证的百分之九十九点八三降到独立机场短句的百分之五十五点五六，说明跨域泛化仍是关键限制。",
    requiredFacts: ["95.83%", "5.00 个百分点", "813.13 ms", "2.79 → 4.19", "99.83% → 55.56%"],
  },
  {
    number: 6,
    title: "低开销感知，低首响响应，同步化驱动",
    targetSeconds: 13,
    narration: "综上，该方法实现了缺失模态可退化、首响优先和块级音画同步。它验证了交通终端数字人的可行路径，但现场部署前，仍需完成跨说话人、多噪声条件和自然交互评价。",
    requiredFacts: [],
  },
];
```

- [ ] **Step 4: Install the local build dependencies**

Run: `npm install`

Working directory: `paper/demo_build`

Expected: exit 0 and a local `node_modules/` plus `package-lock.json`.

- [ ] **Step 5: Run the content contract test**

Run: `node paper/demo_build/verify_content.mjs`

Expected: `content contract: PASS`.

- [ ] **Step 6: Commit the build package contract**

```bash
git add paper/demo_build/package.json paper/demo_build/package-lock.json paper/demo_build/content.mjs paper/demo_build/verify_content.mjs
git commit -m "build: define ChinaVR demo content contract"
```

### Task 2: Prepare the Final-Paper Visual Assets

**Files:**
- Create: `paper/demo_build/prepare_assets.sh`
- Create: `paper/demo_build/assets/system_interface.png`
- Create: `paper/demo_build/assets/avatar_idle.png`
- Create: `paper/demo_build/assets/avatar_wave.png`
- Create: `paper/demo_build/assets/multimodal_ablation.png`
- Create: `paper/demo_build/assets/ttfa_breakdown.png`
- Create: `paper/demo_build/assets/user_study.png`

**Interfaces:**
- Consumes: final figures under `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/` and avatar screenshots in `paper/`.
- Produces: stable PNG paths at print-quality resolution for the PPT builder.

- [ ] **Step 1: Write the asset preparation script**

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD_DIR="$ROOT_DIR/paper/demo_build"
FINAL_FIGURES="$ROOT_DIR/paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures"
ASSET_DIR="$BUILD_DIR/assets"
mkdir -p "$ASSET_DIR"
cp "$FINAL_FIGURES/system_interface_composite.png" "$ASSET_DIR/system_interface.png"
cp "$ROOT_DIR/paper/待机.png" "$ASSET_DIR/avatar_idle.png"
cp "$ROOT_DIR/paper/挥手.png" "$ASSET_DIR/avatar_wave.png"
pdftoppm -png -singlefile -r 240 "$FINAL_FIGURES/multimodal_ablation.pdf" "$ASSET_DIR/multimodal_ablation"
pdftoppm -png -singlefile -r 240 "$FINAL_FIGURES/ttfa_breakdown.pdf" "$ASSET_DIR/ttfa_breakdown"
pdftoppm -png -singlefile -r 240 "$FINAL_FIGURES/user_study.pdf" "$ASSET_DIR/user_study"
```

- [ ] **Step 2: Run asset preparation**

Run: `bash paper/demo_build/prepare_assets.sh`

Expected: seven non-empty PNG files in `paper/demo_build/assets/`.

- [ ] **Step 3: Verify image dimensions**

Run: `identify paper/demo_build/assets/*.png`

Expected: every file is readable; final-paper chart renders are at least 1500 pixels wide or 900 pixels high.

- [ ] **Step 4: Commit the asset preparation source**

```bash
git add paper/demo_build/prepare_assets.sh
git commit -m "build: prepare final-paper demo assets"
```

Do not commit generated PNG files; add `paper/demo_build/assets/` to the local ignore rules in `paper/demo_build/.gitignore`.

### Task 3: Generate the Editable PPTX and Narration DOCX

**Files:**
- Create: `paper/demo_build/build_documents.mjs`
- Create: `paper/demo_build/verify_documents.mjs`
- Create: `dome/ChinaVR_Awatar_论文Demo.pptx`
- Create: `dome/ChinaVR_Awatar_逐页中文讲述词.docx`

**Interfaces:**
- Consumes: `METRICS`, `SLIDES`, and the prepared PNG assets.
- Produces: the six-slide 16:9 PPTX and six-section DOCX, both built from the same content array.

- [ ] **Step 1: Write the failing document verifier**

```javascript
// paper/demo_build/verify_documents.mjs
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const pptx = "dome/ChinaVR_Awatar_论文Demo.pptx";
const docx = "dome/ChinaVR_Awatar_逐页中文讲述词.docx";
for (const file of [pptx, docx]) {
  assert.ok(existsSync(file), `${file} missing`);
  assert.ok(statSync(file).size > 50_000, `${file} unexpectedly small`);
}
const listing = execFileSync("unzip", ["-l", pptx], { encoding: "utf8" });
const slideCount = [...listing.matchAll(/ppt\/slides\/slide\d+\.xml/g)].length;
assert.equal(slideCount, 6);
console.log("document structure: PASS");
```

- [ ] **Step 2: Run the verifier and verify it fails**

Run: `node paper/demo_build/verify_documents.mjs`

Expected: FAIL with `ChinaVR_Awatar_论文Demo.pptx missing`.

- [ ] **Step 3: Implement shared theme helpers and slide builders**

`build_documents.mjs` must:

- set `pptx.layout = "LAYOUT_WIDE"` and the author/company/subject metadata to anonymous review-safe values;
- use `Noto Sans CJK SC`, dark navy `050B16`, cyan `67E8F9`, amber `F6C453`, muted slate `94A3B8`, and white `F8FAFC`;
- create one `buildSlideN(slide, content)` function per page;
- redraw the multimodal flow, streaming timeline, and result cards with editable PPT shapes;
- use the final interface and avatar PNGs only as visual evidence, never as full-page paper screenshots;
- call `slide.addNotes(slideSpec.narration)` so the PPT also carries the narration as speaker notes;
- create a DOCX with a title, total target time, and one heading per page containing the narration, target time, and required facts;
- write only the two public document files to `dome/`.

- [ ] **Step 4: Generate the PPTX and DOCX**

Run: `node paper/demo_build/build_documents.mjs`

Expected: both public document files exist in `dome/`.

- [ ] **Step 5: Verify document structure**

Run: `node paper/demo_build/verify_documents.mjs`

Expected: `document structure: PASS`.

- [ ] **Step 6: Render the PPTX and inspect all six pages**

Run:

```bash
mkdir -p paper/demo_build/rendered
libreoffice --headless --convert-to pdf --outdir paper/demo_build/rendered dome/ChinaVR_Awatar_论文Demo.pptx
pdftoppm -png -r 150 paper/demo_build/rendered/ChinaVR_Awatar_论文Demo.pdf paper/demo_build/rendered/slide
montage paper/demo_build/rendered/slide-*.png -thumbnail 480x270 -tile 3x2 -geometry +12+12 -background '#020617' paper/demo_build/rendered/contact_sheet.png
```

Expected: a six-page PDF and a 3×2 contact sheet with no clipping, font substitution, author information, or unreadably small text.

- [ ] **Step 7: Commit document builders**

```bash
git add paper/demo_build/build_documents.mjs paper/demo_build/verify_documents.mjs
git commit -m "feat: generate ChinaVR demo documents"
```

### Task 4: Generate and Calibrate the Male Narration

**Files:**
- Create: `paper/demo_build/generate_audio.sh`
- Create: `paper/demo_build/audio/slide_1.mp3` through `slide_6.mp3`
- Create: `paper/demo_build/audio/durations.tsv`

**Interfaces:**
- Consumes: the exact narration strings exported by `content.mjs`.
- Produces: one Mandarin male-voice MP3 per slide and measured durations used by video composition.

- [ ] **Step 1: Export the six narration strings to UTF-8 text files**

Add an `--export-narration` mode to `build_documents.mjs` that writes `paper/demo_build/audio/slide_1.txt` through `slide_6.txt` directly from `SLIDES`.

Run: `node paper/demo_build/build_documents.mjs --export-narration`

Expected: six non-empty UTF-8 files.

- [ ] **Step 2: Check the available Mandarin male voices**

Run: `edge-tts --list-voices`

Expected: `zh-CN-YunyangNeural` is available. If unavailable, select the lowest-pitched available `zh-CN-*Neural` male voice.

- [ ] **Step 3: Generate per-slide speech**

```bash
#!/usr/bin/env bash
set -euo pipefail
BUILD_DIR="$(cd "$(dirname "$0")" && pwd)"
AUDIO_DIR="$BUILD_DIR/audio"
VOICE="${DEMO_VOICE:-zh-CN-YunyangNeural}"
for index in 1 2 3 4 5 6; do
  edge-tts \
    --voice "$VOICE" \
    --rate=-3% \
    --pitch=-6Hz \
    --file "$AUDIO_DIR/slide_${index}.txt" \
    --write-media "$AUDIO_DIR/slide_${index}.mp3"
done
```

- [ ] **Step 4: Measure each clip and total duration**

Run:

```bash
for file in paper/demo_build/audio/slide_*.mp3; do
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file"
done
```

Expected: the sum of clip durations plus 0.6 seconds of padding per slide is between 103 and 114 seconds.

- [ ] **Step 5: Calibrate without distorting the voice**

If the padded total exceeds 114 seconds, shorten repeated wording in slides 2, 3, or 4 and regenerate both documents and audio. Do not remove experimental conditions or limitations. If the padded total is below 103 seconds, add natural pauses in the video rather than slowing speech below `--rate=-6%`.

- [ ] **Step 6: Commit the audio-generation source**

```bash
git add paper/demo_build/generate_audio.sh paper/demo_build/build_documents.mjs paper/demo_build/content.mjs
git commit -m "feat: add calibrated male demo narration"
```

Do not commit generated MP3 files; keep `paper/demo_build/audio/` ignored.

### Task 5: Compose the 1080p Review Video

**Files:**
- Create: `paper/demo_build/compose_video.py`
- Create: `dome/ChinaVR_Awatar_论文Demo.mp4`

**Interfaces:**
- Consumes: six rendered slide PNGs and six measured narration MP3 files.
- Produces: one 1920×1080 H.264/AAC MP4 whose slide changes follow the corresponding audio clips.

- [ ] **Step 1: Write a failing composition input check**

At the start of `compose_video.py`, assert:

```python
from pathlib import Path

root = Path(__file__).resolve().parents[2]
rendered = root / "paper" / "demo_build" / "rendered"
audio = root / "paper" / "demo_build" / "audio"
slides = sorted(rendered.glob("slide-*.png"))
clips = sorted(audio.glob("slide_*.mp3"))
assert len(slides) == 6, f"expected 6 slide images, got {len(slides)}"
assert len(clips) == 6, f"expected 6 narration clips, got {len(clips)}"
```

Run before audio generation: `python paper/demo_build/compose_video.py`

Expected: FAIL because the six narration clips do not yet exist.

- [ ] **Step 2: Implement per-slide segment creation**

For each slide:

- read the narration duration using `ffprobe`;
- add 0.25 seconds before and 0.35 seconds after the clip;
- render the slide as a constant 1920×1080 frame at 30 fps;
- delay the narration by 250 ms;
- encode the temporary segment as H.264 High Profile, yuv420p, CRF 18, AAC 192 kb/s, 48 kHz.

- [ ] **Step 3: Concatenate the six encoded segments**

Use FFmpeg concat demuxer with `-c copy` because every segment has identical codecs, dimensions, frame rate, time base, and audio parameters. Write the result atomically to `dome/ChinaVR_Awatar_论文Demo.mp4`.

- [ ] **Step 4: Run the composition**

Run: `python paper/demo_build/compose_video.py`

Expected: exit 0 and an MP4 shorter than 115 seconds.

- [ ] **Step 5: Commit the video composer**

```bash
git add paper/demo_build/compose_video.py
git commit -m "feat: compose ChinaVR review video"
```

### Task 6: Verify the Public Deliverables

**Files:**
- Create: `paper/demo_build/verify_deliverables.py`
- Modify only if verification finds a defect: the relevant content or builder source from Tasks 1–5

**Interfaces:**
- Consumes: the three files in `dome/`.
- Produces: a machine-readable pass/fail report on stdout and fresh evidence for final handoff.

- [ ] **Step 1: Implement final verification**

`verify_deliverables.py` must check:

```python
EXPECTED = {
    "ChinaVR_Awatar_论文Demo.pptx",
    "ChinaVR_Awatar_逐页中文讲述词.docx",
    "ChinaVR_Awatar_论文Demo.mp4",
}
REQUIRED_TEXT = [
    "95.83%",
    "5.00",
    "813.13",
    "2.79",
    "4.19",
    "99.83%",
    "55.56%",
    "跨说话人",
    "多噪声",
    "自然交互",
]
```

It must:

- assert the public filenames equal `EXPECTED`;
- inspect PPTX XML and assert exactly six slides and 16:9 dimensions;
- inspect PPTX and DOCX XML for all required text;
- call `ffprobe -show_streams -show_format -of json`;
- assert duration `< 115.0`, video codec `h264`, audio codec `aac`, width `1920`, and height `1080`;
- print page count, file sizes, duration, codecs, dimensions, and `ALL CHECKS PASSED`.

- [ ] **Step 2: Run structural verification**

Run: `python paper/demo_build/verify_deliverables.py`

Expected: `ALL CHECKS PASSED`.

- [ ] **Step 3: Inspect the final video at representative timestamps**

Run:

```bash
ffmpeg -y -ss 5 -i dome/ChinaVR_Awatar_论文Demo.mp4 -frames:v 1 /tmp/chinavr_demo_05.png
ffmpeg -y -ss 35 -i dome/ChinaVR_Awatar_论文Demo.mp4 -frames:v 1 /tmp/chinavr_demo_35.png
ffmpeg -y -ss 58 -i dome/ChinaVR_Awatar_论文Demo.mp4 -frames:v 1 /tmp/chinavr_demo_58.png
ffmpeg -y -ss 88 -i dome/ChinaVR_Awatar_论文Demo.mp4 -frames:v 1 /tmp/chinavr_demo_88.png
ffmpeg -y -ss 108 -i dome/ChinaVR_Awatar_论文Demo.mp4 -frames:v 1 /tmp/chinavr_demo_108.png
montage /tmp/chinavr_demo_*.png -thumbnail 480x270 -tile 3x2 -geometry +12+12 -background '#020617' /tmp/chinavr_demo_video_contact.png
```

Expected: the contact sheet shows the intended slide progression and no black frames, clipping, or rendering corruption.

- [ ] **Step 4: Check the final audio**

Run: `ffmpeg -v error -i dome/ChinaVR_Awatar_论文Demo.mp4 -af volumedetect -f null -`

Expected: no decoding errors, `max_volume` below 0 dB, and clear speech throughout the six segments.

- [ ] **Step 5: Commit verifier source and hand off**

```bash
git add paper/demo_build/verify_deliverables.py
git commit -m "test: verify ChinaVR demo deliverables"
```

Do not commit the generated `dome/` deliverables unless the user explicitly requests version control for binary outputs.

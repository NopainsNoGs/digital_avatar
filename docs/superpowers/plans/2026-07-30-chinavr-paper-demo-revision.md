# ChinaVR Awatar Paper Demo Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the six-slide anonymous review demo with a clearer cover, slide-aligned Chinese narration, medium-fast male voice-over, and a verified sub-two-minute MP4.

**Architecture:** Keep `paper/demo_build/content.mjs` as the single source of truth for narration and metrics. Generate the editable PPTX and DOCX from that source, synthesize one audio clip per slide, render the PPTX to PNG, and compose the MP4 using measured clip durations. Extend the existing contract tests so the revised cover text, narration, voice settings, pacing, pauses, and final media properties are mechanically checked.

**Tech Stack:** Node.js ESM, PptxGenJS, docx, Edge TTS, Python 3, ffmpeg/ffprobe, LibreOffice headless.

## Global Constraints

- Preserve exactly six 16:9 anonymous-review slides and the three deliverables under `dome/`.
- Use only claims and metrics supported by `paper/ChinaVR_Awatar_Final_20260730.pdf`.
- Preserve 95.83%, +5.00 percentage points, 813.13 ms, 2.79→4.19, and 99.83%→55.56%.
- The cover must first explain what the work built; it must not open with a rhetorical question.
- Use a Mandarin male baritone at approximately `+8%` speech rate with slightly lowered pitch.
- Target 100–110 seconds and require the final MP4 to be strictly shorter than 120 seconds.
- Do not include background music.
- Do not modify unrelated user changes in the working tree.

---

### Task 1: Revise the narration contract

**Files:**
- Modify: `paper/demo_build/verify_content.mjs`
- Modify: `paper/demo_build/content.mjs`

**Interfaces:**
- Consumes: `METRICS` and `SLIDES` exported by `content.mjs`.
- Produces: six narration strings and target durations consumed by document, audio, and video generation.

- [ ] **Step 1: Add failing narration assertions**

Add assertions that the first narration starts with `大家好，我们面向机场和车站，设计了一套`, mentions `多模态情感感知与流式驱动数字人系统`, and contains no rhetorical `能否`. Assert slides 2–5 contain the directional reading words required by the visuals and slide 6 ends with `感谢观看。`. Change the target-duration total to the new declared total from `content.mjs`.

- [ ] **Step 2: Run the content contract and verify failure**

Run: `node paper/demo_build/verify_content.mjs`

Expected: FAIL because the old first narration and target-duration sum do not satisfy the revised contract.

- [ ] **Step 3: Replace all six narration strings**

Use the exact six scripts approved in `docs/superpowers/specs/2026-07-30-chinavr-paper-demo-revision-design.md`. Set per-slide targets to values totaling 108 seconds while keeping the results slide longest.

- [ ] **Step 4: Run the content contract**

Run: `node paper/demo_build/verify_content.mjs`

Expected: `content contract: PASS`.

- [ ] **Step 5: Commit the narration contract**

```bash
git add paper/demo_build/content.mjs paper/demo_build/verify_content.mjs
git commit -m "content: align demo narration with slides"
```

### Task 2: Redesign the cover slide

**Files:**
- Modify: `paper/demo_build/verify_documents.mjs`
- Modify: `paper/demo_build/build_documents.mjs`

**Interfaces:**
- Consumes: `SLIDES[0]`, existing `avatar_idle.png`, and existing slide theme helpers.
- Produces: slide 1 of `dome/ChinaVR_Awatar_论文Demo.pptx` and the narration DOCX.

- [ ] **Step 1: Add failing cover-content assertions**

Open the generated PPTX archive in `verify_documents.mjs` and assert slide 1 contains `面向交通枢纽的情感感知流式数字人`, `多模态情感感知与流式驱动数字人交互方法`, `面部`, `语音`, `文本`, `融合情感`, `首响`, and `同步`. Assert slide 1 does not contain the old long cover title split or the old `TRANSIT HUB DIGITAL HUMAN` screenshot caption.

- [ ] **Step 2: Run the document contract and verify failure**

Run: `node paper/demo_build/verify_documents.mjs`

Expected: FAIL because the current PPTX still contains the old cover.

- [ ] **Step 3: Implement the new cover**

Replace `buildSlide1()` with a left-led title hierarchy and a right-side avatar system visual. Reuse theme colors and `avatar_idle.png`; represent `面部 / 语音 / 文本 → 融合情感 → 首响 / 同步` with editable shapes and connectors. Remove the composite paper screenshot, decorative oversized circle, and duplicate English system caption from slide 1.

- [ ] **Step 4: Export narration text and prepare measured-duration input**

Run: `node paper/demo_build/build_documents.mjs --export-narration`

Expected: `exported 6 narration text files`, and `node paper/demo_build/verify_audio_inputs.mjs` reports PASS.

- [ ] **Step 5: Regenerate documents with the current measured-duration manifest**

Run: `node paper/demo_build/build_documents.mjs`

Expected: updated PPTX and DOCX in `dome/`. Task 4 will rebuild the DOCX once more after the new audio manifest is available.

- [ ] **Step 6: Run the document contract**

Run: `node paper/demo_build/verify_documents.mjs`

Expected: `document structure: PASS`.

- [ ] **Step 7: Commit the cover redesign**

```bash
git add paper/demo_build/build_documents.mjs paper/demo_build/verify_documents.mjs
git commit -m "design: improve paper demo cover"
```

### Task 3: Synthesize and validate medium-fast speech

**Files:**
- Modify: `paper/demo_build/generate_audio.sh`
- Modify: `paper/demo_build/verify_audio_outputs.py`
- Create: `paper/demo_build/verify_speech_quality.py`

**Interfaces:**
- Consumes: `paper/demo_build/audio/slide_<index>.txt`.
- Produces: `slide_<index>.mp3`, `slide_<index>.vtt`, and `durations.json`.

- [ ] **Step 1: Add failing audio-setting assertions**

Change `verify_audio_outputs.py` to require manifest voice `zh-CN-YunyangNeural`, rate `+8%`, pitch `-6Hz`, and padded total within 100–110 seconds.

- [ ] **Step 2: Add the speech-quality verifier**

Implement `verify_speech_quality.py` to:

- read each source TXT and synthesized VTT;
- ensure VTT cues are monotonic and cover the source narration;
- use `ffmpeg` `silencedetect=noise=-42dB:d=0.70`;
- reject internal silent gaps longer than 1.0 second;
- compute effective non-punctuation characters per second and require 4.0–6.2 characters per second, with no adjacent-slide jump greater than 1.4 characters per second;
- emit a JSON report with per-slide duration, characters per second, maximum internal silence, and cue count.

- [ ] **Step 3: Run audio verifiers and verify failure**

Run: `python paper/demo_build/verify_audio_outputs.py`

Expected: FAIL because the current audio manifest records `-3%`.

- [ ] **Step 4: Update TTS generation**

Set defaults in `generate_audio.sh` to `RATE=+8%` and `PITCH=-6Hz`. Add `--write-subtitles "$AUDIO_DIR/slide_${index}.vtt"` so word timing is retained for pacing checks.

- [ ] **Step 5: Regenerate all six clips**

Run: `bash paper/demo_build/generate_audio.sh`

Expected: six MP3 files and six VTT files are written without synthesis errors.

- [ ] **Step 6: Generate the duration manifest and check pacing**

Run:

```bash
python paper/demo_build/verify_audio_outputs.py
python paper/demo_build/verify_speech_quality.py
```

Expected: both report PASS; padded total is 100–110 seconds and no internal silence exceeds 1.0 second.

- [ ] **Step 7: Commit the voice pipeline**

```bash
git add paper/demo_build/generate_audio.sh paper/demo_build/verify_audio_outputs.py paper/demo_build/verify_speech_quality.py
git commit -m "audio: add medium-fast narration checks"
```

### Task 4: Rebuild documents, render slides, and inspect the cover

**Files:**
- Regenerate: `dome/ChinaVR_Awatar_论文Demo.pptx`
- Regenerate: `dome/ChinaVR_Awatar_逐页中文讲述词.docx`
- Regenerate ignored renders under `paper/demo_build/rendered/`

**Interfaces:**
- Consumes: revised source, audio manifest, and existing visual assets.
- Produces: final PPTX, DOCX, and six 1920×1080 slide images used by video composition.

- [ ] **Step 1: Build PPTX and DOCX**

Run: `node paper/demo_build/build_documents.mjs`

Expected: both files are written to `dome/`.

- [ ] **Step 2: Render the PPTX to PDF**

Run: `libreoffice --headless --convert-to pdf --outdir paper/demo_build/rendered dome/ChinaVR_Awatar_论文Demo.pptx`

Expected: `paper/demo_build/rendered/ChinaVR_Awatar_论文Demo.pdf`.

- [ ] **Step 3: Render all pages to PNG**

Run: `pdftoppm -png -r 144 paper/demo_build/rendered/ChinaVR_Awatar_论文Demo.pdf paper/demo_build/rendered/slide`

Rename or copy the six generated pages to the exact `slide-1.png` through `slide-6.png` inputs expected by `compose_video.py`.

- [ ] **Step 4: Inspect the cover and contact sheet**

Create a six-slide contact sheet with ImageMagick and inspect `slide-1.png` plus the contact sheet. Reject the build if the title wraps awkwardly, the avatar is stretched, connectors cross text, or any page has clipped text.

- [ ] **Step 5: Run document and asset contracts**

Run:

```bash
node paper/demo_build/verify_assets.mjs
node paper/demo_build/verify_documents.mjs
```

Expected: both PASS.

### Task 5: Recompose and verify the final video

**Files:**
- Modify: `paper/demo_build/verify_video_output.py`
- Modify: `paper/demo_build/verify_deliverables.py`
- Regenerate: `dome/ChinaVR_Awatar_论文Demo.mp4`

**Interfaces:**
- Consumes: six rendered slide PNGs, six MP3 clips, and `durations.json`.
- Produces: final H.264/AAC MP4 and a final verification report.

- [ ] **Step 1: Tighten final duration assertions**

Require the MP4 duration to fall within 100–110 seconds and remain strictly below 120 seconds. Require the MP4 modification time to be newer than both the revised PPTX and `durations.json`. Keep existing codec, frame rate, resolution, sample rate, decode, volume, anonymity, and required-metric assertions.

- [ ] **Step 2: Run the video contract and verify failure**

Run: `python paper/demo_build/verify_video_output.py`

Expected: FAIL because the old video is older than the revised PPTX or audio manifest.

- [ ] **Step 3: Compose the MP4**

Run: `python paper/demo_build/compose_video.py`

Expected: six segments are encoded and concatenated to `dome/ChinaVR_Awatar_论文Demo.mp4`.

- [ ] **Step 4: Run all final checks**

Run:

```bash
node paper/demo_build/verify_content.mjs
node paper/demo_build/verify_audio_inputs.mjs
python paper/demo_build/verify_audio_outputs.py
python paper/demo_build/verify_speech_quality.py
node paper/demo_build/verify_documents.mjs
python paper/demo_build/verify_video_output.py
python paper/demo_build/verify_deliverables.py
```

Expected: every command reports PASS; final duration is 100–110 seconds; no abnormal internal silence or decoding error is reported.

- [ ] **Step 5: Inspect transition and data-page frames**

Extract frames from the opening, each page transition, the middle of slide 5, and the ending. Confirm the first page opens cleanly, transitions occur after the corresponding narration, slide 5 remains visible throughout all five numerical claims, and the ending contains the deployment boundary while the final words play.

- [ ] **Step 6: Commit verifier changes**

```bash
git add paper/demo_build/verify_video_output.py paper/demo_build/verify_deliverables.py
git commit -m "test: verify revised review video"
```

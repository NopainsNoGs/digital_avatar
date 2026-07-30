# ChinaVR Demo Live Operation Clip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert the complete 7.211-second real operation video between slides 4 and 5 with synchronized male narration, while keeping the final review video below 120 seconds.

**Architecture:** Add one `DEMO_CLIP` record to the existing content source, export and synthesize a dedicated narration clip, and extend the composer to encode `paper/test.mp4` as a seventh video segment while preserving the six-slide PPT. The DOCX records the live insert separately; automated checks verify narration coverage, insertion order, visual similarity to the source clip, codec compatibility, and the hard duration limit.

**Tech Stack:** Node.js ESM, PptxGenJS, docx, Edge TTS, Python 3, FFmpeg/FFprobe, NumPy, LibreOffice.

## Global Constraints

- Insert the operation segment after slide 4 and before slide 5.
- Play the complete 7.211-second source video full-screen.
- The operation segment must contain corresponding Mandarin male narration; it must not be a silent video-only interval.
- Use `zh-CN-YunyangNeural`, rate `+8%`, pitch `-6Hz`, and no background music.
- Keep the PPT at exactly six slides and do not embed the MP4 in the PPTX.
- Add a separate live-operation section to the narration DOCX.
- Keep the final MP4 at 1920×1080, 30 fps, H.264/AAC, and strictly below 120 seconds.
- Do not stage or commit the existing untracked `paper/` and `dome/` trees.

---

### Task 1: Add the live-clip content contract

**Files:**
- Modify: `paper/demo_build/verify_content.mjs`
- Modify: `paper/demo_build/content.mjs`
- Modify: `paper/demo_build/verify_audio_inputs.mjs`
- Modify: `paper/demo_build/build_documents.mjs`
- Test: `paper/demo_build/verify_content.mjs`
- Test: `paper/demo_build/verify_audio_inputs.mjs`

**Interfaces:**
- Produces: `DEMO_CLIP` with `title`, `insertAfterSlide`, `targetSeconds`, `sourceVideo`, and `narration`.
- Produces: `paper/demo_build/audio/demo_clip.txt`.

- [ ] **Step 1: Add failing content assertions**

Import `DEMO_CLIP` and assert:

```javascript
assert.equal(DEMO_CLIP.insertAfterSlide, 4);
assert.equal(DEMO_CLIP.sourceVideo, "paper/test.mp4");
assert.equal(DEMO_CLIP.targetSeconds, 7.211);
assert.equal(
  DEMO_CLIP.narration,
  "这是一次厕所问路：系统同步感知面部、语音和文本情感，驱动数字人完成回复与动作。",
);
```

Keep `SLIDES.length === 6`. Include the live narration in the character-density ceiling without changing the six slide target total.

- [ ] **Step 2: Run the content test to verify RED**

Run:

```bash
node paper/demo_build/verify_content.mjs
```

Expected: FAIL because `DEMO_CLIP` is not exported.

- [ ] **Step 3: Add the content record**

Add to `content.mjs`:

```javascript
export const DEMO_CLIP = Object.freeze({
  title: "实机交互插段｜厕所问路",
  insertAfterSlide: 4,
  targetSeconds: 7.211,
  sourceVideo: "paper/test.mp4",
  narration:
    "这是一次厕所问路：系统同步感知面部、语音和文本情感，驱动数字人完成回复与动作。",
});
```

- [ ] **Step 4: Add a failing exported-audio-input assertion**

Extend `verify_audio_inputs.mjs` to read `audio/demo_clip.txt` and assert exact equality with `DEMO_CLIP.narration`.

Run:

```bash
node paper/demo_build/build_documents.mjs --export-narration
node paper/demo_build/verify_audio_inputs.mjs
```

Expected before exporter modification: FAIL because `demo_clip.txt` is missing.

- [ ] **Step 5: Export the live narration**

Import `DEMO_CLIP` in `build_documents.mjs` and extend `exportNarration()`:

```javascript
await writeFile(
  path.join(audioDir, "demo_clip.txt"),
  `${DEMO_CLIP.narration}\n`,
  "utf8",
);
```

Expected after the change: both content and audio-input tests pass.

### Task 2: Generate and verify the live narration

**Files:**
- Modify: `paper/demo_build/generate_audio.sh`
- Modify: `paper/demo_build/verify_audio_outputs.py`
- Modify: `paper/demo_build/verify_speech_quality.py`
- Generate: `paper/demo_build/audio/demo_clip.mp3`
- Generate: `paper/demo_build/audio/demo_clip.vtt`
- Regenerate: `paper/demo_build/audio/durations.json`

**Interfaces:**
- Consumes: `audio/demo_clip.txt` and the existing synthesis settings.
- Produces: `demo_clip.mp3`, `demo_clip.vtt`, and `durations.json["demo_clip"]`.

- [ ] **Step 1: Add failing audio-output expectations**

Extend `verify_audio_outputs.py` to require `demo_clip.mp3` and to assert:

```python
demo_duration > 4.0
demo_duration <= 7.0
```

Write the manifest entry:

```python
"demo_clip": {
    "seconds": round(demo_duration, 3),
    "video_seconds": 7.211,
}
```

Keep the six-slide padded total check at 100–110 seconds and add:

```python
estimated_video_total = padded_total + 7.211
assert 115.0 <= estimated_video_total < 120.0
```

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/demo_build/verify_audio_outputs.py
```

Expected: FAIL because `demo_clip.mp3` does not exist.

- [ ] **Step 2: Generate the live narration with the same male voice**

Extend `generate_audio.sh` to synthesize the six slide stems plus `demo_clip`, using the existing voice, rate, and pitch.

Run:

```bash
bash paper/demo_build/generate_audio.sh
```

If the live narration exceeds 7.0 seconds, shorten only `DEMO_CLIP.narration`, update the exact content assertion, re-export, and regenerate until the narration completes within the source video.

- [ ] **Step 3: Extend speech-quality verification**

Process the stems in playback order:

```python
[
    "slide_1",
    "slide_2",
    "slide_3",
    "slide_4",
    "demo_clip",
    "slide_5",
    "slide_6",
]
```

Verify that the VTT text exactly matches each source TXT, cues are monotonic, maximum internal silence is at most 1 second, and speech rate remains between 4.0 and 6.2 normalized characters per second.

- [ ] **Step 4: Verify narration artifacts**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/demo_build/verify_audio_outputs.py
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/demo_build/verify_speech_quality.py
```

Expected: both checks pass and the manifest estimates a final duration below 120 seconds.

### Task 3: Record the live insert in the DOCX

**Files:**
- Modify: `paper/demo_build/build_documents.mjs`
- Modify: `paper/demo_build/verify_documents.mjs`
- Regenerate: `dome/ChinaVR_Awatar_论文Demo.pptx`
- Regenerate: `dome/ChinaVR_Awatar_逐页中文讲述词.docx`

**Interfaces:**
- Consumes: `DEMO_CLIP` and `durations.json["demo_clip"]`.
- Produces: a six-slide PPTX and a DOCX with seven measured narration sections.

- [ ] **Step 1: Add failing document assertions**

Keep the expected PPT slide count at six. Update the DOCX expectation to seven occurrences of `实测配音：` and require:

```javascript
assert.match(documentXml, /实机交互插段/);
assert.match(documentXml, /厕所问路/);
assert.match(documentXml, /7\.211 秒/);
```

Run:

```bash
node paper/demo_build/verify_documents.mjs
```

Expected: FAIL because the existing DOCX has only six sections.

- [ ] **Step 2: Insert a standalone DOCX section after slide 4**

In `buildNarrationDocument()`, read `durationManifest.demo_clip.seconds`. After adding slide 4, append a page-break heading, position note, measured narration duration, source-video duration, the exact live narration, and a note that this is a video insert rather than PPT page 7.

- [ ] **Step 3: Rebuild and verify the documents**

Run:

```bash
node paper/demo_build/build_documents.mjs
node paper/demo_build/verify_documents.mjs
```

Expected: PPT remains six slides; DOCX records seven narration sections and the live insert text.

### Task 4: Encode and insert the narrated operation segment

**Files:**
- Modify: `paper/demo_build/compose_video.py`
- Modify: `paper/demo_build/verify_video_output.py`
- Modify: `paper/demo_build/verify_deliverables.py`
- Regenerate: `dome/ChinaVR_Awatar_论文Demo.mp4`

**Interfaces:**
- Consumes: `paper/test.mp4`, `audio/demo_clip.mp3`, `durations.json`, and six rendered slide PNGs.
- Produces: playback order `slide 1–4 → demo clip → slide 5–6`.

- [ ] **Step 1: Add failing final-video assertions**

In `verify_video_output.py`, require:

```python
115.0 <= duration <= 118.5
duration < 120.0
```

Compute the demo start as the sum of the first four slide narration durations plus `0.6 * 4`. Extract a 320×180 RGB frame from the source at 3.5 seconds and from the final video at `demo_start + 3.5`; assert mean absolute pixel error is below 8.

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/demo_build/verify_video_output.py
```

Expected: FAIL because the old 108.976-second video does not contain the operation segment.

- [ ] **Step 2: Add operation-segment encoding**

Add `encode_demo_segment()` to:

- probe the exact source duration;
- ignore the source AAC stream;
- convert video to 1920×1080, 30 fps, H.264 high profile, yuv420p;
- normalize the new narration, delay it by 200 ms, convert it to 48 kHz stereo AAC, and pad it to the source duration;
- apply short video fades;
- stop exactly at the 7.211-second source duration.

Insert the encoded segment after `segment_4.mp4` and before `segment_5.mp4`.

- [ ] **Step 3: Update delivery checks**

In `verify_deliverables.py`:

- keep the PPT slide count at six;
- expect seven DOCX measured narration sections;
- require the live narration text in DOCX only;
- accept a final duration from 115 to 118.5 seconds while preserving the `<120` hard assertion;
- require the output video to be newer than `paper/test.mp4` and the narration manifest;
- measure the operation interval audio and assert mean volume is above -30 dB and peak remains below 0 dB.

- [ ] **Step 4: Compose the final video**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/demo_build/compose_video.py
```

Expected: seven encoded segments are concatenated into `dome/ChinaVR_Awatar_论文Demo.mp4`.

### Task 5: Final audiovisual verification

**Files:**
- Verify: `dome/ChinaVR_Awatar_论文Demo.pptx`
- Verify: `dome/ChinaVR_Awatar_逐页中文讲述词.docx`
- Verify: `dome/ChinaVR_Awatar_论文Demo.mp4`

**Interfaces:**
- Consumes: the three final deliverables.
- Produces: evidence that the live segment is visible, narrated, synchronized, and below 120 seconds.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
node paper/demo_build/verify_content.mjs
node paper/demo_build/verify_audio_inputs.mjs
node paper/demo_build/verify_documents.mjs
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/demo_build/verify_audio_outputs.py
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/demo_build/verify_speech_quality.py
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/demo_build/verify_video_output.py
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/demo_build/verify_deliverables.py
```

Expected: every check passes.

- [ ] **Step 2: Inspect the operation interval**

Extract frames immediately before the insert, at 0.5, 3.5, and 6.8 seconds inside it, and immediately after it. Confirm the order is slide 4, real interface, slide 5; confirm the complete question, emotion state, response text, and avatar action remain visible.

- [ ] **Step 3: Inspect narration continuity**

Extract the operation interval audio, run `volumedetect` and `silencedetect`, inspect the VTT timing, and listen through local playback diagnostics where available. Confirm the narration begins after the clip appears, completes before the clip ends, contains no truncation or stutter, and leaves no long silent interval.

- [ ] **Step 4: Verify final media properties and hashes**

Use FFprobe to confirm 1920×1080, 30 fps, H.264/AAC and a duration below 120 seconds. Record SHA-256 hashes and preserve exactly the three public files in `dome/`.

- [ ] **Step 5: Preserve the current branch**

Keep branch `v2-new-version` and the normal worktree at `/home/czg/czg/python_projects/digital_awatar`; do not push, merge, or create a PR.

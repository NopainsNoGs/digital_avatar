# ChinaVR Paper Author and Affiliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the final ChinaVR paper with the five approved Chinese and English authors and their three numbered affiliations, while leaving all other manuscript content unchanged.

**Architecture:** Add a focused source/PDF author verifier, fill only the four existing author and affiliation macros in the final 2026-07-30 LaTeX source, compile twice with Tectonic, and inspect the published first page for order, superscripts, wrapping, overlap, and unchanged surrounding content.

**Tech Stack:** XeLaTeX-compatible LaTeX, Tectonic, Python 3, Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), ImageMagick.

## Global Constraints

- Keep exactly five authors in this order: 陈卓岗、周锋、代菊、李瑾、解超.
- Do not include 徐浩延 or `Xu Haoyan`.
- Use surname-first English names: Chen Zhuogang, Zhou Feng, Dai Ju, Li Jin, Xie Chao.
- Map North China University of Technology to affiliation 1, Peng Cheng Laboratory to affiliation 2, and Zhongjiaoxin Co., Ltd. to affiliation 3.
- Modify only `\cnauthors`, `\cnaffil`, `\enauthors`, and `\enaffil` in the manuscript source.
- Do not add departments, locations, postcodes, countries, corresponding-author data, email, funding, dates, or biographies.
- Do not change the title, abstract, keywords, body, figures, tables, references, experiments, or demo deliverables.
- Keep the current `v2-new-version` branch; do not stage the untracked `paper/` tree, push, merge, or create a PR.

---

### Task 1: Add an author-metadata regression verifier

**Files:**
- Create: `paper/verify_paper_authors.py`
- Read: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`
- Read: `paper/ChinaVR_Awatar_Final_20260730.pdf`

**Interfaces:**
- Consumes: the final LaTeX source and published dated PDF.
- Produces: process exit 0 only when all approved source macros and first-page text are present in order, excluded author names are absent, and the PDF is 15 pages after the official-template front-matter reflow.

- [ ] **Step 1: Write the failing verifier**

Create a Python script that requires these exact source strings:

```python
EXPECTED_SOURCE = [
    r"\cnauthors{陈卓岗\textsuperscript{1}，周锋\textsuperscript{1}，代菊\textsuperscript{2}，李瑾\textsuperscript{1}，解超\textsuperscript{3}}",
    "1. 北方工业大学；",
    "2. 鹏城实验室；",
    "3. 中交信有限责任公司",
    r"\enauthors{Chen Zhuogang\textsuperscript{1}, Zhou Feng\textsuperscript{1}, Dai Ju\textsuperscript{2}, Li Jin\textsuperscript{1}, Xie Chao\textsuperscript{3}}",
    "1. North China University of Technology;",
    "2. Peng Cheng Laboratory;",
    "3. Zhongjiaoxin Co., Ltd.",
]
```

The script must reject `徐浩延` and `Xu Haoyan` inside the four metadata
fields. It must run `pdfinfo`, assert 15 pages after the official-template
front-matter reflow, extract page 1 with
`pdftotext -layout`, normalize whitespace, and require the five Chinese
and five English names plus all six Chinese/English institution strings.

- [ ] **Step 2: Run the verifier to confirm RED**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
  paper/verify_paper_authors.py
```

Expected: FAIL because the current manuscript has empty author and
affiliation fields.

### Task 2: Populate only the four front-matter fields

**Files:**
- Modify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex:34-56`

**Interfaces:**
- Consumes: the approved author order, superscript mapping, and English spellings.
- Produces: populated `\cnauthors`, `\cnaffil`, `\enauthors`, and `\enaffil`.

- [ ] **Step 1: Fill the Chinese fields**

Set:

```tex
\cnauthors{陈卓岗\textsuperscript{1}，周锋\textsuperscript{1}，代菊\textsuperscript{2}，李瑾\textsuperscript{1}，解超\textsuperscript{3}}

\cnaffil{%
    1. 北方工业大学；
    2. 鹏城实验室；
    3. 中交信有限责任公司
}
```

- [ ] **Step 2: Fill the English fields**

Set:

```tex
\enauthors{Chen Zhuogang\textsuperscript{1}, Zhou Feng\textsuperscript{1}, Dai Ju\textsuperscript{2}, Li Jin\textsuperscript{1}, Xie Chao\textsuperscript{3}}

\enaffil{%
    1. North China University of Technology;
    2. Peng Cheng Laboratory;
    3. Zhongjiaoxin Co., Ltd.
}
```

- [ ] **Step 3: Run the source verifier before compiling**

Run the author verifier. Expected: source assertions pass, while the PDF
assertions remain red because the published PDF is still the previous
build.

### Task 3: Compile and publish the updated paper

**Files:**
- Generate: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.pdf`
- Regenerate: `paper/ChinaVR_Awatar_Final_20260730.pdf`

**Interfaces:**
- Consumes: the author-populated final LaTeX source.
- Produces: a settled-reference PDF with the five authors and three affiliations.

- [ ] **Step 1: Compile twice with Tectonic**

From `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730`, run:

```bash
XDG_CACHE_HOME=/tmp/tectonic_cache \
  /tmp/tectonic -X compile main.tex \
  --keep-logs --keep-intermediates --reruns 2
```

- [ ] **Step 2: Scan the log**

Require no matches for:

```text
Undefined control sequence
LaTeX Error
Reference ... undefined
Citation ... undefined
Fatal error
```

- [ ] **Step 3: Inspect the candidate first page**

Render page 1 at 180 dpi. Confirm:

- the Chinese and English author rows are centered and unclipped;
- affiliation superscripts match 1, 1, 2, 1, 3;
- each numbered affiliation block is readable;
- title, abstract, and keywords do not overlap;
- no manually added information appears beyond the approved names and institutions.

- [ ] **Step 4: Publish the candidate**

Copy `main.pdf` to `paper/ChinaVR_Awatar_Final_20260730.pdf`.

### Task 4: Run final manuscript verification

**Files:**
- Verify: `paper/ChinaVR_Awatar_Final_20260730.pdf`
- Verify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`

**Interfaces:**
- Consumes: the final source and published PDF.
- Produces: structural, visual, and hash evidence for the author update.

- [ ] **Step 1: Run both focused verifiers**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/verify_paper_authors.py
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/verify_final_paper_layout.py
```

Expected: both pass.

- [ ] **Step 2: Re-extract page 1**

Use `pdftotext -f 1 -l 1 -layout` and confirm the five Chinese names,
five English names, and three bilingual affiliations appear in the
approved order, with no excluded author.

- [ ] **Step 3: Confirm media metadata**

Use `pdfinfo` to confirm A4 layout and 15 pages. The added author and
affiliation rows fill the first page and naturally move the introduction to
page 2; do not compress the official template to preserve the former 14-page
count.

- [ ] **Step 4: Record the final hash**

Run:

```bash
sha256sum paper/ChinaVR_Awatar_Final_20260730.pdf
```

- [ ] **Step 5: Preserve the branch**

Keep `v2-new-version` and the current normal worktree unchanged; do not
stage or commit the untracked `paper/` tree.

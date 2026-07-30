# ChinaVR Paper Float-Page and Article-Number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the float-only page 9 from the final ChinaVR manuscript and render article number `25` on the first page without changing chart sizes, data, prose, author metadata, or official-template typography.

**Architecture:** Extend the two focused PDF verifiers first so they reject the current empty article number and page-9 float-only layout. Apply only three production-source edits: set `\articleno{25}`, remove the `p` placement option from Table 3, and remove it from Figure 4. Recompile twice, publish the candidate PDF, then verify the first page, pages 8--10, all-page contact sheet, references, authors, and media metadata.

**Tech Stack:** XeLaTeX-compatible LaTeX, Tectonic, Python 3, Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), ImageMagick.

## Global Constraints

- The first page must display `文章编号：25`.
- Page 9 must contain Table 3, Figure 4, and Section 3.5 manuscript prose.
- Every PDF page must contain manuscript prose rather than only floating tables or figures.
- Keep Figure 4 at `0.86\linewidth`; do not change its asset, caption, label, data, or chart styling.
- Keep Table 3 contents, caption, label, and tabular formatting unchanged.
- Keep page 8's Figure 2, Figure 3, Section 3.4 heading, and quantitative result paragraph.
- Do not change authors, affiliations, title, abstracts, keywords, body wording, references, experiments, or demo files.
- Preserve the official template's fonts, margins, and spacing.
- Keep the current `v2-new-version` branch; do not stage the untracked `paper/` tree, push, merge, or create a PR.

---

### Task 1: Add failing metadata and page-9 regression checks

**Files:**
- Modify: `paper/verify_paper_authors.py`
- Modify: `paper/verify_final_paper_layout.py`
- Read: `paper/ChinaVR_Awatar_Final_20260730.pdf`

**Interfaces:**
- Consumes: the current final LaTeX source, generated multimodal experiment source, and published PDF.
- Produces: process exit 0 only when article number 25 and the non-float-only page-9 layout are both present.

- [ ] **Step 1: Extend the article-number verifier**

Add the exact source requirement:

```python
r"\articleno{25}",
```

After whitespace normalization of the first page, add:

```python
assert "文章编号：25" in normalized, "article number 25 missing from first page"
```

- [ ] **Step 2: Extend the page-9 layout verifier**

Add:

```python
MULTIMODAL_SOURCE = (
    PAPER_DIR
    / "ChinaVR_Awatar_Overleaf_FINAL_20260730"
    / "generated_multimodal_experiment.tex"
)
```

Read `MULTIMODAL_SOURCE` and require the exact approved float forms:

```python
multimodal_source = MULTIMODAL_SOURCE.read_text(encoding="utf-8")
assert r"\begin{table}[!htb]" in multimodal_source
assert r"\begin{figure}[htb]" in multimodal_source
assert (
    r"\includegraphics[width=0.86\linewidth]{multimodal_ablation.pdf}"
    in multimodal_source
)
```

Extract page 9 with `pdftotext -layout` and require:

```python
assert "表3" in page_nine or "表 3" in page_nine
assert "图4" in page_nine or "图 4" in page_nine
assert "3.5" in page_nine
assert "模块计算效率" in page_nine
assert "规则文本和自适应融合" in page_nine
```

These checks prove that page 9 contains the expected floats and body prose
rather than only Table 3 and Figure 4.

- [ ] **Step 3: Run both verifiers and confirm RED**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/verify_paper_authors.py
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/verify_final_paper_layout.py
```

Expected: both fail. The author verifier fails because `\articleno{25}` is
absent; the layout verifier fails because the approved Table 3 and Figure 4
placement specifiers are absent.

- [ ] **Step 4: Check verifier syntax**

Run:

```bash
python -m py_compile \
  paper/verify_paper_authors.py \
  paper/verify_final_paper_layout.py
```

Expected: exit 0.

### Task 2: Apply the minimal source changes and publish the PDF

**Files:**
- Modify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`
- Modify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/generated_multimodal_experiment.tex`
- Generate: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.pdf`
- Regenerate: `paper/ChinaVR_Awatar_Final_20260730.pdf`

**Interfaces:**
- Consumes: the approved three source substitutions and failing verifiers from Task 1.
- Produces: a compiled A4 PDF whose first page contains article number 25 and whose page 9 mixes floats with Section 3.5 prose.

- [ ] **Step 1: Set the article number**

Replace:

```tex
\articleno{}
```

with:

```tex
\articleno{25}
```

- [ ] **Step 2: Remove float-page placement from Table 3**

In `generated_multimodal_experiment.tex`, replace:

```tex
\begin{table}[htbp]
```

with:

```tex
\begin{table}[!htb]
```

- [ ] **Step 3: Remove float-page placement from Figure 4**

In the same file, replace:

```tex
\begin{figure}[htbp]
```

with:

```tex
\begin{figure}[htb]
```

Do not change `width=0.86\linewidth` or any table/figure content.

- [ ] **Step 4: Compile the candidate twice**

From `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730`, run:

```bash
XDG_CACHE_HOME=/tmp/tectonic_cache \
  /tmp/tectonic -X compile main.tex \
  --keep-logs --keep-intermediates --reruns 2
```

Expected: exit 0 and `main.pdf` generated.

- [ ] **Step 5: Confirm candidate pagination and page text**

Run:

```bash
pdfinfo main.pdf | rg '^(Pages|Page size):'
pdftotext -f 1 -l 1 -layout main.pdf -
pdftotext -f 8 -l 10 -layout main.pdf -
```

Require A4, 15 pages, `文章编号：25` on page 1, the retained page-8 content,
and Section 3.5 body prose on page 9. If the natural pagination differs from
15 pages, stop and diagnose which float or paragraph moved before publishing;
do not force the count by changing typography.

- [ ] **Step 6: Publish the candidate**

Run:

```bash
cp \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.pdf \
  paper/ChinaVR_Awatar_Final_20260730.pdf
```

Then require:

```bash
cmp -s \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.pdf \
  paper/ChinaVR_Awatar_Final_20260730.pdf
```

Expected: exit 0.

### Task 3: Verify every page and preserve prior fixes

**Files:**
- Verify: `paper/ChinaVR_Awatar_Final_20260730.pdf`
- Verify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.log`
- Verify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`

**Interfaces:**
- Consumes: the published PDF and source tree from Task 2.
- Produces: automated, textual, visual, and checksum evidence for the final deliverable.

- [ ] **Step 1: Run the focused verifiers**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/verify_paper_authors.py
/home/czg/anaconda3/envs/digital_avatar/bin/python paper/verify_final_paper_layout.py
```

Expected:

```text
paper author metadata: PASS
final paper page-8 layout: PASS
```

- [ ] **Step 2: Scan the LaTeX log**

Require no matches for:

```text
Undefined control sequence
LaTeX Error
Reference ... undefined
Citation ... undefined
Fatal error
```

Run:

```bash
if rg -n \
  'Undefined control sequence|LaTeX Error|Reference .* undefined|Citation .* undefined|Fatal error' \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.log
then
  exit 1
fi
```

- [ ] **Step 3: Render targeted pages**

Render page 1 and pages 8--10 at 180 dpi:

```bash
mkdir -p /tmp/chinavr_float_fix
pdftoppm -f 1 -l 1 -png -r 180 \
  paper/ChinaVR_Awatar_Final_20260730.pdf \
  /tmp/chinavr_float_fix/page
pdftoppm -f 8 -l 10 -png -r 180 \
  paper/ChinaVR_Awatar_Final_20260730.pdf \
  /tmp/chinavr_float_fix/body
```

Inspect the four images and confirm no clipping or overlap, article number
25 is visible, page 8 remains balanced, page 9 includes readable prose, and
page 10 starts naturally.

- [ ] **Step 4: Render a full-document contact sheet**

Render all 15 pages at 90 dpi, then create a 5-by-3 contact sheet:

```bash
pdftoppm -f 1 -l 15 -png -r 90 \
  paper/ChinaVR_Awatar_Final_20260730.pdf \
  /tmp/chinavr_float_fix/all
montage /tmp/chinavr_float_fix/all-*.png \
  -tile 5x3 -geometry +8+8 \
  /tmp/chinavr_float_fix/contact-sheet.png
```

Inspect the contact sheet and confirm no page consists only of floating
tables or figures. For any visually sparse page, inspect its full-resolution
render and extracted text before accepting it.

- [ ] **Step 5: Reconfirm authors and article number**

Extract page 1 and require the five approved Chinese and English authors,
the three bilingual affiliations, `文章编号：25`, and no `徐浩延` or
`Xu Haoyan`.

- [ ] **Step 6: Record final metadata and checksum**

Run:

```bash
pdfinfo paper/ChinaVR_Awatar_Final_20260730.pdf \
  | rg '^(Pages|Page size|File size):'
sha256sum paper/ChinaVR_Awatar_Final_20260730.pdf
```

Expected: A4 media metadata, the verified natural page count, and a final
SHA-256 value.

- [ ] **Step 7: Preserve the branch**

Keep `v2-new-version` and the current normal worktree unchanged. Do not
stage or commit the untracked `paper/` source tree, and do not modify any
unrelated tracked or untracked files.

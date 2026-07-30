# ChinaVR Paper Page 8 Float Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Figures 2 and 3 into independent LaTeX floats so page 8 contains figure material plus body text or a table without reducing figure readability.

**Architecture:** Add a focused source/PDF layout verifier, then make the smallest LaTeX change by closing the Figure 2 float and opening a new Figure 3 float. Compile the final 2026-07-30 Overleaf source twice with Tectonic, replace the dated final PDF, and inspect pages 7–9 plus cross-reference and page-count evidence.

**Tech Stack:** XeLaTeX-compatible LaTeX, Tectonic, Python 3, Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`), ImageMagick.

## Global Constraints

- Modify only `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`, the regenerated dated final PDF, and a focused verification script.
- Preserve Figure 2 and Figure 3 image widths, captions, labels, and reference order.
- Do not change experimental values, bibliography, figure assets, demo deliverables, or unrelated working-tree content.
- Page 8 must contain body text or a table in addition to figure material.
- Preserve a 14-page paper if feasible and introduce no missing-reference or fatal compilation errors.
- Keep the current `v2-new-version` branch; do not push, merge, or create a PR.

---

### Task 1: Add a regression check for the page-8 float layout

**Files:**
- Create: `paper/verify_final_paper_layout.py`
- Read: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`
- Read: `paper/ChinaVR_Awatar_Final_20260730.pdf`

**Interfaces:**
- Consumes: a LaTeX source path and its compiled final PDF at fixed repository locations.
- Produces: process exit 0 only when Figures 2 and 3 are separate floats, the PDF has 14 pages, page 8 contains Section 3.4 body content or Table 3, and figure references are present.

- [ ] **Step 1: Write the failing verifier**

Create a Python verifier that:

```python
source = SOURCE.read_text(encoding="utf-8")
figure_two = source.index(r"\label{fig:confusion}")
figure_three = source.index(r"\label{fig:f1}")
between = source[figure_two:figure_three]
assert r"\end{figure}" in between
assert r"\begin{figure}" in between
```

It must also run `pdfinfo` and `pdftotext -f 8 -l 8 -layout`, assert a
14-page PDF, require Table 3 and `多模态情感识别消融结果` in page-8 text, and
reject `??` cross-reference markers in the full extracted text. The Section
3.4 heading itself may remain on page 7 as long as its body continues on
page 8.

- [ ] **Step 2: Run the verifier to confirm RED**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
  paper/verify_final_paper_layout.py
```

Expected: FAIL because `fig:confusion` and `fig:f1` still belong to one
indivisible `figure` environment and page 8 has no Section 3.4 text.

### Task 2: Split the two figure floats

**Files:**
- Modify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex:281-291`

**Interfaces:**
- Consumes: existing `confusion_matrices.pdf` and `independent_f1.pdf`.
- Produces: two consecutive `figure` environments with unchanged image widths, captions, and labels.

- [ ] **Step 1: Implement the minimal source change**

Replace the shared block with:

```tex
\begin{figure}[!htbp]
    \centering
    \includegraphics[width=0.93\linewidth]{confusion_matrices.pdf}
    \caption{内部验证集与独立短句集的混淆矩阵}
    \label{fig:confusion}
\end{figure}

\begin{figure}[htbp]
    \centering
    \includegraphics[width=0.61\linewidth]{independent_f1.pdf}
    \caption{独立短句集上各情感类别的 F1}
    \label{fig:f1}
\end{figure}
```

Do not change either width or caption.

- [ ] **Step 2: Run the source portion of the verifier**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
  paper/verify_final_paper_layout.py
```

Expected before recompiling: the source split passes, while the PDF page-8
assertion remains red because the dated final PDF is still the old build.

### Task 3: Recompile and replace the final PDF

**Files:**
- Generate: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.pdf`
- Regenerate: `paper/ChinaVR_Awatar_Final_20260730.pdf`

**Interfaces:**
- Consumes: the split-float LaTeX source and existing generated data/figure assets.
- Produces: a settled-reference 14-page final PDF.

- [ ] **Step 1: Compile the source twice**

From `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730`, run:

```bash
XDG_CACHE_HOME=/tmp/tectonic_cache \
  /tmp/tectonic -X compile main.tex \
  --keep-logs --keep-intermediates --reruns 2
```

Expected: `main.pdf` is produced with no fatal error.

- [ ] **Step 2: Check the build log before publishing**

Run:

```bash
rg -n "Undefined control sequence|LaTeX Error|Reference .* undefined|Citation .* undefined|Fatal error" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.log
```

Expected: no matches.

- [ ] **Step 3: Replace the dated final PDF**

Copy the newly compiled `main.pdf` to
`paper/ChinaVR_Awatar_Final_20260730.pdf`, preserving the existing public
filename.

- [ ] **Step 4: Run the layout verifier to confirm GREEN**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
  paper/verify_final_paper_layout.py
```

Expected: PASS.

### Task 4: Inspect pages 7–9 and the final artifact

**Files:**
- Verify: `paper/ChinaVR_Awatar_Final_20260730.pdf`

**Interfaces:**
- Consumes: the rebuilt PDF.
- Produces: visual and structural evidence that page 8 is no longer figure-only.

- [ ] **Step 1: Render pages 7–9**

Render pages 7–9 at 150 dpi and create a three-page contact sheet.

- [ ] **Step 2: Inspect the contact sheet**

Confirm that:

- page 8 contains figure content and Section 3.4 text or Table 3;
- Figure 2 precedes Figure 3;
- neither figure is visibly reduced;
- pages 7 and 9 have no new large blank areas or broken reading order.

- [ ] **Step 3: Verify final metadata and references**

Run `pdfinfo`, `pdftotext`, and the layout verifier. Confirm 14 pages,
resolved Figure 2/3 references, and no `??` markers.

- [ ] **Step 4: Record the final SHA-256 hash**

Run:

```bash
sha256sum paper/ChinaVR_Awatar_Final_20260730.pdf
```

- [ ] **Step 5: Preserve the current branch**

Leave `v2-new-version` and the current working tree in place. Do not stage
or commit the untracked `paper/` tree, and do not push or create a PR.

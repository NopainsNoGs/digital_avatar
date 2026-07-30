# ChinaVR Figure 5 and Figure 6 Visual Bar Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Figure 5 and Figure 6 bars visually equal in the final paper while preserving all chart and paper dimensions.

**Architecture:** Measure each bar in display pixels, normalize it by the tight saved-figure width, and apply the exact LaTeX `\includegraphics` ratio. Use a Figure-5-specific data-coordinate width of `0.277`; keep Figure 6 at `0.218`.

**Tech Stack:** Python 3.10, Matplotlib, `unittest`, Tectonic, Poppler.

## Global Constraints

- Figure 5 and Figure 6 final-paper visual bar widths must differ by no more than 1%.
- Keep Figure 5 canvas dimensions, logarithmic y-axis, fonts, labels, values, and LaTeX insertion ratio unchanged.
- Keep Figure 6 at its verified `0.218` data-coordinate bar width.
- Do not change other figures, experiment data, paper text, or references.
- Do not stage or commit the existing untracked `paper/` tree.

---

### Task 1: Add final-paper scale-aware regression coverage

**Files:**
- Modify: `paper/experiments/tests/test_visual_revision.py`
- Test: `paper/experiments/tests/test_visual_revision.py`

**Interfaces:**
- Consumes: `visible_bars(axis)`, Matplotlib renderers, tight bounding boxes, and the LaTeX width ratios `0.75`, `0.76`, and `0.82`.
- Produces: `normalized_bar_width_after_latex_scaling(figure, axis, latex_width_ratio)` and an extended final-width test for Figures 5, 6, and 8.

- [ ] **Step 1: Add the scale-aware test helper**

Add after `visible_bars`:

```python
def normalized_bar_width_after_latex_scaling(
    figure,
    axis,
    latex_width_ratio: float,
) -> float:
    figure.canvas.draw()
    renderer = figure.canvas.get_renderer()
    bar_width_px = visible_bars(axis)[0].get_window_extent(renderer).width
    saved_width_inches = (
        figure.get_tightbbox(renderer).width
        + 2 * plt.rcParams["savefig.pad_inches"]
    )
    return (
        bar_width_px
        * latex_width_ratio
        / (saved_width_inches * figure.dpi)
    )
```

- [ ] **Step 2: Extend the existing display-width test**

Rename the test to:

```python
def test_figures_5_6_and_8_bars_match_after_latex_scaling(self) -> None:
```

Render Figure 5 before Figures 6 and 8:

```python
latency = {
    "runtime_text_rules": {"median_ms": 0.010},
    "adaptive_fusion": {"median_ms": 0.014},
    "text_classifier_cpu": {"median_ms": 0.058},
    "text_classifier_cuda": {"median_ms": 0.126},
    "viseme_generation": {"median_ms": 1.824},
}
plots.plot_latency_summary(latency)
figure_5 = plt.gcf()
width_5 = normalized_bar_width_after_latex_scaling(
    figure_5,
    figure_5.axes[0],
    0.75,
)
figure_5.clear()
```

Compute Figure 6 and Figure 8 widths with the same helper and ratios `0.76` and `0.82`, then assert:

```python
self.assertLessEqual(abs(width_5 - width_6) / width_6, 0.01)
self.assertLessEqual(abs(width_8 - width_6) / width_6, 0.01)
```

Update the structural expectation for `latency_summary` from `0.52` to `0.277`.

- [ ] **Step 3: Run the suite to verify RED**

Run:

```bash
PYTHONWARNINGS=ignore \
MPLCONFIGDIR=/tmp/matplotlib-paper-figure5-red \
XDG_CACHE_HOME=/tmp/xdg-cache-paper-figure5-red \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/tests/test_visual_revision.py
```

Expected: FAIL because Figure 5 still uses width `0.52` and its final normalized visual width is approximately 1.779 times Figure 6.

### Task 2: Apply the minimum Figure 5 width correction

**Files:**
- Modify: `paper/experiments/run_paper_experiments.py`
- Test: `paper/experiments/tests/test_visual_revision.py`

**Interfaces:**
- Consumes: `plot_latency_summary`.
- Produces: `LATENCY_BAR_WIDTH = 0.277`, used only by Figure 5.

- [ ] **Step 1: Replace the generic single-bar constant**

Replace:

```python
SINGLE_BAR_WIDTH = 0.52
```

with:

```python
LATENCY_BAR_WIDTH = 0.277
```

- [ ] **Step 2: Apply the constant in Figure 5**

In `plot_latency_summary`, replace:

```python
width=SINGLE_BAR_WIDTH
```

with:

```python
width=LATENCY_BAR_WIDTH
```

- [ ] **Step 3: Run the complete suite to verify GREEN**

Run:

```bash
PYTHONWARNINGS=ignore \
MPLCONFIGDIR=/tmp/matplotlib-paper-figure5-green \
XDG_CACHE_HOME=/tmp/xdg-cache-paper-figure5-green \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/tests/test_visual_revision.py
```

Expected: all four tests pass; Figures 5, 6, and 8 each differ from Figure 6 by no more than 1% after final-paper scaling.

- [ ] **Step 4: Run syntax and whitespace checks**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
-m py_compile paper/experiments/run_paper_experiments.py
git diff --check
```

Expected: both commands exit with status 0.

### Task 3: Regenerate and synchronize only Figure 5

**Files:**
- Regenerate: `paper/chinavr+2026/chinavr 2026/figures/latency_summary.pdf`
- Regenerate: `paper/chinavr+2026/chinavr 2026/figures/latency_summary.png`
- Synchronize: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/latency_summary.pdf`
- Synchronize: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/latency_summary.png`

**Interfaces:**
- Consumes: the corrected plotting script and existing experiment data.
- Produces: updated Figure 5 assets without changing Figures 6, 7, or 8.

- [ ] **Step 1: Regenerate real-data figures**

Run:

```bash
MPLCONFIGDIR=/tmp/matplotlib-paper-figure5-final \
XDG_CACHE_HOME=/tmp/xdg-cache-paper-figure5-final \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/run_paper_experiments.py --skip-core
```

Expected: experiment summaries remain unchanged.

- [ ] **Step 2: Synchronize Figure 5 only**

Copy `latency_summary.pdf` and `latency_summary.png` from the canonical figure directory into the final Overleaf source directory. Confirm Figures 6, 7, and 8 retain their pre-change SHA-256 hashes.

### Task 4: Rebuild and verify the delivery

**Files:**
- Rebuild: `paper/ChinaVR_Awatar_Final_20260730.pdf`
- Rebuild: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip`

**Interfaces:**
- Consumes: final Overleaf source with corrected Figure 5.
- Produces: verified 14-page PDF and minimal Overleaf ZIP.

- [ ] **Step 1: Compile in a temporary directory**

Copy the final source directory into `/tmp` and run:

```bash
XDG_CACHE_HOME=/tmp/tectonic_cache \
/tmp/tectonic -X compile main.tex \
--keep-logs --keep-intermediates --reruns 2
```

Expected: a 14-page PDF with no errors, undefined references, missing files, or overfull boxes.

- [ ] **Step 2: Inspect Figures 5 and 6 in the paper**

Raster page 10 at 160 DPI; if pagination changes, locate both captions through extracted text and inspect the corresponding pages. Verify equal final visual thickness, readable labels, and no clipping or overlap.

- [ ] **Step 3: Replace final artifacts**

Replace the final PDF with the compiled result. Build the minimal Overleaf ZIP from the required TeX fragments and referenced assets; run `unzip -t` before replacement.

- [ ] **Step 4: Perform fresh completion verification**

Run the four visual tests, exact normalized-width measurement, syntax check, `pdfinfo`, `pdftotext`, fresh ZIP compilation, 14-page render comparison, archive policy check, unchanged Figure 6/7/8 hash checks, and delivery SHA-256 checks.

- [ ] **Step 5: Preserve the current branch**

Keep `v2-new-version` and the normal worktree at `/home/czg/czg/python_projects/digital_awatar`; do not push, merge, or create a PR.

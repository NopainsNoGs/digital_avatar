# ChinaVR Figure 6 and Figure 8 Visual Bar Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the displayed bar widths in Figure 6 and Figure 8 differ by no more than 1 px while preserving their current layouts and all paper content.

**Architecture:** Keep the existing figure dimensions and LaTeX insertion widths. Introduce a Figure-6-specific data-coordinate bar width of `0.218`, because Figure 6 has four category groups while Figure 8 has six and Matplotlib adds automatic x-axis margins; verify the result in display coordinates through Matplotlib's renderer rather than comparing only data-coordinate widths.

**Tech Stack:** Python 3.10, Matplotlib, `unittest`, Tectonic, Poppler.

## Global Constraints

- Figure 6 and Figure 8 displayed bar widths must differ by no more than 1 px.
- Keep Figure 6 and Figure 8 canvas dimensions, fonts, axes, legends, value labels, and LaTeX insertion widths unchanged.
- Do not change Figures 2, 3, 4, 5, or 7.
- Do not change experiment data.
- Do not stage or commit the existing untracked `paper/` tree.

---

### Task 1: Add a display-width regression test

**Files:**
- Modify: `paper/experiments/tests/test_visual_revision.py`
- Test: `paper/experiments/tests/test_visual_revision.py`

**Interfaces:**
- Consumes: `plots.plot_ttfa_results`, `plots.plot_user_study_results`, and `visible_bars(axis)`.
- Produces: `test_ttfa_and_user_study_bars_have_matching_display_width`.

- [ ] **Step 1: Write the failing test**

Update the TTFA structural expectation from `0.32` to `0.218`, then add:

```python
def test_ttfa_and_user_study_bars_have_matching_display_width(self) -> None:
    plots.configure_plot_style()
    ttfa = {
        "latency_ms": {
            "llm_first_delta": {"median_ms": 111, "p95_ms": 180},
            "sentence_wait": {"median_ms": 311, "p95_ms": 444},
            "tts_first_chunk": {"median_ms": 329, "p95_ms": 1077},
            "ttfa": {"median_ms": 813, "p95_ms": 1404},
        }
    }
    with tempfile.TemporaryDirectory() as temporary_directory:
        output_dir = Path(temporary_directory)
        with (
            patch.object(plots, "FIGURE_DIR", output_dir),
            patch.object(plots.plt, "close", lambda figure: None),
        ):
            plots.plot_ttfa_results(ttfa)
            figure_6 = plt.gcf()
            figure_6.canvas.draw()
            width_6 = visible_bars(figure_6.axes[0])[0].get_window_extent(
                figure_6.canvas.get_renderer()
            ).width
            figure_6.clear()

            plots.plot_user_study_results(user_study_result())
            figure_8 = plt.gcf()
            figure_8.canvas.draw()
            width_8 = visible_bars(figure_8.axes[0])[0].get_window_extent(
                figure_8.canvas.get_renderer()
            ).width
            figure_8.clear()

    self.assertLessEqual(abs(width_6 - width_8), 1.0)
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
PYTHONWARNINGS=ignore \
MPLCONFIGDIR=/tmp/matplotlib-paper-width-red \
XDG_CACHE_HOME=/tmp/xdg-cache-paper-width-red \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/tests/test_visual_revision.py
```

Expected: FAIL because Figure 6 is still approximately `33.8 px`, Figure 8 approximately `24.4 px`, and Figure 6 still uses data-coordinate width `0.32`.

### Task 2: Apply the minimum Figure 6 width correction

**Files:**
- Modify: `paper/experiments/run_paper_experiments.py`
- Test: `paper/experiments/tests/test_visual_revision.py`

**Interfaces:**
- Consumes: the current grouped-bar plotting implementation.
- Produces: `TTFA_GROUPED_BAR_WIDTH = 0.218`, used only by `plot_ttfa_results`.

- [ ] **Step 1: Add the Figure 6 width constant**

Add beside the shared bar constants:

```python
TTFA_GROUPED_BAR_WIDTH = 0.218
```

- [ ] **Step 2: Use the constant for both Figure 6 series**

In `plot_ttfa_results`, replace the two position offsets and two `width` arguments:

```python
positions - TTFA_GROUPED_BAR_WIDTH / 2
positions + TTFA_GROUPED_BAR_WIDTH / 2
width=TTFA_GROUPED_BAR_WIDTH
```

- [ ] **Step 3: Run the complete visual regression suite to verify GREEN**

Run:

```bash
PYTHONWARNINGS=ignore \
MPLCONFIGDIR=/tmp/matplotlib-paper-width-green \
XDG_CACHE_HOME=/tmp/xdg-cache-paper-width-green \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/tests/test_visual_revision.py
```

Expected: all four tests pass, including a measured Figure 6/Figure 8 display-width difference no greater than 1 px.

- [ ] **Step 4: Run syntax and whitespace checks**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
-m py_compile paper/experiments/run_paper_experiments.py
git diff --check
```

Expected: both commands exit with status 0.

### Task 3: Regenerate and synchronize the paper

**Files:**
- Regenerate: `paper/chinavr+2026/chinavr 2026/figures/ttfa_breakdown.pdf`
- Regenerate: `paper/chinavr+2026/chinavr 2026/figures/ttfa_breakdown.png`
- Synchronize: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/ttfa_breakdown.pdf`
- Synchronize: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/ttfa_breakdown.png`
- Rebuild: `paper/ChinaVR_Awatar_Final_20260730.pdf`
- Rebuild: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip`

**Interfaces:**
- Consumes: the corrected plotting script and existing experiment JSON/CSV files.
- Produces: updated Figure 6 and final delivery artifacts.

- [ ] **Step 1: Regenerate real-data figures**

Run:

```bash
MPLCONFIGDIR=/tmp/matplotlib-paper-width-final \
XDG_CACHE_HOME=/tmp/xdg-cache-paper-width-final \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/run_paper_experiments.py --skip-core
```

Expected: experiment summaries are unchanged and `ttfa_breakdown.pdf/png` are regenerated.

- [ ] **Step 2: Synchronize only Figure 6**

Copy the regenerated Figure 6 PDF and PNG from the canonical figure directory into the final Overleaf source figure directory. Verify Figure 8 and Figure 7 hashes remain unchanged.

- [ ] **Step 3: Compile the final source in a temporary directory**

Copy `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730` into a new `/tmp` directory and run:

```bash
XDG_CACHE_HOME=/tmp/tectonic_cache \
/tmp/tectonic -X compile main.tex \
--keep-logs --keep-intermediates --reruns 2
```

Expected: a 14-page `main.pdf`; no undefined references, missing files, errors, or overfull boxes.

- [ ] **Step 4: Update the final PDF and Overleaf ZIP**

Copy the verified `main.pdf` to `paper/ChinaVR_Awatar_Final_20260730.pdf`. Rebuild the minimal ZIP with `chinavr.cls`, `main.tex`, generated experiment TeX fragments, and referenced figure assets; run `unzip -t` before replacing the final ZIP.

### Task 4: Final visual and artifact verification

**Files:**
- Verify: `paper/ChinaVR_Awatar_Final_20260730.pdf`
- Verify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip`

**Interfaces:**
- Consumes: final PDF and ZIP.
- Produces: evidence that the requested correction is present and no unrelated content changed.

- [ ] **Step 1: Measure regenerated Figure 6 and Figure 8 display widths**

Run the visual regression suite and record the Figure 6/Figure 8 display widths; the absolute difference must be at most 1 px.

- [ ] **Step 2: Raster and inspect PDF pages containing Figures 6 and 8**

Use `pdftoppm -png -r 160` on the final PDF and inspect pages 10 and 12. Confirm visually equal bar thickness, readable values, and no clipping or overlap.

- [ ] **Step 3: Verify delivery integrity**

Run `pdfinfo`, `pdftotext -layout`, `unzip -t`, log diagnostics, Figure 7 and Figure 8 hash checks, and SHA-256 checksums for the final PDF and ZIP.

- [ ] **Step 4: Preserve the current branch**

Keep branch `v2-new-version` and the normal worktree at `/home/czg/czg/python_projects/digital_awatar`; do not push, merge, or create a PR.

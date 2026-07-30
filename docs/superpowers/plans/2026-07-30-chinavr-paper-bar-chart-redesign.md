# ChinaVR Unified Bar Chart Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five statistical figures with consistently styled bar charts, rebuild the paper, and deliver a visually verified PDF and Overleaf package.

**Architecture:** Keep `run_paper_experiments.py` as the single figure-generation entry point and preserve every source value and category order. Encode shared bar width, color, border, axis, legend, and labeling rules in the plotting module; verify chart structure through Matplotlib artist inspection before regenerating and compiling the paper.

**Tech Stack:** Python 3.10, Matplotlib, NumPy, `unittest`, Tectonic/XeLaTeX, Poppler, ImageMagick, ZIP.

## Global Constraints

- Figure 3 and Figure 4 use horizontal grouped bars.
- Figure 5 uses vertical single bars with a logarithmic vertical axis.
- Figure 6 uses vertical grouped bars for Median and P95.
- Figure 8 uses vertical grouped bars for Baseline and Proposed.
- Grouped bar width is `0.32`; single-series bar width is `0.52`.
- Primary blue is `#2f6f9f`; secondary orange is `#d58a3c`.
- Bar edges are white with line width `0.45`.
- No statistical figure displays background grid lines.
- Experimental values, order, figure numbers, captions, references, and Figure 7 remain unchanged.
- Preserve unrelated working-tree changes and do not stage the pre-existing untracked `paper/` tree.

---

### Task 1: Replace the relational-mark regression tests with bar-chart requirements

**Files:**
- Modify: `paper/experiments/tests/test_visual_revision.py`
- Test: `paper/experiments/tests/test_visual_revision.py`

**Interfaces:**
- Consumes: plotting functions `plot_per_label_f1`, `plot_latency_summary`, `plot_multimodal_results`, `plot_ttfa_results`, and `plot_user_study_results`.
- Produces: `assert_bar_chart(axis, expected_count, expected_thickness, orientation)` and structural tests for the approved layouts.

- [ ] **Step 1: Rewrite the figure structure helper**

Replace `assert_relational_marks_without_background_grid` with:

```python
def visible_bars(axis) -> list[Rectangle]:
    return [
        patch
        for patch in axis.patches
        if isinstance(patch, Rectangle)
        and patch.get_width() > 0
        and patch.get_height() > 0
    ]


def assert_bar_chart(
    axis,
    *,
    expected_count: int,
    expected_thickness: float,
    orientation: str,
) -> None:
    bars = visible_bars(axis)
    assert len(bars) == expected_count
    thicknesses = [
        patch.get_height() if orientation == "horizontal" else patch.get_width()
        for patch in bars
    ]
    assert all(
        np.isclose(thickness, expected_thickness)
        for thickness in thicknesses
    )
    gridlines = axis.xaxis.get_gridlines() + axis.yaxis.get_gridlines()
    assert not any(line.get_visible() for line in gridlines)
```

- [ ] **Step 2: Add exact layout expectations**

Use these expected tuples in the existing figure loop:

```python
BAR_EXPECTATIONS = {
    "independent_f1": (12, 0.32, "horizontal"),
    "latency_summary": (5, 0.52, "vertical"),
    "multimodal_ablation": (14, 0.32, "horizontal"),
    "ttfa_breakdown": (8, 0.32, "vertical"),
    "user_study": (12, 0.32, "vertical"),
}
```

For Figure 6, additionally assert that the first four bar x-positions differ from the second four positions and that both series contain four bars. For Figure 5, assert `axis.get_yscale() == "log"`.

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
PYTHONWARNINGS=ignore \
MPLCONFIGDIR=/tmp/matplotlib-paper-test \
XDG_CACHE_HOME=/tmp/xdg-cache-paper-test \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/tests/test_visual_revision.py
```

Expected: FAIL because the current figures contain zero bar rectangles.

- [ ] **Step 4: Check the scoped diff**

Run:

```bash
git diff --check -- paper/experiments/tests/test_visual_revision.py
git status --short -- paper/experiments/tests/test_visual_revision.py
```

Expected: no whitespace errors; only the test file appears in this task’s scope. Do not stage or commit because `paper/` is pre-existing untracked user content.

---

### Task 2: Implement the five approved bar-chart layouts

**Files:**
- Modify: `paper/experiments/run_paper_experiments.py`
- Test: `paper/experiments/tests/test_visual_revision.py`

**Interfaces:**
- Consumes: unchanged experiment dictionaries and existing constants `PRIMARY_BLUE` and `SECONDARY_ORANGE`.
- Produces: bar-based PDF and PNG output with unchanged stems: `independent_f1`, `latency_summary`, `multimodal_ablation`, `ttfa_breakdown`, and `user_study`.

- [ ] **Step 1: Add shared bar constants**

Add beside the existing palette:

```python
GROUPED_BAR_WIDTH = 0.32
SINGLE_BAR_WIDTH = 0.52
BAR_EDGE_COLOR = "#ffffff"
BAR_EDGE_WIDTH = 0.45
```

- [ ] **Step 2: Convert Figure 3 to horizontal grouped bars**

Use:

```python
axis.barh(
    positions - GROUPED_BAR_WIDTH / 2,
    model_values,
    height=GROUPED_BAR_WIDTH,
    color=PRIMARY_BLUE,
    edgecolor=BAR_EDGE_COLOR,
    linewidth=BAR_EDGE_WIDTH,
    label="字符模型",
)
axis.barh(
    positions + GROUPED_BAR_WIDTH / 2,
    rule_values,
    height=GROUPED_BAR_WIDTH,
    color=SECONDARY_ORANGE,
    edgecolor=BAR_EDGE_COLOR,
    linewidth=BAR_EDGE_WIDTH,
    label="规则分支",
)
```

Keep category order, invert the y-axis, set the x-range to `0, 1.05`, place the legend above the axis, and label each bar end with two decimal places.

- [ ] **Step 3: Convert Figure 5 to vertical single bars**

Use a visible logarithmic baseline:

```python
minimum = max(min(values) / 2.5, 0.001)
axis.bar(
    positions,
    np.asarray(values) - minimum,
    bottom=minimum,
    width=SINGLE_BAR_WIDTH,
    color=PRIMARY_BLUE,
    edgecolor=BAR_EDGE_COLOR,
    linewidth=BAR_EDGE_WIDTH,
)
axis.set_yscale("log")
axis.set_ylim(bottom=minimum)
```

Keep the existing module labels and annotate the actual values, not the baseline-adjusted bar heights.

- [ ] **Step 4: Convert Figure 4 to horizontal grouped bars**

Use two `barh` calls at `positions ± GROUPED_BAR_WIDTH / 2`, preserve the seven method names and their order, set the x-range to `0, 105`, and display one-decimal percentage labels at each bar end.

- [ ] **Step 5: Convert Figure 6 to vertical grouped bars**

Use:

```python
axis.bar(
    positions - GROUPED_BAR_WIDTH / 2,
    medians,
    width=GROUPED_BAR_WIDTH,
    color=PRIMARY_BLUE,
    edgecolor=BAR_EDGE_COLOR,
    linewidth=BAR_EDGE_WIDTH,
    label="中位数",
)
axis.bar(
    positions + GROUPED_BAR_WIDTH / 2,
    p95_values,
    width=GROUPED_BAR_WIDTH,
    color=SECONDARY_ORANGE,
    edgecolor=BAR_EDGE_COLOR,
    linewidth=BAR_EDGE_WIDTH,
    label="P95",
)
```

Set the upper y-limit to `max(p95_values) * 1.14`, use integer labels above the bars, and place the two-column legend above the plotting area.

- [ ] **Step 6: Convert Figure 8 to vertical grouped bars**

Represent the 1--5 rating range using a baseline at 1:

```python
axis.bar(
    positions - GROUPED_BAR_WIDTH / 2,
    np.asarray(baseline) - 1.0,
    bottom=1.0,
    width=GROUPED_BAR_WIDTH,
    color=SECONDARY_ORANGE,
    edgecolor=BAR_EDGE_COLOR,
    linewidth=BAR_EDGE_WIDTH,
    label="基线",
)
axis.bar(
    positions + GROUPED_BAR_WIDTH / 2,
    np.asarray(proposed) - 1.0,
    bottom=1.0,
    width=GROUPED_BAR_WIDTH,
    color=PRIMARY_BLUE,
    edgecolor=BAR_EDGE_COLOR,
    linewidth=BAR_EDGE_WIDTH,
    label="本文方法",
)
```

Retain the `1, 5.15` y-range and place two-decimal labels above each bar.

- [ ] **Step 7: Run the complete visual test and verify GREEN**

Run the Task 1 test command.

Expected: 3 tests pass with no failures.

- [ ] **Step 8: Run syntax and source checks**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python -m py_compile \
paper/experiments/run_paper_experiments.py \
paper/experiments/tests/test_visual_revision.py
rg -n 'axis\\.grid\\(False\\)' paper/experiments/run_paper_experiments.py
```

Expected: Python compilation succeeds and the shared no-grid rule remains present.

- [ ] **Step 9: Check the scoped diff**

Run:

```bash
git diff --check -- \
paper/experiments/run_paper_experiments.py \
paper/experiments/tests/test_visual_revision.py
```

Do not stage or commit the pre-existing untracked paper files.

---

### Task 3: Regenerate, synchronize, and visually inspect the figures

**Files:**
- Regenerate: `paper/chinavr+2026/chinavr 2026/figures/{independent_f1,latency_summary,multimodal_ablation,ttfa_breakdown,user_study}.{pdf,png}`
- Update: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/`
- Preserve: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/system_interface_composite.png`

**Interfaces:**
- Consumes: the updated plotting module and existing experiment data.
- Produces: ten synchronized figure files and a five-figure contact sheet for visual review.

- [ ] **Step 1: Regenerate from stored experimental results**

Run:

```bash
MPLCONFIGDIR=/tmp/matplotlib-paper \
XDG_CACHE_HOME=/tmp/xdg-cache-paper \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/run_paper_experiments.py --skip-core
```

Expected core values: internal accuracy `0.9983`, independent accuracy `0.5556`, fusion median `0.0141 ms`, viseme median `1.8238 ms`.

- [ ] **Step 2: Synchronize PDF and PNG pairs**

Copy the five named PDF/PNG pairs from the canonical figure directory into the final Overleaf `figures/` directory. Also synchronize `generated_multimodal_experiment.tex`, `generated_ttfa_experiment.tex`, and `generated_user_study.tex`.

- [ ] **Step 3: Verify byte identity**

Run `sha256sum` on every canonical/final pair and confirm each pair has identical hashes.

- [ ] **Step 4: Create and inspect a contact sheet**

Use ImageMagick `montage` to place the five final PNGs on `/tmp/chinavr-bar-charts.png`, then inspect it at original detail.

Acceptance:

- Figure 3 and Figure 4 have readable horizontal grouped bars.
- Figure 5 retains a readable logarithmic scale.
- Figure 6 has two clearly separated vertical bars per stage.
- Figure 8 has two clearly separated vertical bars per score dimension.
- All bars have consistent visual weight, labels are not clipped, legends do not overlap data, and no background grid is visible.

- [ ] **Step 5: Preserve Figure 7**

Compare the final Figure 7 hash against `48ebc016b0569d8c90313114e00f89657794c075275ed27256e981ed318530d2`.

Expected: unchanged.

---

### Task 4: Rebuild and validate the final paper deliverables

**Files:**
- Update: `paper/ChinaVR_Awatar_Final_20260730.pdf`
- Update: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip`
- Validate: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`

**Interfaces:**
- Consumes: the final Overleaf source directory and synchronized figures.
- Produces: the final PDF and clean Overleaf ZIP.

- [ ] **Step 1: Compile in an isolated temporary directory**

Copy the source directory to a `mktemp -d` build directory and run:

```bash
XDG_CACHE_HOME=/tmp/tectonic_cache \
/tmp/tectonic -X compile main.tex \
--keep-logs --keep-intermediates --reruns 2
```

Expected: `main.pdf` is produced successfully.

- [ ] **Step 2: Inspect the build log and PDF metadata**

Run:

```bash
rg -n 'Undefined|Citation.*undefined|Reference.*undefined|Overfull|Missing character|Error' main.log
pdfinfo main.pdf
pdftotext -layout main.pdf main.txt
```

Expected: no undefined citations, missing figures, `Overfull`, missing characters, or fatal errors.

- [ ] **Step 3: Inspect every page**

Rasterize every page with `pdftoppm`, make contact sheets in page-order groups, and inspect each at original detail for clipping, overlap, abnormal whitespace, and unreadable charts.

- [ ] **Step 4: Replace final deliverables**

Copy the verified PDF to `paper/ChinaVR_Awatar_Final_20260730.pdf`. Rebuild the ZIP with only `main.tex`, `chinavr.cls`, generated TeX fragments, and the referenced figure assets; exclude `.aux`, `.log`, `.out`, `.xdv`, nested ZIPs, and compiled `main.pdf`.

- [ ] **Step 5: Run final verification**

Run:

```bash
PYTHONWARNINGS=ignore \
MPLCONFIGDIR=/tmp/matplotlib-paper-test \
XDG_CACHE_HOME=/tmp/xdg-cache-paper-test \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
paper/experiments/tests/test_visual_revision.py

unzip -t paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip
pdfinfo paper/ChinaVR_Awatar_Final_20260730.pdf
sha256sum \
paper/ChinaVR_Awatar_Final_20260730.pdf \
paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip
```

Expected: all 3 tests pass, ZIP reports no errors, and the final PDF metadata is readable.

- [ ] **Step 6: Preserve the inline branch**

Run:

```bash
git rev-parse --abbrev-ref HEAD
git status --short -- \
paper/experiments/run_paper_experiments.py \
paper/experiments/tests/test_visual_revision.py \
paper/ChinaVR_Awatar_Overleaf_FINAL_20260730 \
paper/ChinaVR_Awatar_Final_20260730.pdf \
paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip
```

Expected: branch remains `v2-new-version`; no push, merge, or PR is performed.


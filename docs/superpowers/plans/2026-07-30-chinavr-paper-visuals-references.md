# ChinaVR Paper Visuals and References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace five repetitive bar charts with unified relationship-specific graphics, reduce the Figure 7 mosaic strength, audit all current arXiv references, add five formally published 2026 papers, and rebuild submission-ready PDF and Overleaf artifacts.

**Architecture:** Keep `paper/experiments/run_paper_experiments.py` as the canonical statistical-figure generator and `paper/experiments/build_interface_composite.py` as the canonical Figure 7 generator. Add focused regression tests around figure structure, anonymization behavior, and bibliography state; regenerate assets into the experiment paper tree; synchronize only the reviewed outputs into `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/`; compile from a temporary build directory so the source package remains clean.

**Tech Stack:** Python 3.12, Matplotlib, NumPy, Pillow, pytest, XeLaTeX-compatible Tectonic, Poppler PDF utilities, ZIP.

## Global Constraints

- Do not change experimental source data or reported numeric results.
- Do not edit unrelated application, backend, avatar, demo, or IDE files already present in the dirty worktree.
- Do not stage or commit implementation artifacts under `paper/`; those directories are existing untracked user-owned content.
- Remove all five bar-chart encodings and all background grid/reference lines.
- Use blue `#2f6f9f` for the proposed/primary series and orange `#d58a3c` for the baseline/rule/secondary series.
- Keep Figure 7(b)/(c) face coverage unchanged and use an 8-pixel mosaic block, increasing only within 8--10 pixels if visual anonymity is inadequate.
- Convert five verified arXiv-marked entries to formal proceedings references; retain ten verified preprints as arXiv entries.
- Add exactly five formally published 2026 references and cite every new item in the related-work text.
- Build the PDF from the final Overleaf source tree and ensure the PDF and ZIP contain the same reviewed source state.

---

## File Responsibility Map

- `paper/experiments/run_paper_experiments.py`
  - Canonical rendering logic for all five statistical figures.
- `paper/experiments/build_interface_composite.py`
  - Canonical Figure 7 composition and face anonymization.
- `paper/experiments/tests/test_visual_revision.py`
  - Regression tests for chart encodings, grid visibility, output files, mosaic detail, and bibliography status.
- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`
  - Related-work prose, captions when necessary, current reference corrections, and five new references.
- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/`
  - Reviewed final PDF/PNG figures used by `main.tex`.
- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/generated_multimodal_experiment.tex`
- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/generated_ttfa_experiment.tex`
- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/generated_user_study.tex`
  - Generated sections synchronized after chart regeneration.
- `paper/ChinaVR_Awatar_Final_20260730.pdf`
  - Recompiled final manuscript.
- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip`
  - Clean source package matching the final manuscript.

---

### Task 1: Add failing visual regression tests

**Files:**
- Create: `paper/experiments/tests/test_visual_revision.py`
- Read: `paper/experiments/run_paper_experiments.py`
- Read: `paper/experiments/build_interface_composite.py`
- Read: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`

**Interfaces:**
- Consumes: existing functions `plot_per_label_f1`, `plot_latency_summary`, `plot_multimodal_results`, `plot_ttfa_results`, `plot_user_study_results`, and `pixelate_face`.
- Produces: pytest checks that later tasks must satisfy without changing public function signatures.

- [ ] **Step 1: Create the test module and load the two generators**

Use an Agg backend before importing the plotting module:

```python
from __future__ import annotations

import importlib.util
import inspect
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


plots = load_module(
    "paper_plots",
    ROOT / "paper" / "experiments" / "run_paper_experiments.py",
)
interface = load_module(
    "paper_interface",
    ROOT / "paper" / "experiments" / "build_interface_composite.py",
)
```

- [ ] **Step 2: Add reusable chart assertions and deterministic fixtures**

Add:

```python
def assert_no_bars_or_grid(axis):
    bars = [
        patch
        for patch in axis.patches
        if isinstance(patch, Rectangle)
        and patch.get_width() > 0
        and patch.get_height() > 0
    ]
    assert bars == []
    gridlines = axis.xaxis.get_gridlines() + axis.yaxis.get_gridlines()
    assert not any(line.get_visible() for line in gridlines)


def label_result(values):
    return {
        "per_label": {
            label: {"f1": value}
            for label, value in zip(plots.LABELS, values, strict=True)
        }
    }


def multimodal_result():
    keys = [
        "facial_only", "prosody_only", "text_only", "fixed_fusion",
        "adaptive_fusion", "without_facial", "without_prosody",
    ]
    return {
        "metrics": {
            key: {"accuracy": 0.72 + index * 0.02, "macro_f1": 0.70 + index * 0.02}
            for index, key in enumerate(keys)
        }
    }


def user_study_result():
    keys = [
        "reply_usefulness", "emotion_fit", "speech_naturalness",
        "action_naturalness", "lip_sync", "overall_satisfaction",
    ]
    return {
        "conditions": {
            condition: {
                "ratings": {
                    key: {"mean": base + index * 0.05}
                    for index, key in enumerate(keys)
                }
            }
            for condition, base in (("baseline", 3.3), ("proposed", 4.1))
        }
    }
```

- [ ] **Step 3: Add one structural test covering all five figures**

The test captures the current figure before the production function closes it and verifies both PDF and PNG output:

```python
def test_all_five_statistical_figures_have_no_bars_or_grid(tmp_path, monkeypatch):
    monkeypatch.setattr(plots, "FIGURE_DIR", tmp_path)
    monkeypatch.setattr(plots.plt, "close", lambda figure: None)
    plots.configure_plot_style()

    cases = [
        (
            plots.plot_per_label_f1,
            (
                label_result([0.71, 0.74, 0.69, 0.76, 0.73, 0.78]),
                label_result([0.61, 0.65, 0.60, 0.66, 0.64, 0.67]),
            ),
            "independent_f1",
        ),
        (
            plots.plot_latency_summary,
            ({
                "runtime_text_rules": {"median_ms": 0.08},
                "adaptive_fusion": {"median_ms": 0.12},
                "text_classifier_cpu": {"median_ms": 4.2},
                "text_classifier_cuda": {"median_ms": 1.1},
                "viseme_generation": {"median_ms": 280.0},
            },),
            "latency_summary",
        ),
        (plots.plot_multimodal_results, (multimodal_result(),), "multimodal_ablation"),
        (
            plots.plot_ttfa_results,
            ({
                "latency_ms": {
                    "llm_first_delta": {"median_ms": 120, "p95_ms": 180},
                    "sentence_wait": {"median_ms": 260, "p95_ms": 410},
                    "tts_first_chunk": {"median_ms": 340, "p95_ms": 520},
                    "ttfa": {"median_ms": 720, "p95_ms": 1040},
                }
            },),
            "ttfa_breakdown",
        ),
        (plots.plot_user_study_results, (user_study_result(),), "user_study"),
    ]

    for function, arguments, stem in cases:
        function(*arguments)
        figure = plt.gcf()
        assert len(figure.axes) == 1
        assert_no_bars_or_grid(figure.axes[0])
        assert (tmp_path / f"{stem}.pdf").is_file()
        assert (tmp_path / f"{stem}.png").is_file()
        figure.clear()
```

- [ ] **Step 4: Add the mosaic-detail regression test**

Use a synthetic gradient so a lighter mosaic must preserve more local detail while leaving pixels outside the box unchanged:

```python
def test_eight_pixel_mosaic_is_lighter_and_preserves_outside_region():
    grid = np.indices((96, 96)).sum(axis=0).astype(np.uint8)
    rgb = np.stack((grid, np.roll(grid, 7, axis=0), np.roll(grid, 11, axis=1)), axis=2)
    source = Image.fromarray(rgb, mode="RGB")
    box = (0.25, 0.25, 0.75, 0.75)

    assert inspect.signature(interface.pixelate_face).parameters["block_size"].default == 8
    light = interface.pixelate_face(source, box, block_size=8)
    heavy = interface.pixelate_face(source, box, block_size=16)

    light_crop = np.asarray(light)[24:72, 24:72]
    heavy_crop = np.asarray(heavy)[24:72, 24:72]
    assert len(np.unique(light_crop.reshape(-1, 3), axis=0)) > len(
        np.unique(heavy_crop.reshape(-1, 3), axis=0)
    )
    assert np.array_equal(np.asarray(light)[:20, :20], np.asarray(source)[:20, :20])
```

- [ ] **Step 5: Run the tests and verify they fail for the intended reasons**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python -m pytest \
  paper/experiments/tests/test_visual_revision.py -q
```

Expected: failures show existing bar `Rectangle` patches, visible grid lines, and the 16-pixel default mosaic.

- [ ] **Step 6: Record a review checkpoint without staging user-owned paper files**

Run `git status --short` and confirm the only new task artifact is the test file under the already-untracked `paper/experiments/` tree. Do not run `git add paper/...`.

---

### Task 2: Implement all five semantic chart redesigns

**Files:**
- Modify: `paper/experiments/run_paper_experiments.py:510-552`
- Modify: `paper/experiments/run_paper_experiments.py:1210-1334`

**Interfaces:**
- Consumes: the existing result dictionaries and existing output stems.
- Produces: the same `*.pdf` and `*.png` filenames with dot, lollipop, interval, and profile encodings.

- [ ] **Step 1: Add a shared axis-finishing helper**

Place this near `configure_plot_style()` and call it from all five target plotting functions:

```python
PRIMARY_BLUE = "#2f6f9f"
SECONDARY_ORANGE = "#d58a3c"
CONNECTOR_GRAY = "#a9b2bc"


def finish_comparison_axis(axis: plt.Axes) -> None:
    axis.grid(False)
    axis.spines["top"].set_visible(False)
    axis.spines["right"].set_visible(False)
    axis.spines["left"].set_linewidth(0.7)
    axis.spines["bottom"].set_linewidth(0.7)
    axis.tick_params(width=0.7, length=3)
```

- [ ] **Step 2: Replace grouped F1 bars with a horizontal dumbbell plot**

Keep raw F1 values on a 0--1 axis:

```python
positions = np.arange(len(LABELS))
model_values = [model["per_label"][label]["f1"] for label in LABELS]
rule_values = [rules["per_label"][label]["f1"] for label in LABELS]
figure, axis = plt.subplots(figsize=(4.35, 2.7), constrained_layout=True)
for position, model_value, rule_value in zip(
    positions, model_values, rule_values, strict=True
):
    axis.plot(
        [rule_value, model_value], [position, position],
        color=CONNECTOR_GRAY, linewidth=1.1, zorder=1,
    )
axis.scatter(model_values, positions, s=30, color=PRIMARY_BLUE, label="字符模型", zorder=3)
axis.scatter(rule_values, positions, s=30, color=SECONDARY_ORANGE, label="规则分支", zorder=3)
for position, model_value, rule_value in zip(
    positions, model_values, rule_values, strict=True
):
    axis.text(model_value + 0.012, position - 0.12, f"{model_value:.2f}", fontsize=6.3)
    axis.text(rule_value + 0.012, position + 0.19, f"{rule_value:.2f}", fontsize=6.3)
axis.set_yticks(positions, LABEL_NAMES)
axis.invert_yaxis()
axis.set_xlabel("F1")
axis.set_xlim(0, 1.02)
finish_comparison_axis(axis)
```

Keep the existing output filenames and a two-column frameless legend.

- [ ] **Step 3: Replace latency bars with a log-scale lollipop plot**

Use one primary color because the items are pipeline modules, not competing methods:

```python
positions = np.arange(len(names))
figure, axis = plt.subplots(figsize=(4.65, 2.55), constrained_layout=True)
minimum = max(min(values) / 2.5, 0.01)
axis.vlines(positions, minimum, values, color="#b9c6d3", linewidth=1.4, zorder=1)
axis.scatter(positions, values, s=34, color=PRIMARY_BLUE, zorder=3)
axis.set_yscale("log")
axis.set_ylim(bottom=minimum)
for position, value in zip(positions, values, strict=True):
    axis.annotate(
        f"{value:.3f}",
        (position, value),
        xytext=(0, 6),
        textcoords="offset points",
        ha="center",
        va="bottom",
        fontsize=6.3,
    )
finish_comparison_axis(axis)
```

Retain the current module order, rotated labels, and logarithmic-axis wording.

- [ ] **Step 4: Replace horizontal ablation bars with a horizontal dumbbell plot**

Use percent values and a focused x-range based on the actual values rather than a 0--105 baseline:

```python
all_values = accuracy + macro_f1
lower = max(0.0, min(all_values) - 4.0)
upper = min(100.5, max(all_values) + 4.0)
for position, accuracy_value, f1_value in zip(
    positions, accuracy, macro_f1, strict=True
):
    axis.plot(
        [accuracy_value, f1_value], [position, position],
        color=CONNECTOR_GRAY, linewidth=1.1, zorder=1,
    )
axis.scatter(accuracy, positions, s=31, color=PRIMARY_BLUE, label="准确率", zorder=3)
axis.scatter(macro_f1, positions, s=31, color=SECONDARY_ORANGE, label="Macro-F1", zorder=3)
```

Add direct one-decimal labels, invert the y-axis as before, set `axis.set_xlim(lower, upper)`, and call `finish_comparison_axis(axis)`.

- [ ] **Step 5: Replace TTFA grouped bars with horizontal Median--P95 intervals**

Use a blue circle for Median, an orange diamond for P95, and a gray connector:

```python
positions = np.arange(len(keys))
figure, axis = plt.subplots(figsize=(4.8, 2.7), constrained_layout=True)
for position, median, p95 in zip(positions, medians, p95_values, strict=True):
    axis.plot([median, p95], [position, position], color=CONNECTOR_GRAY, linewidth=1.4)
axis.scatter(medians, positions, s=34, marker="o", color=PRIMARY_BLUE, label="中位数", zorder=3)
axis.scatter(p95_values, positions, s=38, marker="D", color=SECONDARY_ORANGE, label="P95", zorder=3)
for position, median, p95 in zip(positions, medians, p95_values, strict=True):
    axis.annotate(f"{median:.0f}", (median, position), xytext=(-4, -10), textcoords="offset points", ha="right", fontsize=6.3)
    axis.annotate(f"{p95:.0f}", (p95, position), xytext=(4, -10), textcoords="offset points", ha="left", fontsize=6.3)
axis.set_yticks(positions, ["LLM 首增量", "切句等待", "TTS 首音频块", "总 TTFA"])
axis.invert_yaxis()
axis.set_xlabel("时延 / ms")
finish_comparison_axis(axis)
```

- [ ] **Step 6: Replace user-study bars with a paired profile plot**

Render baseline in orange and proposed in blue:

```python
baseline = [conditions["baseline"]["ratings"][key]["mean"] for key in keys]
proposed = [conditions["proposed"]["ratings"][key]["mean"] for key in keys]
axis.plot(
    positions, baseline, color=SECONDARY_ORANGE, marker="o",
    markersize=4.5, linewidth=1.4, label="基线",
)
axis.plot(
    positions, proposed, color=PRIMARY_BLUE, marker="o",
    markersize=4.5, linewidth=1.4, label="本文方法",
)
for values, offset in ((baseline, -10), (proposed, 6)):
    for position, value in zip(positions, values, strict=True):
        axis.annotate(
            f"{value:.2f}", (position, value), xytext=(0, offset),
            textcoords="offset points", ha="center", fontsize=6.2,
        )
axis.set_ylim(1, 5.15)
finish_comparison_axis(axis)
```

Keep the six current rating dimensions and the existing output stems.

- [ ] **Step 7: Run the chart regression test**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python -m pytest \
  paper/experiments/tests/test_visual_revision.py::test_all_five_statistical_figures_have_no_bars_or_grid -q
```

Expected: PASS, with ten generated test assets in pytest's temporary directory.

- [ ] **Step 8: Review the source for prohibited encodings**

Run:

```bash
sed -n '500,560p' paper/experiments/run_paper_experiments.py
sed -n '1210,1345p' paper/experiments/run_paper_experiments.py
```

Confirm the five target functions contain no `axis.bar`, `axis.barh`, or `axis.grid(... True ...)` calls.

- [ ] **Step 9: Record a review checkpoint without staging**

Run `git diff --check -- paper/experiments/run_paper_experiments.py` if Git recognizes the path; otherwise run the Python compile check:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python -m py_compile \
  paper/experiments/run_paper_experiments.py
```

Do not stage the untracked paper tree.

---

### Task 3: Reduce Figure 7 mosaic strength and synchronize the canonical output

**Files:**
- Modify: `paper/experiments/build_interface_composite.py:7-11`
- Modify: `paper/experiments/build_interface_composite.py:26-47`
- Modify: `paper/experiments/build_interface_composite.py:93-104`
- Modify: `paper/experiments/build_interface_composite.py:148-150`
- Test: `paper/experiments/tests/test_visual_revision.py`

**Interfaces:**
- Consumes: `pixelate_face(image, normalized_box, block_size)`.
- Produces: identical `system_interface_composite.png` files in the experiment source and final Overleaf figure directories.

- [ ] **Step 1: Define both output targets**

Replace the single output constant with:

```python
SOURCE_FIGURE_DIR = PAPER_DIR / "chinavr+2026" / "chinavr 2026" / "figures"
FINAL_FIGURE_DIR = PAPER_DIR / "ChinaVR_Awatar_Overleaf_FINAL_20260730" / "figures"
OUTPUT_PATHS = (
    SOURCE_FIGURE_DIR / "system_interface_composite.png",
    FINAL_FIGURE_DIR / "system_interface_composite.png",
)
```

Continue reading `system_interface.png` from `SOURCE_FIGURE_DIR`.

- [ ] **Step 2: Change the mosaic default and make the calls explicit**

Change the function default to `block_size: int = 8` and invoke both faces with `block_size=8`:

```python
face_one = pixelate_face(
    open_rgb(PAPER_DIR / "表情识别1.png"),
    (0.27, 0.23, 0.79, 0.55),
    block_size=8,
)
face_two = pixelate_face(
    open_rgb(PAPER_DIR / "表情识别2.png"),
    (0.27, 0.28, 0.80, 0.61),
    block_size=8,
)
```

Do not change the normalized face boxes.

- [ ] **Step 3: Save one canvas to both destinations**

Replace the single save with:

```python
for output_path in OUTPUT_PATHS:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, optimize=True, dpi=(300, 300))
    print(f"wrote {output_path} ({canvas.width}x{canvas.height})")
```

- [ ] **Step 4: Run the focused mosaic test**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python -m pytest \
  paper/experiments/tests/test_visual_revision.py::test_eight_pixel_mosaic_is_lighter_and_preserves_outside_region -q
```

Expected: PASS.

- [ ] **Step 5: Generate Figure 7 and compare both outputs**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python \
  paper/experiments/build_interface_composite.py
sha256sum \
  "paper/chinavr+2026/chinavr 2026/figures/system_interface_composite.png" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/system_interface_composite.png
```

Expected: both hashes are identical.

- [ ] **Step 6: Visually inspect the final composite**

Open `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/system_interface_composite.png` with the image viewer. Confirm:

- panels (b) and (c) show lighter mosaic blocks than the previous version;
- facial expression and UI state remain interpretable;
- facial identity is still not clear;
- panels (a), (d), and (e), borders, and labels are unchanged.

If identity is clear, change only `block_size=8` to `block_size=9` or `10`, rerun Steps 4--6, and document the selected value.

- [ ] **Step 7: Record a review checkpoint without staging**

Run the Python compile check and do not stage the untracked paper files:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python -m py_compile \
  paper/experiments/build_interface_composite.py
```

---

### Task 4: Correct the existing references and integrate five 2026 papers

**Files:**
- Modify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex:100-119`
- Modify: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex:404-454`
- Test: `paper/experiments/tests/test_visual_revision.py`

**Interfaces:**
- Consumes: the approved formal/preprint audit and official publication metadata.
- Produces: 35 bibliography items, with five new keys cited in related work and no status mislabeling.

- [ ] **Step 1: Add the two 2026 affect-recognition citations**

After the discussion of different modality roles in `多模态情感识别`, add:

```tex
		2026 年的研究进一步强调了情感结构与模态角色的显式建模：EMART 将文本作为主要语义来源、将音频作为副语言补充，并利用情感轮结构约束表示学习\cite{seong2026emart}；NOVA-ARC 则以非语言发声中的韵律线索监督低资源多语言语音情感识别\cite{girish2026prosody}。这些工作表明，不同模态不宜被视为功能完全等价的输入，也支持本文在晚期融合中分别保留模态分数与可靠性信息。
```

- [ ] **Step 2: Add the 2026 full-duplex voice-agent citation**

Before the final sentence of the end-to-end speech-agent paragraph, add:

```tex
		面向真实任务的 $\tau$-Voice 基准进一步表明，全双工语音代理还需要同时评价任务完成、噪声与口音鲁棒性以及自然轮次交互\cite{ray2026tauvoice}。
```

- [ ] **Step 3: Add the two 2026 talking-face citations**

Extend the talking-face paragraph after the LatentSync sentence:

```tex
		2026 年的 FreeTalkDiff 探索了免微调扩散式说话人脸生成，并针对身份漂移、口型同步与时序抖动设计无训练参数的控制组件\cite{wu2026ipadapter}；SynchroRaMa 则联合文本与音频情感嵌入，以增强口型同步视频的情感表达\cite{yee2026synchrorama}。
```

- [ ] **Step 4: Formalize the five verified existing entries**

Replace the five bibliography bodies with:

```tex
		\bibitem{kartynnik2019facial}
		Kartynnik Y, Ablavatski A, Grishchenko I, Grundmann M. Real-time facial surface geometry from monocular video on mobile GPUs[C]//CVPR Workshop on Computer Vision for Augmented and Virtual Reality. Long Beach: IEEE, 2019.

		\bibitem{fang2025llamaomni}
		Fang Q, Guo S, Zhou Y, et al. LLaMA-Omni: Seamless speech interaction with large language models[C]//The Thirteenth International Conference on Learning Representations. 2025.

		\bibitem{fu2025vita15}
		Fu C, Lin H, Wang X, et al. VITA-1.5: Towards GPT-4o level real-time vision and speech interaction[C]//Advances in Neural Information Processing Systems. 2025, 38.

		\bibitem{xu2024vasa1}
		Xu S, Chen G, Guo Y X, et al. VASA-1: Lifelike audio-driven talking faces generated in real time[C]//Advances in Neural Information Processing Systems. 2024, 37: 660-684.

		\bibitem{cui2024hallo2}
		Cui J, Li H, Yao Y, et al. Hallo2: Long-duration and high-resolution audio-driven portrait image animation[C]//The Thirteenth International Conference on Learning Representations. 2025.
```

Do not alter the ten retained preprint entries except for consistent capitalization or punctuation.

- [ ] **Step 5: Add the five formally published 2026 bibliography entries**

Insert them near the related topical groups:

```tex
		\bibitem{seong2026emart}
		Seong E, Lee H, Kim D, et al. Emotion-wheel-guided audio-referred text representation for multimodal emotion recognition in conversation[C]//Proceedings of the 64th Annual Meeting of the Association for Computational Linguistics. San Diego: ACL, 2026: 40392-40403. DOI: 10.18653/v1/2026.acl-long.1875.

		\bibitem{girish2026prosody}
		Girish, Akhtar M M, Singh M. Prosody as supervision: Bridging the non-verbal--verbal for multilingual speech emotion recognition[C]//Proceedings of the 64th Annual Meeting of the Association for Computational Linguistics. San Diego: ACL, 2026: 41881-41893. DOI: 10.18653/v1/2026.acl-long.1940.

		\bibitem{ray2026tauvoice}
		Ray S, Dhandhania K, Barres V, Narasimhan K R. $\tau$-Voice: Benchmarking full-duplex voice agents on real-world domains[C]//The Forty-third International Conference on Machine Learning. 2026.

		\bibitem{wu2026ipadapter}
		Wu H, Luo X, Wang H, et al. IP-Adapter is all you need: Towards fine-tuning-free diffusion-based talking face generation[C]//Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition. 2026: 32967-32977.

		\bibitem{yee2026synchrorama}
		Yee P T, Kollias D, Mishra S, Dhall A. SynchroRaMa: Lip-synchronized and emotion-aware talking face generation via multi-modal emotion embedding[C]//Proceedings of the IEEE/CVF Winter Conference on Applications of Computer Vision. 2026: 4546-4555.
```

- [ ] **Step 6: Perform the structured bibliography audit**

Run:

```bash
rg -c '\\bibitem\\{' paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex
rg -n 'arXiv:' paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex
rg -n 'seong2026emart|girish2026prosody|ray2026tauvoice|wu2026ipadapter|yee2026synchrorama' \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex
```

Expected:

- bibliography count is 35;
- arXiv appears only in the ten retained preprint blocks;
- each new key appears once as a `\bibitem` and at least once in a citation.

- [ ] **Step 7: Record a review checkpoint without staging**

Run `git diff --check` when available, otherwise inspect the edited TeX ranges with `sed`. Do not stage the user-owned final paper tree.

---

### Task 5: Regenerate, synchronize, and visually review all revised figures

**Files:**
- Generate: `paper/chinavr+2026/chinavr 2026/figures/independent_f1.{pdf,png}`
- Generate: `paper/chinavr+2026/chinavr 2026/figures/latency_summary.{pdf,png}`
- Generate: `paper/chinavr+2026/chinavr 2026/figures/multimodal_ablation.{pdf,png}`
- Generate: `paper/chinavr+2026/chinavr 2026/figures/ttfa_breakdown.{pdf,png}`
- Generate: `paper/chinavr+2026/chinavr 2026/figures/user_study.{pdf,png}`
- Synchronize: corresponding files under `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/`
- Synchronize: three generated experiment TeX files under the final source tree.

**Interfaces:**
- Consumes: revised plotting functions and unchanged experiment data/results.
- Produces: reviewed final figures and synchronized generated sections.

- [ ] **Step 1: Run the complete regression test file**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python -m pytest \
  paper/experiments/tests/test_visual_revision.py -q
```

Expected: all tests PASS.

- [ ] **Step 2: Regenerate real-data figures without rerunning model training**

Run:

```bash
MPLCONFIGDIR=/tmp/matplotlib-paper \
XDG_CACHE_HOME=/tmp/xdg-cache-paper \
/home/czg/anaconda3/envs/digital_avatar/bin/python \
  paper/experiments/run_paper_experiments.py --skip-core
```

Expected: the script reuses `experiment_results.json`, regenerates supplementary statistics and the five target figures, and reports the canonical figure directory.

- [ ] **Step 3: Synchronize only the approved statistical assets**

Copy the ten statistical figure files from the canonical experiment source into the final `figures/` directory:

```bash
cp "paper/chinavr+2026/chinavr 2026/figures/independent_f1.pdf" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/independent_f1.pdf
cp "paper/chinavr+2026/chinavr 2026/figures/independent_f1.png" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/independent_f1.png
cp "paper/chinavr+2026/chinavr 2026/figures/latency_summary.pdf" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/latency_summary.pdf
cp "paper/chinavr+2026/chinavr 2026/figures/latency_summary.png" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/latency_summary.png
cp "paper/chinavr+2026/chinavr 2026/figures/multimodal_ablation.pdf" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/multimodal_ablation.pdf
cp "paper/chinavr+2026/chinavr 2026/figures/multimodal_ablation.png" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/multimodal_ablation.png
cp "paper/chinavr+2026/chinavr 2026/figures/ttfa_breakdown.pdf" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/ttfa_breakdown.pdf
cp "paper/chinavr+2026/chinavr 2026/figures/ttfa_breakdown.png" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/ttfa_breakdown.png
cp "paper/chinavr+2026/chinavr 2026/figures/user_study.pdf" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/user_study.pdf
cp "paper/chinavr+2026/chinavr 2026/figures/user_study.png" \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/figures/user_study.png
```

Copy `generated_multimodal_experiment.tex`, `generated_ttfa_experiment.tex`, and `generated_user_study.tex` from the canonical paper tree to the final source tree.

- [ ] **Step 4: Verify source/final hashes**

Run `sha256sum` on each source/final pair. Expected: each pair has identical hashes.

- [ ] **Step 5: Visually inspect the five PNG figures**

Open all five final PNGs. Confirm:

- no rectangles are used as data marks;
- no background grid lines appear;
- all values remain legible at manuscript scale;
- annotations do not overlap markers, axes, or each other;
- consistent blue/orange semantics are preserved;
- Chinese labels render correctly.

If an annotation overlaps, adjust only figure size, label offset, axis margin, or font size; do not change data or switch back to bars.

- [ ] **Step 6: Verify generated numeric content is unchanged**

Compare the regenerated `generated_*.tex` prose and tables with the previous final versions, excluding line endings or plot-caption wording. Confirm all reported counts, means, confidence intervals, and latency values are unchanged.

- [ ] **Step 7: Record a review checkpoint without staging**

Do not stage generated paper assets. Record the reviewed hashes and selected Figure 7 mosaic block size for the final report.

---

### Task 6: Compile, inspect, and package the final paper

**Files:**
- Build from: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/`
- Update: `paper/ChinaVR_Awatar_Final_20260730.pdf`
- Update: `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip`

**Interfaces:**
- Consumes: synchronized final TeX and figure source.
- Produces: final PDF and clean source archive.

- [ ] **Step 1: Create an isolated temporary build directory**

Run:

```bash
build_dir=$(mktemp -d /tmp/chinavr-paper-revision.XXXXXX)
cp -a paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/. "$build_dir/"
```

The temporary build prevents auxiliary files from entering the Overleaf package.

- [ ] **Step 2: Compile with two reruns**

From the temporary directory run:

```bash
XDG_CACHE_HOME=/tmp/tectonic_cache \
/tmp/tectonic -X compile main.tex \
  --keep-logs --keep-intermediates --reruns 2
```

Expected: exit code 0 and `main.pdf` exists.

- [ ] **Step 3: Check the compiler log and extracted text**

Run:

```bash
rg -n 'undefined|Undefined|Missing|not found|Emergency stop|Fatal error' "$build_dir/main.log"
pdftotext "$build_dir/main.pdf" "$build_dir/main.txt"
rg -n '\\[\\?\\]|seong2026|girish2026|ray2026|wu2026|yee2026' "$build_dir/main.txt"
```

Expected:

- no undefined-reference, missing-file, or fatal-error matches;
- no `[?]` citation markers;
- raw citation keys do not leak into rendered text.

Review overfull-box warnings separately; any visible overflow must be fixed before proceeding.

- [ ] **Step 4: Inspect PDF metadata and page count**

Run:

```bash
pdfinfo "$build_dir/main.pdf"
```

Record page count, page size, file size, and PDF version. A page-count increase is acceptable only if all pages are well composed and the venue limit remains satisfied; otherwise tighten related-work wording without removing required citations.

- [ ] **Step 5: Rasterize and visually inspect every page**

Run:

```bash
pdftoppm -png -r 130 "$build_dir/main.pdf" "$build_dir/page"
```

Open all rendered pages, paying particular attention to:

- pages containing the five redesigned figures;
- the Figure 7 page;
- related-work paragraph wrapping;
- the transition into the bibliography;
- all bibliography pages and the final page.

Reject any overlap, clipping, empty page, oversized whitespace, malformed Chinese, broken math, or unreadably small label.

- [ ] **Step 6: Copy the reviewed PDF to its delivery path**

After successful inspection:

```bash
cp "$build_dir/main.pdf" paper/ChinaVR_Awatar_Final_20260730.pdf
```

Verify the copied file hash matches the reviewed temporary PDF.

- [ ] **Step 7: Build a clean Overleaf archive from the reviewed source**

From inside `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/`, create the archive in `/tmp` so it cannot recursively contain itself:

```bash
zip -r -q /tmp/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip .
cp /tmp/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip \
  ../ChinaVR_Awatar_Overleaf_FINAL_20260730.zip
unzip -l ../ChinaVR_Awatar_Overleaf_FINAL_20260730.zip
```

Expected: the archive contains `main.tex`, `chinavr.cls`, the generated TeX files, and the reviewed `figures/` assets, but no auxiliary build files or nested ZIP.

- [ ] **Step 8: Run final cross-artifact verification**

Run:

```bash
/home/czg/anaconda3/envs/digital_avatar/bin/python -m pytest \
  paper/experiments/tests/test_visual_revision.py -q
pdfinfo paper/ChinaVR_Awatar_Final_20260730.pdf
sha256sum paper/ChinaVR_Awatar_Final_20260730.pdf \
  paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip
```

Expected: tests PASS, PDF metadata is readable, and both deliverables have nonempty stable hashes.

- [ ] **Step 9: Final status review**

Run `git status --short`, confirm no unrelated tracked file changed during implementation, and report:

- the five new visual encodings;
- selected Figure 7 mosaic block size;
- five formalized old references and ten retained preprints;
- five added 2026 formal references;
- final page count and build/test results;
- clickable paths to the final PDF, source folder, ZIP, and test file.

Do not stage or commit the user-owned paper implementation artifacts.

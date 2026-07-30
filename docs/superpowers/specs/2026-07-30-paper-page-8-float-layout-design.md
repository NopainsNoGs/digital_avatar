# ChinaVR Paper Page 8 Float Layout Design

## Goal

Correct the layout of page 8 in
`paper/ChinaVR_Awatar_Final_20260730.pdf` so that the page is not a
figure-only page, while preserving figure readability, numbering,
cross-references, experimental content, and the anonymous review format.

## Confirmed Root Cause

In
`paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`,
Figures 2 and 3 are currently placed inside one `figure` environment.
LaTeX must move this combined, indivisible float as a unit. Its total
height is too large to share a normal text page, so it is emitted as a
dedicated float page containing only the two figures.

## Approved Design

Use the recommended split-float layout:

- Keep Figure 2 (`confusion_matrices.pdf`) as an independent figure.
- Keep Figure 3 (`independent_f1.pdf`) as a second independent figure.
- Preserve their current widths, captions, labels, and reference order.
- Remove the inter-image `\vspace` that was only needed when both images
  occupied the same float.
- Allow LaTeX to place Section 3.4 text or its related table on page 8
  alongside one of the figures.
- Do not combine the figures into subfigures and do not reduce their
  current display sizes.

The target reading sequence remains:

1. Section 3.3 result text and Table 2.
2. Figure 2, the confusion matrices.
3. Figure 3, per-class F1.
4. Section 3.4 multimodal fusion ablation text and Table 3.

## Scope

Modify only the final 2026-07-30 Overleaf source required for this float
split, then regenerate the final PDF. Do not change experimental values,
captions, figure files, bibliography, demo deliverables, or unrelated
working-tree content.

## Verification

After compiling twice to settle references:

- Page 8 must contain both figure material and body text or a table.
- Figures 2 and 3 must remain legible and keep the same numbering.
- References to Figures 2 and 3 must resolve without warnings.
- Pages 7–9 must preserve a coherent reading order with no new
  figure-only page.
- The final PDF should remain 14 pages if feasible; any page-count change
  requires inspection of the entire affected section.
- The generated PDF must have no missing figures, missing references, or
  fatal compilation errors.


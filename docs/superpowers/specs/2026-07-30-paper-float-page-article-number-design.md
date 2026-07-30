# ChinaVR Paper Float-Page and Article-Number Design

## Goal

Update the final ChinaVR 2026 manuscript so that page 9 is no longer a
float-only page and the first-page article-number field displays `25`.
Preserve the existing figure sizes, chart styles, results, prose, author
metadata, and official-template typography.

## Root Cause

After the author and affiliation rows moved the introduction to page 2,
LaTeX placed Table 3 and Figure 4 together on page 9. Both floats currently
use `[htbp]`, so the `p` placement option permits a dedicated float page.
Section 3.5 body text consequently begins on page 10.

The official class exposes the article-number field through
`\articleno{...}`. The final manuscript currently uses an empty
`\articleno{}` value, which leaves the first-page label blank.

## Approved Layout Change

In `generated_multimodal_experiment.tex`:

- change Table 3 from `[htbp]` to `[!htb]`;
- change Figure 4 from `[htbp]` to `[htb]`;
- keep the table contents, figure asset, figure width, captions, labels, and
  surrounding prose unchanged.

Removing `p` prevents Table 3 and Figure 4 from forming a dedicated
float-only page. The following Section 3.5 heading and body text may then
share page 9 with the table and figure through normal LaTeX placement.

Do not shrink Figure 4 or move prose between the table and figure unless the
approved minimal placement change fails to remove the float-only page.

## Approved Metadata Change

In `main.tex`, replace:

```tex
\articleno{}
```

with:

```tex
\articleno{25}
```

The rendered first page must display `文章编号：25`.

## Scope

Modify only:

- the placement specifiers for Table 3 and Figure 4 in
  `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/generated_multimodal_experiment.tex`;
- the value of `\articleno` in
  `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`;
- focused verification scripts needed to prevent regression;
- regenerated PDF outputs.

Do not alter authors, affiliations, title, abstracts, keywords, data,
captions, labels, chart dimensions, chart styling, body wording, references,
or demo deliverables.

## Verification

Compile the final source with two Tectonic reruns, publish the candidate as
`paper/ChinaVR_Awatar_Final_20260730.pdf`, and confirm:

- page 1 displays `文章编号：25`;
- page 9 contains Table 3, Figure 4, and Section 3.5 body content;
- page 8 retains Figure 2, Figure 3, and Section 3.4 result text;
- every PDF page contains manuscript prose rather than only floating tables
  or figures;
- the PDF remains A4 and has no unresolved references or fatal LaTeX errors;
- all five approved authors remain present and 徐浩延 / `Xu Haoyan` remain
  absent;
- the final PDF is visually inspected at page 1, pages 8--10, and as a
  full-document contact sheet.

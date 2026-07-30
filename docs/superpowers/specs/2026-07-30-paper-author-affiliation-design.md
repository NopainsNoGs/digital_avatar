# ChinaVR Paper Author and Affiliation Design

## Goal

Populate the Chinese and English author and affiliation fields in the
final ChinaVR 2026 paper using the structure demonstrated by the official
template at `paper/chinavr+2026 (1)/chinavr 2026/main.tex`.

## Approved Author Order and Mapping

Keep the following author order in both languages:

1. 陈卓岗 — 北方工业大学
2. 周锋 — 北方工业大学
3. 代菊 — 鹏城实验室
4. 李瑾 — 北方工业大学
5. 解超 — 中交信有限责任公司
6. 徐浩延 — 北方工业大学

Use affiliation superscripts because the paper contains authors from
three institutions:

- Affiliation 1: 北方工业大学
- Affiliation 2: 鹏城实验室
- Affiliation 3: 中交信有限责任公司

## Chinese Front Matter

Set the existing fields to:

```tex
\cnauthors{陈卓岗\textsuperscript{1}，周锋\textsuperscript{1}，代菊\textsuperscript{2}，李瑾\textsuperscript{1}，解超\textsuperscript{3}，徐浩延\textsuperscript{1}}

\cnaffil{%
    1. 北方工业大学；
    2. 鹏城实验室；
    3. 中交信有限责任公司
}
```

## English Front Matter

Follow the official template's surname-first ordering. Use the approved
spellings:

```tex
\enauthors{Chen Zhuogang\textsuperscript{1}, Zhou Feng\textsuperscript{1}, Dai Ju\textsuperscript{2}, Li Jin\textsuperscript{1}, Xie Chao\textsuperscript{3}, Xu Haoyan\textsuperscript{1}}

\enaffil{%
    1. North China University of Technology;
    2. Peng Cheng Laboratory;
    3. Zhongjiaoxin Co., Ltd.
}
```

`Zhongjiaoxin Co., Ltd.` is the user-approved English rendering for
中交信有限责任公司.

## Scope

Modify only the four existing author and affiliation fields in
`paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`, then regenerate
`paper/ChinaVR_Awatar_Final_20260730.pdf`.

Do not add or change:

- corresponding-author markers or email addresses;
- departments, cities, postal codes, or countries;
- receipt dates, funding acknowledgements, or author biographies;
- title, abstract, keywords, article number, classification, or document code;
- body text, figures, tables, references, experimental values, or demo files.

## Verification

Compile twice with Tectonic and inspect the first page. Confirm:

- all six Chinese names appear once and in the approved order;
- all six English names appear once and in the approved order;
- superscripts map each author to the correct numbered institution;
- all three affiliations appear in both languages;
- the title and abstract remain unchanged;
- no author line or affiliation line is clipped or overlaps adjacent text;
- all references remain resolved and there are no fatal compilation errors;
- the paper remains 14 pages if the added front matter fits without changing
  the template's typography.


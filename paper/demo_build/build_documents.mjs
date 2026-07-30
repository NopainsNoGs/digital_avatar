import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pptxgen from "pptxgenjs";
import { METRICS, SLIDES } from "./content.mjs";

const buildDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(buildDir, "../..");
const outputDir = path.join(rootDir, "dome");
const assetDir = path.join(buildDir, "assets");

const PPTX_PATH = path.join(outputDir, "ChinaVR_Awatar_论文Demo.pptx");
const DOCX_PATH = path.join(outputDir, "ChinaVR_Awatar_逐页中文讲述词.docx");
const FONT = "Noto Sans CJK SC";

const C = Object.freeze({
  bg: "050B16",
  bg2: "07111F",
  panel: "0B1628",
  panel2: "101D32",
  panel3: "0A1424",
  cyan: "67E8F9",
  cyan2: "22D3EE",
  blue: "60A5FA",
  amber: "F6C453",
  amber2: "F59E0B",
  green: "86EFAC",
  red: "FB7185",
  white: "F8FAFC",
  muted: "94A3B8",
  muted2: "64748B",
  line: "243652",
});

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Anonymous";
pptx.company = "Anonymous";
pptx.subject = "ChinaVR 2026 anonymous paper review demo";
pptx.title = "面向交通枢纽服务的多模态情感感知与流式驱动数字人交互方法";
pptx.lang = "zh-CN";
pptx.theme = {
  headFontFace: FONT,
  bodyFontFace: FONT,
  lang: "zh-CN",
};
pptx.defineSlideMaster({
  title: "DARK_MASTER",
  background: { color: C.bg },
  objects: [
    {
      line: {
        x: 0.45,
        y: 7.12,
        w: 12.43,
        h: 0,
        line: { color: C.line, transparency: 20, width: 0.7 },
      },
    },
    {
      text: {
        text: "ChinaVR 2026 · ANONYMOUS REVIEW DEMO",
        options: {
          x: 0.55,
          y: 7.16,
          w: 4.3,
          h: 0.16,
          fontFace: FONT,
          fontSize: 6.8,
          color: C.muted2,
          charSpacing: 1.4,
          margin: 0,
        },
      },
    },
  ],
  slideNumber: {
    x: 12.15,
    y: 7.14,
    w: 0.55,
    h: 0.18,
    fontFace: FONT,
    fontSize: 7,
    color: C.muted2,
    align: "right",
    margin: 0,
  },
});

function addBackgroundGlow(slide, x, y, w, h, color, transparency = 88) {
  slide.addShape(pptx.ShapeType.ellipse, {
    x,
    y,
    w,
    h,
    line: { color, transparency: 100 },
    fill: { color, transparency },
  });
}

function addHeader(slide, eyebrow, title, accent = C.cyan) {
  slide.addText(eyebrow, {
    x: 0.62,
    y: 0.34,
    w: 5.4,
    h: 0.24,
    fontFace: FONT,
    fontSize: 8.5,
    bold: true,
    color: accent,
    charSpacing: 1.4,
    margin: 0,
  });
  slide.addText(title, {
    x: 0.6,
    y: 0.69,
    w: 12.1,
    h: 0.48,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: C.white,
    margin: 0,
    breakLine: false,
    fit: "shrink",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 0.62,
    y: 1.27,
    w: 12.05,
    h: 0,
    line: { color: C.line, transparency: 10, width: 1 },
  });
}

function addPill(slide, text, x, y, w, color = C.cyan) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.42,
    rectRadius: 0.08,
    line: { color, transparency: 60, width: 0.8 },
    fill: { color, transparency: 87 },
  });
  slide.addText(text, {
    x: x + 0.05,
    y: y + 0.02,
    w: w - 0.1,
    h: 0.32,
    fontFace: FONT,
    fontSize: 10.5,
    bold: true,
    color,
    align: "center",
    valign: "mid",
    margin: 0,
  });
}

function addCard(slide, x, y, w, h, options = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    line: {
      color: options.lineColor ?? C.line,
      transparency: options.lineTransparency ?? 12,
      width: options.lineWidth ?? 1,
    },
    fill: {
      color: options.fillColor ?? C.panel,
      transparency: options.fillTransparency ?? 0,
    },
  });
}

function addArrow(slide, x, y, w, h, color = C.muted2, width = 1.5) {
  slide.addShape(pptx.ShapeType.line, {
    x,
    y,
    w,
    h,
    line: {
      color,
      width,
      beginArrowType: "none",
      endArrowType: "triangle",
    },
  });
}

function addNotes(slide, slideSpec) {
  slide.addNotes(
    `第${slideSpec.number}页｜目标 ${slideSpec.targetSeconds} 秒\n${slideSpec.narration}`,
  );
}

function imageContainOptions(imagePath, x, y, w, h, imageRatio) {
  let drawW = w;
  let drawH = drawW / imageRatio;
  if (drawH > h) {
    drawH = h;
    drawW = drawH * imageRatio;
  }
  return {
    path: imagePath,
    x: x + (w - drawW) / 2,
    y: y + (h - drawH) / 2,
    w: drawW,
    h: drawH,
  };
}

function addScoreBars(slide, x, y, values, colors) {
  values.forEach((value, index) => {
    const barH = 0.18 + value * 0.52;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: x + index * 0.19,
      y: y + 0.72 - barH,
      w: 0.11,
      h: barH,
      rectRadius: 0.03,
      line: { color: colors[index], transparency: 100 },
      fill: { color: colors[index], transparency: 8 },
    });
  });
}

function buildSlide1(slideSpec) {
  const slide = pptx.addSlide("DARK_MASTER");
  slide.background = { color: C.bg };
  addBackgroundGlow(slide, -1.3, -1.2, 7.2, 5.3, C.cyan2, 91);
  addBackgroundGlow(slide, 8.3, 3.8, 6.3, 4.6, C.blue, 93);

  slide.addText("CHINAVR 2026 · PAPER DEMO", {
    x: 0.68,
    y: 0.52,
    w: 4.2,
    h: 0.26,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: C.cyan,
    charSpacing: 1.7,
    margin: 0,
  });
  slide.addText("面向交通枢纽服务的", {
    x: 0.66,
    y: 1.02,
    w: 5.85,
    h: 0.54,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: C.white,
    margin: 0,
  });
  slide.addText("多模态情感感知与\n流式驱动数字人交互方法", {
    x: 0.64,
    y: 1.56,
    w: 6.2,
    h: 1.48,
    fontFace: FONT,
    fontSize: 31,
    bold: true,
    color: C.white,
    breakLine: false,
    margin: 0,
    fit: "shrink",
  });
  slide.addText("不只回答正确，更要理解旅客状态，并尽早给出一致的语音与动作反馈。", {
    x: 0.7,
    y: 3.35,
    w: 5.7,
    h: 0.75,
    fontFace: FONT,
    fontSize: 16,
    color: "CBD5E1",
    breakLine: false,
    margin: 0,
    fit: "shrink",
  });
  addPill(slide, "感知情绪", 0.7, 4.53, 1.45, C.cyan);
  addPill(slide, "尽早首响", 2.35, 4.53, 1.45, C.amber);
  addPill(slide, "音画一致", 4.0, 4.53, 1.45, C.green);

  addCard(slide, 6.65, 0.68, 6.05, 5.78, {
    fillColor: C.panel3,
    lineColor: C.cyan,
    lineTransparency: 72,
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 6.87,
    y: 0.92,
    w: 5.61,
    h: 3.25,
    rectRadius: 0.06,
    line: { color: C.line, width: 1 },
    fill: { color: C.bg2 },
  });
  slide.addImage(
    imageContainOptions(
      path.join(assetDir, "system_interface.png"),
      6.92,
      0.97,
      5.51,
      3.15,
      2000 / 1158,
    ),
  );
  slide.addText("TRANSIT HUB DIGITAL HUMAN", {
    x: 7.02,
    y: 4.54,
    w: 3.25,
    h: 0.24,
    fontFace: FONT,
    fontSize: 8.3,
    bold: true,
    charSpacing: 1.3,
    color: C.cyan,
    margin: 0,
  });
  slide.addText("三模态感知 × 置信度融合 × 首响优先音画驱动", {
    x: 7.0,
    y: 4.88,
    w: 4.88,
    h: 0.5,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color: C.white,
    margin: 0,
  });
  slide.addText("浏览器终端 · 本地模型 · 流式 WebSocket", {
    x: 7.02,
    y: 5.53,
    w: 4.6,
    h: 0.28,
    fontFace: FONT,
    fontSize: 10,
    color: C.muted,
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 11.78,
    y: 5.35,
    w: 0.47,
    h: 0.47,
    line: { color: C.green, transparency: 60 },
    fill: { color: C.green, transparency: 82 },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 11.94,
    y: 5.51,
    w: 0.15,
    h: 0.15,
    line: { color: C.green, transparency: 100 },
    fill: { color: C.green },
  });
  addNotes(slide, slideSpec);
}

function buildSlide2(slideSpec) {
  const slide = pptx.addSlide("DARK_MASTER");
  slide.background = { color: C.bg };
  addBackgroundGlow(slide, 9.5, -1.3, 5.2, 4.2, C.red, 95);
  addHeader(slide, "01 · MOTIVATION", slideSpec.title, C.red);

  const cards = [
    {
      x: 0.63,
      number: "01",
      kicker: "SIGNAL",
      title: "单模态不可靠",
      body: "噪声、遮挡、逆光或拒绝授权，都会让某一感知通道失效。",
      color: C.cyan,
      icon: "V / A / T",
    },
    {
      x: 4.56,
      number: "02",
      kicker: "LATENCY",
      title: "完整回复后才开口",
      body: "串行 ASR–LLM–TTS–动画链路，让等待随回复长度增长。",
      color: C.amber,
      icon: "···  →  ▶",
    },
    {
      x: 8.49,
      number: "03",
      kicker: "SYNC",
      title: "音频与口型易漂移",
      body: "音频和口型分离生成，缺少共享播放时钟，造成视听不一致。",
      color: C.red,
      icon: "PCM  ≠  viseme",
    },
  ];

  cards.forEach((card) => {
    addCard(slide, card.x, 1.62, 3.55, 3.94, {
      fillColor: C.panel,
      lineColor: card.color,
      lineTransparency: 66,
    });
    slide.addText(card.number, {
      x: card.x + 0.24,
      y: 1.86,
      w: 0.55,
      h: 0.36,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: card.color,
      margin: 0,
    });
    slide.addText(card.kicker, {
      x: card.x + 0.87,
      y: 1.92,
      w: 1.7,
      h: 0.22,
      fontFace: FONT,
      fontSize: 8.2,
      bold: true,
      color: C.muted2,
      charSpacing: 1.6,
      margin: 0,
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x: card.x + 0.24,
      y: 2.46,
      w: 3.07,
      h: 1.08,
      rectRadius: 0.05,
      line: { color: card.color, transparency: 78 },
      fill: { color: card.color, transparency: 91 },
    });
    slide.addText(card.icon, {
      x: card.x + 0.34,
      y: 2.75,
      w: 2.87,
      h: 0.35,
      fontFace: FONT,
      fontSize: 17,
      bold: true,
      color: card.color,
      align: "center",
      margin: 0,
    });
    slide.addText(card.title, {
      x: card.x + 0.24,
      y: 3.88,
      w: 3.0,
      h: 0.38,
      fontFace: FONT,
      fontSize: 18,
      bold: true,
      color: C.white,
      margin: 0,
      fit: "shrink",
    });
    slide.addText(card.body, {
      x: card.x + 0.24,
      y: 4.42,
      w: 3.02,
      h: 0.78,
      fontFace: FONT,
      fontSize: 11.2,
      color: C.muted,
      breakLine: false,
      margin: 0,
      fit: "shrink",
    });
  });

  slide.addText("研究目标", {
    x: 0.66,
    y: 6.08,
    w: 1.0,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: C.cyan,
    charSpacing: 1,
    margin: 0,
  });
  slide.addText("在部分通道失效时仍可感知，并在完整回复结束前开始一致的音画反馈。", {
    x: 1.62,
    y: 5.98,
    w: 10.45,
    h: 0.46,
    fontFace: FONT,
    fontSize: 16.5,
    bold: true,
    color: C.white,
    align: "left",
    margin: 0,
  });
  addNotes(slide, slideSpec);
}

function buildSlide3(slideSpec) {
  const slide = pptx.addSlide("DARK_MASTER");
  slide.background = { color: C.bg };
  addBackgroundGlow(slide, -1, 3.4, 5.4, 4.4, C.green, 95);
  addHeader(slide, "02 · METHOD / AFFECT", slideSpec.title, C.green);

  const inputs = [
    {
      y: 1.62,
      title: "面部几何",
      sub: "FaceMesh · 468 点",
      color: C.green,
      bars: [0.32, 0.56, 0.42, 0.72, 0.48, 0.37],
    },
    {
      y: 3.23,
      title: "语音韵律",
      sub: "RMS · ZCR",
      color: C.amber,
      bars: [0.28, 0.38, 0.64, 0.74, 0.49, 0.44],
    },
    {
      y: 4.84,
      title: "文本语义",
      sub: "ASR · 六类分数",
      color: C.blue,
      bars: [0.22, 0.47, 0.53, 0.68, 0.35, 0.58],
    },
  ];

  inputs.forEach((item, index) => {
    addCard(slide, 0.66, item.y, 3.27, 1.27, {
      fillColor: C.panel,
      lineColor: item.color,
      lineTransparency: 72,
    });
    slide.addText(`0${index + 1}`, {
      x: 0.87,
      y: item.y + 0.18,
      w: 0.42,
      h: 0.28,
      fontFace: FONT,
      fontSize: 10.5,
      bold: true,
      color: item.color,
      margin: 0,
    });
    slide.addText(item.title, {
      x: 1.3,
      y: item.y + 0.14,
      w: 1.35,
      h: 0.35,
      fontFace: FONT,
      fontSize: 16,
      bold: true,
      color: C.white,
      margin: 0,
    });
    slide.addText(item.sub, {
      x: 1.3,
      y: item.y + 0.58,
      w: 1.5,
      h: 0.28,
      fontFace: FONT,
      fontSize: 9.5,
      color: C.muted,
      margin: 0,
    });
    addScoreBars(
      slide,
      2.77,
      item.y + 0.2,
      item.bars,
      [item.color, item.color, item.color, item.color, item.color, item.color],
    );
    addArrow(slide, 3.93, item.y + 0.63, 0.74, 0, item.color, 1.4);
  });

  addCard(slide, 4.74, 1.62, 3.52, 4.5, {
    fillColor: "111C2D",
    lineColor: C.amber,
    lineTransparency: 32,
    lineWidth: 1.4,
  });
  slide.addText("QUALITY-AWARE FUSION", {
    x: 5.08,
    y: 1.91,
    w: 2.8,
    h: 0.28,
    fontFace: FONT,
    fontSize: 8.5,
    bold: true,
    color: C.amber,
    charSpacing: 1.2,
    align: "center",
    margin: 0,
  });
  slide.addText("Σ", {
    x: 5.88,
    y: 2.34,
    w: 1.2,
    h: 1.05,
    fontFace: FONT,
    fontSize: 48,
    bold: true,
    color: C.amber,
    align: "center",
    margin: 0,
  });
  slide.addText("wₘ ∝ bₘ · s(nₘ) · γₘ(cₘ)", {
    x: 5.08,
    y: 3.42,
    w: 2.82,
    h: 0.43,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });
  [
    ["置信度", "cₘ", C.cyan],
    ["样本量", "nₘ", C.amber],
    ["基础权重", "bₘ", C.green],
  ].forEach(([label, symbol, color], index) => {
    addPill(slide, `${label}  ${symbol}`, 5.12, 4.1 + index * 0.54, 2.72, color);
  });
  slide.addText("缺失模态置零，其余权重重新归一化", {
    x: 5.09,
    y: 5.78,
    w: 2.82,
    h: 0.25,
    fontFace: FONT,
    fontSize: 9.4,
    color: C.muted,
    align: "center",
    margin: 0,
  });
  addArrow(slide, 8.28, 3.85, 0.72, 0, C.amber, 1.6);

  addCard(slide, 9.04, 1.62, 3.64, 4.5, {
    fillColor: C.panel,
    lineColor: C.cyan,
    lineTransparency: 68,
  });
  slide.addText("FUSED AFFECT", {
    x: 9.38,
    y: 1.94,
    w: 2.95,
    h: 0.28,
    fontFace: FONT,
    fontSize: 8.5,
    bold: true,
    color: C.cyan,
    charSpacing: 1.3,
    align: "center",
    margin: 0,
  });
  slide.addText("焦急", {
    x: 9.42,
    y: 2.46,
    w: 2.86,
    h: 0.64,
    fontFace: FONT,
    fontSize: 32,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });
  slide.addText("融合置信度  0.86", {
    x: 9.75,
    y: 3.18,
    w: 2.2,
    h: 0.3,
    fontFace: FONT,
    fontSize: 11,
    color: C.amber,
    align: "center",
    margin: 0,
  });
  const emotions = [
    ["平稳", C.blue],
    ["积极", C.green],
    ["委婉", "C4B5FD"],
    ["焦急", C.amber],
    ["愤怒", C.red],
    ["惊讶", C.cyan],
  ];
  emotions.forEach(([label, color], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    addPill(
      slide,
      label,
      9.5 + col * 1.4,
      3.78 + row * 0.65,
      1.16,
      color,
    );
  });
  slide.addText("同一融合状态同时驱动回复、语音、表情与动作", {
    x: 9.45,
    y: 5.73,
    w: 2.84,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9.5,
    color: C.muted,
    align: "center",
    margin: 0,
  });
  addNotes(slide, slideSpec);
}

function buildSlide4(slideSpec) {
  const slide = pptx.addSlide("DARK_MASTER");
  slide.background = { color: C.bg };
  addBackgroundGlow(slide, 8.5, 3.7, 6.0, 4.2, C.blue, 94);
  addHeader(slide, "03 · METHOD / STREAMING", slideSpec.title, C.blue);

  const steps = [
    ["Qwen2.5", "JSON 增量", C.blue],
    ["emotionMode", "情绪先行", C.amber],
    ["句段队列", "标点 + 超时", C.cyan],
    ["CosyVoice", "流式 TTS", C.green],
  ];
  steps.forEach(([title, sub, color], index) => {
    const x = 0.72 + index * 3.08;
    addCard(slide, x, 1.58, 2.42, 1.22, {
      fillColor: C.panel,
      lineColor: color,
      lineTransparency: 66,
    });
    slide.addText(title, {
      x: x + 0.16,
      y: 1.82,
      w: 2.1,
      h: 0.36,
      fontFace: FONT,
      fontSize: 17,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
    });
    slide.addText(sub, {
      x: x + 0.16,
      y: 2.24,
      w: 2.1,
      h: 0.24,
      fontFace: FONT,
      fontSize: 9.5,
      color,
      align: "center",
      margin: 0,
    });
    if (index < steps.length - 1) {
      addArrow(slide, x + 2.45, 2.18, 0.57, 0, color, 1.5);
    }
  });

  slide.addText("PRODUCER", {
    x: 0.82,
    y: 3.12,
    w: 1.1,
    h: 0.2,
    fontFace: FONT,
    fontSize: 7.5,
    bold: true,
    color: C.blue,
    charSpacing: 1.3,
    margin: 0,
  });
  slide.addText("CONSUMER", {
    x: 10.44,
    y: 3.12,
    w: 1.25,
    h: 0.2,
    fontFace: FONT,
    fontSize: 7.5,
    bold: true,
    color: C.green,
    charSpacing: 1.3,
    margin: 0,
  });

  slide.addShape(pptx.ShapeType.line, {
    x: 1.02,
    y: 4.31,
    w: 11.13,
    h: 0,
    line: { color: C.muted2, width: 2.2 },
  });
  const timeline = [
    [1.05, "t₀", "输入到达", C.muted],
    [4.05, "tₗ", "首增量", C.blue],
    [7.15, "tₛ", "首句段", C.amber],
    [10.2, "tₐ", "首 PCM", C.green],
  ];
  timeline.forEach(([x, symbol, label, color]) => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x - 0.11,
      y: 4.2,
      w: 0.22,
      h: 0.22,
      line: { color, width: 1.3 },
      fill: { color },
    });
    slide.addText(symbol, {
      x: x - 0.28,
      y: 3.69,
      w: 0.56,
      h: 0.3,
      fontFace: FONT,
      fontSize: 15,
      bold: true,
      italic: true,
      color,
      align: "center",
      margin: 0,
    });
    slide.addText(label, {
      x: x - 0.5,
      y: 4.56,
      w: 1.0,
      h: 0.28,
      fontFace: FONT,
      fontSize: 9.8,
      color: C.muted,
      align: "center",
      margin: 0,
    });
  });
  slide.addText("TTFA = (tₗ − t₀) + (tₛ − tₗ) + (tₐ − tₛ)", {
    x: 3.94,
    y: 4.92,
    w: 5.25,
    h: 0.34,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });

  addCard(slide, 0.74, 5.55, 11.89, 0.94, {
    fillColor: C.panel3,
    lineColor: C.line,
    lineTransparency: 10,
  });
  slide.addText("块级音画对齐", {
    x: 0.98,
    y: 5.84,
    w: 1.45,
    h: 0.3,
    fontFace: FONT,
    fontSize: 13,
    bold: true,
    color: C.white,
    margin: 0,
  });
  for (let index = 0; index < 4; index += 1) {
    const x = 2.73 + index * 1.45;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 5.78,
      w: 0.95,
      h: 0.27,
      rectRadius: 0.03,
      line: { color: C.blue, transparency: 100 },
      fill: { color: C.blue, transparency: index * 7 },
    });
    slide.addText(`PCM #${index}`, {
      x,
      y: 5.81,
      w: 0.95,
      h: 0.14,
      fontFace: FONT,
      fontSize: 7,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 6.13,
      w: 0.95,
      h: 0.18,
      rectRadius: 0.03,
      line: { color: "F3C4B4", transparency: 100 },
      fill: { color: "F3C4B4", transparency: index * 6 },
    });
    slide.addText(`v${index}`, {
      x,
      y: 6.14,
      w: 0.95,
      h: 0.1,
      fontFace: FONT,
      fontSize: 6.2,
      color: "7C4A3C",
      align: "center",
      margin: 0,
    });
  }
  slide.addText("共享 stream_id · chunk_seq · playback clock", {
    x: 8.83,
    y: 5.86,
    w: 3.25,
    h: 0.25,
    fontFace: FONT,
    fontSize: 9.5,
    color: C.cyan,
    align: "right",
    margin: 0,
  });
  slide.addText("音频块与 viseme 同步进入浏览器", {
    x: 8.61,
    y: 6.16,
    w: 3.47,
    h: 0.22,
    fontFace: FONT,
    fontSize: 8.7,
    color: C.muted,
    align: "right",
    margin: 0,
  });
  addNotes(slide, slideSpec);
}

function addMetricCard(
  slide,
  x,
  color,
  kicker,
  value,
  title,
  evidence,
  bars,
) {
  addCard(slide, x, 1.7, 3.73, 3.38, {
    fillColor: C.panel,
    lineColor: color,
    lineTransparency: 64,
  });
  slide.addText(kicker, {
    x: x + 0.26,
    y: 1.97,
    w: 3.16,
    h: 0.22,
    fontFace: FONT,
    fontSize: 8,
    bold: true,
    color,
    charSpacing: 1.2,
    margin: 0,
  });
  slide.addText(value, {
    x: x + 0.24,
    y: 2.31,
    w: 3.2,
    h: 0.66,
    fontFace: FONT,
    fontSize: 31,
    bold: true,
    color: C.white,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(title, {
    x: x + 0.26,
    y: 3.03,
    w: 3.14,
    h: 0.36,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color,
    margin: 0,
  });
  slide.addText(evidence, {
    x: x + 0.26,
    y: 3.48,
    w: 3.12,
    h: 0.56,
    fontFace: FONT,
    fontSize: 9.7,
    color: C.muted,
    margin: 0,
    fit: "shrink",
  });
  bars.forEach((bar, index) => {
    const barW = 2.76 * bar.value;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.26,
      y: 4.28 + index * 0.31,
      w: 2.76,
      h: 0.13,
      rectRadius: 0.03,
      line: { color: C.line, transparency: 100 },
      fill: { color: C.line, transparency: 10 },
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x: x + 0.26,
      y: 4.28 + index * 0.31,
      w: barW,
      h: 0.13,
      rectRadius: 0.03,
      line: { color: bar.color, transparency: 100 },
      fill: { color: bar.color },
    });
    slide.addText(bar.label, {
      x: x + 3.02,
      y: 4.19 + index * 0.31,
      w: 0.4,
      h: 0.21,
      fontFace: FONT,
      fontSize: 7.2,
      color: bar.color,
      align: "right",
      margin: 0,
    });
  });
}

function buildSlide5(slideSpec) {
  const slide = pptx.addSlide("DARK_MASTER");
  slide.background = { color: C.bg };
  addBackgroundGlow(slide, -1.2, -1.5, 5.2, 4.0, C.amber, 95);
  addHeader(slide, "04 · EVIDENCE", slideSpec.title, C.amber);

  addMetricCard(
    slide,
    0.66,
    C.green,
    "MULTIMODAL FUSION",
    METRICS.adaptiveFusionAccuracy,
    "自适应融合准确率",
    "120 条均衡三模态引导样本\n相对固定权重 +5.00 个百分点",
    [
      { value: 0.9083, color: C.muted2, label: "90.83" },
      { value: 0.9583, color: C.green, label: "95.83" },
    ],
  );
  addMetricCard(
    slide,
    4.8,
    C.cyan,
    "TIME TO FIRST AUDIO",
    METRICS.ttfaMedian,
    "中位 TTFA",
    "30 轮本地 · 单客户端 · 热启动\n文本输入到首个 PCM 音频块",
    [
      { value: 0.58, color: C.cyan, label: "P50" },
      { value: 0.99, color: C.amber, label: "P95" },
    ],
  );
  addMetricCard(
    slide,
    8.94,
    C.amber,
    "PAIRED USER STUDY",
    METRICS.satisfaction,
    "总体满意度",
    "20 名参与者 · 160 条任务记录\n任务成功率 70% → 95%",
    [
      { value: 2.79 / 5, color: C.muted2, label: "2.79" },
      { value: 4.19 / 5, color: C.amber, label: "4.19" },
    ],
  );

  addCard(slide, 0.66, 5.42, 12.01, 1.05, {
    fillColor: "18141F",
    lineColor: C.red,
    lineTransparency: 46,
  });
  slide.addText("必须正视的边界", {
    x: 0.95,
    y: 5.7,
    w: 1.48,
    h: 0.32,
    fontFace: FONT,
    fontSize: 12.5,
    bold: true,
    color: C.red,
    margin: 0,
  });
  slide.addText(METRICS.domainShift, {
    x: 2.53,
    y: 5.61,
    w: 2.5,
    h: 0.45,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });
  slide.addText("内部扩增验证", {
    x: 2.62,
    y: 6.08,
    w: 0.95,
    h: 0.18,
    fontFace: FONT,
    fontSize: 7.5,
    color: C.muted,
    align: "center",
    margin: 0,
  });
  slide.addText("独立机场短句", {
    x: 4.0,
    y: 6.08,
    w: 0.95,
    h: 0.18,
    fontFace: FONT,
    fontSize: 7.5,
    color: C.muted,
    align: "center",
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.line, {
    x: 5.35,
    y: 5.7,
    w: 0,
    h: 0.48,
    line: { color: C.line, width: 1 },
  });
  slide.addText(
    "文本模型存在明显域偏移；95.83% 结果用于验证融合流程，不能替代真实机场自然交互泛化测试。",
    {
      x: 5.72,
      y: 5.68,
      w: 6.4,
      h: 0.54,
      fontFace: FONT,
      fontSize: 11.5,
      color: "CBD5E1",
      margin: 0,
      fit: "shrink",
    },
  );
  addNotes(slide, slideSpec);
}

function buildSlide6(slideSpec) {
  const slide = pptx.addSlide("DARK_MASTER");
  slide.background = { color: C.bg };
  addBackgroundGlow(slide, 8.8, -0.8, 5.6, 5.3, C.cyan2, 93);
  addBackgroundGlow(slide, -1.2, 4.2, 5.0, 4.0, C.green, 95);
  addHeader(slide, "05 · CONCLUSION", slideSpec.title, C.cyan);

  const conclusions = [
    ["可退化", "缺失通道置零\n其余权重重归一", C.green],
    ["低首响", "增量切句\nLLM–TTS 并行", C.amber],
    ["同步驱动", "PCM 与 viseme\n共享播放时钟", C.cyan],
  ];
  conclusions.forEach(([title, body, color], index) => {
    const x = 0.72 + index * 2.55;
    addCard(slide, x, 1.75, 2.24, 2.32, {
      fillColor: C.panel,
      lineColor: color,
      lineTransparency: 58,
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.82,
      y: 2.04,
      w: 0.6,
      h: 0.6,
      line: { color, transparency: 45, width: 1.2 },
      fill: { color, transparency: 83 },
    });
    slide.addText(String(index + 1).padStart(2, "0"), {
      x: x + 0.82,
      y: 2.21,
      w: 0.6,
      h: 0.2,
      fontFace: FONT,
      fontSize: 10,
      bold: true,
      color,
      align: "center",
      margin: 0,
    });
    slide.addText(title, {
      x: x + 0.22,
      y: 2.85,
      w: 1.8,
      h: 0.38,
      fontFace: FONT,
      fontSize: 19,
      bold: true,
      color: C.white,
      align: "center",
      margin: 0,
    });
    slide.addText(body, {
      x: x + 0.24,
      y: 3.38,
      w: 1.76,
      h: 0.52,
      fontFace: FONT,
      fontSize: 10.2,
      color: C.muted,
      align: "center",
      margin: 0,
    });
  });

  addCard(slide, 0.72, 4.46, 7.34, 1.5, {
    fillColor: "101721",
    lineColor: C.red,
    lineTransparency: 70,
  });
  slide.addText("DEPLOYMENT BOUNDARY", {
    x: 1.0,
    y: 4.77,
    w: 2.2,
    h: 0.22,
    fontFace: FONT,
    fontSize: 8,
    bold: true,
    color: C.red,
    charSpacing: 1.2,
    margin: 0,
  });
  slide.addText("现场部署前仍需验证", {
    x: 1.0,
    y: 5.12,
    w: 2.35,
    h: 0.38,
    fontFace: FONT,
    fontSize: 17,
    bold: true,
    color: C.white,
    margin: 0,
  });
  addPill(slide, "跨说话人", 3.58, 4.91, 1.28, C.red);
  addPill(slide, "多噪声条件", 5.02, 4.91, 1.48, C.red);
  addPill(slide, "自然交互评价", 6.66, 4.91, 1.18, C.red);
  slide.addText("当前结果支持低开销融合与流式控制的可行性，不直接外推为真实机场部署性能。", {
    x: 3.58,
    y: 5.51,
    w: 4.24,
    h: 0.27,
    fontFace: FONT,
    fontSize: 9.4,
    color: C.muted,
    margin: 0,
  });

  addCard(slide, 8.48, 1.55, 4.12, 4.65, {
    fillColor: C.panel3,
    lineColor: C.cyan,
    lineTransparency: 72,
  });
  slide.addImage(
    imageContainOptions(
      path.join(assetDir, "avatar_wave.png"),
      9.17,
      1.85,
      2.68,
      3.47,
      271 / 351,
    ),
  );
  slide.addText("面向交通枢纽的\n情感感知流式数字人", {
    x: 8.85,
    y: 5.28,
    w: 3.38,
    h: 0.64,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color: C.white,
    align: "center",
    margin: 0,
  });
  slide.addText("ANONYMOUS PAPER DEMO", {
    x: 9.1,
    y: 5.96,
    w: 2.88,
    h: 0.2,
    fontFace: FONT,
    fontSize: 7.6,
    color: C.cyan,
    charSpacing: 1.3,
    align: "center",
    margin: 0,
  });
  addNotes(slide, slideSpec);
}

function buildPresentation() {
  buildSlide1(SLIDES[0]);
  buildSlide2(SLIDES[1]);
  buildSlide3(SLIDES[2]);
  buildSlide4(SLIDES[3]);
  buildSlide5(SLIDES[4]);
  buildSlide6(SLIDES[5]);
}

function factsTable(slideSpec) {
  const facts =
    slideSpec.requiredFacts.length > 0
      ? slideSpec.requiredFacts.join("　/　")
      : "本页不引入新的实验数值";
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 24, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            shading: {
              type: ShadingType.CLEAR,
              color: "auto",
              fill: "DDF7FB",
            },
            borders: {
              top: { style: BorderStyle.SINGLE, color: "A5DDE8", size: 4 },
              bottom: { style: BorderStyle.SINGLE, color: "A5DDE8", size: 4 },
              left: { style: BorderStyle.SINGLE, color: "A5DDE8", size: 4 },
              right: { style: BorderStyle.SINGLE, color: "A5DDE8", size: 4 },
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "核心数据",
                    bold: true,
                    font: FONT,
                    size: 20,
                    color: "0E7490",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 76, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            borders: {
              top: { style: BorderStyle.SINGLE, color: "CBD5E1", size: 4 },
              bottom: { style: BorderStyle.SINGLE, color: "CBD5E1", size: 4 },
              left: { style: BorderStyle.SINGLE, color: "CBD5E1", size: 4 },
              right: { style: BorderStyle.SINGLE, color: "CBD5E1", size: 4 },
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: facts,
                    font: FONT,
                    size: 20,
                    color: "334155",
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

async function buildNarrationDocument() {
  const interfaceImage = await readFile(
    path.join(assetDir, "system_interface.png"),
  );
  const children = [];

  SLIDES.forEach((slideSpec, index) => {
    children.push(
      new Paragraph({
        pageBreakBefore: index > 0,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 180, after: 120 },
        children: [
          new TextRun({
            text: `第 ${slideSpec.number} 页｜${slideSpec.title}`,
            font: FONT,
            bold: true,
            color: "0F172A",
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 170 },
        children: [
          new TextRun({
            text: `目标时长：${slideSpec.targetSeconds} 秒`,
            font: FONT,
            bold: true,
            size: 21,
            color: "0891B2",
          }),
          new TextRun({
            text: "　｜　匿名审稿视频",
            font: FONT,
            size: 21,
            color: "64748B",
          }),
        ],
      }),
      new Paragraph({
        spacing: { before: 80, after: 140, line: 420 },
        children: [
          new TextRun({
            text: slideSpec.narration,
            font: FONT,
            size: 28,
            color: "1E293B",
          }),
        ],
      }),
      factsTable(slideSpec),
    );

    if (index === 0) {
      children.push(
        new Paragraph({
          spacing: { before: 220, after: 80 },
          children: [
            new TextRun({
              text: "视觉参考",
              font: FONT,
              bold: true,
              size: 20,
              color: "64748B",
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: interfaceImage,
              transformation: { width: 560, height: 324 },
              type: "png",
              altText: {
                title: "交通终端智能服务中枢界面",
                description: "论文终版中的系统界面与运行状态",
                name: "system_interface",
              },
            }),
          ],
        }),
      );
    }

    children.push(
      new Paragraph({
        spacing: { before: 180 },
        children: [
          new TextRun({
            text: `字数：${slideSpec.narration.replace(/[，。；：、,.!?！？\s]/g, "").length}　｜　最终实测配音时长将在成片阶段校准`,
            font: FONT,
            size: 18,
            color: "94A3B8",
          }),
        ],
      }),
    );
  });

  const document = new Document({
    creator: "Anonymous",
    title: "ChinaVR Awatar 论文 Demo 逐页中文讲述词",
    subject: "Anonymous paper review demo narration",
    description:
      "Six-slide Chinese narration for the ChinaVR Awatar anonymous review demo.",
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: "1E293B" },
          paragraph: {
            spacing: { line: 360, lineRule: LineRuleType.AUTO },
          },
        },
        heading1: {
          run: { font: FONT, size: 34, bold: true, color: "0F172A" },
          paragraph: { spacing: { before: 240, after: 140 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 900,
              right: 900,
              bottom: 900,
              left: 900,
            },
          },
        },
        headers: {},
        footers: {},
        children,
      },
    ],
  });
  const buffer = await Packer.toBuffer(document);
  await writeFile(DOCX_PATH, buffer);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  buildPresentation();
  await Promise.all([
    pptx.writeFile({ fileName: PPTX_PATH, compression: true }),
    buildNarrationDocument(),
  ]);
  console.log(`wrote ${path.relative(rootDir, PPTX_PATH)}`);
  console.log(`wrote ${path.relative(rootDir, DOCX_PATH)}`);
}

await main();

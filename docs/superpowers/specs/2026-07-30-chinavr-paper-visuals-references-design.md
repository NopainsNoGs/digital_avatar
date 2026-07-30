# ChinaVR 论文终版图表、图7与参考文献修订设计

## 1. 背景与目标

修订对象为：

- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/`
- `paper/ChinaVR_Awatar_Final_20260730.pdf`

本次修订解决以下问题：

1. 五张统计图均采用柱状图，表达形式重复，柱宽、方向和视觉重量不统一。
2. 柱状图背景参考线较重，影响论文版面的整洁度。
3. 参考文献缺少 2026 年正式发表的相关研究，且现有含 arXiv 标记的条目需要核对正式发表状态。
4. 图7(b)、图7(c)中的人脸马赛克过强，遮挡了表情识别界面的有效信息。

目标是在不改变实验数据和论文核心结论的前提下，提升图表表达、文献时效性和图7可读性，并生成可直接提交的终版 PDF 与 Overleaf 源文件包。

## 2. 已确认方案

采用“方案 A：按数据关系进行语义化图表改造”。

不保留现有五张柱状图。每张图根据其主要比较关系选择不同但统一的表达形式，所有统计图删除背景网格线，并共享一致的视觉规范。

## 3. 图表改造

### 3.1 各类别 F1

源文件：`figures/independent_f1.pdf`

改为横向配对哑铃图：

- 每个情感类别为一行。
- Character model 与 rule branch 使用两个圆点表示。
- 同一类别的两个点使用细线连接。
- 在点旁直接标注 F1 数值。
- 横轴保持 0--1 的 F1 范围。

该形式重点表达两个分支在每个类别上的差异，避免重复使用分组柱。

### 3.2 运行时延迟汇总

源文件：`figures/latency_summary.pdf`

改为竖向棒棒糖图：

- 保留对数纵轴，以覆盖毫秒级到秒级的数量级差异。
- 每项延迟使用统一大小的圆点和细竖线。
- 在圆点上方标注实际时间。
- 不绘制横向参考线。

### 3.3 多模态消融

源文件：`figures/multimodal_ablation.pdf`

改为横向哑铃图：

- 每个方法为一行。
- Accuracy 与 Macro-F1 使用两个固定颜色的圆点。
- 使用细线连接同一方法的两个指标。
- 在圆点旁标注数值。
- 按论文当前方法顺序呈现，不改变实验数据。

### 3.4 TTFA 分解

源文件：`figures/ttfa_breakdown.pdf`

改为 Median--P95 区间图：

- 每个流水线阶段为一行。
- 区间起点表示 Median，终点表示 P95。
- 使用线段表达尾延迟跨度，端点使用不同形状。
- 直接标注 Median 与 P95 数值。
- 不使用柱形面积表达。

### 3.5 用户研究

源文件：`figures/user_study.pdf`

改为双折线轮廓图：

- 六个主观评分维度沿横轴排列。
- Baseline 与 proposed system 各使用一条折线。
- 每个数据点直接显示评分。
- 纵轴保持用户研究原始评分范围。
- 不绘制背景参考线。

### 3.6 统一视觉规范

五张图统一采用：

- 与论文兼容的字体和字号。
- Proposed/主要模型使用蓝色。
- Baseline、rule branch 或对照项使用橙色。
- Accuracy/Median 等第一指标使用蓝色，Macro-F1/P95 等第二指标使用橙色。
- 统一圆点尺寸、连接线宽和坐标轴线宽。
- 仅保留必要的左、下坐标轴；去除顶部、右侧边框。
- 不绘制横向或纵向背景网格线。
- 保持当前论文中的图名、标签和数据来源不变；若表达形式变化需要解释，则同步调整图注。

## 4. 图7马赛克调整

源生成器：`paper/experiments/build_interface_composite.py`

目标图：`figures/system_interface_composite.png`

处理规则：

- 图7(b)、图7(c)继续覆盖原有完整人脸区域，不缩小匿名区域。
- 马赛克块尺寸由当前约 16 像素调整为 8 像素。
- 不恢复原始清晰人脸，不改变其他三个子图。
- 重新生成后进行视觉检查：表情识别结果和界面状态应可辨识，但人脸身份不应清晰可识别。
- 若 8 像素不足以匿名，只允许在 8--10 像素范围内微调，不回到当前重度马赛克。
- 将生成结果同步到终版源目录，避免实验目录与最终论文使用不同版本。

正文中“真人画面已进行像素化匿名处理”的表述保持不变。

## 5. 现有 arXiv 文献审计

共检查 15 条带 arXiv 标记的现有参考文献。

### 5.1 改引正式发表版本

以下 5 条已有可核验的正式会议版本：

1. FaceMesh：CVPR Workshop on Computer Vision for Augmented and Virtual Reality 2019。
2. LLaMA-Omni：ICLR 2025。
3. VITA-1.5：NeurIPS 2025。
4. VASA-1：NeurIPS 2024。
5. Hallo2：ICLR 2025。

处理规则：

- 使用正式会议名称、年份、页码或正式论文页面提供的元数据。
- 删除正式会议条目后重复附加的 `arXiv:` 标记。

### 5.2 保留为预印本

截至 2026-07-30，以下 10 条未查到同标题的正式会议或期刊发表记录：

1. MediaPipe。
2. FunAudioLLM。
3. CosyVoice。
4. Qwen2.5 Technical Report。
5. Qwen2.5-Omni Technical Report。
6. Step-Audio。
7. Kimi-Audio Technical Report。
8. Qwen3 Technical Report。
9. LivePortrait。
10. LatentSync。

这些条目继续明确标为 arXiv preprint/预印本，不将项目页、代码仓库、其他论文的引用或“被会议论文引用”误判为正式录用。

## 6. 新增 2026 年正式论文

新增约 5 篇与论文主题直接相关、且已有正式会议出处的 2026 年论文：

1. Seong et al., *Emotion-Wheel-Guided Audio-Referred Text Representation for Multimodal Emotion Recognition in Conversation*, ACL 2026, pp. 40392--40403, DOI: 10.18653/v1/2026.acl-long.1875。
2. Girish et al., *Prosody as Supervision: Bridging the Non-Verbal--Verbal for Multilingual Speech Emotion Recognition*, ACL 2026, pp. 41881--41893, DOI: 10.18653/v1/2026.acl-long.1940。
3. Ray et al., *τ-Voice: Benchmarking Full-Duplex Voice Agents on Real-World Domains*, ICML 2026。
4. Wu et al., *IP-Adapter Is All You Need: Towards Fine-Tuning-Free Diffusion-Based Talking Face Generation*, CVPR 2026, pp. 32967--32977。
5. Yee et al., *SynchroRaMa: Lip-Synchronized and Emotion-Aware Talking Face Generation via Multi-Modal Emotion Embedding*, WACV 2026, pp. 4546--4555。

新增条目不只追加到文末，还要按内容融入相关工作：

- EMART 和 Prosody as Supervision：多模态情感识别、语音韵律与模态互补。
- τ-Voice：全双工语音代理的真实场景评测与系统可靠性。
- IP-Adapter Is All You Need：免微调说话人脸生成、口型同步和时序稳定性。
- SynchroRaMa：多模态情感嵌入与情感化说话人脸生成。

正文只陈述这些论文正式页面能够支持的结论，不夸大其与本文系统的可比性。

## 7. 修改范围与生成物

预计修改：

- `paper/experiments/run_paper_experiments.py`
- `paper/experiments/build_interface_composite.py`
- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/main.tex`
- 必要的 `generated_*.tex`
- 终版 `figures/` 中的五张统计图和图7合成图

最终更新：

- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730/`
- `paper/ChinaVR_Awatar_Final_20260730.pdf`
- `paper/ChinaVR_Awatar_Overleaf_FINAL_20260730.zip`

不修改实验原始数据，不修改与本次反馈无关的项目源码，也不覆盖用户当前其他未提交改动。

## 8. 验收标准

1. 五张统计图中不再出现柱状图。
2. 五张统计图不含背景网格参考线。
3. 图形尺寸、字体、颜色、标记与线宽统一。
4. 图表数值与修订前完全一致。
5. 图7(b)、图7(c)的马赛克明显减轻，同时仍完成匿名处理。
6. 15 条现有 arXiv 文献全部按审计结果处理。
7. 新增 5 篇 2026 年论文均有正式会议页面，并在正文中被实际引用。
8. LaTeX 编译无未定义引用、缺失图片或致命错误。
9. 最终 PDF 逐页检查，图表、图注、参考文献和分页无重叠、溢出或异常空白。
10. 最终 PDF 与 Overleaf 源文件包使用同一套最新图表和文献内容。

## 9. 核验来源

- ACL Anthology: https://aclanthology.org/
- CVF Open Access: https://openaccess.thecvf.com/
- OpenReview: https://openreview.net/
- NeurIPS Proceedings: https://proceedings.neurips.cc/
- Google Research Publications: https://research.google/pubs/
- arXiv: https://arxiv.org/

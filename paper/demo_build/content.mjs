export const METRICS = Object.freeze({
  adaptiveFusionAccuracy: "95.83%",
  fixedFusionGain: "5.00 个百分点",
  ttfaMedian: "813.13 ms",
  satisfaction: "2.79 → 4.19",
  domainShift: "99.83% → 55.56%",
});

export const SLIDES = [
  {
    number: 1,
    title: "面向交通枢纽的情感感知流式数字人",
    targetSeconds: 14,
    narration:
      "大家好，我们面向机场和车站，设计了一套多模态情感感知与流式驱动数字人系统，让数字人更懂旅客、更早反馈。下面介绍问题、方法和结果。",
    requiredFacts: [],
  },
  {
    number: 2,
    title: "真实终端中的三类断点",
    targetSeconds: 15,
    narration:
      "系统面临三个断点：左侧，噪声与遮挡会使单一模态失效；中间，串行链路等待完整回复；右侧，音频与口型分离生成会漂移。目标是通道可退化、反馈可提前、音画可同步。",
    requiredFacts: [],
  },
  {
    number: 3,
    title: "质量感知的多模态情感融合",
    targetSeconds: 18,
    narration:
      "针对感知问题，左侧提取四百六十八点面部几何、语音韵律和文本语义。中间按权重、样本量和置信度融合；模态缺失时置零并重新归一化。右侧输出六类情感，驱动回复、语音、表情和动作。",
    requiredFacts: [],
  },
  {
    number: 4,
    title: "首响优先的流式音画流水线",
    targetSeconds: 20,
    narration:
      "针对时延与同步，上方把回复拆成情绪字段和句段，由语言模型与语音合成并行处理。中部展示到首音频块的时间轴。下方音频块与口型共享流编号、块序号和播放时钟，让语音、字幕、表情和动作同步。",
    requiredFacts: [],
  },
  {
    number: 5,
    title: "三组证据与一个必须正视的边界",
    targetSeconds: 28,
    narration:
      "三组证据：左侧，一百二十条样本的自适应融合达到百分之九十五点八三，比固定权重高五个百分点；中间，三十轮热启动测试的首音频块中位时延为八百一十三点一三毫秒；右侧，二十名参与者、一百六十条任务的满意度由二点七九升至四点一九。底部显示文本模型由内部验证的百分之九十九点八三降到独立机场短句的百分之五十五点五六，说明跨域泛化受限。",
    requiredFacts: [
      "95.83%",
      "5.00 个百分点",
      "813.13 ms",
      "2.79 → 4.19",
      "99.83% → 55.56%",
    ],
  },
  {
    number: 6,
    title: "低开销感知，低首响响应，同步化驱动",
    targetSeconds: 13,
    narration:
      "最后，系统实现可退化感知、首响优先和块级同步。结果仅验证可行性，不能外推到真实机场；部署前仍需跨说话人、多噪声和自然交互评价。感谢观看。",
    requiredFacts: [],
  },
];

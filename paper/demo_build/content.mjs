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
    title: "让交通枢纽数字人既懂情绪，也能尽早开口",
    targetSeconds: 10,
    narration:
      "面向机场和车站，数字人不仅要回答正确，还要在噪声与遮挡下理解旅客状态，尽早给出语音、表情和动作一致的反馈。",
    requiredFacts: [],
  },
  {
    number: 2,
    title: "真实终端中的三类断点",
    targetSeconds: 15,
    narration:
      "真实终端有三类断点：面部、语音或文本通道会因环境失效；串行链路等待完整回复；音频与口型分开生成，还会造成时间轴漂移。",
    requiredFacts: [],
  },
  {
    number: 3,
    title: "质量感知的多模态情感融合",
    targetSeconds: 22,
    narration:
      "我们并行提取四百六十八点面部几何、语音韵律和文本语义的六类情感分数。融合权重同时考虑基础权重、置信度和有效样本量；模态缺失时权重置零，其余通道重新归一化，让系统平滑退化。",
    requiredFacts: [],
  },
  {
    number: 4,
    title: "首响优先的流式音画流水线",
    targetSeconds: 22,
    narration:
      "回复采用结构化增量协议：情绪字段先行，文本按标点和超时切句；语言模型与语音合成以生产者消费者方式并行。每个音频块和口型轨迹共享流编号、块序号与播放时钟，让语音、字幕、表情和动作渐进输出。",
    requiredFacts: [],
  },
  {
    number: 5,
    title: "三组证据与一个必须正视的边界",
    targetSeconds: 30,
    narration:
      "一百二十条引导样本中，自适应融合准确率为百分之九十五点八三，比固定权重高五个百分点。三十轮本地热启动文本测试的首音频块中位时延为八百一十三点一三毫秒。二十名参与者的一百六十条任务中，满意度由二点七九升至四点一九。但文本模型从内部验证的百分之九十九点八三降到独立短句的百分之五十五点五六，表明跨域泛化仍受限。",
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
      "该方法实现缺失模态可退化、首响优先和块级音画同步。现场部署前，仍需完成跨说话人、多噪声条件与自然交互评价。",
    requiredFacts: [],
  },
];

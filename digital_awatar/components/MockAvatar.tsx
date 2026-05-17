// components/MockAvatar.tsx
'use client';
import { motion } from 'framer-motion';

export default function MockAvatar({ status }: { status: string }) {
  const isListening = status === 'LISTENING';
  const isSpeaking = status === 'SPEAKING';

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* 背景发光底座 */}
      <div className={`absolute w-[500px] h-[500px] rounded-full blur-[100px] transition-colors duration-1000 ${
        isListening ? 'bg-cyan-500/20' : isSpeaking ? 'bg-blue-500/20' : 'bg-slate-500/10'
      }`} />

      <motion.svg
        viewBox="0 0 200 200"
        className="w-[60vh] h-[60vh] drop-shadow-[0_0_30px_rgba(0,229,255,0.2)]"
        animate={{ 
          y: [0, -10, 0], // 呼吸起伏
          rotate: isListening ? [0, -2, 2, 0] : 0 // 倾听时轻微侧头
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* 头部轮廓 - 极简科技感 */}
        <path
          d="M60,40 Q100,20 140,40 L150,110 Q100,140 50,110 Z"
          fill="url(#headGrad)"
          stroke="rgba(0,229,255,0.5)"
          strokeWidth="0.5"
        />
        
        {/* 眼睛 - 带眨眼动画 */}
        <g>
          <motion.ellipse 
            cx="80" cy="75" rx="6" ry="4" fill="#00E5FF"
            animate={{ ry: [4, 0.5, 4] }}
            transition={{ duration: 4, repeat: Infinity, times: [0, 0.95, 1] }}
          />
          <motion.ellipse 
            cx="120" cy="75" rx="6" ry="4" fill="#00E5FF"
            animate={{ ry: [4, 0.5, 4] }}
            transition={{ duration: 4, repeat: Infinity, times: [0, 0.95, 1] }}
          />
        </g>

        {/* 嘴巴 - 说话时联动 */}
        <motion.path
          d={isSpeaking ? "M85,105 Q100,115 115,105" : "M90,105 H110"}
          stroke="#00E5FF"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          animate={isSpeaking ? { d: ["M85,105 Q100,115 115,105", "M85,105 Q100,100 115,105"] } : {}}
          transition={{ duration: 0.2, repeat: Infinity }}
        />

        <defs>
          <linearGradient id="headGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(0,229,255,0.15)" />
            <stop offset="100%" stopColor="rgba(0,102,255,0.05)" />
          </linearGradient>
        </defs>
      </motion.svg>
    </div>
  );
}

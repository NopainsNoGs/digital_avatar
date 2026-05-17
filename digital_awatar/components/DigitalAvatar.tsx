// components/DigitalAvatar.tsx
'use client';
import { motion } from 'framer-motion';

export default function DigitalAvatar({ status, emotion }: { status: string, emotion?: string }) {
  const isSpeaking = status === 'SPEAKING';
  const isListening = status === 'LISTENING';
  
  // 根据情感微调颜色
  const themeColor = emotion === 'urgent' ? '#FF6B6B' : '#00E5FF';

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* 底部扩散光环 - 模拟能量感 */}
      <motion.div 
        animate={{ scale: isListening ? [1, 1.2, 1] : 1, opacity: isListening ? [0.2, 0.5, 0.2] : 0.1 }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute w-[400px] h-[400px] rounded-full bg-cyan-500/20 blur-[80px]" 
      />

      <motion.div
        animate={{ y: [0, -15, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative"
      >
        <svg viewBox="0 0 240 240" className="w-[55vh] h-[55vh] drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <defs>
            <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#E0F7FA" />
            </linearGradient>
            <filter id="innerShadow">
              <feOffset dx="0" dy="2" />
              <feGaussianBlur stdDeviation="3" result="offset-blur" />
              <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
              <feFlood floodColor="black" floodOpacity="0.1" result="color" />
              <feComposite operator="in" in="color" in2="inverse" result="shadow" />
              <feComponentTransfer in="shadow">
                <feFuncA type="linear" slope="0.5" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 身体 - 圆润的豆包风格 */}
          <path d="M60,100 Q120,80 180,100 L190,180 Q120,210 50,180 Z" fill="url(#bodyGrad)" filter="url(#innerShadow)" />
          
          {/* 头部/面屏 */}
          <rect x="75" y="45" width="90" height="70" rx="35" fill="#1A1A1A" stroke="#333" strokeWidth="2" />
          
          {/* 动态眼睛 */}
          <g>
            <motion.ellipse 
              cx="100" cy="80" rx="7" ry={isSpeaking ? 7 : 4} fill={themeColor}
              animate={isSpeaking ? { scaleY: [1, 1.2, 1] } : { scaleY: [1, 0.1, 1] }}
              transition={isSpeaking ? { duration: 0.2, repeat: Infinity } : { duration: 4, repeat: Infinity, times: [0, 0.98, 1] }}
            />
            <motion.ellipse 
              cx="140" cy="80" rx="7" ry={isSpeaking ? 7 : 4} fill={themeColor}
              animate={isSpeaking ? { scaleY: [1, 1.2, 1] } : { scaleY: [1, 0.1, 1] }}
              transition={isSpeaking ? { duration: 0.2, repeat: Infinity } : { duration: 4, repeat: Infinity, times: [0, 0.98, 1] }}
            />
          </g>

          {/* 交互状态波纹 (仅在听讲时出现) */}
          {isListening && (
            <motion.path
              d="M95,100 Q120,110 145,100"
              stroke={themeColor} strokeWidth="3" fill="none" strokeLinecap="round"
              animate={{ opacity: [0.3, 1, 0.3], scaleX: [0.8, 1.1, 0.8] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </svg>
      </motion.div>
    </div>
  );
}

'use client';
import { motion } from 'framer-motion';
import { Mic, ScanFace, Activity } from 'lucide-react';
import { useState, useEffect } from 'react';

interface ListeningViewProps {
  onFinish: (transcript: string) => void;
}

export default function ListeningView({ onFinish }: ListeningViewProps) {
  const [text, setText] = useState('');
  const mockTranscription = "我找不到行李转盘了，等了半个小时，你们怎么回事啊！";

  // 模拟流式语音转写效果
  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setText(mockTranscription.slice(0, i));
      i++;
      if (i > mockTranscription.length) clearInterval(timer);
    }, 100);
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="h-full w-full flex gap-8 px-12 pb-12"
    >
      {/* 左侧：数字人容器 (倾听态) */}
      <div className="w-[35%] glass-card rounded-3xl flex flex-col items-center justify-center relative overflow-hidden border-hub-cyan/30 neon-glow-cyan">
        <div className="text-hub-cyan/20 text-8xl font-black transition-transform duration-1000 scale-105">2D_AVATAR</div>
        
        {/* 底部动态波形环 */}
        <div className="absolute bottom-12 flex items-end gap-1 h-12">
          {[...Array(15)].map((_, i) => (
            <motion.div 
              key={i}
              animate={{ height: [10, Math.random() * 40 + 10, 10] }}
              transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
              className="w-1.5 bg-hub-cyan rounded-t-full"
            />
          ))}
        </div>
      </div>

      {/* 右侧：多模态感知 HUD */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex-1 glass-card rounded-3xl p-8 flex flex-col relative overflow-hidden">
          <div className="flex items-center gap-2 mb-8 text-hub-cyan">
            <Activity size={20} className="animate-pulse" />
            <h2 className="font-bold tracking-widest">多模态特征融合引擎 (MM-FUSION)</h2>
          </div>

          <div className="flex gap-6 flex-1">
            {/* 视觉情绪分析模拟 */}
            <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-4 flex flex-col items-center justify-center relative">
               <ScanFace size={48} className="text-white/20 mb-4" />
               <motion.div 
                 animate={{ top: ['0%', '100%', '0%'] }} 
                 transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                 className="absolute w-full h-0.5 bg-hub-cyan/50 shadow-[0_0_10px_#00e5ff]"
               />
               <span className="text-xs text-gray-400 font-mono">面部特征点阵扫描中...</span>
               <div className="mt-4 px-3 py-1 bg-red-500/20 text-red-400 text-xs rounded-full border border-red-500/30">
                 侦测情绪：焦虑 (Anxious) 87%
               </div>
            </div>

            {/* 语音分析模拟 */}
            <div className="flex-[2] bg-black/40 rounded-2xl border border-white/5 p-6 flex flex-col">
               <div className="flex items-center gap-2 mb-4 opacity-50">
                 <Mic size={16} />
                 <span className="text-xs font-mono">实时语音声学分析 (SenseVoice)</span>
               </div>
               <p className="text-xl leading-relaxed text-gray-200 font-light">
                 {text}<motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity }} className="w-2 h-5 bg-hub-cyan inline-block ml-1 align-middle"/>
               </p>
            </div>
          </div>
          
          <button 
            onClick={() => onFinish(mockTranscription)}
            className="absolute bottom-8 right-8 px-6 py-2 bg-hub-cyan text-black text-sm font-bold rounded-lg hover:bg-white transition-colors"
          >
            模拟发送给大模型 ➔
          </button>
        </div>
      </div>
    </motion.div>
  );
}

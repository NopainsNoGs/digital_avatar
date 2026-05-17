'use client';
import { motion } from 'framer-motion';
import { Map, Users } from 'lucide-react';

interface WelcomeViewProps {
  onStart: () => void;
}

export default function WelcomeView({ onStart }: WelcomeViewProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="h-full w-full flex gap-8 px-12 pb-12"
    >
      {/* 左侧：数字人容器 (占位) */}
      <div className="w-[35%] glass-card rounded-3xl flex items-center justify-center relative overflow-hidden">
        <div className="text-hub-cyan/20 text-8xl font-black">2D_AVATAR</div>
        <div className="absolute bottom-12 text-center">
          <p className="text-hub-cyan font-mono animate-pulse">{">>>"} STANDBY_MODE</p>
        </div>
      </div>

      {/* 右侧：全局态势看板 */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex-1 glass-card rounded-3xl p-8 relative">
          <div className="flex items-center gap-2 mb-6 text-hub-cyan">
            <Map size={20} />
            <h2 className="font-bold">枢纽实时态势分布 (Global Heatmap)</h2>
          </div>
          {/* 这里可以放你之前的 YOLO 模拟框逻辑 */}
          <div className="w-full h-[80%] rounded-xl bg-slate-900/50 border border-white/5 relative overflow-hidden">
             {/* 模拟热力点 */}
             <div className="absolute top-1/4 left-1/3 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl" />
             <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />
          </div>
        </div>

        <div className="h-48 flex gap-6">
          <div className="flex-1 glass-card rounded-2xl p-6 flex items-center gap-4">
             <div className="p-4 bg-hub-blue/20 rounded-xl text-hub-blue"><Users /></div>
             <div>
               <div className="text-xs opacity-50 uppercase font-mono">今日累计到发</div>
               <div className="text-3xl font-black">142,509</div>
             </div>
          </div>
          <div className="flex-1 glass-card rounded-2xl p-6 flex flex-col justify-center cursor-pointer hover:bg-white/10 transition-all border-hub-cyan/30" onClick={onStart}>
             <p className="text-hub-cyan text-sm font-bold">点击屏幕或语音唤醒</p>
             <h3 className="text-xl font-bold uppercase">开始交互服务</h3>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

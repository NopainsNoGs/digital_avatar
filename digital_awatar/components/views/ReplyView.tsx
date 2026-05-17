'use client';
import { motion } from 'framer-motion';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';

interface ReplyViewProps {
  response?: unknown;
  onReset: () => void;
}

export default function ReplyView({ response, onReset }: ReplyViewProps) {
  // 模拟大模型生成的回复
  const mockReply = "感知到您的焦急。别担心，系统已锁定您所在的 B 区。我已为您开启快速寻物通道，并指派工作人员前往协助，请跟随屏幕地图指引前往失物招领处。";

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="h-full w-full flex gap-8 px-12 pb-12"
    >
      {/* 左侧：数字人容器 (说话态) */}
      <div className="w-[35%] glass-card rounded-3xl flex items-center justify-center relative overflow-hidden">
        <div className="text-hub-cyan/40 text-8xl font-black scale-100">2D_AVATAR</div>
        <div className="absolute bottom-12 text-center">
          <p className="text-hub-cyan font-mono flex items-center gap-2">
            <span className="w-2 h-2 bg-hub-cyan rounded-full animate-ping"/> RESPONSE_ACTIVE
          </p>
        </div>
      </div>

      {/* 右侧：决策执行看板 */}
      <div className="flex-1 flex flex-col gap-6">
        <div className="flex-1 glass-card rounded-3xl p-8 flex flex-col relative">
          
          <div className="flex items-center gap-2 mb-6 text-emerald-400">
            <CheckCircle2 size={20} />
            <h2 className="font-bold tracking-widest text-white">智脑调度决策 (LLM_DECISION)</h2>
          </div>

          <div className="bg-black/40 rounded-2xl p-6 border border-white/5 mb-6">
             <p className="text-lg text-gray-200 leading-relaxed font-light">
               “{mockReply}”
             </p>
          </div>

          {/* 智能指引卡片弹出 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="flex-1 bg-gradient-to-r from-hub-blue/20 to-transparent border-l-4 border-hub-blue rounded-r-2xl p-6 flex flex-col justify-center"
          >
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="text-hub-cyan" size={24} />
              <h3 className="text-xl font-bold">已执行应急调度指令</h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-300 font-mono">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-hub-cyan" /> 目标位置：B区行李转盘 T-04
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-hub-cyan" /> 调度资源：安保人员张工 (工号 092)
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-hub-cyan" /> 预计抵达时间：2 分钟
              </li>
            </ul>
          </motion.div>

          <button 
            onClick={onReset}
            className="absolute top-8 right-8 px-4 py-2 bg-white/10 text-gray-300 text-xs rounded-lg hover:bg-white/20 transition-colors"
          >
            结束对话 (Reset)
          </button>
        </div>
      </div>
    </motion.div>
  );
}

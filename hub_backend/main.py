import asyncio
import json
import os
import httpx
import torchaudio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from funasr import AutoModel
from openai import AsyncOpenAI
import sys
import torch
import re

# 强制屏蔽系统代理，防止 httpx 报错
os.environ.pop("http_proxy", None)
os.environ.pop("https_proxy", None)
os.environ.pop("all_proxy", None)
os.environ["NO_PROXY"] = "localhost,127.0.0.1"

# 💡 将 CosyVoice 及其隐藏的第三方核心库加入系统路径
base_dir = os.path.dirname(__file__)
cosy_dir = os.path.join(base_dir, 'CosyVoice')

sys.path.append(cosy_dir)
sys.path.append(os.path.join(cosy_dir, 'third_party', 'Matcha-TTS')) 
sys.path.append(os.path.join(cosy_dir, 'third_party', 'AcademiCodec')) 

from cosyvoice.cli.cosyvoice import CosyVoice
from cosyvoice.utils.file_utils import load_wav

app = FastAPI()

# 挂载静态文件目录，让前端可以直接通过 URL 访问生成的音频
app.mount("/static", StaticFiles(directory="static"), name="static")

print("正在加载 SenseVoice (耳朵) ...")
asr_model = AutoModel(model="iic/SenseVoiceSmall", trust_remote_code=True, device="cuda:0")

print("正在加载 CosyVoice (嘴巴) ... (第一次运行会自动下载约 3GB 模型)")
# 我们使用 SFT 版本，它内置了多个高质量的预训练音色
tts_model = CosyVoice('iic/CosyVoice-300M-SFT')

print("✅ 所有感官器官加载完毕！")

# 干净的 HTTP 客户端，连接 Ollama
custom_http_client = httpx.AsyncClient(trust_env=False)
llm_client = AsyncOpenAI(
    api_key="ollama",
    base_url="http://localhost:11434/v1",
    http_client=custom_http_client 
)

class AgentResponse(BaseModel):
    type: str = "AGENT_REPLY"
    status: str
    payload: dict

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("终端大屏已连接至中枢大脑")
    
    try:
        # 👇 就是这里！刚才不小心把 while True 和接收音频的代码删了
        while True:
            audio_bytes = await websocket.receive_bytes()
            print(f"📦 收到前端语音包，大小: {len(audio_bytes)} bytes")
            
            temp_audio_path = "temp_record.webm"
            with open(temp_audio_path, "wb") as f:
                f.write(audio_bytes)
                
            # 1. 听：语音转文字 (修复了 SenseVoice 语言标签问题)
            res = asr_model.generate(input=temp_audio_path, cache={}, language="zh", use_itn=True)
            raw_text = res[0]['text']
            # 使用正则表达式，一键清除所有的 <|xxx|> 标签
            clean_text = re.sub(r'<\|.*?\|>', '', raw_text)
            print(f"🎙️ 旅客说: {clean_text}")
            
            if not clean_text.strip(): 
                continue
            
            # 2. 想：大模型思考
            await websocket.send_json({"type": "STATUS_UPDATE", "status": "THINKING"})
            
            try:
                response = await llm_client.chat.completions.create(
                    model="qwen2.5",
                    messages=[
                        {"role": "system", "content": """你是一个交通枢纽大屏上的智能数字人。请根据旅客的话，输出严格的JSON格式：{"replyText": "回复话术(30字内，口语化)", "emotionMode": "calm/urgent/warm", "actionCard": {"type": "INFO", "title": "标题", "content": "内容"}或null}"""},
                        {"role": "user", "content": clean_text}
                    ]
                )
                
                llm_reply_str = response.choices[0].message.content
                if "```json" in llm_reply_str:
                    llm_reply_str = llm_reply_str.split("```json")[1].split("```")[0]
                    
                payload_data = json.loads(llm_reply_str)
                payload_data["transcript"] = clean_text 
                print(f"✅ 决策结果: {payload_data}")
                
                # 3. 说：CosyVoice 语音合成 (彻底修复 Generator 报错)
                reply_text = payload_data.get("replyText", "好的，我明白了。")
                print(f"🔊 正在生成语音: {reply_text}")
                
                # 遍历生成器，把 CosyVoice 吐出来的每一块音频收集起来
                audio_chunks = []
                for chunk in tts_model.inference_sft(reply_text, '中文女'):
                    audio_chunks.append(chunk['tts_speech'])
                
                # 把所有的音频碎片无缝拼接成一段完整的音频
                final_audio = torch.cat(audio_chunks, dim=1)
                
                # 保存为静态文件
                audio_file_name = "reply.wav"
                audio_file_path = os.path.join("static", audio_file_name)
                torchaudio.save(audio_file_path, final_audio, 22050)
                
                # 将音频 URL 放入 payload
                payload_data["audioUrl"] = f"http://localhost:8000/static/{audio_file_name}"
                
            except Exception as e:
                print(f"⚠️ 推理或合成失败: {e}")
                payload_data = {"transcript": clean_text, "replyText": "系统处理异常，请稍后再试。", "emotionMode": "urgent", "actionCard": None}

            # 4. 传回前端
            final_response = AgentResponse(status="SPEAKING", payload=payload_data)
            await websocket.send_json(final_response.model_dump())
            
            await asyncio.sleep(8.0) # 预留时间给前端播放音频
            await websocket.send_json({"type": "STATUS_UPDATE", "status": "IDLE"})

    except WebSocketDisconnect:
        print("终端大屏已断开连接")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

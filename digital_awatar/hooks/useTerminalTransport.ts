import { useEffect, useRef } from 'react';

import type { ClientSocketMessage, ServerSocketMessage } from '@/types/terminalProtocol';

interface UseTerminalTransportOptions {
  wsUrl: string;
  onJsonMessage: (message: ServerSocketMessage) => void | Promise<void>;
  onBinaryMessage: (packet: ArrayBuffer) => void | Promise<void>;
}

export function useTerminalTransport({
  wsUrl,
  onJsonMessage,
  onBinaryMessage,
}: UseTerminalTransportOptions) {
  const socketRef = useRef<WebSocket | null>(null);
  const onJsonMessageRef = useRef(onJsonMessage);
  const onBinaryMessageRef = useRef(onBinaryMessage);

  useEffect(() => {
    onJsonMessageRef.current = onJsonMessage;
    onBinaryMessageRef.current = onBinaryMessage;
  }, [onJsonMessage, onBinaryMessage]);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => console.log('前端：已连接至 Python 中枢大脑');

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        let message: ServerSocketMessage;
        try {
          message = JSON.parse(event.data) as ServerSocketMessage;
        } catch (error) {
          console.error('无效 WebSocket JSON frame，已忽略:', error);
          return;
        }

        await onJsonMessageRef.current(message);
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        await onBinaryMessageRef.current(event.data);
        return;
      }

      if (event.data instanceof Blob) {
        let packet: ArrayBuffer;
        try {
          packet = await event.data.arrayBuffer();
        } catch (error) {
          console.error('WebSocket binary frame 读取失败，已忽略:', error);
          return;
        }
        await onBinaryMessageRef.current(packet);
      }
    };

    socketRef.current = ws;

    return () => {
      if (socketRef.current === ws) {
        socketRef.current = null;
      }
      ws.close();
    };
  }, [wsUrl]);

  const isOpen = () => socketRef.current?.readyState === WebSocket.OPEN;

  const sendJson = (message: ClientSocketMessage) => {
    if (!isOpen()) {
      return false;
    }
    socketRef.current?.send(JSON.stringify(message));
    return true;
  };

  const sendBinary = (payload: Blob | ArrayBuffer) => {
    if (!isOpen()) {
      return false;
    }
    socketRef.current?.send(payload);
    return true;
  };

  const close = () => {
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
  };

  return {
    isOpen,
    sendJson,
    sendBinary,
    close,
  };
}

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Manages WebSocket connection to the voice server.
 *
 * Routes incoming messages to appropriate callbacks:
 *   audio -> onAudio(base64, sampleRate)
 *   transcript -> updates transcripts state
 *   interruption -> onInterruption()
 *   tool_use -> updates toolUse state
 *
 * Exposes sendAudio() for the capture hook to call.
 *
 * @param {Object} options
 * @param {Function} [options.getWebSocketUrl] - Async function returning a WebSocket URL.
 *   If provided, uses the returned URL (e.g. presigned AgentCore URL).
 *   If not provided, connects to the local dev server via Vite proxy.
 */
export function useVoiceSession({ onAudio, onInterruption, onSessionEnd, getWebSocketUrl } = {}) {
  const [status, setStatus] = useState('disconnected');
  const [transcripts, setTranscripts] = useState([]);
  const [toolUse, setToolUse] = useState(null);
  const wsRef = useRef(null);
  const onAudioRef = useRef(onAudio);
  const onInterruptionRef = useRef(onInterruption);
  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    onAudioRef.current = onAudio;
    onInterruptionRef.current = onInterruption;
    onSessionEndRef.current = onSessionEnd;
  }, [onAudio, onInterruption, onSessionEnd]);

  const getWebSocketUrlRef = useRef(getWebSocketUrl);
  useEffect(() => {
    getWebSocketUrlRef.current = getWebSocketUrl;
  }, [getWebSocketUrl]);

  const connect = useCallback(async () => {
    if (wsRef.current) return;

    setStatus('connecting');
    setTranscripts([]);
    setToolUse(null);

    let wsUrl;
    if (getWebSocketUrlRef.current) {
      try {
        wsUrl = await getWebSocketUrlRef.current();
      } catch (err) {
        console.error('Failed to get WebSocket URL:', err);
        setStatus('disconnected');
        return;
      }
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        // BidiAgent native format (used by both local and AgentCore)
        case 'bidi_audio_stream':
          onAudioRef.current?.(data.audio, data.sample_rate || 24000);
          break;

        case 'bidi_transcript_stream':
          if (data.is_final !== false) {
            setTranscripts((prev) => [
              ...prev,
              { role: data.role || 'assistant', text: data.text || '' },
            ]);
          }
          setToolUse(null);
          break;

        case 'bidi_interruption':
          onInterruptionRef.current?.();
          break;

        case 'bidi_text_response':
          setTranscripts((prev) => [
            ...prev,
            { role: 'assistant', text: data.text || '' },
          ]);
          break;

        // Legacy local server format (kept for backwards compat)
        case 'audio':
          onAudioRef.current?.(data.audio, data.sample_rate);
          break;

        case 'transcript':
          if (data.is_final) {
            setTranscripts((prev) => [
              ...prev,
              { role: data.role, text: data.text },
            ]);
          }
          setToolUse(null);
          break;

        case 'interruption':
          onInterruptionRef.current?.();
          break;

        case 'tool_use':
          setToolUse(data.name);
          break;

        case 'error':
          console.error('[WS] Server error:', data.message);
          break;

        case 'session_end':
          wsRef.current?.close();
          wsRef.current = null;
          setStatus('disconnected');
          onSessionEndRef.current?.(data.reason);
          break;

        case 'bidi_usage':
        case 'bidi_response_start':
        case 'bidi_connection_start':
          break;

        default:
          console.log('[WS] Unknown message type:', data.type);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStatus('disconnected');
    };

    ws.onerror = () => {
      console.error('[WS] Connection error');
      wsRef.current = null;
      setStatus('disconnected');
    };
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  const sendAudio = useCallback((base64Audio) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'bidi_audio_input',
          audio: base64Audio,
          format: 'pcm',
          sample_rate: 16000,
          channels: 1,
        })
      );
    }
  }, []);

  return { status, transcripts, toolUse, connect, disconnect, sendAudio };
}

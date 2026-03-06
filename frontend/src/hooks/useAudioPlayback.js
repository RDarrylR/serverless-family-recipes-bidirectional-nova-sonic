import { useRef, useCallback } from 'react';
import { base64Pcm16ToFloat32 } from '../audio/audioUtils';

const SAMPLE_RATE = 24000;

/**
 * Plays streaming audio via an AudioWorklet with a ring buffer.
 *
 * AudioContext runs at 24kHz (Nova Sonic output rate). Audio samples
 * are decoded from base64 PCM16 and posted to the worklet thread.
 * On barge-in, the worklet's ring buffer is cleared immediately.
 */
export function useAudioPlayback() {
  const contextRef = useRef(null);
  const workletNodeRef = useRef(null);

  const start = useCallback(async () => {
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (context.state === 'suspended') {
      await context.resume();
    }
    contextRef.current = context;

    const workletUrl = new URL(
      '../audio/audio-player-processor.js',
      import.meta.url
    );
    await context.audioWorklet.addModule(workletUrl);

    const node = new AudioWorkletNode(context, 'audio-player-processor');
    node.connect(context.destination);
    workletNodeRef.current = node;
  }, []);

  const playAudio = useCallback((base64Audio) => {
    if (!workletNodeRef.current) return;
    const samples = base64Pcm16ToFloat32(base64Audio);
    workletNodeRef.current.port.postMessage(
      { type: 'audio', samples },
      [samples.buffer]
    );
  }, []);

  const clearBuffer = useCallback(() => {
    workletNodeRef.current?.port.postMessage({ type: 'barge-in' });
  }, []);

  const stop = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (contextRef.current && contextRef.current.state !== 'closed') {
      contextRef.current.close();
    }
    contextRef.current = null;
  }, []);

  return { start, stop, playAudio, clearBuffer };
}

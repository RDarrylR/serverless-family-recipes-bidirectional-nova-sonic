import { useRef, useCallback } from 'react';
import { float32ToBase64Pcm16 } from '../audio/audioUtils';

const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 512;

/**
 * Captures microphone audio with echo cancellation and sends PCM16 base64
 * chunks via the provided callback.
 *
 * Uses getUserMedia with echoCancellation, noiseSuppression, and autoGainControl.
 * AudioContext is created at 16kHz - Chrome and Safari resample automatically.
 * Firefox may need manual downsampling (not implemented for this demo).
 *
 * Uses ScriptProcessorNode (deprecated but universal). AudioWorklet is the
 * upgrade path for capture if ScriptProcessorNode is ever removed.
 */
export function useAudioCapture(onAudioData) {
  const contextRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null);
  const processorRef = useRef(null);
  const onAudioDataRef = useRef(onAudioData);
  onAudioDataRef.current = onAudioData;

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: SAMPLE_RATE,
      },
    });
    streamRef.current = stream;

    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (context.state === 'suspended') {
      await context.resume();
    }
    contextRef.current = context;

    const source = context.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = context.createScriptProcessor(BUFFER_SIZE, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const base64 = float32ToBase64Pcm16(inputData);
      onAudioDataRef.current?.(base64);
    };

    // Connect: mic -> processor -> destination (outputs silence)
    source.connect(processor);
    processor.connect(context.destination);
  }, []);

  const stop = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (contextRef.current && contextRef.current.state !== 'closed') {
      contextRef.current.close();
    }
    contextRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  return { start, stop };
}

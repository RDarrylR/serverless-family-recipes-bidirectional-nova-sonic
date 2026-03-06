/**
 * AudioWorklet processor for gapless streaming playback.
 *
 * Maintains a ring buffer that the audio thread pulls from continuously.
 * Main thread posts audio samples via port.postMessage. On barge-in
 * (user interruption), the buffer is cleared instantly.
 *
 * Buffer is sized for 60 seconds to handle Nova Sonic's faster-than-realtime
 * audio generation (especially after tool calls).
 */
class AudioPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Ring buffer: 60 seconds at 24kHz
    this._bufferSize = 24000 * 60;
    this._buffer = new Float32Array(this._bufferSize);
    this._writePos = 0;
    this._readPos = 0;

    this.port.onmessage = (event) => {
      if (event.data.type === 'audio') {
        this._enqueue(event.data.samples);
      } else if (event.data.type === 'barge-in') {
        // Clear all buffered audio on interruption
        this._readPos = this._writePos;
      }
    };
  }

  _enqueue(samples) {
    const available = this._writePos - this._readPos;
    if (available + samples.length > this._bufferSize) {
      // Skip ahead to avoid overwriting unplayed audio
      this._readPos = this._writePos + samples.length - this._bufferSize;
    }
    for (let i = 0; i < samples.length; i++) {
      this._buffer[this._writePos % this._bufferSize] = samples[i];
      this._writePos++;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    for (let i = 0; i < output.length; i++) {
      if (this._readPos < this._writePos) {
        output[i] = this._buffer[this._readPos % this._bufferSize];
        this._readPos++;
      } else {
        output[i] = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-player-processor', AudioPlayerProcessor);

/**
 * Audio format conversion utilities for PCM16 <-> Float32 <-> base64.
 *
 * Browser audio pipeline:
 *   Capture: Float32 (Web Audio) -> PCM16 -> base64 -> WebSocket
 *   Playback: WebSocket -> base64 -> PCM16 -> Float32 -> Web Audio
 */

/**
 * Convert Float32Array audio samples to base64-encoded PCM16.
 * Clamps input to [-1, 1] range before conversion.
 */
export function float32ToBase64Pcm16(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s * 0x7fff;
  }
  return uint8ToBase64(new Uint8Array(int16.buffer));
}

/**
 * Convert base64-encoded PCM16 to Float32Array for Web Audio playback.
 */
export function base64Pcm16ToFloat32(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer, 0, Math.floor(len / 2));
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

/**
 * Encode a Uint8Array to base64 string, chunk-safe for large arrays.
 */
function uint8ToBase64(bytes) {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

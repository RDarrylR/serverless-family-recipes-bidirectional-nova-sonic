import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useVoiceSession } from '../hooks/useVoiceSession';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { getPresignedWebSocketUrl } from '../websocket-presigned.js';

const TOOL_LABELS = {
  search_recipes: 'Searching recipes...',
  set_timer: 'Setting timer...',
  nutrition_lookup: 'Looking up nutrition...',
  convert_units: 'Converting units...',
};

const agentRuntimeArn = import.meta.env.VITE_AGENT_RUNTIME_ARN;

export default function VoiceChat() {
  const [isActive, setIsActive] = useState(false);
  const playbackRef = useRef({});
  const transcriptEndRef = useRef(null);

  // In deployed mode, create a function that returns a presigned AgentCore WebSocket URL.
  // In local mode, this is undefined and useVoiceSession falls back to the Vite proxy.
  const getWebSocketUrl = useMemo(() => {
    if (!agentRuntimeArn) return undefined;
    return () => {
      const sessionId = crypto.randomUUID();
      return getPresignedWebSocketUrl(agentRuntimeArn, sessionId);
    };
  }, []);

  const handleAudioReceived = useCallback((audioBase64) => {
    playbackRef.current.playAudio?.(audioBase64);
  }, []);

  const handleInterruption = useCallback(() => {
    playbackRef.current.clearBuffer?.();
  }, []);

  const stopCaptureRef = useRef(null);
  const stopPlaybackRef = useRef(null);

  const handleSessionEnd = useCallback(() => {
    stopCaptureRef.current?.();
    stopPlaybackRef.current?.();
    setIsActive(false);
  }, []);

  const { status, transcripts, toolUse, connect, disconnect, sendAudio } =
    useVoiceSession({
      onAudio: handleAudioReceived,
      onInterruption: handleInterruption,
      onSessionEnd: handleSessionEnd,
      getWebSocketUrl,
    });

  const { start: startCapture, stop: stopCapture } =
    useAudioCapture(sendAudio);
  const {
    start: startPlayback,
    stop: stopPlayback,
    playAudio,
    clearBuffer,
  } = useAudioPlayback();

  useEffect(() => {
    playbackRef.current = { playAudio, clearBuffer };
  }, [playAudio, clearBuffer]);

  useEffect(() => {
    stopCaptureRef.current = stopCapture;
    stopPlaybackRef.current = stopPlayback;
  }, [stopCapture, stopPlayback]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const handleToggle = async () => {
    if (isActive) {
      stopCapture();
      disconnect();
      stopPlayback();
      setIsActive(false);
    } else {
      try {
        await startPlayback();
        await connect();
        await startCapture();
        setIsActive(true);
      } catch (err) {
        console.error('[Voice] Failed to start voice session:', err);
        stopPlayback();
        disconnect();
      }
    }
  };

  const statusText =
    status === 'connecting'
      ? 'Connecting...'
      : status === 'connected'
        ? 'Listening - speak to ask a question'
        : isActive
          ? 'Starting...'
          : 'Click the microphone to start';

  return (
    <div style={styles.wrapper}>
      {/* Mic button */}
      <button
        onClick={handleToggle}
        style={{
          ...styles.micButton,
          background: isActive ? '#c0392b' : '#2d5016',
          boxShadow: isActive
            ? '0 4px 16px rgba(192, 57, 43, 0.3)'
            : '0 4px 16px rgba(45, 80, 22, 0.3)',
        }}
        aria-label={isActive ? 'Stop voice session' : 'Start voice session'}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isActive ? (
            <rect x="6" y="6" width="12" height="12" rx="1" />
          ) : (
            <>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          )}
        </svg>
      </button>

      {/* Status */}
      <p style={styles.status}>{statusText}</p>

      {/* Tool use indicator */}
      {toolUse && (
        <p style={styles.toolUse}>
          {TOOL_LABELS[toolUse] || `Using ${toolUse}...`}
        </p>
      )}

      {/* Transcripts */}
      {transcripts.length > 0 && (
        <div style={styles.transcriptArea}>
          {transcripts.map((t, i) => (
            <div
              key={i}
              style={{
                ...styles.transcript,
                alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <span style={styles.role}>
                {t.role === 'user' ? 'You' : 'Assistant'}
              </span>
              <div
                style={{
                  ...styles.bubble,
                  ...(t.role === 'user' ? styles.userBubble : styles.botBubble),
                }}
              >
                {t.text}
              </div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* Hint */}
      {isActive && (
        <p style={styles.hint}>
          Say &quot;stop&quot; or &quot;goodbye&quot; to end the session.
          You can interrupt the assistant by speaking over it.
        </p>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    marginBottom: '1rem',
  },
  status: {
    fontSize: '0.9rem',
    color: '#666666',
    marginBottom: '0.5rem',
  },
  toolUse: {
    fontSize: '0.85rem',
    color: '#4a7c29',
    fontStyle: 'italic',
    marginBottom: '0.5rem',
  },
  transcriptArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
    maxHeight: 400,
    overflowY: 'auto',
    marginTop: '1.5rem',
    padding: '0 0.5rem',
  },
  transcript: {
    maxWidth: '85%',
  },
  role: {
    fontSize: '0.7rem',
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    display: 'block',
    marginBottom: '0.15rem',
  },
  bubble: {
    fontSize: '0.9rem',
    lineHeight: 1.4,
    padding: '0.6rem 0.85rem',
    borderRadius: '12px',
  },
  userBubble: {
    background: '#2d5016',
    color: '#ffffff',
    borderBottomRightRadius: '4px',
  },
  botBubble: {
    background: '#ffffff',
    color: '#1a1a1a',
    border: '1px solid #e0e0d8',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06)',
    borderBottomLeftRadius: '4px',
  },
  hint: {
    fontSize: '0.75rem',
    color: '#666666',
    textAlign: 'center',
    marginTop: '2rem',
    maxWidth: 320,
    lineHeight: 1.4,
  },
};

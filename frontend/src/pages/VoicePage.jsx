import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { Mic, PhoneOff, AlertCircle } from 'lucide-react';
import * as api from '../services/api';

const STATUS_LABEL = {
  idle: 'Click to talk',
  connecting: 'Connecting...',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  error: 'Something went wrong',
};

export default function VoicePage() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState([]);

  const roomRef = useRef(null);
  const awaitingResponseRef = useRef(false);
  const audioElsRef = useRef(new Map());

  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function upsertSegment(segmentId, role, text, final) {
    setTranscript((prev) => {
      const idx = prev.findIndex((e) => e.segmentId === segmentId);
      const entry = { segmentId, role, text, final };
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = entry;
        return copy;
      }
      return [...prev, entry];
    });
  }

  function attachRoomListeners(room) {
    room.on(RoomEvent.Disconnected, () => {
      setStatus('idle');
      roomRef.current = null;
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio && participant.identity !== room.localParticipant.identity) {
        const el = track.attach();
        el.style.display = 'none';
        document.body.appendChild(el);
        audioElsRef.current.set(track.sid, el);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      const el = audioElsRef.current.get(track.sid);
      if (el) {
        track.detach(el);
        el.remove();
        audioElsRef.current.delete(track.sid);
      }
    });

    // @livekit/agents publishes transcripts as text streams on topic "lk.transcription"
    // (not the legacy RoomEvent.TranscriptionReceived). senderIdentity on the stream
    // correctly attributes text to whichever party is speaking, even though the agent
    // process is physically the one sending both its own and the user's transcript.
    room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
      const text = await reader.readAll();
      const attrs = reader.info.attributes || {};
      const isFinal = attrs['lk.transcription_final'] === 'true';
      const segmentId = attrs['lk.segment_id'] || reader.info.id;
      const isLocal = participantInfo.identity === room.localParticipant.identity;
      const role = isLocal ? 'user' : 'agent';

      upsertSegment(segmentId, role, text, isFinal);

      if (isFinal && role === 'user') {
        awaitingResponseRef.current = true;
        setStatus('thinking');
      } else if (isFinal && role === 'agent') {
        awaitingResponseRef.current = false;
      }
    });

    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const localSpeaking = speakers.some((p) => p.identity === room.localParticipant.identity);
      const agentSpeaking = speakers.some((p) => p.identity !== room.localParticipant.identity);

      if (agentSpeaking) {
        awaitingResponseRef.current = false;
        setStatus('speaking');
      } else if (localSpeaking) {
        setStatus('listening');
      } else if (!awaitingResponseRef.current) {
        setStatus('listening');
      }
    });
  }

  async function connect() {
    setError('');
    setStatus('connecting');

    try {
      const { token, url } = await api.livekit.getToken();

      const room = new Room();
      attachRoomListeners(room);
      roomRef.current = room;

      await room.connect(url, token);

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micErr) {
        throw new Error('Microphone permission denied. Please allow microphone access and try again.');
      }

      setStatus('listening');
    } catch (err) {
      setError(err.message || 'Failed to connect to voice assistant');
      setStatus('error');
      await disconnect();
    }
  }

  async function disconnect() {
    for (const el of audioElsRef.current.values()) {
      el.remove();
    }
    audioElsRef.current.clear();

    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    awaitingResponseRef.current = false;
  }

  async function handleEndCall() {
    await disconnect();
    setStatus('idle');
    setInterim(null);
  }

  const connected = status !== 'idle' && status !== 'connecting' && status !== 'error';
  const active = status === 'listening' || status === 'speaking';

  return (
    <div className="flex-1 flex flex-col items-center px-8 py-10 overflow-y-auto">
      <div className="flex flex-col items-center">
        <div className="relative flex items-center justify-center mb-6">
          <WaveBars side="left" active={active} speaking={status === 'listening'} />

          <button
            type="button"
            onClick={connected ? handleEndCall : connect}
            disabled={status === 'connecting'}
            className={`relative z-10 mx-4 w-24 h-24 rounded-full flex items-center justify-center transition shadow-lg ${
              status === 'error'
                ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400'
                : connected
                ? 'bg-purple-600 text-white'
                : 'bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400'
            } ${status === 'connecting' ? 'opacity-60 cursor-wait' : 'hover:opacity-90'}`}
            title={connected ? 'End call' : 'Start voice chat'}
          >
            {connected ? <PhoneOff size={30} /> : <Mic size={30} />}
            {active && (
              <span className="absolute inset-0 rounded-full border-2 border-purple-400 dark:border-purple-500 animate-ping" />
            )}
          </button>

          <WaveBars side="right" active={active} speaking={status === 'speaking'} />
        </div>

        <div
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8 ${
            status === 'error'
              ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
              : 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
          }`}
        >
          {status !== 'idle' && status !== 'error' && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400 animate-pulse" />
          )}
          {status === 'error' ? <AlertCircle size={14} /> : null}
          {STATUS_LABEL[status]}
        </div>
      </div>

      {error && (
        <div className="w-full max-w-lg mb-6 p-3 rounded-lg bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <div className="w-full max-w-lg flex-1 space-y-3">
        {transcript.length === 0 && !interim ? (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 mt-4">
            {connected
              ? 'Say something - your conversation will appear here.'
              : 'Click the microphone to start a voice conversation with your Knowledge Base.'}
          </p>
        ) : (
          <>
            {transcript.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-4 py-2.5"
              >
                <span
                  className={`text-sm font-semibold ${
                    entry.role === 'user'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-purple-600 dark:text-purple-400'
                  }`}
                >
                  {entry.role === 'user' ? 'You: ' : 'Assistant: '}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{entry.text}</span>
              </div>
            ))}
            {interim && (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-800 px-4 py-2.5 opacity-60 italic">
                <span
                  className={`text-sm font-semibold ${
                    interim.role === 'user'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-purple-600 dark:text-purple-400'
                  }`}
                >
                  {interim.role === 'user' ? 'You: ' : 'Assistant: '}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{interim.text}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function WaveBars({ side, active, speaking }) {
  const bars = 6;
  return (
    <div className={`flex items-center gap-1 ${side === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className={`w-1 rounded-full transition-all duration-300 ${
            speaking ? 'bg-purple-500 dark:bg-purple-400' : 'bg-purple-200 dark:bg-purple-500/30'
          }`}
          style={{
            height: active ? `${12 + ((i * 7 + (side === 'left' ? 0 : 3)) % 24)}px` : '8px',
            animation: speaking ? `voice-wave 0.9s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
          }}
        />
      ))}
      <style>{`
        @keyframes voice-wave {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}

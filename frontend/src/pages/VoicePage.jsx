import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { Mic, PhoneOff, AlertCircle, Settings, X, Check, ChevronDown, Gauge, Volume2 } from 'lucide-react';
import * as api from '../services/api';

const STATUS_LABEL = {
  idle: 'Click to talk',
  connecting: 'Connecting...',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  error: 'Something went wrong',
};

// Must match the ALLOWED_VOICES allowlist in backend/src/controllers/livekitController.js
// (gender/style descriptions verified against Deepgram's Aura-2 voice docs).
const VOICES = [
  { id: 'aura-2-luna-en', label: 'Luna', gender: 'Female', style: 'Friendly, natural' },
  { id: 'aura-2-asteria-en', label: 'Asteria', gender: 'Female', style: 'Confident, energetic' },
  { id: 'aura-2-aurora-en', label: 'Aurora', gender: 'Female', style: 'Cheerful, expressive' },
  { id: 'aura-2-hera-en', label: 'Hera', gender: 'Female', style: 'Smooth, professional' },
  { id: 'aura-2-orion-en', label: 'Orion', gender: 'Male', style: 'Calm, approachable' },
  { id: 'aura-2-arcas-en', label: 'Arcas', gender: 'Male', style: 'Natural, smooth' },
  { id: 'aura-2-jupiter-en', label: 'Jupiter', gender: 'Male', style: 'Expressive, baritone' },
  { id: 'aura-2-zeus-en', label: 'Zeus', gender: 'Male', style: 'Deep, trustworthy' },
];

const DEFAULT_SETTINGS = {
  voice: 'aura-2-luna-en',
  speed: 1.0,
  volume: 1.0,
  showTranscript: true,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('voiceSettings') || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function VoicePage() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  const roomRef = useRef(null);
  const awaitingResponseRef = useRef(false);
  const audioElsRef = useRef(new Map());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSetting(key, value) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('voiceSettings', JSON.stringify(next));
      return next;
    });

    if (key === 'volume') {
      for (const el of audioElsRef.current.values()) {
        el.volume = value;
      }
    }
  }

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
        el.volume = settingsRef.current.volume;
        el.style.display = 'none';
        document.body.appendChild(el);
        audioElsRef.current.set(track.sid, el);
      }
    });

    // Browsers can refuse to auto-play the agent's audio if they decide the user
    // gesture that started the call has expired. That fails silently and is
    // indistinguishable from "the agent never answered", so surface it instead.
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) {
        setError('Your browser blocked audio playback. Click anywhere on the page to enable sound.');
      } else {
        setError((prev) => (prev.startsWith('Your browser blocked audio') ? '' : prev));
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
      } else if (awaitingResponseRef.current) {
        // Your turn already ended and we're waiting on the agent's reply - a stray
        // mic pickup (breath, background noise) briefly registering as "you're
        // speaking again" shouldn't flip the status back to Listening and hide
        // that it's actually processing.
        return;
      } else if (localSpeaking) {
        setStatus('listening');
      } else {
        setStatus('listening');
      }
    });
  }

  async function connect() {
    setError('');
    setStatus('connecting');

    try {
      const { token, url } = await api.livekit.getToken({
        voice: settings.voice,
        speed: settings.speed,
      });

      const room = new Room();
      attachRoomListeners(room);
      roomRef.current = room;

      await room.connect(url, token);

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micErr) {
        throw new Error('Microphone permission denied. Please allow microphone access and try again.');
      }

      // Explicitly unblocks playback of the agent's audio. This is still inside the
      // click that started the call, which is what the browser wants to see.
      try {
        await room.startAudio();
      } catch {
        // Non-fatal - AudioPlaybackStatusChanged above will prompt if it's needed.
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
  }

  const connected = status !== 'idle' && status !== 'connecting' && status !== 'error';
  const active = status === 'listening' || status === 'speaking';

  return (
    <div className="flex-1 flex flex-col items-center px-8 py-10 overflow-y-auto relative">
      <button
        type="button"
        onClick={() => setSettingsOpen((o) => !o)}
        title="Voice settings"
        className="absolute top-4 right-8 p-2 rounded-lg bg-white/60 dark:bg-gray-800/60 backdrop-blur-md border border-white/60 dark:border-gray-700/60 hover:bg-white/90 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300 transition"
      >
        <Settings size={18} />
      </button>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={updateSetting}
          onClose={() => setSettingsOpen(false)}
          disabledVoiceSpeed={connected}
        />
      )}

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
                ? 'ai-gradient text-white'
                : 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400'
            } ${status === 'connecting' ? 'opacity-60 cursor-wait' : 'hover:opacity-90'}`}
            title={connected ? 'End call' : 'Start voice chat'}
          >
            {connected ? (
              <PhoneOff size={30} />
            ) : (
              <Mic size={30} stroke={status === 'error' ? 'currentColor' : 'url(#ai-icon-gradient)'} />
            )}
            {active && (
              <span className="absolute inset-0 rounded-full border-2 border-violet-400 dark:border-violet-500 animate-ping" />
            )}
          </button>

          <WaveBars side="right" active={active} speaking={status === 'speaking'} />
        </div>

        <div
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8 ${
            status === 'error'
              ? 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
              : 'bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300'
          }`}
        >
          {status !== 'idle' && status !== 'error' && (
            <span className="ai-gradient w-1.5 h-1.5 rounded-full animate-pulse" />
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

      {settings.showTranscript && (
        <div className="w-full max-w-lg flex-1 space-y-3">
          {transcript.length === 0 ? (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 mt-4">
              {connected
                ? 'Say something - your conversation will appear here.'
                : 'Click the microphone to start a voice conversation with your Knowledge Base.'}
            </p>
          ) : (
            transcript.map((entry) => (
              <div
                key={entry.segmentId}
                className={`rounded-xl border px-4 py-2.5 transition-opacity backdrop-blur-md ${
                  entry.final
                    ? 'border-white/60 dark:border-gray-800/60 bg-white/60 dark:bg-gray-900/50'
                    : 'border-dashed border-gray-200 dark:border-gray-800 opacity-60 italic'
                }`}
              >
                <span
                  className={`text-sm font-semibold ${
                    entry.role === 'user'
                      ? 'text-gray-900 dark:text-gray-100'
                      : 'text-violet-600 dark:text-violet-400'
                  }`}
                >
                  {entry.role === 'user' ? 'You: ' : 'Assistant: '}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300">{entry.text}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, onChange, onClose, disabledVoiceSpeed }) {
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  }

  return (
    <div className="absolute top-16 right-8 z-20 w-80 rounded-2xl border border-white/60 dark:border-gray-700/60 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="ai-gradient w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0">
            <Settings size={14} />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Voice Settings</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close voice settings"
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            <Mic size={12} />
            Assistant Voice
          </label>
          <div className="relative">
            <select
              value={settings.voice}
              disabled={disabledVoiceSpeed}
              onChange={(e) => onChange('voice', e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 disabled:opacity-50 transition"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} ({v.gender}) - {v.style}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          {disabledVoiceSpeed && (
            <p className="text-xs text-gray-400 mt-1.5">End the call to change voice/speed for the next one.</p>
          )}
        </div>

        <div>
          <label className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Gauge size={12} />
              Speaking Speed
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 font-semibold">
              {settings.speed.toFixed(1)}x
            </span>
          </label>
          <input
            type="range"
            min="0.7"
            max="1.5"
            step="0.1"
            value={settings.speed}
            disabled={disabledVoiceSpeed}
            onChange={(e) => onChange('speed', parseFloat(e.target.value))}
            style={{ accentColor: '#6c2bff' }}
            className="w-full disabled:opacity-50"
          />
        </div>

        <div>
          <label className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Volume2 size={12} />
              Volume
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 font-semibold">
              {Math.round(settings.volume * 100)}%
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.volume}
            onChange={(e) => onChange('volume', parseFloat(e.target.value))}
            style={{ accentColor: '#6c2bff' }}
            className="w-full"
          />
        </div>

        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Show live transcript</span>
          <span className="relative inline-flex">
            <input
              type="checkbox"
              checked={settings.showTranscript}
              onChange={(e) => onChange('showTranscript', e.target.checked)}
              className="peer sr-only"
            />
            <span
              className={`w-9 h-5 rounded-full transition-colors ${
                settings.showTranscript ? 'ai-gradient' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
            <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
          </span>
        </label>
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={handleSave}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm transition ${
            saved ? 'bg-green-600' : 'ai-gradient hover:brightness-95 active:brightness-90'
          }`}
        >
          <Check size={16} />
          {saved ? 'Saved' : 'Save Settings'}
        </button>
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
            speaking ? 'ai-gradient' : 'bg-violet-200 dark:bg-violet-500/30'
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

import { useEffect, useRef, useState } from 'react';
import { Mic, PhoneOff, AlertCircle, Settings, X, Check, ChevronDown, Gauge, Volume2 } from 'lucide-react';
import * as api from '../services/api';

const STATUS_LABEL = {
  idle: 'Click to talk',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
  error: 'Something went wrong',
};

// Speaks through the browser's own speech engine instead of Deepgram. It sounds more
// synthetic, but it starts talking immediately: Deepgram is a network round trip that
// returns the finished audio file, which measured 1.3-2.5s from this region and lands
// entirely between the text appearing and the voice starting.
const BROWSER_VOICE = 'browser';

// Must match the ALLOWED_VOICES allowlist in backend/src/controllers/ttsController.js
// (gender/style descriptions verified against Deepgram's Aura-2 voice docs).
const VOICES = [
  { id: BROWSER_VOICE, label: 'System voice', gender: 'Device', style: 'Instant, no network wait' },
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

// Shortest chunk worth sending to speech synthesis on its own. Below this, the clause
// break is likelier to be an abbreviation or a list item than a natural pause.
const MIN_FIRST_CHUNK = 30;

// Pulls speakable chunks off the front of the buffer so each can be synthesized the
// moment it's ready, instead of waiting for the whole answer. The trailing fragment
// stays in the buffer until more text arrives to complete it.
//
// The very first chunk of an answer also breaks on a clause boundary (comma, colon,
// semicolon), because that chunk is the only one the listener actually waits on - the
// rest are synthesized while earlier audio is still playing. Later chunks hold out for
// a full sentence, which reads more naturally.
function extractSpeakable(buffer, allowClauseBreak) {
  const chunks = [];
  let consumed = 0;

  // A period only ends a sentence when whitespace follows it and the next visible
  // character starts a new sentence. Requiring that whitespace is what keeps
  // "ridham@gmail.com" and "a CGPA of 7.98" intact - both contain periods with no
  // space after them, and both are exactly the kind of answer this app returns most.
  // A trailing period at the end of the buffer is deliberately NOT a boundary: mid
  // stream we may simply not have received the rest of the address yet. The caller
  // flushes whatever remains once the stream finishes.
  const sentenceEnd = /[.!?]["')\]]?\s+(?=[A-Z"'(\[])/g;
  let match;

  while ((match = sentenceEnd.exec(buffer)) !== null) {
    const sentence = buffer.slice(consumed, match.index + match[0].length).trim();
    if (sentence) chunks.push(sentence);
    consumed = match.index + match[0].length;
  }

  let rest = buffer.slice(consumed);

  // Same reasoning for clause breaks: require whitespace after the punctuation so
  // numbers like "7,000" and time stamps like "10:30" don't get chopped in half.
  if (allowClauseBreak && chunks.length === 0) {
    const clause = rest.search(/[,;:]\s/);
    if (clause >= MIN_FIRST_CHUNK) {
      chunks.push(rest.slice(0, clause + 1).trim());
      rest = rest.slice(clause + 1);
    }
  }

  return { chunks, rest };
}

// Groups the flat entry list into question/answer turns. The Voice page shows the
// newest turn first so the current exchange is under the mic instead of scrolled off
// the bottom, but a question still has to sit above its own answer - so the reversal
// happens at turn level, not entry level.
function groupIntoTurns(entries) {
  const turns = [];

  for (const entry of entries) {
    if (entry.role === 'user' || turns.length === 0) {
      turns.push([entry]);
    } else {
      turns[turns.length - 1].push(entry);
    }
  }

  return turns;
}

export default function VoicePage() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [liveText, setLiveText] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const conversationIdRef = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // True from clicking the mic until clicking end-call. Speech recognition stops on
  // its own regularly (silence timeouts, engine restarts), so this is what decides
  // whether an `onend` should quietly restart it or genuinely finish the session.
  const sessionActiveRef = useRef(false);
  // True while the assistant is talking, so the microphone doesn't transcribe the
  // assistant's own voice coming back through the speakers.
  const suspendedRef = useRef(false);
  const abortRef = useRef(null);
  // Ordered list of in-flight synthesis promises. Synthesis runs in parallel so later
  // sentences are ready early, but playback walks the list in order.
  const playQueueRef = useRef([]);
  const playingRef = useRef(false);

  useEffect(() => {
    return () => {
      endSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSetting(key, value) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('voiceSettings', JSON.stringify(next));
      return next;
    });

    if (key === 'volume' && audioRef.current) {
      audioRef.current.volume = value;
    }
  }

  function appendEntry(role, text) {
    const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setTranscript((prev) => [...prev, { id, role, text }]);
    return id;
  }

  function appendToEntry(id, text) {
    setTranscript((prev) => prev.map((e) => (e.id === id ? { ...e, text: e.text + text } : e)));
  }

  // ---- speech synthesis playback -------------------------------------------------

  function enqueueSpeech(text) {
    if (!text.trim()) return;

    if (settingsRef.current.voice === BROWSER_VOICE) {
      playQueueRef.current.push({ kind: 'browser', text });
    } else {
      // Kick synthesis off immediately so later sentences are ready early; the player
      // still walks the queue in order.
      const promise = api.tts
        .speak(text, settingsRef.current.voice, settingsRef.current.speed)
        .catch((err) => {
          console.error('Speech synthesis failed:', err);
          return null;
        });
      playQueueRef.current.push({ kind: 'remote', promise });
    }

    drainQueue();
  }

  function speakWithBrowser(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = settingsRef.current.speed;
      utterance.volume = settingsRef.current.volume;
      utterance.lang = 'en-US';

      const preferred = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang && v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;

      utterance.onend = resolve;
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function drainQueue() {
    if (playingRef.current) return;
    playingRef.current = true;

    try {
      while (playQueueRef.current.length > 0) {
        const item = playQueueRef.current.shift();

        if (item.kind === 'browser') {
          if (!sessionActiveRef.current) continue;
          suspendedRef.current = true;
          stopRecognition();
          setStatus('speaking');
          await speakWithBrowser(item.text);
          continue;
        }

        const url = await item.promise;
        if (!url) continue;
        if (!sessionActiveRef.current) {
          URL.revokeObjectURL(url);
          continue;
        }

        suspendedRef.current = true;
        stopRecognition();
        setStatus('speaking');

        await playUrl(url);
        URL.revokeObjectURL(url);
      }
    } finally {
      playingRef.current = false;

      if (playQueueRef.current.length > 0) {
        // A sentence finished streaming while the loop was wrapping up. Its own
        // drainQueue() call returned early because playingRef was still set, so
        // without this the rest of the answer would never be spoken.
        drainQueue();
      } else if (sessionActiveRef.current) {
        // Only hand the microphone back once nothing else is queued, otherwise the gap
        // between two sentences would briefly re-open the mic onto the assistant's voice.
        suspendedRef.current = false;
        setStatus('listening');
        startRecognition();
      }
    }
  }

  function playUrl(url) {
    return new Promise((resolve) => {
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
      }
      audio.src = url;
      audio.volume = settingsRef.current.volume;
      audio.onended = resolve;
      audio.onerror = () => resolve();
      audio.play().catch(() => {
        setError('Your browser blocked audio playback. Click anywhere on the page, then try again.');
        resolve();
      });
    });
  }

  // ---- asking the knowledge base -------------------------------------------------

  async function askQuestion(question) {
    setLiveText('');
    appendEntry('user', question);
    setStatus('thinking');

    const answerId = appendEntry('assistant', '');
    let pending = '';
    let spokeAnything = false;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await api.chat.sendStream(
        question,
        conversationIdRef.current,
        (delta) => {
          appendToEntry(answerId, delta);
          pending += delta;

          const { chunks, rest } = extractSpeakable(pending, !spokeAnything);
          pending = rest;
          for (const chunk of chunks) {
            spokeAnything = true;
            enqueueSpeech(chunk);
          }
        },
        controller.signal
      );

      if (result?.conversationId) conversationIdRef.current = result.conversationId;

      // Whatever didn't end with punctuation still needs speaking.
      if (pending.trim()) enqueueSpeech(pending);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      setError(err.message || 'Failed to get an answer');
      appendToEntry(answerId, ' [failed to get an answer]');
      if (sessionActiveRef.current) {
        setStatus('listening');
        startRecognition();
      }
    } finally {
      abortRef.current = null;
    }
  }

  // ---- speech recognition --------------------------------------------------------

  function startRecognition() {
    if (!sessionActiveRef.current || suspendedRef.current || recognitionRef.current) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      setStatus('error');
      sessionActiveRef.current = false;
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interimText += chunk;
      }

      // Show partial words in the box as they're recognized, exactly like dictation
      // in the text chat.
      if (interimText) setLiveText(interimText);

      if (finalText.trim()) {
        stopRecognition();
        askQuestion(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please allow microphone access and try again.');
        setStatus('error');
        sessionActiveRef.current = false;
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      // The engine stops itself after silence. Restart it so the call stays live
      // until the user actually hangs up.
      if (sessionActiveRef.current && !suspendedRef.current) {
        startRecognition();
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      // start() throws if called while the previous instance is still shutting down;
      // the onend handler above will retry.
      recognitionRef.current = null;
    }
  }

  function stopRecognition() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognitionRef.current = null;
    recognition.onend = null;
    recognition.onresult = null;
    recognition.onerror = null;
    try {
      recognition.stop();
    } catch {
      // already stopped
    }
  }

  // ---- session lifecycle ---------------------------------------------------------

  function startSession() {
    setError('');
    setLiveText('');
    sessionActiveRef.current = true;
    suspendedRef.current = false;
    setStatus('listening');
    startRecognition();
  }

  function endSession() {
    sessionActiveRef.current = false;
    suspendedRef.current = false;
    stopRecognition();

    abortRef.current?.abort();
    abortRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.src = '';
    }
    window.speechSynthesis?.cancel();
    playQueueRef.current = [];
    playingRef.current = false;
    setLiveText('');
  }

  function handleEndCall() {
    endSession();
    setStatus('idle');
  }

  const connected = status !== 'idle' && status !== 'error';
  const active = status === 'listening' || status === 'speaking';

  return (
    <div className="flex-1 flex flex-col items-center px-4 sm:px-8 py-6 sm:py-10 overflow-y-auto relative">
      <button
        type="button"
        onClick={() => setSettingsOpen((o) => !o)}
        title="Voice settings"
        className="absolute top-3 right-3 sm:top-4 sm:right-8 p-2 rounded-lg bg-white/60 dark:bg-gray-800/60 backdrop-blur-md border border-white/60 dark:border-gray-700/60 hover:bg-white/90 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300 transition"
      >
        <Settings size={18} />
      </button>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={updateSetting}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div className="flex flex-col items-center">
        <div className="relative flex items-center justify-center mb-6">
          <WaveBars side="left" active={active} speaking={status === 'listening'} />

          <button
            type="button"
            onClick={connected ? handleEndCall : startSession}
            className={`relative z-10 mx-4 w-24 h-24 rounded-full flex items-center justify-center transition shadow-lg ${
              status === 'error'
                ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400'
                : connected
                ? 'ai-gradient text-white'
                : 'bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400'
            } hover:opacity-90`}
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
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6 ${
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

      {/* Live dictation box - what you're saying right now, as it's recognized. */}
      {connected && (
        <div className="w-full max-w-lg mb-6">
          <div
            className={`w-full min-h-[52px] px-4 py-3 rounded-xl border text-sm transition ${
              liveText
                ? 'border-violet-300 dark:border-violet-500/50 bg-white/80 dark:bg-gray-900/70 text-gray-900 dark:text-gray-100'
                : 'border-dashed border-gray-300 dark:border-gray-700 bg-white/40 dark:bg-gray-900/40 text-gray-400 dark:text-gray-500 italic'
            }`}
          >
            {liveText || (status === 'listening' ? 'Listening - start speaking...' : 'Mic paused while the assistant speaks')}
          </div>
        </div>
      )}

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
            groupIntoTurns(transcript)
              .reverse()
              .map((turn) => (
                <div key={turn[0].id} className="space-y-3">
                  {turn.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-white/60 dark:border-gray-800/60 bg-white/60 dark:bg-gray-900/50 backdrop-blur-md px-4 py-2.5"
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
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {entry.text || <span className="italic text-gray-400">...</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

function SettingsPanel({ settings, onChange, onClose }) {
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  }

  return (
    <div className="absolute top-14 left-3 right-3 sm:left-auto sm:top-16 sm:right-8 z-20 w-auto sm:w-80 rounded-2xl border border-white/60 dark:border-gray-700/60 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl shadow-xl overflow-hidden">
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
              onChange={(e) => onChange('voice', e.target.value)}
              className="w-full appearance-none pl-3 pr-8 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-500 transition"
            >
              {VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} ({v.gender}) - {v.style}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {settings.voice === BROWSER_VOICE
              ? 'Speaks instantly using your device. More robotic, but no waiting.'
              : 'Natural sounding, but adds a short wait while the audio is generated.'}
          </p>
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
            onChange={(e) => onChange('speed', parseFloat(e.target.value))}
            style={{ accentColor: '#6c2bff' }}
            className="w-full"
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

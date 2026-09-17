import { useContext, useEffect, useRef, useState } from 'react';
import {
  CornerDownLeft,
  FileText,
  Menu,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import Logo from '../components/Logo';
import * as api from '../services/api';

const FEATURES = [
  {
    icon: FileText,
    title: 'Ask questions',
    description: 'Get accurate answers from your uploaded documents',
  },
  {
    icon: Mic,
    title: 'Use voice',
    description: 'Speak naturally and get instant responses',
  },
  {
    icon: Shield,
    title: 'Your data is private',
    description: 'Your knowledge base is only accessible to you',
  },
];

function formatTimestamp(date) {
  const d = new Date(date);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ChatPage() {
  const { user } = useContext(AuthContext);
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  // Mobile/tablet only - the conversations panel is a normal, always-visible column
  // from md upward, so this has no effect on desktop layout at all.
  const [conversationsOpen, setConversationsOpen] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const dictationBaseRef = useRef('');

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const loadConversations = async () => {
    try {
      setConversationsLoading(true);
      const list = await api.chat.listConversations();
      setConversations(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setConversationsLoading(false);
    }
  };

  const handleNewChat = () => {
    recognitionRef.current?.stop();
    setInput('');
    setCurrentConversationId(null);
    setMessages([]);
    setError('');
    setConversationsOpen(false);
  };

  const handleSelectConversation = async (id) => {
    setConversationsOpen(false);
    if (id === currentConversationId) return;
    setError('');
    try {
      const { messages: msgs } = await api.chat.getConversation(id);
      setCurrentConversationId(id);
      setMessages(
        msgs.map(m => ({
          id: m._id,
          role: m.role,
          content: m.content,
          sources: m.sources,
          timestamp: m.createdAt,
        }))
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteAll = async () => {
    if (conversations.length === 0) return;
    if (!window.confirm('Delete all conversations? This cannot be undone.')) return;
    try {
      await Promise.all(conversations.map(c => api.chat.deleteConversation(c._id)));
      setConversations([]);
      handleNewChat();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      await api.files.upload(file);
    } catch (err) {
      setError(err.message);
    }
  };

  // Live dictation into the text input via the browser's built-in speech recognition
  // (separate from the LiveKit voice agent on the Voice page - this just transcribes
  // into the text box locally, no server round-trip, so it works even without the
  // voice agent running).
  const handleMicClick = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    setError('');
    dictationBaseRef.current = input ? `${input} ` : '';

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }
      if (finalText) {
        dictationBaseRef.current += `${finalText} `;
      }
      setInput(dictationBaseRef.current + interimText);
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Please allow microphone access and try again.');
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      // Without this, a session left running in the background (e.g. the user sent
      // the message instead of explicitly stopping dictation) keeps accumulating into
      // this same base, so the next dictation prepends stale, already-sent text.
      dictationBaseRef.current = '';
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  // Any manual edit to the text box (e.g. backspacing out a misheard word) needs to
  // become the new base that further speech gets appended to. Without this, editing
  // the box mid-dictation was invisible to handleMicClick's onresult handler, which
  // only ever appended onto the last value it itself had written - so a manual edit
  // got silently overwritten (and the deleted text reappeared) the moment the user
  // spoke again in the same session.
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    dictationBaseRef.current = value;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    // A dictation session left running in the background would otherwise keep
    // appending newly-spoken words onto its old (pre-send) accumulated text the
    // next time it fires onresult.
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = input;
    setInput('');
    setLoading(true);
    setError('');

    try {
      const result = await api.chat.send(messageText, currentConversationId);
      const isNewConversation = !currentConversationId;
      setCurrentConversationId(result.conversationId);

      const aiMessage = {
        id: result.message._id || Date.now() + 1,
        role: 'assistant',
        content: result.message.content,
        sources: result.message.sources,
        timestamp: result.message.createdAt,
      };

      setMessages(prev => [...prev, aiMessage]);
      if (isNewConversation) loadConversations();
    } catch (err) {
      setError(err.message);
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setLoading(false);
    }
  };

  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex overflow-hidden relative">
      {/* Backdrop - mobile/tablet only, closes the drawer on outside tap. The panel
          is a normal, always-visible column from md upward, so this never renders
          there. */}
      {conversationsOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setConversationsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Conversations panel */}
      <div
        className={`w-80 max-w-[85vw] shrink-0 border-r border-gray-100 dark:border-gray-800/60 flex flex-col bg-white/60 dark:bg-gray-900/50 backdrop-blur-xl fixed inset-y-0 left-0 z-30 transition-transform duration-200 ease-in-out ${
          conversationsOpen ? 'translate-x-0' : '-translate-x-full'
        } md:static md:translate-x-0 md:z-auto`}
      >
        <div className="p-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-50">Conversations</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleNewChat}
              className="brand-gradient flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-sm font-medium transition hover:brightness-95 active:brightness-90"
            >
              <Plus size={16} />
              New Chat
            </button>
            <button
              onClick={() => setConversationsOpen(false)}
              aria-label="Close conversations"
              className="md:hidden shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {conversationsLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 px-2 py-4">Loading...</p>
          ) : filteredConversations.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 px-2 py-4">No conversations yet</p>
          ) : (
            filteredConversations.map(conv => {
              const active = conv._id === currentConversationId;
              return (
                <button
                  key={conv._id}
                  onClick={() => handleSelectConversation(conv._id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition border-l-2 ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-600'
                      : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium truncate ${active ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
                      {conv.title}
                    </p>
                    <span className="text-xs text-gray-400 shrink-0">{formatTimestamp(conv.updatedAt)}</span>
                  </div>
                  {conv.preview && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{conv.preview}</p>
                  )}
                </button>
              );
            })
          )}
        </div>

        <button
          onClick={handleDeleteAll}
          className="flex items-center gap-2 m-3 px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition border-t border-gray-200 dark:border-gray-800 pt-3"
        >
          <Trash2 size={15} />
          Delete all conversations
        </button>
      </div>

      {/* Chat panel */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile/tablet only - opens the conversations drawer above. */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800/60 shrink-0">
          <button
            onClick={() => setConversationsOpen(true)}
            aria-label="Open conversations"
            className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Conversations</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4 sm:px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-white/90 flex items-center justify-center mb-6">
                <Logo className="h-11" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">
                Hello {user?.name?.split(' ')[0]}!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">Your AI Knowledge Assistant is ready</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
                {FEATURES.map(f => (
                  <div
                    key={f.title}
                    className="p-4 rounded-xl border border-white/60 dark:border-gray-800/60 bg-white/60 dark:bg-gray-900/50 backdrop-blur-xl shadow-sm text-left"
                  >
                    <f.icon size={20} stroke="url(#icon-gradient)" className="mb-3" />
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-50 mb-1">{f.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{f.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 space-y-4">
              {messages.map(msg => (
                <div key={msg.id}>
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-xl px-4 py-2.5 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'user-bubble text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 pl-1">
                      <p className="font-medium">Sources ({msg.sources.length})</p>
                      {msg.sources.map((source, idx) => (
                        <div key={idx} className="ml-2">
                          • {source.fileName} ({source.fileType})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 rounded-2xl text-sm">
                    <span className="ai-gradient w-1.5 h-1.5 rounded-full animate-pulse" />
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="px-3 sm:px-8 pb-4 sm:pb-6 pt-2">
          {messages.length === 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mb-2 flex items-center justify-center gap-1.5 italic">
              <CornerDownLeft size={12} />
              <span className="hidden sm:inline">Start by typing a question or use the microphone</span>
              <span className="sm:hidden">Type a question or use the microphone</span>
            </p>
          )}

          {error && (
            <div className="mb-3 max-w-3xl mx-auto p-3 bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex items-center gap-1.5 sm:gap-2">
            <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" />
            <button
              type="button"
              onClick={handleAttachClick}
              title="Attach a document to your Knowledge Base"
              className="p-3 sm:p-2.5 rounded-lg bg-white/60 dark:bg-gray-800/60 backdrop-blur-md border border-white/60 dark:border-gray-700/60 hover:bg-white/90 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300 transition shrink-0"
            >
              <Paperclip size={18} />
            </button>
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask a question..."
              disabled={loading}
              className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 rounded-lg border border-white/60 dark:border-gray-700/60 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleMicClick}
              title={listening ? 'Stop dictation' : 'Speak your question'}
              className={`p-3 sm:p-2.5 rounded-lg transition shrink-0 ${
                listening
                  ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400 animate-pulse'
                  : 'bg-white/60 dark:bg-gray-800/60 backdrop-blur-md border border-white/60 dark:border-gray-700/60 hover:bg-white/90 dark:hover:bg-gray-700/70 text-gray-600 dark:text-gray-300'
              }`}
            >
              <Mic size={18} />
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="ai-gradient flex items-center gap-2 px-3.5 sm:px-5 py-3 sm:py-2.5 rounded-lg text-white text-sm font-medium transition hover:brightness-95 active:brightness-90 disabled:opacity-50 shrink-0"
            >
              <Send size={16} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useContext, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  CornerDownLeft,
  FileText,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  Shield,
  Trash2,
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
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

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

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
    setCurrentConversationId(null);
    setMessages([]);
    setError('');
  };

  const handleSelectConversation = async (id) => {
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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

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
    <div className="flex-1 flex overflow-hidden">
      {/* Conversations panel */}
      <div className="w-80 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900">
        <div className="p-4 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-50">Conversations</h3>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                      ? 'bg-purple-50 dark:bg-purple-500/15 border-purple-600'
                      : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium truncate ${active ? 'text-purple-700 dark:text-purple-300' : 'text-gray-900 dark:text-gray-100'}`}>
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
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-6">
                <AudioLines size={32} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">
                Hello {user?.name?.split(' ')[0]}!
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">Your AI Knowledge Assistant is ready</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
                {FEATURES.map(f => (
                  <div
                    key={f.title}
                    className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-left"
                  >
                    <f.icon size={20} className="text-purple-600 dark:text-purple-400 mb-3" />
                    <p className="font-semibold text-sm text-gray-900 dark:text-gray-50 mb-1">{f.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{f.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
              {messages.map(msg => (
                <div key={msg.id}>
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-xl px-4 py-2.5 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-purple-600 text-white'
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
                  <div className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-4 py-2.5 rounded-2xl text-sm">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="px-8 pb-6 pt-2">
          {messages.length === 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mb-2 flex items-center justify-center gap-1.5 italic">
              <CornerDownLeft size={12} />
              Start by typing a question or use the microphone
            </p>
          )}

          {error && (
            <div className="mb-3 max-w-3xl mx-auto p-3 bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex items-center gap-2">
            <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" />
            <button
              type="button"
              onClick={handleAttachClick}
              title="Attach a document to your Knowledge Base"
              className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition"
            >
              <Paperclip size={18} />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            />
            <button
              type="button"
              disabled
              title="Use the Voice tab for spoken conversations"
              className="p-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
            >
              <Mic size={18} />
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition disabled:opacity-50"
            >
              <Send size={16} />
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

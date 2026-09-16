import { useState, useEffect } from 'react';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import * as api from '../services/api';

export default function Dashboard({ onLogout }) {
  const { user } = useContext(AuthContext);
  const [currentPage, setCurrentPage] = useState('chat');
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">KnowledgeVoice</h1>
          <p className="text-xs text-gray-500 mt-1">AI Knowledge Assistant</p>
        </div>

        <nav className="mt-8">
          {[
            { id: 'chat', label: 'Chat', icon: '💬' },
            { id: 'knowledge', label: 'Knowledge Base', icon: '📚' },
            { id: 'tasks', label: 'Tasks', icon: '✓' },
            { id: 'decisions', label: 'Decisions', icon: '⚖️' },
            { id: 'meetings', label: 'Meetings', icon: '📞' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full text-left px-6 py-3 transition ${
                currentPage === item.id
                  ? 'bg-purple-50 text-purple-700 border-r-4 border-purple-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-lg mr-3">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-200" style={{ width: '256px' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <button
              onClick={onLogout}
              className="text-gray-400 hover:text-gray-600 text-xl"
              title="Logout"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Top Navigation */}
        <header className="border-b border-gray-200 bg-white">
          <div className="px-8 py-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {currentPage === 'chat' && 'Chat'}
              {currentPage === 'knowledge' && 'Knowledge Base'}
              {currentPage === 'tasks' && 'Tasks'}
              {currentPage === 'decisions' && 'Decisions'}
              {currentPage === 'meetings' && 'Meetings'}
            </h2>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-8">
          {currentPage === 'chat' && <ChatPage />}
          {currentPage === 'knowledge' && <KnowledgeBasePage />}
          {currentPage === 'tasks' && <PlaceholderPage title="Tasks" />}
          {currentPage === 'decisions' && <PlaceholderPage title="Decisions" />}
          {currentPage === 'meetings' && <PlaceholderPage title="Meetings" />}
        </div>
      </main>
    </div>
  );
}

function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [error, setError] = useState('');

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

      setCurrentConversationId(result.conversationId);

      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: result.message.content,
        sources: result.message.sources,
        timestamp: new Date(result.message.createdAt),
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      setError(err.message);
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      <div className="flex-1 overflow-y-auto mb-6">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p className="text-lg mb-2">👋 Start a conversation</p>
            <p className="text-sm">Ask questions about your Knowledge Base</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map(msg => (
              <div key={msg.id}>
                <div
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-2xl px-4 py-2 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">
                    <p className="font-semibold">Sources ({msg.sources.length})</p>
                    {msg.sources.map((source, idx) => (
                      <div key={idx} className="ml-2 text-xs">
                        • {source.fileName} ({source.fileType})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                  Thinking...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSendMessage} className="flex gap-2">
        <button
          type="button"
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl transition"
          title="Voice input (coming soon)"
          disabled
        >
          🎤
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={loading}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function KnowledgeBasePage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const fileList = await api.files.list();
      setFiles(fileList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const fileInput = e.target;
    const selectedFile = fileInput.files[0];
    if (!selectedFile) return;

    setUploading(true);
    setError('');

    try {
      const result = await api.files.upload(selectedFile);
      setFiles(prev => [result, ...prev]);
      fileInput.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await api.files.delete(fileId);
      setFiles(prev => prev.filter(f => f._id !== fileId));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload Documents</h3>
        <label className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition cursor-pointer block">
          <p className="text-gray-600">📄 Drag files here or click to browse</p>
          <p className="text-sm text-gray-500 mt-2">Supported: PDF, DOCX, TXT</p>
          <input
            type="file"
            onChange={handleFileUpload}
            disabled={uploading}
            accept=".pdf,.docx,.doc,.txt"
            className="hidden"
          />
        </label>
        {uploading && <p className="text-sm text-gray-500 mt-2">Uploading...</p>}
      </div>

      {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>}

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Documents</h3>
        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : files.length === 0 ? (
          <p className="text-gray-500">No documents uploaded yet</p>
        ) : (
          <div className="space-y-2">
            {files.map(file => (
              <div key={file._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{file.fileName}</p>
                  <p className="text-sm text-gray-500">
                    Status: <span className={file.status === 'processed' ? 'text-green-600' : 'text-yellow-600'}>
                      {file.status === 'processed' ? '✓ Processed' : '⏳ ' + file.status}
                    </span>
                    {file.chunkCount > 0 && ` (${file.chunkCount} chunks)`}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteFile(file._id)}
                  className="text-red-600 hover:text-red-700 text-lg"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceholderPage({ title }) {
  return (
    <div className="text-center text-gray-500 py-12">
      <p className="text-lg mb-2">🔜 {title}</p>
      <p className="text-sm">Coming soon</p>
    </div>
  );
}

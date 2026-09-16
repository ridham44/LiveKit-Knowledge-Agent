// Frontend and API are served from the same Vercel deployment (same-origin), so API
// calls use a relative path rather than an absolute backend URL. Locally, Vite's dev
// server proxies /api to the backend dev server (see vite.config.js) so this works
// unchanged in both environments with no env var needed.
const API_URL = '';

function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

export async function apiCall(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Vercel can return a plain-text platform error when a function fails before
  // Express gets control. Read the body once and parse JSON only when present so
  // callers see that real response rather than a secondary JSON parser error.
  const body = await response.text();
  let data = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      if (!response.ok) {
        throw new Error(body.trim() || `API request failed (${response.status})`);
      }
      throw new Error(`API returned an invalid JSON response (${response.status})`);
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `API request failed (${response.status})`);
  }

  return data;
}

export const auth = {
  signup: (formData) => apiCall('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(formData),
  }),
  login: (email, password) => apiCall('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  getMe: () => apiCall('/api/auth/me'),
};

export const files = {
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();
    const headers = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return fetch(`${API_URL}/api/files/upload`, {
      method: 'POST',
      headers,
      body: formData,
    }).then(r => r.json()).then(d => {
      if (!d || !d._id) throw new Error('Upload failed');
      return d;
    });
  },
  list: () => apiCall('/api/files'),
  delete: (fileId) => apiCall(`/api/files/${fileId}`, { method: 'DELETE' }),
};

export const chat = {
  send: (message, conversationId) => apiCall('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, conversationId }),
  }),
  // Streams the answer as newline-delimited JSON events. onDelta is called with each
  // piece of text as it is generated, so the voice page can start speaking the first
  // sentence while the rest is still being written. Resolves with the final metadata.
  sendStream: async (message, conversationId, onDelta, signal) => {
    const token = getToken();
    const response = await fetch(`${API_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, conversationId }),
      signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Chat request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = {};

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let event;
      try {
        event = JSON.parse(trimmed);
      } catch {
        return;
      }

      if (event.type === 'delta' && event.text) {
        onDelta(event.text);
      } else if (event.type === 'done') {
        result = event;
      } else if (event.type === 'error') {
        throw new Error(event.error || 'Chat stream failed');
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
      }
    }
    handleLine(buffer);

    return result;
  },
  listConversations: () => apiCall('/api/chat/conversations'),
  getConversation: (conversationId) => apiCall(`/api/chat/conversations/${conversationId}`),
  deleteConversation: (conversationId) => apiCall(`/api/chat/conversations/${conversationId}`, {
    method: 'DELETE',
  }),
};

export const tts = {
  // Returns an object URL for the synthesized audio. Goes through the backend so the
  // Deepgram key stays server-side. Caller is responsible for revoking the URL.
  speak: async (text, voice, speed, signal) => {
    const token = getToken();
    const response = await fetch(`${API_URL}/api/tts/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, voice, speed }),
      signal,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Speech synthesis failed');
    }

    return URL.createObjectURL(await response.blob());
  },
};

export const livekit = {
  getToken: (options = {}) => apiCall('/api/livekit/token', {
    method: 'POST',
    body: JSON.stringify(options),
  }),
};

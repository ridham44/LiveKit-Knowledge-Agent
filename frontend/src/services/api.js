const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function apiCall(endpoint, options = {}) {
  const token = localStorage.getItem('token');
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
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

    const token = localStorage.getItem('token');
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
  listConversations: () => apiCall('/api/chat/conversations'),
  getConversation: (conversationId) => apiCall(`/api/chat/conversations/${conversationId}`),
  deleteConversation: (conversationId) => apiCall(`/api/chat/conversations/${conversationId}`, {
    method: 'DELETE',
  }),
};

export const livekit = {
  getToken: (roomName) => apiCall('/api/livekit/token', {
    method: 'POST',
    body: JSON.stringify({ roomName }),
  }),
};

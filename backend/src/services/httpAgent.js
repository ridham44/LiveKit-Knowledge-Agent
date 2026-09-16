const https = require('https');

// Every outbound call to OpenRouter and Deepgram otherwise pays a fresh DNS lookup,
// TCP connect and TLS handshake before the remote service even sees the request.
// Measured against Deepgram from this project's region that handshake costs ~700ms
// per request, and it sits directly in front of the user hearing the answer, so
// reusing the socket is one of the cheapest latency wins available.
const keepAliveAgent = new https.Agent({
  keepAlive: true,
  // How often to send TCP keepalive probes on an idle socket.
  keepAliveMsecs: 30_000,
  // Voice turns fan out several speech-synthesis calls at once (one per sentence).
  maxSockets: 16,
  maxFreeSockets: 8,
});

// Opens the pooled connection ahead of time so the first real request of the process
// doesn't pay the handshake either. Failures are ignored: this is an optimization,
// and a dead network here should surface on the real request, not at boot.
function prewarmConnection(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.request(
      url,
      { method: 'GET', agent: keepAliveAgent, headers, timeout: 10_000 },
      (res) => {
        res.resume(); // drain so the socket returns to the pool instead of stalling
        res.on('end', resolve);
      }
    );
    req.on('error', resolve);
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });
    req.end();
  });
}

module.exports = {
  keepAliveAgent,
  prewarmConnection,
};

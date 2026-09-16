// Guards service-to-service endpoints (called by the voice agent process, not browsers).
// Not a JWT because the caller has no user session - it acts on behalf of whichever
// userId it passes, authenticated instead by a shared secret only the agent process holds.
module.exports = function internalAuth(req, res, next) {
  const secret = req.headers['x-internal-secret'];

  if (!process.env.AGENT_SHARED_SECRET) {
    return res.status(500).json({ error: 'AGENT_SHARED_SECRET not configured' });
  }

  if (!secret || secret !== process.env.AGENT_SHARED_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
};

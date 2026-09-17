const mongoose = require('mongoose');

// Operational audit trail for auth/signup/OTP events, queryable via
// GET /api/internal/audit-logs (see internalController.getAuditLogs) instead of
// depending on the hosting platform's own function-log access, which this project
// often can't reach directly. Written by otpLogger.js alongside its console output -
// never stores OTPs, passwords, or secrets, only whatever safe fields each call site
// passes as `meta`.
const auditLogSchema = new mongoose.Schema({
  scope: {
    type: String,
    required: true,
  },
  event: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    default: null,
  },
  level: {
    type: String,
    enum: ['info', 'warn', 'error'],
    default: 'info',
  },
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 30 * 24 * 60 * 60, // 30 days - TTL index, this is an ops log, not a permanent record
  },
});

auditLogSchema.index({ email: 1, createdAt: -1 });
auditLogSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

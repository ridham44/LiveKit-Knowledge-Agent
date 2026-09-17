const nodemailer = require('nodemailer');

// Built once per warm function instance and reused - same rationale as the cached
// Mongo connection in db.js, avoids paying an SMTP handshake on every request.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP is not configured');
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

function otpEmailHtml(otp, expiryMinutes) {
  const digits = otp
    .split('')
    .map(
      (d) =>
        `<td style="padding:0 4px;"><div style="width:38px;height:46px;line-height:46px;text-align:center;background:#f0f4ff;border:1px solid #dbe4ff;border-radius:8px;font-size:22px;font-weight:700;color:#111827;font-family:'Courier New',monospace;">${d}</div></td>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:28px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.3px;">Work24</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:19px;color:#111827;">Verify your email</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">
                  Use the verification code below to finish creating your Work24 account. Enter it on the signup screen to continue.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>${digits}</tr>
                </table>
                <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-align:center;">
                  This code expires in <strong>${expiryMinutes} minutes</strong>.
                </p>
                <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #eef0f4;font-size:12px;line-height:1.6;color:#9ca3af;">
                  If you didn't request this code, you can safely ignore this email - no account will be created without it. Never share this code with anyone, including anyone claiming to be from Work24.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">&copy; ${new Date().getFullYear()} Work24. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function otpEmailText(otp, expiryMinutes) {
  return [
    'Work24 - Verify your email',
    '',
    `Your verification code is: ${otp}`,
    '',
    `This code expires in ${expiryMinutes} minutes.`,
    '',
    "If you didn't request this code, you can safely ignore this email - no account will be created without it.",
    'Never share this code with anyone, including anyone claiming to be from Work24.',
  ].join('\n');
}

// Never log `otp` here or let it reach the rejection message - callers only log the
// outcome (see otpLogger usage in authController.js), not this function's arguments.
//
// Returns the subset of nodemailer's SentMessageInfo that's useful for tracing a
// message in SMTP2GO's own Activity/Reports dashboard (messageId, the relay's raw
// SMTP response line - which carries SMTP2GO's queue id - and which recipients it
// accepted/rejected at hand-off time). None of this is secret: `response` is a relay
// acknowledgement, not a credential, and `accepted`/`rejected` just echo back the
// recipient address already being logged elsewhere. A 250 OK here only means SMTP2GO
// queued the message - it is NOT confirmation of inbox delivery, which is why
// authController logs this alongside the "sent" event rather than treating it as
// "delivered".
async function sendOtpEmail(email, otp) {
  const expiryMinutes = 5;
  const info = await getTransporter().sendMail({
    from: process.env.SMTP_FROM || 'Work24 <no-reply@work24.app>',
    to: email,
    subject: 'Your Work24 verification code',
    html: otpEmailHtml(otp, expiryMinutes),
    text: otpEmailText(otp, expiryMinutes),
  });

  return {
    messageId: info.messageId,
    response: info.response,
    accepted: info.accepted,
    rejected: info.rejected,
  };
}

module.exports = { sendOtpEmail };

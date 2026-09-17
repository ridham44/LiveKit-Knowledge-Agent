const axios = require('axios');

// Brevo's transactional email HTTP API (still under the historical "smtp/email"
// path even though this is the REST API, not raw SMTP - that's Brevo's own naming,
// not a leftover from the old SMTP2GO integration).
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

function getBrevoConfig() {
  const { BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME } = process.env;
  if (!BREVO_API_KEY || !BREVO_FROM_EMAIL) {
    throw new Error('Brevo is not configured');
  }
  return {
    apiKey: BREVO_API_KEY,
    fromEmail: BREVO_FROM_EMAIL,
    fromName: BREVO_FROM_NAME || 'Work24',
  };
}

// Copy differs by why the OTP was sent - the HTML/text shell (branding, digit
// boxes, footer) is identical either way.
const PURPOSE_COPY = {
  signup: {
    subject: 'Your Work24 verification code',
    heading: 'Verify your email',
    intro: 'Use the verification code below to finish creating your Work24 account. Enter it on the signup screen to continue.',
    disclaimer: "If you didn't request this code, you can safely ignore this email - no account will be created without it.",
  },
  password_reset: {
    subject: 'Your Work24 password reset code',
    heading: 'Reset your password',
    intro: 'Use the verification code below to reset your Work24 account password. Enter it on the password reset screen to continue.',
    disclaimer: "If you didn't request this code, you can safely ignore this email - your password will not be changed without it.",
  },
};

function otpEmailHtml(otp, expiryMinutes, purpose = 'signup') {
  const copy = PURPOSE_COPY[purpose] || PURPOSE_COPY.signup;
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
                <h1 style="margin:0 0 12px;font-size:19px;color:#111827;">${copy.heading}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">
                  ${copy.intro}
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
                  <tr>${digits}</tr>
                </table>
                <p style="margin:0 0 4px;font-size:13px;color:#6b7280;text-align:center;">
                  This code expires in <strong>${expiryMinutes} minutes</strong>.
                </p>
                <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #eef0f4;font-size:12px;line-height:1.6;color:#9ca3af;">
                  ${copy.disclaimer} Never share this code with anyone, including anyone claiming to be from Work24.
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

function otpEmailText(otp, expiryMinutes, purpose = 'signup') {
  const copy = PURPOSE_COPY[purpose] || PURPOSE_COPY.signup;
  return [
    `Work24 - ${copy.heading}`,
    '',
    `Your verification code is: ${otp}`,
    '',
    `This code expires in ${expiryMinutes} minutes.`,
    '',
    copy.disclaimer,
    'Never share this code with anyone, including anyone claiming to be from Work24.',
  ].join('\n');
}

// Never log `otp`, the request body, or BREVO_API_KEY here - callers only log the
// safe outcome fields this function returns/throws (see otpLogger usage in
// authController.js), never this function's arguments or the raw axios error (whose
// `error.config.headers` would carry the api-key).
//
// A 201 here only means Brevo accepted the message for delivery - it is NOT
// confirmation of inbox delivery, which is why authController logs this alongside
// the "sent" event rather than treating it as "delivered".
async function sendOtpEmail(email, otp, purpose = 'signup') {
  const expiryMinutes = 5;
  const { apiKey, fromEmail, fromName } = getBrevoConfig();
  const copy = PURPOSE_COPY[purpose] || PURPOSE_COPY.signup;

  try {
    const response = await axios.post(
      BREVO_API_URL,
      {
        sender: { name: fromName, email: fromEmail },
        to: [{ email }],
        subject: copy.subject,
        htmlContent: otpEmailHtml(otp, expiryMinutes, purpose),
        textContent: otpEmailText(otp, expiryMinutes, purpose),
      },
      {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15000,
      }
    );

    return {
      provider: 'brevo',
      success: true,
      httpStatus: response.status,
      messageId: response.data && response.data.messageId,
    };
  } catch (err) {
    // Re-throw only safe, non-secret fields - never err.config (it holds the
    // api-key header) or the raw axios error object.
    const safeError = new Error(
      (err.response && err.response.data && err.response.data.message) || err.message
    );
    safeError.httpStatus = err.response ? err.response.status : undefined;
    safeError.brevoCode = err.response && err.response.data && err.response.data.code;
    throw safeError;
  }
}

module.exports = { sendOtpEmail };

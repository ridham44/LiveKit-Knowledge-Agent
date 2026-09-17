import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { auth } from '../../services/api';

const OTP_LENGTH = 6;

function formatCountdown(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ForgotPasswordOtp({
  email,
  initialExpiresIn,
  initialCooldown,
  initialResendsRemaining,
  onVerified,
  onBack,
}) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const [sessionInvalid, setSessionInvalid] = useState(false);

  const [expiresIn, setExpiresIn] = useState(initialExpiresIn ?? 300);
  const [cooldown, setCooldown] = useState(initialCooldown ?? 30);
  const [resendsRemaining, setResendsRemaining] = useState(initialResendsRemaining ?? 5);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState('');

  const inputRefs = useRef([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setExpiresIn((s) => (s > 0 ? s - 1 : 0));
      setCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const expired = expiresIn <= 0;
  const code = digits.join('');
  const inputsDisabled = verifying || locked || sessionInvalid;

  const resetDigits = (focusFirst = true) => {
    setDigits(Array(OTP_LENGTH).fill(''));
    if (focusFirst) {
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
    }
  };

  const submitVerify = async (otpValue) => {
    setVerifying(true);
    setError('');
    setResendNotice('');
    try {
      const data = await auth.verifyForgotPasswordOtp(email, otpValue);
      onVerified(data.resetToken);
    } catch (err) {
      if (err.code === 'OTP_LOCKED') {
        setLocked(true);
        setError(err.message);
      } else if (err.code === 'SESSION_NOT_FOUND') {
        setSessionInvalid(true);
        setError(err.message);
      } else if (err.code === 'OTP_INVALID') {
        const remaining = err.data?.attemptsRemaining;
        setError(
          remaining != null
            ? `${err.message} ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : err.message
        );
        resetDigits();
      } else {
        // Covers OTP_EXPIRED and any network/unexpected error.
        setError(err.message || 'Verification failed. Please try again.');
        resetDigits();
      }
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (code.length === OTP_LENGTH && !inputsDisabled) {
      submitVerify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleChange = (index, rawValue) => {
    const clean = rawValue.replace(/\D/g, '');
    setError('');
    setDigits((prev) => {
      const next = [...prev];
      if (!clean) {
        next[index] = '';
        return next;
      }
      let i = index;
      for (const ch of clean.split('')) {
        if (i >= OTP_LENGTH) break;
        next[i] = ch;
        i += 1;
      }
      const focusIndex = Math.min(i, OTP_LENGTH - 1);
      requestAnimationFrame(() => inputRefs.current[focusIndex]?.focus());
      return next;
    });
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    setError('');
    const next = Array(OTP_LENGTH).fill('');
    text.split('').forEach((ch, i) => {
      next[i] = ch;
    });
    setDigits(next);
    const focusIndex = Math.min(text.length, OTP_LENGTH - 1);
    requestAnimationFrame(() => inputRefs.current[focusIndex]?.focus());
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (code.length === OTP_LENGTH && !inputsDisabled) {
      submitVerify(code);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError('');
    setResendNotice('');
    try {
      const data = await auth.resendForgotPasswordOtp(email);
      setExpiresIn(data.otpExpiresInSeconds);
      setCooldown(data.resendCooldownSeconds);
      setResendsRemaining(data.resendsRemaining);
      setLocked(false);
      resetDigits();
      setResendNotice('A new code has been sent to your email.');
    } catch (err) {
      if (err.code === 'RESEND_COOLDOWN') {
        setCooldown(err.data?.retryAfterSeconds ?? cooldown);
      } else if (err.code === 'RESEND_LIMIT') {
        setResendsRemaining(0);
      } else if (err.code === 'SESSION_NOT_FOUND') {
        setSessionInvalid(true);
      }
      setError(err.message || 'Could not resend the code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const canResend = !resending && !sessionInvalid && cooldown <= 0 && resendsRemaining > 0;

  let resendLabel = 'Resend code';
  if (resending) resendLabel = 'Resending...';
  else if (cooldown > 0) resendLabel = `Resend in ${cooldown}s`;
  else if (resendsRemaining <= 0) resendLabel = 'Resend limit reached';

  return (
    <div>
      <div className="w-11 h-11 rounded-xl brand-gradient flex items-center justify-center mb-4">
        <KeyRound size={20} className="text-white" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1.5">Enter reset code</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Enter the 6-digit code we sent to <span className="font-medium text-gray-700 dark:text-gray-300">{email}</span>
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle size={17} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {resendNotice && !error && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-400 text-sm">
          <CheckCircle2 size={17} className="shrink-0 mt-0.5" />
          <span>{resendNotice}</span>
        </div>
      )}

      {sessionInvalid ? (
        <div className="text-center py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Your password reset session has expired. Please start again.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="brand-gradient inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white text-sm font-semibold shadow-sm transition hover:brightness-95 active:brightness-90"
          >
            <ArrowLeft size={16} /> Start over
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={handleFormSubmit}>
            <div
              className="flex items-center justify-center gap-2 sm:gap-3 mb-3"
              onPaste={handlePaste}
            >
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  maxLength={OTP_LENGTH}
                  aria-label={`Digit ${index + 1} of reset code`}
                  value={digit}
                  disabled={inputsDisabled}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className={`w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-semibold rounded-xl border bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition focus:outline-none focus:ring-4 disabled:opacity-60 disabled:cursor-not-allowed ${
                    error
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/10'
                      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-blue-500/10'
                  }`}
                />
              ))}
            </div>

            <p className={`text-center text-xs mb-5 ${expired ? 'text-red-500 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {expired ? 'Code expired — request a new one below' : `Code expires in ${formatCountdown(expiresIn)}`}
            </p>

            <button
              type="submit"
              disabled={inputsDisabled || code.length !== OTP_LENGTH}
              className="brand-gradient w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold shadow-sm transition hover:brightness-95 active:brightness-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verifying && <Loader2 size={17} className="animate-spin" />}
              {verifying ? 'Verifying...' : 'Verify Code'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
            Didn't receive the code?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={!canResend}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-blue-600 dark:disabled:hover:text-blue-400"
            >
              {resendLabel}
            </button>
            {resendsRemaining > 0 && resendsRemaining <= 3 && (
              <span className="block mt-1 text-xs text-gray-400 dark:text-gray-500">
                {resendsRemaining} resend{resendsRemaining === 1 ? '' : 's'} left
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onBack}
            className="mt-4 w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition"
          >
            <ArrowLeft size={13} /> Use a different email
          </button>
        </>
      )}
    </div>
  );
}

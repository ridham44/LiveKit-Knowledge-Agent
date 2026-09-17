import { useContext, useState } from 'react';
import { AlertCircle, Loader2, Mail } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { auth } from '../../services/api';
import AuthInput from './AuthInput';
import ForgotPasswordOtp from './ForgotPasswordOtp';
import NewPasswordForm from './NewPasswordForm';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordForm({ onSwitchPage }) {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSession, setOtpSession] = useState(null);
  const [resetToken, setResetToken] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');

    if (!email.trim()) {
      setFieldError('Email is required');
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      setFieldError('Enter a valid email address');
      return;
    }
    setFieldError('');

    setLoading(true);
    try {
      const data = await auth.forgotPassword(email);
      setOtpSession({
        email: data.email,
        expiresIn: data.otpExpiresInSeconds,
        cooldown: data.resendCooldownSeconds,
        resendsRemaining: data.resendsRemaining,
      });
    } catch (err) {
      setApiError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetToEmailStep = () => {
    setOtpSession(null);
    setResetToken(null);
  };

  if (resetToken && otpSession) {
    return (
      <NewPasswordForm
        email={otpSession.email}
        resetToken={resetToken}
        onReset={login}
        onBack={resetToEmailStep}
      />
    );
  }

  if (otpSession) {
    return (
      <ForgotPasswordOtp
        email={otpSession.email}
        initialExpiresIn={otpSession.expiresIn}
        initialCooldown={otpSession.cooldown}
        initialResendsRemaining={otpSession.resendsRemaining}
        onVerified={(token) => setResetToken(token)}
        onBack={resetToEmailStep}
      />
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1.5">Reset your password</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Enter your account email and we'll send you a verification code
      </p>

      {apiError && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle size={17} className="shrink-0 mt-0.5" />
          <span>{apiError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        <AuthInput
          id="forgot-password-email"
          name="email"
          label="Email"
          type="email"
          icon={Mail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          error={fieldError}
        />

        <button
          type="submit"
          disabled={loading}
          className="brand-gradient w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold shadow-sm transition hover:brightness-95 active:brightness-90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 size={17} className="animate-spin" />}
          {loading ? 'Sending code...' : 'Send Reset Code'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        Remembered your password?{' '}
        <button
          onClick={onSwitchPage}
          className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          Back to login
        </button>
      </p>
    </div>
  );
}

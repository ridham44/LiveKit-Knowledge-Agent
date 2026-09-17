import { useState } from 'react';
import { AlertCircle, Check, KeyRound, Loader2 } from 'lucide-react';
import { auth } from '../../services/api';
import PasswordInput from './PasswordInput';
import PasswordStrength, { getPasswordChecks } from './PasswordStrength';

export default function NewPasswordForm({ email, resetToken, onReset, onBack }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const errors = {};
    const checks = getPasswordChecks(password);
    if (!password) errors.password = 'Password is required';
    else if (!Object.values(checks).every(Boolean)) errors.password = 'Password does not meet all requirements';

    if (!confirmPassword) errors.confirmPassword = 'Please confirm your password';
    else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await auth.resetPassword(email, resetToken, password);
      onReset(data.user, data.token);
    } catch (err) {
      if (err.code === 'RESET_TOKEN_EXPIRED' || err.code === 'RESET_TOKEN_INVALID' || err.code === 'SESSION_NOT_FOUND') {
        setApiError('Your reset session is no longer valid. Please start again.');
      } else {
        setApiError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmMatches = confirmPassword && confirmPassword === password;

  return (
    <div>
      <div className="w-11 h-11 rounded-xl brand-gradient flex items-center justify-center mb-4">
        <KeyRound size={20} className="text-white" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1.5">Set a new password</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Choose a new password for <span className="font-medium text-gray-700 dark:text-gray-300">{email}</span>
      </p>

      {apiError && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle size={17} className="shrink-0 mt-0.5" />
          <span>{apiError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        <div>
          <PasswordInput
            id="reset-password"
            name="password"
            label="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          <PasswordStrength password={password} />
        </div>

        <div>
          <PasswordInput
            id="reset-confirm-password"
            name="confirmPassword"
            label="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />
          {confirmMatches && !fieldErrors.confirmPassword && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
              <Check size={13} /> Passwords match
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="brand-gradient w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold shadow-sm transition hover:brightness-95 active:brightness-90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 size={17} className="animate-spin" />}
          {loading ? 'Updating password...' : 'Reset Password'}
        </button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="mt-5 w-full text-center text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition"
      >
        Start over
      </button>
    </div>
  );
}

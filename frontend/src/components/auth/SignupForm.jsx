import { useContext, useState } from 'react';
import { AlertCircle, Building2, Check, Loader2, Mail, User } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { auth } from '../../services/api';
import AuthInput from './AuthInput';
import PasswordInput from './PasswordInput';
import PasswordStrength, { getPasswordChecks } from './PasswordStrength';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'not-specified', label: 'Prefer not to say' },
];

export default function SignupForm({ onSwitchPage }) {
  const { login } = useContext(AuthContext);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    gender: 'not-specified',
    companyName: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Full name is required';
    if (!form.email.trim()) errors.email = 'Email is required';
    else if (!EMAIL_REGEX.test(form.email)) errors.email = 'Enter a valid email address';

    const checks = getPasswordChecks(form.password);
    if (!form.password) errors.password = 'Password is required';
    else if (!Object.values(checks).every(Boolean)) errors.password = 'Password does not meet all requirements';

    if (!form.confirmPassword) errors.confirmPassword = 'Please confirm your password';
    else if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    if (!validate()) return;

    setLoading(true);
    try {
      const data = await auth.signup({
        name: form.name,
        email: form.email,
        password: form.password,
        gender: form.gender,
        companyName: form.companyName,
      });
      login(data.user, data.token);
    } catch (err) {
      setApiError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const confirmMatches = form.confirmPassword && form.confirmPassword === form.password;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1.5">Create your account</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Start building your AI-powered knowledge base
      </p>

      {apiError && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle size={17} className="shrink-0 mt-0.5" />
          <span>{apiError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        <AuthInput
          id="signup-name"
          name="name"
          label="Full Name"
          icon={User}
          value={form.name}
          onChange={handleChange}
          placeholder="Jane Doe"
          autoComplete="name"
          error={fieldErrors.name}
        />

        <AuthInput
          id="signup-email"
          name="email"
          label="Email"
          type="email"
          icon={Mail}
          value={form.email}
          onChange={handleChange}
          placeholder="you@company.com"
          autoComplete="email"
          error={fieldErrors.email}
        />

        <div>
          <PasswordInput
            id="signup-password"
            name="password"
            label="Password"
            value={form.password}
            onChange={handleChange}
            placeholder="Create a strong password"
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          <PasswordStrength password={form.password} />
        </div>

        <div>
          <PasswordInput
            id="signup-confirm-password"
            name="confirmPassword"
            label="Confirm Password"
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />
          {confirmMatches && !fieldErrors.confirmPassword && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-green-600 dark:text-green-500">
              <Check size={13} /> Passwords match
            </p>
          )}
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Gender</span>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, gender: opt.value }))}
                aria-pressed={form.gender === opt.value}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium border transition ${
                  form.gender === opt.value
                    ? 'brand-gradient border-transparent text-white'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <AuthInput
          id="signup-company"
          name="companyName"
          label="Company Name"
          icon={Building2}
          value={form.companyName}
          onChange={handleChange}
          placeholder="Your Company (optional)"
          autoComplete="organization"
        />

        <button
          type="submit"
          disabled={loading}
          className="brand-gradient w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold shadow-sm transition hover:brightness-95 active:brightness-90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <Loader2 size={17} className="animate-spin" />}
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
        Already have an account?{' '}
        <button
          onClick={onSwitchPage}
          className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          Login
        </button>
      </p>

      <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
        By creating an account, you agree that your documents stay private to you.
      </p>
    </div>
  );
}

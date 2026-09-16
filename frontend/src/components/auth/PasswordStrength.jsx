import { Check, X } from 'lucide-react';

export function getPasswordChecks(password) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

const REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'uppercase', label: 'One uppercase letter' },
  { key: 'lowercase', label: 'One lowercase letter' },
  { key: 'number', label: 'One number' },
];

const STRENGTH_META = [
  { label: '', color: 'bg-gray-200 dark:bg-gray-700' },
  { label: 'Weak', color: 'bg-red-500' },
  { label: 'Fair', color: 'bg-orange-500' },
  { label: 'Good', color: 'bg-yellow-500' },
  { label: 'Strong', color: 'bg-green-500' },
];

export default function PasswordStrength({ password }) {
  const checks = getPasswordChecks(password);
  const score = Object.values(checks).filter(Boolean).length;

  if (!password) return null;

  const meta = STRENGTH_META[score];

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i < score ? meta.color : 'bg-gray-200 dark:bg-gray-700'}`}
          />
        ))}
      </div>
      {meta.label && (
        <p className={`mt-1 text-xs font-medium ${score <= 1 ? 'text-red-500' : score === 2 ? 'text-orange-500' : score === 3 ? 'text-yellow-600 dark:text-yellow-500' : 'text-green-600 dark:text-green-500'}`}>
          {meta.label} password
        </p>
      )}
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {REQUIREMENTS.map(req => {
          const met = checks[req.key];
          return (
            <li key={req.key} className={`flex items-center gap-1.5 text-xs ${met ? 'text-green-600 dark:text-green-500' : 'text-gray-400 dark:text-gray-500'}`}>
              {met ? <Check size={13} /> : <X size={13} />}
              {req.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

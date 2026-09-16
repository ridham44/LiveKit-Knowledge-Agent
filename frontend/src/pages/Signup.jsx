import AuthLayout from '../components/auth/AuthLayout';
import SignupForm from '../components/auth/SignupForm';

export default function Signup({ onSwitchPage }) {
  return (
    <AuthLayout>
      <SignupForm onSwitchPage={onSwitchPage} />
    </AuthLayout>
  );
}

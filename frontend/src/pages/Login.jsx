import AuthLayout from '../components/auth/AuthLayout';
import LoginForm from '../components/auth/LoginForm';

export default function Login({ onSwitchPage }) {
  return (
    <AuthLayout>
      <LoginForm onSwitchPage={onSwitchPage} />
    </AuthLayout>
  );
}

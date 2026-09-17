import AuthLayout from '../components/auth/AuthLayout';
import LoginForm from '../components/auth/LoginForm';

export default function Login({ onSwitchPage, onForgotPassword }) {
  return (
    <AuthLayout>
      <LoginForm onSwitchPage={onSwitchPage} onForgotPassword={onForgotPassword} />
    </AuthLayout>
  );
}

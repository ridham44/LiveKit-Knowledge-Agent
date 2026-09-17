import AuthLayout from '../components/auth/AuthLayout';
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm';

export default function ForgotPassword({ onSwitchPage }) {
  return (
    <AuthLayout>
      <ForgotPasswordForm onSwitchPage={onSwitchPage} />
    </AuthLayout>
  );
}

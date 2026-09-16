export default function Logo({ className = 'h-9' }) {
  return (
    <img
      src="/logo-icon.png"
      alt="KnowledgeVoice logo"
      className={`w-auto object-contain shrink-0 ${className}`}
    />
  );
}

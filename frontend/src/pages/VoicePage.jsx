import { Mic, Sparkles } from 'lucide-react';

export default function VoicePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center overflow-y-auto">
      <div className="w-20 h-20 rounded-full bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-6">
        <Mic size={32} />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 mb-1">Voice Assistant</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">
        Speak to your Knowledge Base and get answers out loud. Voice mode is coming soon.
      </p>

      <button
        type="button"
        disabled
        className="flex items-center gap-2 px-6 py-3 rounded-lg bg-purple-600/60 text-white font-medium cursor-not-allowed mb-3"
      >
        <Mic size={18} />
        Start Voice Chat
      </button>
      <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 italic">
        <Sparkles size={12} />
        We're putting the finishing touches on this feature
      </p>
    </div>
  );
}

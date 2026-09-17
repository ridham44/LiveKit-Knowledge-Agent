import { Menu } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const TITLES = {
  chat: { title: 'Chat', subtitle: 'Ask questions about your Knowledge Base' },
  knowledge: { title: 'Knowledge Base', subtitle: 'Upload and manage your documents' },
  voice: { title: 'Voice', subtitle: 'Talk to your Knowledge Base assistant' },
};

export default function TopBar({ currentPage, initial, onMenuClick }) {
  const { title, subtitle } = TITLES[currentPage] || TITLES.chat;

  return (
    <header className="border-b border-gray-100 dark:border-gray-800/60 bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="md:hidden shrink-0 -ml-1 p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-50 truncate">{title}</h2>
          <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <ThemeToggle />
        <div className="brand-gradient w-9 h-9 rounded-full text-white text-sm font-semibold flex items-center justify-center shrink-0">
          {initial}
        </div>
      </div>
    </header>
  );
}

import ThemeToggle from './ThemeToggle';

const TITLES = {
  chat: { title: 'Chat', subtitle: 'Ask questions about your Knowledge Base' },
  knowledge: { title: 'Knowledge Base', subtitle: 'Upload and manage your documents' },
  voice: { title: 'Voice', subtitle: 'Talk to your Knowledge Base assistant' },
};

export default function TopBar({ currentPage, initial }) {
  const { title, subtitle } = TITLES[currentPage] || TITLES.chat;

  return (
    <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-8 py-4 flex items-center justify-between shrink-0">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="w-9 h-9 rounded-full bg-purple-600 text-white text-sm font-semibold flex items-center justify-center">
          {initial}
        </div>
      </div>
    </header>
  );
}

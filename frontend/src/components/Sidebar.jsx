import { useContext, useState } from 'react';
import { ChevronDown, FileText, LogOut, MessageSquare, Mic } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import Logo from './Logo';

const NAV_ITEMS = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'knowledge', label: 'Knowledge Base', icon: FileText },
  { id: 'voice', label: 'Voice', icon: Mic },
];

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

export default function Sidebar({ currentPage, onNavigate, onLogout }) {
  const { user } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <aside className="w-64 shrink-0 border-r border-gray-100 dark:border-gray-800/60 bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl flex flex-col">
      <div className="p-6 flex items-center gap-2.5">
        <div className="rounded-xl bg-blue-50 dark:bg-white/90 p-1.5 flex items-center justify-center">
          <Logo className="h-8" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">
          Knowledge<span className="brand-gradient-text">Voice</span>
        </h1>
      </div>

      <nav className="mt-4 flex-1 px-3 space-y-1">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg transition ${
                active
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              <Icon size={18} stroke={active ? 'url(#icon-gradient)' : 'currentColor'} />
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="relative p-3 border-t border-gray-200 dark:border-gray-800">
        {menuOpen && (
          <button
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
            className="absolute bottom-full left-3 right-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/60 shadow-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            <LogOut size={16} />
            Logout
          </button>
        )}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="brand-gradient w-8 h-8 rounded-full text-white text-xs font-semibold flex items-center justify-center shrink-0">
              {initials(user?.name)}
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.email}</p>
            </div>
          </div>
          <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </aside>
  );
}

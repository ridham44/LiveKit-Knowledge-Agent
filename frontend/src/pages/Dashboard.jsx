import { useContext, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import ChatPage from './ChatPage';
import KnowledgeBasePage from './KnowledgeBasePage';
import VoicePage from './VoicePage';

export default function Dashboard({ onLogout }) {
  const { user } = useContext(AuthContext);
  const [currentPage, setCurrentPage] = useState('chat');
  // Mobile/tablet only - the sidebar is a fixed, always-visible column at md and up
  // (see Sidebar.jsx), so this state has no effect on desktop layout at all.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNavigate = (page) => {
    setCurrentPage(page);
    setSidebarOpen(false);
  };

  return (
    <div className="h-screen flex bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-950 dark:via-gray-950 dark:to-blue-950/30">
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onLogout={onLogout}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar
          currentPage={currentPage}
          initial={user?.name?.[0]?.toUpperCase()}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {currentPage === 'chat' && <ChatPage />}
        {currentPage === 'knowledge' && <KnowledgeBasePage />}
        {currentPage === 'voice' && <VoicePage />}
      </main>
    </div>
  );
}

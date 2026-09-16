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

  return (
    <div className="h-screen flex bg-white dark:bg-gray-950">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} onLogout={onLogout} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <TopBar currentPage={currentPage} initial={user?.name?.[0]?.toUpperCase()} />

        {currentPage === 'chat' && <ChatPage />}
        {currentPage === 'knowledge' && <KnowledgeBasePage />}
        {currentPage === 'voice' && <VoicePage />}
      </main>
    </div>
  );
}

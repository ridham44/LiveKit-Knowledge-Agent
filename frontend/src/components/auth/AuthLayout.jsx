import { FileUp, Mic, MessageSquare } from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import Logo from '../Logo';

const FEATURES = [
  { icon: FileUp, label: 'Upload Documents' },
  { icon: MessageSquare, label: 'Ask & Chat' },
  { icon: Mic, label: 'Voice AI' },
];

export default function AuthLayout({ children }) {
  return (
    <div className="h-screen flex overflow-hidden bg-white dark:bg-gray-950">
      {/* Branding panel */}
      <div className="hidden lg:flex lg:w-[44%] h-full relative overflow-hidden flex-col justify-between p-12 text-white">
        <img
          src="/loginbackground.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: '25% center' }}
        />
        <div className="absolute inset-0 bg-[#050b2e]/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050b2e]/80 via-transparent to-[#050b2e]/40" />

        <div className="relative flex items-center gap-2.5">
          <div className="rounded-xl bg-white/15 backdrop-blur-xl border border-white/20 p-1.5 flex items-center justify-center shadow-lg">
            <Logo className="h-9" />
          </div>
          <span className="text-xl font-bold drop-shadow-sm">KnowledgeVoice</span>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight mb-4 drop-shadow-sm">
            Your Knowledge,
            <br />
            Now in Your Voice
          </h1>
          <p className="text-blue-50/90 text-base leading-relaxed mb-10 max-w-sm drop-shadow-sm">
            Upload documents, ask questions, and get answers through chat or voice — all in one AI-powered knowledge base.
          </p>

          <div className="space-y-3.5">
            {FEATURES.map(f => (
              <div
                key={f.label}
                className="flex items-center gap-3 bg-white/10 backdrop-blur-xl border border-white/15 rounded-xl px-3 py-2.5 shadow-lg"
              >
                <div className="w-9 h-9 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                  <f.icon size={17} />
                </div>
                <span className="text-sm font-medium text-blue-50">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-blue-200/70 drop-shadow-sm">
          &copy; {new Date().getFullYear()} KnowledgeVoice. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 shrink-0 lg:justify-end bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800/60">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="rounded-lg bg-blue-50 dark:bg-white/90 p-1 flex items-center justify-center">
              <Logo className="h-7" />
            </div>
            <span className="font-bold text-gray-900 dark:text-gray-50">KnowledgeVoice</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <div className="min-h-full flex items-center justify-center">
            <div className="w-full max-w-md">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

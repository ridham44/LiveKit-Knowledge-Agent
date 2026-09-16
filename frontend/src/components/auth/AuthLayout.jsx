import { AudioLines, FileUp, Mic, MessageSquare } from 'lucide-react';
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
      <div className="hidden lg:flex lg:w-[44%] h-full relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-900 flex-col justify-between p-12 text-white">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <AudioLines size={420} strokeWidth={0.6} className="absolute -bottom-16 -right-20 text-white/[0.06] rotate-12" />

        <div className="relative flex items-center gap-2.5">
          <div className="rounded-xl bg-white/90 p-1.5 flex items-center justify-center">
            <Logo className="h-9" />
          </div>
          <span className="text-xl font-bold">KnowledgeVoice</span>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Your Knowledge,
            <br />
            Now in Your Voice
          </h1>
          <p className="text-purple-100/80 text-base leading-relaxed mb-10 max-w-sm">
            Upload documents, ask questions, and get answers through chat or voice — all in one AI-powered knowledge base.
          </p>

          <div className="space-y-3.5">
            {FEATURES.map(f => (
              <div key={f.label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center shrink-0">
                  <f.icon size={17} />
                </div>
                <span className="text-sm font-medium text-purple-50">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-purple-200/60">
          &copy; {new Date().getFullYear()} KnowledgeVoice. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex-1 h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 shrink-0 lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="rounded-lg bg-purple-50 dark:bg-white/90 p-1 flex items-center justify-center">
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

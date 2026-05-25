"use client";

import Link from "next/link";
import { AgentChat } from "@/components/AgentChat";
import { Terminal, Shield, History, Cpu } from "lucide-react";

export default function HomePage() {
  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-[#050711]">
      {/* Decorative Blur Blobs */}
      <div className="absolute top-[-100px] left-[-50px] w-[450px] h-[450px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-50px] right-[-50px] w-[350px] h-[350px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none z-0 opacity-75" />

      {/* Header */}
      <header className="relative flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/40 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
            <Shield className="w-4.5 h-4.5" />
          </div>
          <div className="flex flex-col">
            <span className="text-md font-bold tracking-tight text-white font-sans flex items-center gap-2">
              RewindOps AI
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Policy & Rollback Proxy</span>
          </div>
        </div>

        <nav className="flex items-center gap-2 p-1 bg-slate-950/60 rounded-lg border border-white/5">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold text-white bg-indigo-600/30 border border-indigo-500/20 shadow-lg shadow-indigo-900/10 transition-all duration-200"
          >
            <Terminal className="w-3.5 h-3.5" />
            Agent Console
          </Link>
          <Link
            href="/history"
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-all duration-200"
          >
            <History className="w-3.5 h-3.5" />
            Action History
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-slate-400">Target Agent</span>
            <span className="text-xs font-semibold text-slate-200">AcmeSub Support</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/30 text-indigo-300 border border-indigo-500/10 text-xs font-medium">
            <Cpu className="w-3.5 h-3.5" />
            Gemini 2.5
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative flex-1 overflow-hidden z-0">
        <AgentChat />
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchAgentConfig, setAuthTokenGetter } from "@/lib/api";
import { Terminal, History, Cpu } from "lucide-react";
import { RewindOpsLogo } from "./RewindOpsLogo";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

function ClerkAuthWire() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      setAuthTokenGetter(() => getToken());
    }
  }, [isSignedIn, getToken]);

  return null;
}

interface AppShellProps {
  children: React.ReactNode;
  activePage: "console" | "history";
  headerRight?: React.ReactNode;
}

export function AppShell({ children, activePage, headerRight }: AppShellProps) {
  const [modelName, setModelName] = useState("Loading...");

  useEffect(() => {
    fetchAgentConfig()
      .then((cfg) => setModelName(cfg.model))
      .catch(() => setModelName("unknown"));
  }, []);

  const navItems = [
    { id: "console" as const, href: "/", label: "Agent Console", icon: Terminal },
    { id: "history" as const, href: "/history", label: "Action History", icon: History },
  ];

  return (
    <div className="relative flex flex-col h-screen overflow-hidden bg-[#050711]">
      <div className="absolute top-[-100px] left-[-50px] w-[450px] h-[450px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-[-50px] right-[-50px] w-[350px] h-[350px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none z-0 opacity-75" />

      <header className="relative flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/40 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <RewindOpsLogo size={36} />
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
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-xs transition-all duration-200 ${
                  isActive
                    ? "font-semibold text-white bg-indigo-600/30 border border-indigo-500/20 shadow-lg shadow-indigo-900/10"
                    : "font-medium text-slate-400 hover:text-white"
                }`}
                {...(isActive ? { "aria-current": "page" as const } : {})}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {activePage === "console" && (
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] text-slate-400">Target Agent</span>
              <span className="text-xs font-semibold text-slate-200">AcmeSub Support</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/30 text-indigo-300 border border-indigo-500/10 text-xs font-medium">
            <Cpu className="w-3.5 h-3.5" />
            {modelName}
          </div>
          {headerRight}
          <ClerkAuthWire />
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 text-xs font-semibold transition-all">
                Sign Up
              </button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden z-0">
        {children}
      </main>
    </div>
  );
}

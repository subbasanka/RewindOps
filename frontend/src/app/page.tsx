"use client";

import { AgentChat } from "@/components/AgentChat";
import { AppShell } from "@/components/AppShell";

export default function HomePage() {
  return (
    <AppShell activePage="console">
      <AgentChat />
    </AppShell>
  );
}

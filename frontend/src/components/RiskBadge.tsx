"use client";

import { RiskLevel } from "@/lib/types";
import { ShieldCheck, ShieldAlert, AlertTriangle, ShieldX } from "lucide-react";

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  className?: string;
}

export function RiskBadge({ level, score, className = "" }: RiskBadgeProps) {
  // Styles for high-fidelity glowing pills
  const riskStyles: Record<
    RiskLevel,
    { bg: string; text: string; border: string; glow: string; icon: React.ReactNode }
  > = {
    low: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/20",
      glow: "shadow-emerald-950/20",
      icon: <ShieldCheck className="w-3.5 h-3.5 shrink-0" />,
    },
    medium: {
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/20",
      glow: "shadow-amber-950/20",
      icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
    },
    high: {
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      border: "border-orange-500/20",
      glow: "shadow-orange-950/20",
      icon: <ShieldAlert className="w-3.5 h-3.5 shrink-0" />,
    },
    critical: {
      bg: "bg-rose-500/10",
      text: "text-rose-400",
      border: "border-rose-500/20",
      glow: "shadow-rose-950/20",
      icon: <ShieldX className="w-3.5 h-3.5 shrink-0" />,
    },
  };

  const style = riskStyles[level] || riskStyles.low;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-md ${style.bg} ${style.text} ${style.border} ${style.glow} ${className}`}
    >
      {style.icon}
      <span>{level}</span>
      {score !== undefined && (
        <span className="opacity-60 font-mono font-medium">({score})</span>
      )}
    </span>
  );
}

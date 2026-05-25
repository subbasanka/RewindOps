"use client";

import { RiskLevel, FieldChange } from "@/lib/types";
import { RiskBadge } from "./RiskBadge";
import { AlertCircle, Check, X, ShieldAlert, Database, ArrowRight } from "lucide-react";

interface ApprovalCardProps {
  actionId: string;
  actionType: string;
  riskLevel: RiskLevel;
  riskScore: number;
  collection: string;
  documentId: string;
  fieldChanges: FieldChange[];
  businessImpact: string[];
  blastRadiusSummary: string;
  checkpointId: string;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
  disabled?: boolean;
}

export function ApprovalCard({
  actionId,
  actionType,
  riskLevel,
  riskScore,
  collection,
  documentId,
  fieldChanges,
  businessImpact,
  blastRadiusSummary,
  checkpointId,
  onApprove,
  onReject,
  disabled = false,
}: ApprovalCardProps) {
  return (
    <div className="relative rounded-2xl border border-orange-500/30 bg-orange-950/10 p-5 my-4 shadow-xl shadow-orange-950/5 backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-300">
      {/* Visual Accent Glow */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-orange-500/10 to-transparent blur-xl pointer-events-none" />

      {/* Title Header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-orange-500/10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
            <ShieldAlert className="w-4.5 h-4.5 animate-pulse" />
          </div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-orange-400 font-sans">
            Human-in-the-Loop Gate
          </span>
        </div>
        <RiskBadge level={riskLevel} score={riskScore} />
      </div>

      <div className="space-y-4 pt-3">
        {/* target description */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-300">
          <span className="text-slate-400">Action:</span>
          <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-white/5 font-bold font-mono text-xs text-white capitalize">
            {actionType.replace(/_/g, " ")}
          </span>
          <span className="text-slate-400">on database document</span>
          <span className="flex items-center gap-1 font-mono text-xs font-semibold text-indigo-300 bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-500/10">
            <Database className="w-3 h-3 shrink-0" />
            {collection}/{documentId}
          </span>
        </div>

        {/* Narrative summary */}
        <p className="text-sm text-slate-200 leading-relaxed font-sans">{blastRadiusSummary}</p>

        {/* Changes Field Grid */}
        {fieldChanges.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Proposed Property Mutations</span>
            <div className="bg-slate-950/50 rounded-xl border border-white/5 p-4 space-y-2 font-mono text-xs shadow-inner">
              {fieldChanges.map((change, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-12 gap-y-1 gap-x-3 items-center py-1 border-b border-white/5 last:border-0">
                  <div className="md:col-span-3 text-slate-400 font-semibold truncate">
                    {change.field}
                  </div>
                  <div className="md:col-span-4 text-rose-400 line-through truncate bg-rose-500/5 px-2 py-0.5 rounded border border-rose-500/10">
                    {JSON.stringify(change.before)}
                  </div>
                  <div className="md:col-span-1 flex justify-center text-slate-500">
                    <ArrowRight className="w-3.5 h-3.5 hidden md:block" />
                  </div>
                  <div className="md:col-span-4 text-emerald-400 font-bold truncate bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                    {JSON.stringify(change.after)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Business Impact bullet logs */}
        {businessImpact.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Projected Business Impact</span>
            <div className="rounded-xl border border-orange-500/10 bg-orange-950/5 p-4 space-y-2">
              {businessImpact.map((impact, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm text-orange-200 leading-relaxed">
                  <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <span>{impact}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checkpoint confirmation info */}
        <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-white/5 pt-3">
          <span>Safe Checkpoint: <span className="font-mono text-indigo-400 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-500/20">{checkpointId}</span></span>
          <span className="font-mono text-orange-400 uppercase font-extrabold tracking-widest">{actionId}</span>
        </div>

        {/* Button Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => onApprove(actionId)}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition-all duration-200 hover:scale-[1.01] hover:shadow-lg hover:shadow-emerald-950/30 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Check className="w-4 h-4" />
            Approve & Execute
          </button>
          <button
            onClick={() => onReject(actionId)}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 text-rose-400 border border-rose-600/30 font-bold text-xs uppercase tracking-wider transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
            Reject Action
          </button>
        </div>
      </div>
    </div>
  );
}

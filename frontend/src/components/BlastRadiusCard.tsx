"use client";

import { FieldChange, RiskLevel } from "@/lib/types";
import { RiskBadge } from "./RiskBadge";
import { Eye, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";

interface BlastRadiusCardProps {
  actionId: string;
  riskLevel: RiskLevel;
  riskScore: number;
  riskReasons: string[];
  fieldChanges: FieldChange[];
  affectedRecords: string[];
  businessImpact: string[];
  summary: string;
  rollbackAvailable: boolean;
}

export function BlastRadiusCard({
  actionId,
  riskLevel,
  riskScore,
  riskReasons,
  fieldChanges,
  affectedRecords,
  businessImpact,
  summary,
  rollbackAvailable,
}: BlastRadiusCardProps) {
  return (
    <div className="rounded-2xl border border-white/5 bg-slate-950/40 backdrop-blur-md p-5 my-4 space-y-5 shadow-2xl animate-in fade-in zoom-in-98 duration-200">
      {/* Title Header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Eye className="w-4 h-4" />
          </div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-slate-300 font-sans">
            Blast Radius Simulation
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge level={riskLevel} score={riskScore} />
          <span className="text-[10px] text-slate-500 font-mono font-semibold">{actionId}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Proposed Changes */}
        {fieldChanges.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Changes
            </h4>
            <div className="bg-slate-900/60 rounded-xl border border-white/5 p-4 space-y-2 font-mono text-xs shadow-inner">
              {fieldChanges.map((change, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-12 gap-y-1 gap-x-3 items-center py-1 border-b border-white/5 last:border-0"
                >
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

        {/* Affected Records */}
        {affectedRecords.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Affected Document Keys
            </h4>
            <div className="flex flex-wrap gap-2">
              {affectedRecords.map((record, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono font-semibold"
                >
                  {record}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Business Impact logs */}
        {businessImpact.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Simulated Business Risk Impact
            </h4>
            <ul className="space-y-1.5 bg-orange-500/5 border border-orange-500/10 rounded-xl p-4">
              {businessImpact.map((impact, i) => (
                <li key={i} className="text-sm text-orange-200 flex items-start gap-2.5 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <span>{impact}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risk Reasons */}
        {riskReasons.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Scoring Risk Factors
            </h4>
            <ul className="space-y-1 pl-1">
              {riskReasons.map((reason, i) => (
                <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                  <HelpCircle className="w-3.5 h-3.5 text-indigo-400/50 shrink-0 mt-0.5" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom Bar Info */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/5 text-[10px] text-slate-400 leading-normal">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            {rollbackAvailable && (
              <>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span>Rollback Point Guaranteed</span>
              </>
            )}
          </div>
          <span className="text-slate-500 font-medium italic text-right">{summary}</span>
        </div>
      </div>
    </div>
  );
}

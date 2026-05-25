"use client";

import { Database, ShieldCheck, ShieldAlert, RotateCcw, AlertTriangle } from "lucide-react";

interface ChangeRestored {
  field: string;
  was: unknown;
  restored_to: unknown;
}

interface RollbackResultProps {
  rollbackEventId: string;
  actionId: string;
  collection: string;
  documentId: string;
  verification: string;
  changesRestored: ChangeRestored[];
  reason: string;
}

export function RollbackResult({
  rollbackEventId,
  actionId,
  collection,
  documentId,
  verification,
  changesRestored,
  reason,
}: RollbackResultProps) {
  const isSuccess = verification === "matched";

  return (
    <div
      className={`rounded-2xl border p-5 my-4 space-y-4 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-98 duration-200 ${
        isSuccess
          ? "border-indigo-500/30 bg-indigo-950/10 shadow-indigo-950/5"
          : "border-rose-500/30 bg-rose-950/10 shadow-rose-950/5"
      }`}
    >
      {/* Header Beacons */}
      <div className="flex items-center gap-2 pb-3 border-b border-white/5">
        <div
          className={`p-1.5 rounded-lg border ${
            isSuccess
              ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {isSuccess ? (
            <RotateCcw className="w-4 h-4 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
        </div>
        <span
          className={`text-xs uppercase font-extrabold tracking-wider ${
            isSuccess ? "text-indigo-400" : "text-rose-400"
          }`}
        >
          {isSuccess ? "Rollback Completed Successfully" : "Rollback Execution Failed"}
        </span>
        <span className="text-[10px] text-slate-500 font-mono font-semibold ml-auto">
          {rollbackEventId}
        </span>
      </div>

      {/* Target Document Info */}
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <span className="text-slate-400">Reverted document:</span>
        <span className="flex items-center gap-1 font-mono text-xs font-semibold text-indigo-300 bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-500/10">
          <Database className="w-3.5 h-3.5 shrink-0" />
          {collection}/{documentId}
        </span>
      </div>

      {/* Reason text */}
      {reason && (
        <div className="text-sm text-slate-300 italic border-l-2 border-indigo-500/30 pl-3">
          &ldquo;{reason}&rdquo;
        </div>
      )}

      {/* Changes Restored Table Grid */}
      {changesRestored.length > 0 && (
        <div className="bg-slate-900/60 rounded-xl border border-white/5 p-4 shadow-inner">
          <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">
            Restored Properties
          </h4>
          <div className="space-y-1.5 font-mono text-xs">
            {changesRestored.map((change, i) => (
              <div
                key={i}
                className="grid grid-cols-1 md:grid-cols-12 gap-y-1 gap-x-3 items-center py-1 border-b border-white/5 last:border-0"
              >
                <div className="md:col-span-3 text-slate-400 font-semibold truncate">
                  {change.field}
                </div>
                <div className="md:col-span-4 text-rose-400 line-through truncate bg-rose-500/5 px-2 py-0.5 rounded border border-rose-500/10">
                  {JSON.stringify(change.was)}
                </div>
                <div className="md:col-span-1 flex justify-center text-slate-500">
                  <span>&rarr;</span>
                </div>
                <div className="md:col-span-4 text-indigo-400 font-bold truncate bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10">
                  {JSON.stringify(change.restored_to)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification footer pill */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-white/5 pt-3">
        <div className="flex items-center gap-1.5">
          <span>Match Verification:</span>
          {isSuccess ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold tracking-wider uppercase text-[8px]">
              <ShieldCheck className="w-2.5 h-2.5" />
              Verified Match
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold tracking-wider uppercase text-[8px]">
              <ShieldAlert className="w-2.5 h-2.5" />
              Mismatch Alert
            </span>
          )}
        </div>
        <span className="text-slate-500 font-mono">Action ID: {actionId}</span>
      </div>
    </div>
  );
}

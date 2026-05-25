"use client";

import { CheckCircle2, Database, Info, Undo } from "lucide-react";

interface ExecutionReceiptProps {
  actionId: string;
  collection: string;
  documentId: string;
  changesApplied: Record<string, unknown>;
  checkpointId: string;
  rollbackAvailable: boolean;
  onRollback: (actionId: string) => void;
}

export function ExecutionReceipt({
  actionId,
  collection,
  documentId,
  changesApplied,
  checkpointId,
  rollbackAvailable,
  onRollback,
}: ExecutionReceiptProps) {
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-5 my-4 space-y-4 shadow-xl shadow-emerald-950/5 animate-in fade-in zoom-in-98 duration-200">
      {/* Header Badge */}
      <div className="flex items-center gap-2 pb-3 border-b border-emerald-500/10">
        <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        </div>
        <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-400 font-sans">
          Action Executed Successfully
        </span>
        <span className="text-[10px] text-slate-500 font-mono font-semibold ml-auto">
          {actionId}
        </span>
      </div>

      {/* Target Document Details */}
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <span className="text-slate-400">Committed to:</span>
        <span className="flex items-center gap-1 font-mono text-xs font-semibold text-indigo-300 bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-500/10">
          <Database className="w-3.5 h-3.5 shrink-0" />
          {collection}/{documentId}
        </span>
      </div>

      {/* Changes Applied Box */}
      {Object.keys(changesApplied).length > 0 && (
        <div className="bg-slate-900/60 rounded-xl border border-white/5 p-4 shadow-inner">
          <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-2">
            Applied Properties
          </h4>
          <div className="space-y-1">
            {Object.entries(changesApplied).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400 w-28 shrink-0">{key}:</span>
                <span className="text-emerald-400 font-bold bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10">
                  {JSON.stringify(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rollback point indicator & trigger button */}
      {rollbackAvailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-emerald-500/10 text-[10px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Info className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Checkpoint <span className="font-mono text-indigo-400 font-semibold bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-500/20">{checkpointId}</span> is active
            </span>
          </div>
          <button
            onClick={() => onRollback(actionId)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white border border-amber-500/20 text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-[0.98] shadow-lg shadow-amber-950/30"
          >
            <Undo className="w-3.5 h-3.5" />
            Trigger Rollback
          </button>
        </div>
      )}
    </div>
  );
}

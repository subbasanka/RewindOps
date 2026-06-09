"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ActionReceipt } from "@/lib/types";
import { ActionHistoryTable } from "@/components/ActionHistoryTable";
import { Terminal, Shield, History, RefreshCw, X, AlertTriangle } from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function HistoryPage() {
  const [actions, setActions] = useState<ActionReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [actionDetail, setActionDetail] = useState<Record<string, unknown> | null>(null);
  const [rollbackModalAction, setRollbackModalAction] = useState<string | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/actions`);
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions || []);
      }
    } catch {
      // backend may not be running yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const handleViewDetail = async (actionId: string) => {
    setSelectedAction(actionId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/actions/${actionId}`);
      if (res.ok) {
        const data = await res.json();
        setActionDetail(data);
      }
    } catch {
      setActionDetail(null);
    }
  };

  const handleRollback = (actionId: string) => {
    setRollbackModalAction(actionId);
    setRollbackReason("");
  };

  const confirmRollback = async () => {
    if (!rollbackModalAction) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/actions/${rollbackModalAction}/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: rollbackReason }),
        }
      );
      if (res.ok) {
        setRollbackModalAction(null);
        fetchActions();
      }
    } catch {
      // handle error
    }
  };

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
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-all duration-200"
          >
            <Terminal className="w-3.5 h-3.5" />
            Agent Console
          </Link>
          <Link
            href="/history"
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-semibold text-white bg-indigo-600/30 border border-indigo-500/20 shadow-lg shadow-indigo-900/10 transition-all duration-200"
          >
            <History className="w-3.5 h-3.5" />
            Action History
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchActions}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-900/20 transition-all duration-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="relative flex-1 overflow-y-auto p-6 scrollbar-thin z-0">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Action Registry & History
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Verify all agent executions, active document checkpoints, human approval logs, and safe state rollback events.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                <span className="text-sm font-medium animate-pulse">Loading actions...</span>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-2xl border border-white/5 bg-slate-950/40 backdrop-blur-md shadow-2xl">
              <ActionHistoryTable
                actions={actions}
                onRollback={handleRollback}
                onViewDetail={handleViewDetail}
              />
            </div>
          )}
        </div>

        {/* Detail Drawer */}
        {selectedAction && actionDetail && (
          <>
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-30 animate-in fade-in duration-200"
              onClick={() => {
                setSelectedAction(null);
                setActionDetail(null);
              }}
            />
            <div className="fixed inset-y-0 right-0 w-[520px] bg-slate-950/95 border-l border-white/10 shadow-2xl overflow-y-auto z-40 backdrop-blur-xl animate-in slide-in-from-right duration-300">
              <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/10 bg-slate-950/90 backdrop-blur-md">
                <div className="flex flex-col">
                  <span className="text-xs uppercase font-semibold text-indigo-400 tracking-wider">Auditing System</span>
                  <h2 className="text-lg font-bold text-white font-sans">
                    Action Receipt Details
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setSelectedAction(null);
                    setActionDetail(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-slate-300 hover:text-white hover:bg-white/20 transition-colors text-xs font-semibold border border-white/10"
                >
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>
              <div className="p-6 space-y-2">
                <span className="text-xs text-slate-400 font-semibold block">JSON Data Payload:</span>
                <pre className="text-xs text-indigo-200 bg-slate-900 border border-white/5 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono shadow-inner scrollbar-thin">
                  {JSON.stringify(actionDetail, null, 2)}
                </pre>
              </div>
            </div>
          </>
        )}

        {/* Rollback Modal */}
        {rollbackModalAction && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-6 w-[440px] space-y-5 shadow-2xl backdrop-blur-lg">
              <div className="flex items-center gap-3 text-amber-400">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-md font-bold text-white">
                  Confirm Safe Rollback
                </h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                This will trigger the RewindOps undo transaction, restoring the target document state to exactly what was snapshotted in action{" "}
                <span className="font-mono text-indigo-400 font-semibold bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-500/25">
                  {rollbackModalAction}
                </span>.
              </p>
              <textarea
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="Describe why you are rolling back (e.g., User clarified they meant Acme Corp)"
                rows={3}
                className="w-full rounded-xl border border-white/5 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none shadow-inner"
              />
              <div className="flex gap-3">
                <button
                  onClick={confirmRollback}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-lg shadow-indigo-950/20"
                >
                  Confirm & Revert State
                </button>
                <button
                  onClick={() => setRollbackModalAction(null)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

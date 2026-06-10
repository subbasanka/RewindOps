"use client";

import { useState, useEffect, useCallback } from "react";
import { ActionReceipt } from "@/lib/types";
import { fetchActionHistory, fetchActionDetail, triggerRollback, seedUserData, ActionDetailResponse } from "@/lib/api";
import { ActionHistoryTable } from "@/components/ActionHistoryTable";
import { RiskBadge } from "@/components/RiskBadge";
import { AppShell } from "@/components/AppShell";
import { RefreshCw, X, AlertTriangle, AlertCircle, ChevronDown } from "lucide-react";

export default function HistoryPage() {
  const [actions, setActions] = useState<ActionReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [actionDetail, setActionDetail] = useState<ActionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rollbackModalAction, setRollbackModalAction] = useState<string | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const loadActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let data = await fetchActionHistory();
      if (!data.actions || data.actions.length === 0) {
        await seedUserData();
        data = await fetchActionHistory();
      }
      setActions(data.actions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load actions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const handleViewDetail = async (actionId: string) => {
    setSelectedAction(actionId);
    setDetailLoading(true);
    try {
      const data = await fetchActionDetail(actionId);
      setActionDetail(data);
    } catch {
      setActionDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDrawer = () => {
    setSelectedAction(null);
    setActionDetail(null);
  };

  const handleRollback = (actionId: string) => {
    setRollbackModalAction(actionId);
    setRollbackReason("");
    setRollbackError(null);
  };

  const confirmRollback = async () => {
    if (!rollbackModalAction) return;
    setRollbackLoading(true);
    setRollbackError(null);
    try {
      const result = await triggerRollback(rollbackModalAction, rollbackReason);
      if (result.status === "error") {
        setRollbackError(result.error || "Rollback failed");
        return;
      }
      setRollbackModalAction(null);
      loadActions();
    } catch (err) {
      setRollbackError(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (rollbackModalAction) {
        setRollbackModalAction(null);
      } else if (selectedAction) {
        closeDrawer();
      }
    }
  }, [rollbackModalAction, selectedAction]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const statusPill = (label: string, value: string) => {
    const colors: Record<string, string> = {
      executed: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      approved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      pending: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      rejected: "text-rose-400 bg-rose-500/10 border-rose-500/20",
      failed: "text-rose-400 bg-rose-500/10 border-rose-500/20",
      cancelled: "text-slate-400 bg-slate-500/10 border-slate-500/20",
      available: "text-sky-400 bg-sky-500/10 border-sky-500/20",
      rolled_back: "text-purple-400 bg-purple-500/10 border-purple-500/20",
      not_applicable: "text-slate-500 bg-slate-500/5 border-white/5",
    };
    const colorClass = colors[value] || "text-slate-200 bg-slate-500/5 border-white/5";
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</span>
        <span className={`inline-flex items-center self-start px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${colorClass}`}>
          {value.replace(/_/g, " ")}
        </span>
      </div>
    );
  };

  const detailField = (label: string, value: string | undefined | null) => (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</span>
      <span className="text-xs text-slate-200 font-medium">{value || "—"}</span>
    </div>
  );

  const renderDetailContent = (detail: ActionDetailResponse) => {
    const r = detail.receipt;
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-bold text-indigo-400">{r.action_id}</span>
            <RiskBadge level={r.risk_level} score={r.risk_score} />
          </div>
          <span className="text-lg font-bold text-white capitalize">
            {r.action_type.replace(/_/g, " ")}
          </span>
        </div>

        <div className="p-4 rounded-xl border border-white/5 bg-slate-900/40 space-y-4">
          <span className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Pipeline Details</span>
          <div className="grid grid-cols-2 gap-4">
            {detailField("Collection", r.collection)}
            {detailField("Document ID", r.document_id)}
            {detailField("Operation Type", r.action_type.replace(/_/g, " "))}
            {statusPill("Approval Status", r.approval_status)}
            {statusPill("Execution Status", r.execution_status)}
            {statusPill("Rollback Status", r.rollback_status)}
            {detailField("Created At", r.created_at ? new Date(r.created_at).toLocaleString() : undefined)}
            {detailField("Executed At", r.executed_at ? new Date(r.executed_at).toLocaleString() : undefined)}
          </div>
        </div>

        {r.field_changes && r.field_changes.length > 0 && (
          <div className="p-4 rounded-xl border border-white/5 bg-slate-900/40 space-y-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Field Changes</span>
            <div className="space-y-2">
              {r.field_changes.map((fc, i) => (
                <div key={i} className="flex flex-col gap-1 p-3 rounded-lg bg-slate-950/50 border border-white/5">
                  <span className="text-xs font-bold text-slate-300">{fc.field}</span>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      {String(fc.before ?? "null")}
                    </span>
                    <span className="text-slate-500">→</span>
                    <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {String(fc.after ?? "null")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {r.business_impact && r.business_impact.length > 0 && (
          <div className="p-4 rounded-xl border border-white/5 bg-slate-900/40 space-y-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Business Impact</span>
            <ul className="space-y-1.5">
              {r.business_impact.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {r.blast_radius_summary && (
          <div className="p-4 rounded-xl border border-white/5 bg-slate-900/40 space-y-2">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Blast Radius Summary</span>
            <p className="text-xs text-slate-300 leading-relaxed">{r.blast_radius_summary}</p>
          </div>
        )}

        {detail.checkpoint && (
          <div className="p-4 rounded-xl border border-white/5 bg-slate-900/40 space-y-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">Checkpoint</span>
            <div className="grid grid-cols-2 gap-4">
              {detailField("Checkpoint ID", detail.checkpoint.checkpoint_id)}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Rollback Available</span>
                <span className={`text-xs font-bold ${detail.checkpoint.rollback_available ? "text-emerald-400" : "text-slate-500"}`}>
                  {detail.checkpoint.rollback_available ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>
        )}

        {detail.rollback_event && (
          <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-3">
            <span className="text-[10px] text-purple-400 uppercase tracking-widest font-extrabold">Rollback Event</span>
            <div className="grid grid-cols-2 gap-4">
              {detailField("Rollback Event ID", detail.rollback_event.rollback_event_id)}
              {detailField("Verification", detail.rollback_event.verification)}
              <div className="col-span-2">
                {detailField("Reason", detail.rollback_event.reason)}
              </div>
            </div>
          </div>
        )}

        <details className="rounded-xl border border-white/5 bg-slate-900/40 overflow-hidden">
          <summary className="flex items-center gap-2 px-4 py-3 text-[10px] text-slate-400 uppercase tracking-widest font-extrabold cursor-pointer hover:bg-white/[0.02] transition-colors select-none">
            <ChevronDown className="w-3.5 h-3.5" />
            Raw JSON
          </summary>
          <pre className="text-xs text-indigo-200 bg-slate-950/50 p-4 overflow-x-auto whitespace-pre-wrap font-mono scrollbar-thin border-t border-white/5">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </details>
      </div>
    );
  };

  const refreshButton = (
    <button
      onClick={loadActions}
      aria-label="Refresh action history"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-900/20 transition-all duration-200"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      Refresh
    </button>
  );

  return (
    <AppShell activePage="history" headerRight={refreshButton}>
      <div className="h-full overflow-y-auto p-6 scrollbar-thin">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Action Registry & History
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Verify all agent executions, active document checkpoints, human approval logs, and safe state rollback events.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">Failed to load actions</p>
                <p className="text-xs text-rose-400 mt-0.5">{error}</p>
              </div>
              <button
                onClick={loadActions}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold transition-colors"
              >
                Retry
              </button>
            </div>
          )}

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

        {selectedAction && (
          <>
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-30 animate-in fade-in duration-200"
              onClick={closeDrawer}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Action receipt details"
              className="fixed inset-y-0 right-0 w-[520px] bg-slate-950/95 border-l border-white/10 shadow-2xl overflow-y-auto z-40 backdrop-blur-xl animate-in slide-in-from-right duration-300"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-white/10 bg-slate-950/90 backdrop-blur-md">
                <div className="flex flex-col">
                  <span className="text-xs uppercase font-semibold text-indigo-400 tracking-wider">Auditing System</span>
                  <h2 className="text-lg font-bold text-white font-sans">
                    Action Receipt Details
                  </h2>
                </div>
                <button
                  onClick={closeDrawer}
                  aria-label="Close detail drawer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-slate-300 hover:text-white hover:bg-white/20 transition-colors text-xs font-semibold border border-white/10"
                >
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>
              <div className="p-6 space-y-2">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                  </div>
                ) : actionDetail ? (
                  renderDetailContent(actionDetail)
                ) : (
                  <div className="flex items-center gap-2 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    Failed to load action details.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {rollbackModalAction && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rollback-modal-title"
            className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200"
          >
            <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-6 w-[440px] space-y-5 shadow-2xl backdrop-blur-lg">
              <div className="flex items-center gap-3 text-amber-400">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 id="rollback-modal-title" className="text-md font-bold text-white">
                  Confirm Safe Rollback
                </h3>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                This will trigger the RewindOps undo transaction, restoring the target document state to exactly what was snapshotted in action{" "}
                <span className="font-mono text-indigo-400 font-semibold bg-indigo-950/50 px-1.5 py-0.5 rounded border border-indigo-500/25">
                  {rollbackModalAction}
                </span>.
              </p>

              {rollbackError && (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {rollbackError}
                </div>
              )}

              <textarea
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                placeholder="Describe why you are rolling back (e.g., User clarified they meant Acme Corp)"
                rows={3}
                aria-label="Rollback reason"
                className="w-full rounded-xl border border-white/5 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none shadow-inner"
              />
              <div className="flex gap-3">
                <button
                  onClick={confirmRollback}
                  disabled={rollbackLoading}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-lg shadow-indigo-950/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {rollbackLoading ? "Rolling back..." : "Confirm & Revert State"}
                </button>
                <button
                  onClick={() => setRollbackModalAction(null)}
                  disabled={rollbackLoading}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 text-xs font-semibold transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

"use client";

import { useState } from "react";
import { ActionReceipt, RiskLevel } from "@/lib/types";
import { RiskBadge } from "./RiskBadge";
import { Filter, Calendar, Layers, Activity, RotateCcw, ChevronRight } from "lucide-react";

interface ActionHistoryTableProps {
  actions: ActionReceipt[];
  onRollback: (actionId: string) => void;
  onViewDetail: (actionId: string) => void;
}

export function ActionHistoryTable({
  actions,
  onRollback,
  onViewDetail,
}: ActionHistoryTableProps) {
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = actions.filter((a) => {
    if (riskFilter !== "all" && a.risk_level !== riskFilter) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "rolled_back") {
        if (a.rollback_status !== "rolled_back") return false;
      } else if (a.execution_status !== statusFilter) {
        return false;
      }
    }
    return true;
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "executed":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "pending":
        return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "failed":
        return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "cancelled":
        return "text-slate-400 bg-slate-500/10 border-slate-500/20";
      default:
        return "text-slate-200 bg-slate-500/5 border-white/5";
    }
  };

  const rollbackColor = (status: string) => {
    switch (status) {
      case "available":
        return "text-sky-400 bg-sky-500/10 border-sky-500/20";
      case "rolled_back":
        return "text-purple-400 bg-purple-500/10 border-purple-500/20";
      default:
        return "text-slate-500 bg-slate-500/5 border-white/5";
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-wrap gap-4 items-center justify-between p-4 rounded-xl border border-white/5 bg-slate-900/40 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">
              Risk Level
            </label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="bg-slate-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
            >
              <option value="all">All Tiers</option>
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
              <option value="critical">Critical Risk</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <label className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold">
              Status State
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Checkpoints</option>
              <option value="executed">Executed Queries</option>
              <option value="rolled_back">Rolled Back Undo</option>
              <option value="failed">Failed Runs</option>
              <option value="cancelled">Cancelled Sessions</option>
            </select>
          </div>
        </div>

        <span className="text-xs text-slate-400 font-medium">
          Found <span className="text-white font-bold">{filtered.length}</span> transaction history log{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Grid Table */}
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-slate-950/20 shadow-inner scrollbar-thin">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-950/40 border-b border-white/5 text-slate-400">
              <th className="text-left px-4 py-4 text-[10px] uppercase tracking-widest font-bold">
                Action Registry Key
              </th>
              <th className="text-left px-4 py-4 text-[10px] uppercase tracking-widest font-bold">
                Operation Type
              </th>
              <th className="text-left px-4 py-4 text-[10px] uppercase tracking-widest font-bold">
                Target Collection
              </th>
              <th className="text-left px-4 py-4 text-[10px] uppercase tracking-widest font-bold">
                Safety Tier
              </th>
              <th className="text-left px-4 py-4 text-[10px] uppercase tracking-widest font-bold">
                Execution State
              </th>
              <th className="text-left px-4 py-4 text-[10px] uppercase tracking-widest font-bold">
                Rollback State
              </th>
              <th className="text-left px-4 py-4 text-[10px] uppercase tracking-widest font-bold">
                Registered Time
              </th>
              <th className="text-right px-4 py-4 text-[10px] uppercase tracking-widest font-bold">
                Action Commands
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-slate-300">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-12 text-slate-500 italic text-sm"
                >
                  No action receipts logged matching these criteria.
                </td>
              </tr>
            )}
            {filtered.map((action) => (
              <tr
                key={action.action_id}
                className="hover:bg-white/[0.02] transition-colors cursor-pointer group"
                onClick={() => onViewDetail(action.action_id)}
              >
                <td className="px-4 py-3.5 font-mono text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 transition-colors">
                  {action.action_id}
                </td>
                <td className="px-4 py-3.5 text-slate-200 capitalize font-medium">
                  {action.action_type.replace(/_/g, " ")}
                </td>
                <td className="px-4 py-3.5 font-mono text-xs text-slate-400">
                  {action.collection}/{action.document_id}
                </td>
                <td className="px-4 py-3.5">
                  <RiskBadge level={action.risk_level} score={action.risk_score} />
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusColor(action.execution_status)}`}>
                    {action.execution_status}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${rollbackColor(action.rollback_status)}`}>
                    {action.rollback_status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-slate-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    {action.created_at
                      ? new Date(action.created_at).toLocaleString()
                      : "-"}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    {action.rollback_status === "available" && (
                      <button
                        onClick={() => onRollback(action.action_id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600/10 hover:bg-amber-600/35 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider transition-all duration-200 active:scale-[0.98]"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Rollback
                      </button>
                    )}
                    <button
                      onClick={() => onViewDetail(action.action_id)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

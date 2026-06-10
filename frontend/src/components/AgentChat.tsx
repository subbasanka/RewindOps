"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { RiskLevel, FieldChange } from "@/lib/types";
import {
  sendAgentMessage, createSession,
  fetchChatSessions, fetchChatMessages, saveChatMessage, deleteChatSession,
  setAuthTokenGetter, ChatSessionSummary,
} from "@/lib/api";
import { useAuth } from "@clerk/nextjs";
import { ApprovalCard } from "./ApprovalCard";
import { BlastRadiusCard } from "./BlastRadiusCard";
import { ExecutionReceipt } from "./ExecutionReceipt";
import { RollbackResult } from "./RollbackResult";
import { RiskBadge } from "./RiskBadge";
import { Send, Cpu, Terminal, MessageSquare, AlertCircle, ArrowRight, CreditCard, Shield, Calendar, Award, User, Layers, Info, Plus, Trash2, MessageCircle, PanelLeftClose, PanelLeft, Hash, DollarSign, Package, Zap } from "lucide-react";
import { RewindOpsLogo } from "./RewindOpsLogo";

interface ToolCard {
  type: "risk" | "blast_radius" | "approval" | "execution" | "rollback";
  data: Record<string, unknown>;
}

interface ChatEntry {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
  toolCards: ToolCard[];
}

interface ParsedMessage {
  text: string;
  safetyFilters: string[];
  structuredCard: {
    title: string;
    fields: { label: string; value: string }[];
  } | null;
}

/* ── Inline markdown: **bold**, *italic*, `code` ── */
function renderInline(text: string): React.ReactNode {
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2]) parts.push(<strong key={k++} className="font-semibold text-white">{m[2]}</strong>);
    else if (m[3]) parts.push(<em key={k++} className="italic text-slate-300">{m[3]}</em>);
    else if (m[4]) parts.push(<code key={k++} className="px-1.5 py-0.5 rounded bg-slate-800/80 text-indigo-300 text-[11px] font-mono border border-white/5">{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? <>{parts}</> : text;
}

/* ── Detect price-like tokens ── */
const hasPrice = (t: string) => /\$[\d,.]+/.test(t);
const hasPlan = (t: string) => /enterprise|professional|starter|premium|basic/i.test(t);

/* ── Pick accent colour for numbered list items ── */
const listAccents = [
  { bg: "bg-indigo-500/15", border: "border-indigo-500/20", num: "bg-indigo-500/25 text-indigo-300", icon: <Package className="w-3.5 h-3.5 text-indigo-400" /> },
  { bg: "bg-violet-500/15", border: "border-violet-500/20", num: "bg-violet-500/25 text-violet-300", icon: <Zap className="w-3.5 h-3.5 text-violet-400" /> },
  { bg: "bg-sky-500/15", border: "border-sky-500/20", num: "bg-sky-500/25 text-sky-300", icon: <CreditCard className="w-3.5 h-3.5 text-sky-400" /> },
  { bg: "bg-emerald-500/15", border: "border-emerald-500/20", num: "bg-emerald-500/25 text-emerald-300", icon: <Award className="w-3.5 h-3.5 text-emerald-400" /> },
  { bg: "bg-amber-500/15", border: "border-amber-500/20", num: "bg-amber-500/25 text-amber-300", icon: <DollarSign className="w-3.5 h-3.5 text-amber-400" /> },
  { bg: "bg-rose-500/15", border: "border-rose-500/20", num: "bg-rose-500/25 text-rose-300", icon: <Hash className="w-3.5 h-3.5 text-rose-400" /> },
];

/* ── Rich markdown block renderer ── */
function renderMarkdownBlock(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuf: { num: string; body: string }[] = [];
  let bulletBuf: string[] = [];

  const flushNumberedList = () => {
    if (listBuf.length === 0) return;
    elements.push(
      <div key={elements.length} className="space-y-2.5 my-3">
        {listBuf.map((item, idx) => {
          const accent = listAccents[idx % listAccents.length];
          const priceMatch = item.body.match(/\$[\d,.]+\/?\w*/);
          return (
            <div key={idx} className={`flex items-start gap-3 p-3.5 rounded-xl ${accent.bg} border ${accent.border} backdrop-blur-sm transition-all duration-200 hover:scale-[1.01]`}>
              <div className={`flex items-center justify-center w-7 h-7 rounded-lg ${accent.num} text-xs font-bold shrink-0`}>
                {item.num}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-slate-100 leading-relaxed">{renderInline(item.body)}</div>
                {priceMatch && (
                  <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[11px] font-bold font-mono">
                    <DollarSign className="w-3 h-3" />
                    {priceMatch[0].replace("$", "")}
                  </div>
                )}
              </div>
              {accent.icon}
            </div>
          );
        })}
      </div>
    );
    listBuf = [];
  };

  const flushBulletList = () => {
    if (bulletBuf.length === 0) return;

    const hasGroups = bulletBuf.some((b) => b.startsWith("**"));

    if (hasGroups) {
      const groups: { header: string; details: string[] }[] = [];
      let cur: { header: string; details: string[] } | null = null;

      for (const b of bulletBuf) {
        if (b.startsWith("**")) {
          if (cur) groups.push(cur);
          const hm = b.match(/^\*\*(.*?)\*\*:?\s*(.*)?/);
          cur = { header: hm ? hm[1] : b.replace(/\*\*/g, ""), details: hm && hm[2] ? [hm[2]] : [] };
        } else if (cur) {
          cur.details.push(b);
        } else {
          cur = { header: "", details: [b] };
        }
      }
      if (cur) groups.push(cur);

      elements.push(
        <div key={elements.length} className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3">
          {groups.map((g, idx) => {
            const accent = listAccents[idx % listAccents.length];
            const priceDetail = g.details.find((d) => /\$[\d,.]+/.test(d));
            const priceMatch = priceDetail?.match(/\$[\d,.]+\/?\w*/);
            return (
              <div key={idx} className={`p-4 rounded-xl ${accent.bg} border ${accent.border} backdrop-blur-sm space-y-2.5 hover:scale-[1.01] transition-transform`}>
                <div className="flex items-center gap-2.5">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${accent.num}`}>
                    {accent.icon}
                  </div>
                  <span className="text-sm font-bold text-white">{g.header}</span>
                </div>
                {priceMatch && (
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-sm font-bold font-mono">
                    <DollarSign className="w-3.5 h-3.5" />
                    {priceMatch[0].replace("$", "")}/mo
                  </div>
                )}
                <div className="space-y-1">
                  {g.details.map((d, di) => {
                    const kv = d.match(/^([^:]+):\s*(.*)/);
                    if (kv) {
                      return (
                        <div key={di} className="flex items-baseline gap-1.5 text-xs">
                          <span className="text-slate-400 font-medium shrink-0">{kv[1]}</span>
                          <span className="text-slate-200 font-semibold">{renderInline(kv[2])}</span>
                        </div>
                      );
                    }
                    return <div key={di} className="text-xs text-slate-200">{renderInline(d)}</div>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    } else {
      elements.push(
        <ul key={elements.length} className="space-y-1.5 my-2 pl-1">
          {bulletBuf.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-slate-200 leading-relaxed">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
              <span>{renderInline(b)}</span>
            </li>
          ))}
        </ul>
      );
    }
    bulletBuf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.*)/);
    if (numMatch) {
      flushBulletList();
      listBuf.push({ num: numMatch[1], body: numMatch[2] });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-•*]\s+(.*)/);
    if (bulletMatch && !trimmed.startsWith("**")) {
      flushNumberedList();
      bulletBuf.push(bulletMatch[1]);
      continue;
    }

    flushNumberedList();

    if (!trimmed) {
      if (bulletBuf.length === 0) {
        elements.push(<div key={elements.length} className="h-1.5" />);
      }
      continue;
    }

    flushBulletList();

    if (trimmed.startsWith("### ")) {
      elements.push(<h3 key={elements.length} className="text-sm font-bold text-white mt-3 mb-1">{renderInline(trimmed.slice(4))}</h3>);
    } else if (trimmed.startsWith("## ")) {
      elements.push(<h2 key={elements.length} className="text-[15px] font-bold text-white mt-3 mb-1">{renderInline(trimmed.slice(3))}</h2>);
    } else {
      elements.push(<p key={elements.length} className="text-[13px] text-slate-200 leading-relaxed">{renderInline(trimmed)}</p>);
    }
  }

  flushNumberedList();
  flushBulletList();
  return <div className="space-y-0.5">{elements}</div>;
}

function parseMessageContent(content: string): ParsedMessage {
  const lines = content.split("\n");
  const safetyFilters: string[] = [];
  const textLines: string[] = [];
  const fields: { label: string; value: string }[] = [];
  let possibleTitle = "";
  let hasListItems = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (fields.length === 0) textLines.push(line);
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) hasListItems = true;

    const filterMatch = trimmed.match(/^\[Calling safety filter:\s*(.*?)\.\.\.\]$/i);
    if (filterMatch) {
      safetyFilters.push(filterMatch[1]);
      continue;
    }

    if (!hasListItems) {
      const fieldMatch = trimmed.match(/^[*-\s]*\*\*(.*?)\*\*[:\s]+(.*)/);
      if (fieldMatch) {
        fields.push({ label: fieldMatch[1].trim(), value: fieldMatch[2].trim() });
        continue;
      }
    }

    if (fields.length === 0) {
      textLines.push(line);
      possibleTitle = trimmed;
    } else {
      textLines.push(line);
    }
  }

  let cardTitle = "Structured Details";
  if (fields.length > 0 && possibleTitle) {
    cardTitle = possibleTitle.replace(/[:：]$/, "");
    const titleIdx = textLines.lastIndexOf(possibleTitle);
    if (titleIdx !== -1) textLines.splice(titleIdx, 1);
  }

  return {
    text: textLines.join("\n").trim(),
    safetyFilters: Array.from(new Set(safetyFilters)),
    structuredCard: fields.length > 0 ? { title: cardTitle, fields } : null,
  };
}

const getFieldIcon = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes("id")) return <CreditCard className="w-3.5 h-3.5 text-indigo-400" />;
  if (l.includes("status")) return <Shield className="w-3.5 h-3.5 text-emerald-400" />;
  if (l.includes("date")) return <Calendar className="w-3.5 h-3.5 text-amber-400" />;
  if (l.includes("amount") || l.includes("price") || l.includes("billing")) return <Award className="w-3.5 h-3.5 text-emerald-400" />;
  if (l.includes("customer") || l.includes("user")) return <User className="w-3.5 h-3.5 text-sky-400" />;
  if (l.includes("addon") || l.includes("feature")) return <Layers className="w-3.5 h-3.5 text-purple-400" />;
  return <Info className="w-3.5 h-3.5 text-slate-400" />;
};

const renderStructuredCard = (card: { title: string; fields: { label: string; value: string }[] }) => (
  <div className="mt-3 p-4 rounded-xl border border-indigo-500/10 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-indigo-950/30 backdrop-blur-lg shadow-xl shadow-indigo-950/10 space-y-3 max-w-full">
    <div className="flex items-center gap-2 border-b border-white/5 pb-2.5">
      <div className="flex items-center justify-center w-5 h-5 rounded-md bg-indigo-500/20">
        <Layers className="w-3 h-3 text-indigo-400" />
      </div>
      <span className="text-[11px] font-bold tracking-wider text-indigo-300/80 uppercase">
        {card.title}
      </span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {card.fields.map((f, i) => {
        const isStatus = f.label.toLowerCase().includes("status");
        const isActive = f.value.toLowerCase() === "active";
        const isCancelled = f.value.toLowerCase().includes("cancel");
        const isAmount = f.label.toLowerCase().includes("amount") || f.label.toLowerCase().includes("price");

        return (
          <div key={i} className="flex flex-col space-y-1.5 bg-white/[0.02] border border-white/[0.04] p-3 rounded-lg hover:bg-white/[0.04] transition-colors">
            <span className="text-[10px] font-bold tracking-wide text-slate-500 uppercase flex items-center gap-1.5">
              {getFieldIcon(f.label)}
              {f.label}
            </span>
            {isStatus ? (
              <div className="flex items-center">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase border ${
                  isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : isCancelled ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : isCancelled ? "bg-rose-400" : "bg-slate-400"}`} />
                  {f.value}
                </span>
              </div>
            ) : isAmount ? (
              <span className="text-sm font-bold text-emerald-400 font-mono">{f.value}</span>
            ) : (
              <span className="text-xs font-semibold text-slate-200">{f.value}</span>
            )}
          </div>
        );
      })}
    </div>
  </div>
);

export function AgentChat() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [pendingApproval, setPendingApproval] = useState<Record<string, unknown> | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [streamingCards, setStreamingCards] = useState<ToolCard[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const { isLoaded: authLoaded, isSignedIn, getToken } = useAuth();

  const loadSessions = useCallback(async (): Promise<ChatSessionSummary[]> => {
    try {
      const list = await fetchChatSessions();
      setSessions(list);
      return list;
    } catch {
      return [];
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoaded || initialLoadDone) return;

    if (isSignedIn) {
      setAuthTokenGetter(() => getToken());
    }

    setInitialLoadDone(true);

    (async () => {
      const list = await loadSessions();
      if (list.length > 0) {
        const mostRecent = list[0];
        setSessionId(mostRecent.session_id);
        try {
          const msgs = await fetchChatMessages(mostRecent.session_id);
          setMessages(
            msgs.map((m) => ({
              id: m.message_id,
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              toolCards: (m.toolCards || []) as ToolCard[],
            }))
          );
        } catch {
          // no messages yet is fine
        }
      } else {
        const newSid = await createSession();
        setSessionId(newSid);
      }
    })();
  }, [authLoaded, isSignedIn, getToken, initialLoadDone, loadSessions]);

  const loadSessionMessages = useCallback(async (sid: string) => {
    setSessionId(sid);
    setMessages([]);
    setPendingApproval(null);
    try {
      const msgs = await fetchChatMessages(sid);
      const loaded: ChatEntry[] = msgs.map((m) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        toolCards: (m.toolCards || []) as ToolCard[],
      }));
      setMessages(loaded);
    } catch {
      // if no messages yet, that's fine
    }
  }, []);

  const handleNewChat = useCallback(async () => {
    const newSid = await createSession();
    setSessionId(newSid);
    setMessages([]);
    setPendingApproval(null);
    loadSessions();
  }, [loadSessions]);

  const handleDeleteSession = useCallback(async (sid: string) => {
    await deleteChatSession(sid);
    if (sid === sessionId) {
      handleNewChat();
    }
    loadSessions();
  }, [sessionId, handleNewChat, loadSessions]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, streamingText, streamingCards]);

  const handleSend = async (overrideMessage?: string) => {
    const text = overrideMessage || input.trim();
    if (!text || isLoading) return;

    if (!overrideMessage) setInput("");

    const userMsg: ChatEntry = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      toolCards: [],
    };
    setMessages((prev) => [...prev, userMsg]);
    saveChatMessage(sessionId, userMsg).catch(() => {});
    setIsLoading(true);
    setPendingApproval(null);
    setStreamingText("");
    setStreamingCards([]);

    try {
      const response = await sendAgentMessage(text, sessionId);

      const reader = response.body?.getReader();
      if (!reader) {
        const errMsg: ChatEntry = {
          id: `msg-${Date.now()}`,
          role: "agent",
          content: "Error: No response stream",
          timestamp: new Date().toISOString(),
          toolCards: [],
        };
        setMessages((prev) => [...prev, errMsg]);
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let agentText = "";
      let buffer = "";
      const cards: ToolCard[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const event = JSON.parse(dataStr);
            if (event.error) {
              agentText += `\nError: ${event.error}\n`;
              setStreamingText(agentText);
              continue;
            }
            const content = event?.content;
            if (!content?.parts) continue;

            for (const part of content.parts) {
              if (part.text) {
                agentText += part.text;
                setStreamingText(agentText);
              }

              if (part.functionCall) {
                agentText += `\n[Calling safety filter: ${part.functionCall.name}...]\n`;
                setStreamingText(agentText);
              }

              if (part.functionResponse) {
                const resp = part.functionResponse.response;
                if (typeof resp !== "object" || resp === null) continue;

                const status = resp.status as string;
                if (status === "classified" || status === "blocked") {
                  cards.push({ type: "risk", data: resp as Record<string, unknown> });
                  setStreamingCards([...cards]);
                }
                if (status === "preview_ready") {
                  cards.push({ type: "blast_radius", data: resp as Record<string, unknown> });
                  setStreamingCards([...cards]);
                }
                if (status === "awaiting_approval") {
                  cards.push({ type: "approval", data: resp as Record<string, unknown> });
                  setStreamingCards([...cards]);
                  setPendingApproval(resp as Record<string, unknown>);
                }
                if (status === "executed") {
                  cards.push({ type: "execution", data: resp as Record<string, unknown> });
                  setStreamingCards([...cards]);
                }
                if (status === "rolled_back") {
                  cards.push({ type: "rollback", data: resp as Record<string, unknown> });
                  setStreamingCards([...cards]);
                }
              }
            }
          } catch {
            // skip unparseable SSE lines
          }
        }
      }

      if (agentText.trim() || cards.length > 0) {
        const agentMsg: ChatEntry = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "agent",
          content: agentText.trim(),
          timestamp: new Date().toISOString(),
          toolCards: cards,
        };
        setMessages((prev) => [...prev, agentMsg]);
        saveChatMessage(sessionId, agentMsg).catch(() => {});
        loadSessions();
      }
    } catch (error) {
      const errMsg: ChatEntry = {
        id: `msg-${Date.now()}`,
        role: "agent",
        content: `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date().toISOString(),
        toolCards: [],
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
      setStreamingText("");
      setStreamingCards([]);
    }
  };

  const handleApprove = (actionId: string) => {
    setPendingApproval(null);
    handleSend(`Approved: ${actionId}`);
  };

  const handleReject = (actionId: string) => {
    setPendingApproval(null);
    handleSend(`Rejected: ${actionId}`);
  };

  const handleRollback = (actionId: string) => {
    handleSend(`Rollback action ${actionId}. The previous action was a mistake.`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderToolCard = (card: ToolCard, index: number) => {
    const d = card.data;
    switch (card.type) {
      case "risk":
        return (
          <div key={`card-${index}`} className="flex justify-start my-2">
            <div className="max-w-[80%] rounded-xl border border-white/5 bg-slate-900/60 backdrop-blur-sm p-4 space-y-2.5 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-extrabold tracking-widest text-slate-400 uppercase">Policy Risk Assessment</span>
                <RiskBadge level={(d.risk_level as RiskLevel) || "low"} score={d.score as number} />
              </div>
              {d.decision === "BLOCK" && (
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded" role="alert">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>ACTION PERMANENTLY BLOCKED</span>
                </div>
              )}
              <ul className="text-xs text-slate-300 space-y-1 pl-1 list-disc list-inside">
                {(d.reasons as string[] || []).map((r: string, i: number) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <div className="text-[10px] text-slate-400 border-t border-white/5 pt-2">
                Interceptors: Approval {d.approval_required ? "Required" : "Skip"}
                {" | "}Checkpoint {d.checkpoint_required ? "Active" : "Skip"}
              </div>
            </div>
          </div>
        );

      case "blast_radius":
        return (
          <div key={`card-${index}`} className="flex justify-start">
            <div className="max-w-[85%] w-full">
              <BlastRadiusCard
                actionId={(d.action_id as string) || ""}
                riskLevel={(d.risk_level as RiskLevel) || "high"}
                riskScore={(d.risk_score as number) || 0}
                riskReasons={(d.risk_reasons as string[]) || []}
                fieldChanges={(d.field_changes as FieldChange[]) || []}
                affectedRecords={(d.affected_records as string[]) || []}
                businessImpact={(d.business_impact as string[]) || []}
                summary={(d.summary as string) || ""}
                rollbackAvailable={(d.rollback_available as boolean) ?? true}
              />
            </div>
          </div>
        );

      case "approval":
        return null;

      case "execution":
        return (
          <div key={`card-${index}`} className="flex justify-start">
            <div className="max-w-[85%] w-full">
              <ExecutionReceipt
                actionId={(d.action_id as string) || ""}
                collection={(d.collection as string) || ""}
                documentId={(d.document_id as string) || ""}
                changesApplied={(d.changes_applied as Record<string, unknown>) || {}}
                checkpointId={(d.checkpoint_id as string) || ""}
                rollbackAvailable={(d.rollback_available as boolean) ?? true}
                onRollback={handleRollback}
              />
            </div>
          </div>
        );

      case "rollback":
        return (
          <div key={`card-${index}`} className="flex justify-start">
            <div className="max-w-[85%] w-full">
              <RollbackResult
                rollbackEventId={(d.rollback_event_id as string) || ""}
                actionId={(d.action_id as string) || ""}
                collection={(d.collection as string) || ""}
                documentId={(d.document_id as string) || ""}
                verification={(d.verification as string) || ""}
                changesRestored={(d.changes_restored as Array<{ field: string; was: unknown; restored_to: unknown }>) || []}
                reason={(d.reason as string) || ""}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const starterQueries = [
    {
      title: "Cancel Subscription",
      prompt: "Cancel the enterprise subscription for Acme Robotics.",
      desc: "Triggers HIGH risk classification, pre-write checkpoint, blast radius, and approval gate.",
    },
    {
      title: "Refund Invoice",
      prompt: "Refund the last invoice for customer Acme Robotics.",
      desc: "Fires MEDIUM risk verification checkpoint and execution receipts.",
    },
    {
      title: "Lookup Subscription",
      prompt: "Show me the professional subscription for NovaTech Solutions.",
      desc: "Triggers safe, direct read operations on your MongoDB Atlas collection.",
    },
  ];

  const renderMessageContent = (content: string) => {
    const parsed = parseMessageContent(content);
    const showBubble = parsed.text || parsed.safetyFilters.length > 0;
    return (
      <>
        {showBubble && (
          <div className="rounded-2xl rounded-tl-sm bg-gradient-to-br from-slate-900/70 to-slate-900/50 border border-white/5 text-slate-100 px-5 py-4 leading-relaxed shadow-lg backdrop-blur-sm space-y-2">
            {parsed.text && renderMarkdownBlock(parsed.text)}
            {parsed.safetyFilters.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                {parsed.safetyFilters.map((filter, fi) => (
                  <div key={fi} className="inline-flex items-center gap-1.5 bg-indigo-500/8 border border-indigo-500/15 px-2.5 py-1 rounded-full text-[10px] font-bold text-indigo-400 shadow-sm">
                    <Terminal className="w-3 h-3 text-indigo-400" />
                    <span>Safety Gate Active: {filter}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {parsed.structuredCard && renderStructuredCard(parsed.structuredCard)}
      </>
    );
  };

  return (
    <div className="flex h-full bg-transparent">
      {/* Session sidebar */}
      <div className={`shrink-0 border-r border-white/5 bg-slate-950/60 backdrop-blur-md flex flex-col transition-all duration-300 ${sidebarOpen ? "w-64" : "w-0 overflow-hidden"}`}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Conversations</span>
          <button
            onClick={handleNewChat}
            aria-label="New conversation"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[10px] font-bold transition-colors border border-indigo-500/20"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin py-1">
          {sessionsLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-500 text-xs">Loading...</div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-xs gap-2">
              <MessageCircle className="w-5 h-5 opacity-40" />
              <span>No conversations yet</span>
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.session_id}
                className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                  s.session_id === sessionId
                    ? "bg-indigo-600/15 border-l-2 border-indigo-500"
                    : "hover:bg-white/[0.03] border-l-2 border-transparent"
                }`}
              >
                <button
                  onClick={() => loadSessionMessages(s.session_id)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="text-xs font-medium text-slate-200 truncate">
                    {s.title || "New conversation"}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(s.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.session_id); }}
                  aria-label="Delete conversation"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sidebar toggle */}
        <div className="flex items-center px-3 py-1.5 border-b border-white/5 bg-slate-950/30 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            className="p-1.5 rounded-md hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
          <span className="ml-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {sessionId ? `Session: ${sessionId.slice(0, 16)}...` : ""}
          </span>
        </div>

        <div ref={scrollContainerRef} role="log" aria-label="Agent conversation" aria-live="polite" className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[80%] max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom duration-300">
            <div className="relative flex flex-col items-center text-center space-y-4">
              <div className="relative flex items-center justify-center w-16 h-16">
                <RewindOpsLogo size={56} className="animate-soft-pulse" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight text-white font-sans">RewindOps Agent Console</h2>
                <p className="text-sm text-slate-400 max-w-sm">Autonomous billing transactions with perfect rollback guarantees and state-safety policies.</p>
              </div>
            </div>
            <div className="w-full space-y-3">
              <span className="text-[10px] uppercase tracking-widest font-extrabold text-slate-500 block text-center">Select a demo flow to begin</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {starterQueries.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(q.prompt)}
                    aria-label={`Run demo: ${q.title}`}
                    className="flex flex-col text-left p-4 rounded-xl border border-white/5 bg-slate-950/30 hover:bg-slate-900/40 hover:border-indigo-500/30 transition-all duration-200 group active:scale-[0.98] shadow-lg shadow-black/20"
                  >
                    <span className="text-xs font-bold text-white group-hover:text-indigo-400 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {q.title}
                    </span>
                    <span className="text-[11px] text-slate-400 leading-relaxed mt-2 flex-grow">{q.desc}</span>
                    <span className="text-[10px] font-semibold text-slate-500 group-hover:text-indigo-300 mt-4 flex items-center gap-1">
                      Run query <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="space-y-4 max-w-4xl mx-auto">
            {msg.role === "user" ? (
              <div className="flex justify-end animate-in slide-in-from-right-4 duration-200">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-sans px-4 py-3 text-sm font-medium shadow-lg shadow-indigo-950/30">
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                </div>
              </div>
            ) : (
              <div className="flex justify-start animate-in slide-in-from-left-4 duration-200">
                <div className="flex gap-3 max-w-[85%] w-full">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 space-y-2">
                    {msg.content && renderMessageContent(msg.content)}
                  </div>
                </div>
              </div>
            )}

            {msg.role === "agent" && msg.toolCards.length > 0 && (
              <div className="pl-10 space-y-3">
                {msg.toolCards.map((card, ci) => renderToolCard(card, ci))}
              </div>
            )}
          </div>
        ))}

        {/* Streaming agent response (live) */}
        {isLoading && (streamingText || streamingCards.length > 0) && (
          <div className="space-y-4 max-w-4xl mx-auto">
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-[85%] w-full">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                  <Cpu className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "3s" }} />
                </div>
                <div className="flex-1 space-y-2">
                  {streamingText && renderMessageContent(streamingText)}
                </div>
              </div>
            </div>
            {streamingCards.length > 0 && (
              <div className="pl-10 space-y-3">
                {streamingCards.map((card, ci) => renderToolCard(card, ci))}
              </div>
            )}
          </div>
        )}

        {/* Loading beacon when no streaming content yet */}
        {isLoading && !streamingText && streamingCards.length === 0 && (
          <div className="flex justify-start max-w-4xl mx-auto">
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                <Cpu className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "3s" }} />
              </div>
              <div className="bg-slate-900/60 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-slate-400 font-semibold shadow-md flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span>Agent is processing safety operations...</span>
              </div>
            </div>
          </div>
        )}

        {pendingApproval && (
          <div className="max-w-4xl mx-auto pl-10">
            <ApprovalCard
              actionId={(pendingApproval.action_id as string) || ""}
              actionType={(pendingApproval.action_type as string) || "unknown_action"}
              riskLevel={(pendingApproval.risk_level as RiskLevel) || "high"}
              riskScore={(pendingApproval.risk_score as number) || 0}
              collection={(pendingApproval.collection as string) || ""}
              documentId={(pendingApproval.document_id as string) || ""}
              fieldChanges={(pendingApproval.field_changes as FieldChange[]) || []}
              businessImpact={(pendingApproval.business_impact as string[]) || []}
              blastRadiusSummary={(pendingApproval.blast_radius_summary as string) || ""}
              checkpointId={(pendingApproval.checkpoint_id as string) || ""}
              onApprove={handleApprove}
              onReject={handleReject}
              disabled={isLoading}
            />
          </div>
        )}
      </div>

        <div className="border-t border-white/5 p-4 bg-slate-950/20 backdrop-blur-md">
          <div className="flex gap-3 items-end max-w-4xl mx-auto relative group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Instruct your safety-enabled support agent (e.g., 'Cancel NovaTech Solutions professional tier')..."
              rows={1}
              aria-label="Message to agent"
              className="flex-1 resize-none rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner scrollbar-thin"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-950/20 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

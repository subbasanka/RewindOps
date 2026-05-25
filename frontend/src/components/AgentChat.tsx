"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage, RiskLevel, FieldChange } from "@/lib/types";
import { sendAgentMessage, createSession } from "@/lib/api";
import { ApprovalCard } from "./ApprovalCard";
import { BlastRadiusCard } from "./BlastRadiusCard";
import { ExecutionReceipt } from "./ExecutionReceipt";
import { RollbackResult } from "./RollbackResult";
import { RiskBadge } from "./RiskBadge";
import { Send, Cpu, Terminal, Sparkles, MessageSquare, AlertCircle, ArrowRight, CreditCard, Shield, Calendar, Award, User, Layers, Info } from "lucide-react";

interface ToolCard {
  type: "risk" | "blast_radius" | "approval" | "execution" | "rollback";
  data: Record<string, unknown>;
}

interface ParsedMessage {
  text: string;
  safetyFilters: string[];
  structuredCard: {
    title: string;
    fields: { label: string; value: string }[];
  } | null;
}

function parseMessageContent(content: string): ParsedMessage {
  const lines = content.split("\n");
  const safetyFilters: string[] = [];
  const textLines: string[] = [];
  const fields: { label: string; value: string }[] = [];
  let possibleTitle = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (fields.length === 0) {
        textLines.push(line);
      }
      continue;
    }

    // 1. Detect safety filter calls
    const filterMatch = trimmed.match(/^\[Calling safety filter:\s*(.*?)\.\.\.\]$/i);
    if (filterMatch) {
      safetyFilters.push(filterMatch[1]);
      continue;
    }

    // 2. Detect key-value fields
    // Handles formats like: * **Label:** Value or **Label**: Value
    const fieldMatch = trimmed.match(/^[*-\s]*\*\*(.*?)\*\*[:\s]+(.*)/);
    if (fieldMatch) {
      fields.push({
        label: fieldMatch[1].trim(),
        value: fieldMatch[2].trim(),
      });
      continue;
    }

    // If it's not a safety filter or field:
    if (fields.length === 0) {
      textLines.push(line);
      possibleTitle = trimmed; // Keep track of the last line of text as the title
    } else {
      textLines.push(line);
    }
  }

  let cardTitle = "Structured Details";
  if (fields.length > 0 && possibleTitle) {
    cardTitle = possibleTitle.replace(/[:：]$/, ""); // remove trailing colon
    const titleIdx = textLines.lastIndexOf(possibleTitle);
    if (titleIdx !== -1) {
      textLines.splice(titleIdx, 1);
    }
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

const renderStructuredCard = (card: { title: string; fields: { label: string; value: string }[] }) => {
  return (
    <div className="mt-3 p-4 rounded-xl border border-white/5 bg-slate-950/40 backdrop-blur-md shadow-inner space-y-3 max-w-full">
      <div className="text-[11px] font-bold tracking-wider text-slate-400 uppercase border-b border-white/5 pb-2">
        {card.title}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {card.fields.map((f, i) => {
          const isStatus = f.label.toLowerCase().includes("status");
          const isActive = f.value.toLowerCase() === "active";
          const isCancelled = f.value.toLowerCase().includes("cancel");
          const isAmount = f.label.toLowerCase().includes("amount") || f.label.toLowerCase().includes("price");

          return (
            <div key={i} className="flex flex-col space-y-1 bg-slate-900/35 border border-white/[0.02] p-2.5 rounded-lg">
              <span className="text-[10px] font-bold tracking-wide text-slate-500 uppercase flex items-center gap-1.5">
                {getFieldIcon(f.label)}
                {f.label}
              </span>
              {isStatus ? (
                <div className="flex items-center">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-extrabold uppercase border ${
                    isActive 
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                      : isCancelled
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-400 animate-pulse" : isCancelled ? "bg-rose-400" : "bg-slate-400"}`} />
                    {f.value}
                  </span>
                </div>
              ) : isAmount ? (
                <span className="text-xs font-bold text-emerald-400 font-mono">
                  {f.value}
                </span>
              ) : (
                <span className="text-xs font-semibold text-slate-200">
                  {f.value}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [pendingApproval, setPendingApproval] = useState<Record<string, unknown> | null>(null);
  const [toolCards, setToolCards] = useState<ToolCard[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createSession().then(setSessionId);
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, toolCards]);

  const addMessage = useCallback(
    (role: "user" | "agent", content: string) => {
      const msg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role,
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    []
  );

  const handleSend = async (overrideMessage?: string) => {
    const text = overrideMessage || input.trim();
    if (!text || isLoading) return;

    if (!overrideMessage) setInput("");
    addMessage("user", text);
    setIsLoading(true);
    setPendingApproval(null);

    try {
      const response = await sendAgentMessage(text, sessionId);

      if (!response.ok) {
        addMessage("agent", `Error: ${response.statusText}`);
        setIsLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        addMessage("agent", "Error: No response stream");
        setIsLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let agentText = "";
      let buffer = "";
      const newCards: ToolCard[] = [];

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
              continue;
            }
            const content = event?.content;
            if (!content?.parts) continue;

            for (const part of content.parts) {
              if (part.text) {
                agentText += part.text;
              }

              if (part.functionCall) {
                const fn = part.functionCall;
                agentText += `\n[Calling safety filter: ${fn.name}...]\n`;
              }

              if (part.functionResponse) {
                const resp = part.functionResponse.response;
                if (typeof resp !== "object" || resp === null) continue;

                const status = resp.status as string;
                if (status === "classified" || status === "blocked") {
                  newCards.push({ type: "risk", data: resp as Record<string, unknown> });
                }
                if (status === "preview_ready") {
                  newCards.push({ type: "blast_radius", data: resp as Record<string, unknown> });
                }
                if (status === "awaiting_approval") {
                  newCards.push({ type: "approval", data: resp as Record<string, unknown> });
                  setPendingApproval(resp as Record<string, unknown>);
                }
                if (status === "executed") {
                  newCards.push({ type: "execution", data: resp as Record<string, unknown> });
                }
                if (status === "rolled_back") {
                  newCards.push({ type: "rollback", data: resp as Record<string, unknown> });
                }
              }
            }
          } catch {
            // skip unparseable SSE lines
          }
        }
      }

      if (newCards.length > 0) {
        setToolCards((prev) => [...prev, ...newCards]);
      }
      if (agentText.trim()) {
        addMessage("agent", agentText.trim());
      }
    } catch (error) {
      addMessage(
        "agent",
        `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      setIsLoading(false);
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
                <RiskBadge
                  level={(d.risk_level as RiskLevel) || "low"}
                  score={d.score as number}
                />
              </div>
              {d.decision === "BLOCK" && (
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded">
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
                Interceptors: Approval {d.approval_required ? "🟢 Required" : "⚪ Skip"}
                {" | "}Checkpoint {d.checkpoint_required ? "🟢 Active" : "⚪ Skip"}
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
                riskLevel={"high"}
                riskScore={0}
                riskReasons={[]}
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
        return null; // rendered separately as pendingApproval

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

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Messages Scroll Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-6">
        {messages.length === 0 && toolCards.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[80%] max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom duration-300">
            
            {/* Branding Shield Logo */}
            <div className="relative flex flex-col items-center text-center space-y-4">
              <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 shadow-xl shadow-indigo-950/20 text-indigo-400">
                <Sparkles className="w-8 h-8 animate-soft-pulse" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold tracking-tight text-white font-sans">
                  RewindOps Agent Console
                </h2>
                <p className="text-sm text-slate-400 max-w-sm">
                  Autonomous billing transactions with perfect rollback guarantees and state-safety policies.
                </p>
              </div>
            </div>

            {/* Starter Queries Grid */}
            <div className="w-full space-y-3">
              <span className="text-[10px] uppercase tracking-widest font-extrabold text-slate-500 block text-center">
                Select a demo flow to begin
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {starterQueries.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(q.prompt)}
                    className="flex flex-col text-left p-4 rounded-xl border border-white/5 bg-slate-950/30 hover:bg-slate-900/40 hover:border-indigo-500/30 transition-all duration-200 group active:scale-[0.98] shadow-lg shadow-black/20"
                  >
                    <span className="text-xs font-bold text-white group-hover:text-indigo-400 flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {q.title}
                    </span>
                    <span className="text-[11px] text-slate-400 leading-relaxed mt-2 flex-grow">
                      {q.desc}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 group-hover:text-indigo-300 mt-4 flex items-center gap-1">
                      Run query <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, msgIdx) => (
          <div key={msg.id} className="space-y-4 max-w-4xl mx-auto">
            {/* User message balloon */}
            {msg.role === "user" ? (
              <div className="flex justify-end animate-in slide-in-from-right-4 duration-200">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-sans px-4 py-3 text-sm font-medium shadow-lg shadow-indigo-950/30">
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                </div>
              </div>
            ) : (
              /* Agent message balloon */
              <div className="flex justify-start animate-in slide-in-from-left-4 duration-200">
                <div className="flex gap-3 max-w-[85%] w-full">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 space-y-2">
                    {(() => {
                      const parsed = parseMessageContent(msg.content);
                      const showBubble = parsed.text || parsed.safetyFilters.length > 0;
                      return (
                        <>
                          {showBubble && (
                            <div className="rounded-2xl rounded-tl-sm bg-slate-900/60 border border-white/5 text-slate-100 px-4 py-3 text-sm leading-relaxed shadow-lg backdrop-blur-sm space-y-2">
                              {parsed.text && (
                                <div className="whitespace-pre-wrap break-words">{parsed.text}</div>
                              )}
                              {parsed.safetyFilters.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-white/5">
                                  {parsed.safetyFilters.map((filter, fi) => (
                                    <div key={fi} className="inline-flex items-center gap-1.5 bg-indigo-500/5 border border-indigo-500/15 px-2.5 py-1 rounded-full text-[10px] font-bold text-indigo-400">
                                      <Terminal className="w-3 h-3 text-indigo-400 animate-pulse" />
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
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Render tool cards associated with this agent response block */}
            {msg.role === "agent" && (
              <div className="pl-10 space-y-3">
                {toolCards
                  .filter((_, ci) => {
                    const agentMsgCount = messages
                      .slice(0, msgIdx + 1)
                      .filter((m) => m.role === "agent").length;
                    const cardsPerMsg = Math.ceil(
                      toolCards.length /
                        Math.max(messages.filter((m) => m.role === "agent").length, 1)
                    );
                    const start = (agentMsgCount - 1) * cardsPerMsg;
                    const end = agentMsgCount * cardsPerMsg;
                    return ci >= start && ci < end;
                  })
                  .map((card, ci) => renderToolCard(card, ci))}
              </div>
            )}
          </div>
        ))}

        {/* Floating human pending approval gate card */}
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

        {/* Loading Agent Think Beacon */}
        {isLoading && (
          <div className="flex justify-start max-w-4xl mx-auto animate-pulse">
            <div className="flex gap-3">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                <Cpu className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <div className="bg-slate-900/60 border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-slate-400 font-semibold shadow-md flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                </span>
                <span>Gemini is planning safety operations...</span>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Input Deck */}
      <div className="border-t border-white/5 p-4 bg-slate-950/20 backdrop-blur-md">
        <div className="flex gap-3 items-end max-w-4xl mx-auto relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Instruct your safety-enabled support agent (e.g., 'Cancel NovaTech Solutions professional tier')..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner scrollbar-thin"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-lg shadow-indigo-950/20 hover:scale-[1.03] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  listRemoteProjects,
  listOperatorConversations,
  createOperatorConversation,
  listOperatorMessages,
  listOperatorRuns,
  createOperatorRun,
  appendOperatorMessage,
  setOperatorRunStatus,
  subscribeToOperatorMessages,
  subscribeToOperatorRuns,
  type RemoteProject,
  type OperatorConversation,
  type OperatorMessage,
  type OperatorRun,
} from "../storage/db";
import "./OperatorAssistant.css";

// The operator's in-dashboard coding assistant. Super-admin only (OperatorAssistantRoute
// guards it). The operator picks a project (repo the local agent has discovered), types a
// task, and the agent runs headless Claude on it — streaming the transcript here and stopping
// with a proposed diff. Nothing is committed or pushed until the operator approves. See
// operator-control-plane.md and migration 0025_operator_assistant.

const AGENT_ONLINE_MS = 10 * 60 * 1000;

const MODEL_OPTIONS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 — default" },
  { id: "claude-fable-5", label: "Fable 5 — hard mode (2× cost)" },
];
const EFFORT_OPTIONS = ["high", "xhigh", "max", "medium", "low"];

const RUN_LABEL: Record<OperatorRun["status"], string> = {
  pending: "Queued for the agent…",
  running: "Claude is working…",
  awaiting_approval: "Ready for your review",
  approved: "Approved — deploying…",
  deploying: "Committing and pushing…",
  deployed: "Deployed ✓",
  discarded: "Discarded",
  error: "Error",
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function upsertById<T extends { id: string; createdAt: number }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  const next = i === -1 ? [...list, item] : list.map((x) => (x.id === item.id ? item : x));
  return next.sort((a, b) => a.createdAt - b.createdAt);
}

export function OperatorAssistant() {
  const [projects, setProjects] = useState<RemoteProject[] | null>(null);
  const [conversations, setConversations] = useState<OperatorConversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OperatorMessage[]>([]);
  const [runs, setRuns] = useState<OperatorRun[]>([]);
  const [newProjectId, setNewProjectId] = useState<string>("");
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0].id);
  const [effort, setEffort] = useState("high");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Initial load: projects + conversations.
  useEffect(() => {
    void (async () => {
      try {
        const [projs, convs] = await Promise.all([listRemoteProjects(), listOperatorConversations()]);
        setProjects(projs);
        setConversations(convs);
        setActiveId((cur) => cur ?? convs[0]?.id ?? null);
        setNewProjectId((cur) => cur || projs[0]?.id || "");
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, []);

  // Load + subscribe to the active conversation's transcript and runs.
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setRuns([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [msgs, rns] = await Promise.all([listOperatorMessages(activeId), listOperatorRuns(activeId)]);
        if (!cancelled) {
          setMessages(msgs);
          setRuns(rns);
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    const unsubMsgs = subscribeToOperatorMessages(activeId, (m) => setMessages((cur) => upsertById(cur, m)));
    const unsubRuns = subscribeToOperatorRuns(activeId, (r) => setRuns((cur) => upsertById(cur, r)));
    return () => {
      cancelled = true;
      unsubMsgs();
      unsubRuns();
    };
  }, [activeId]);

  // Keep the transcript pinned to the newest message.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, runs]);

  const activeConv = useMemo(
    () => conversations?.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const activeRun = runs.length > 0 ? runs[runs.length - 1] : null;
  const projectId = activeConv ? activeConv.projectId : newProjectId;
  const project = projects?.find((p) => p.id === projectId) ?? null;
  const agentOnline = project ? project.lastSeen > Date.now() - AGENT_ONLINE_MS : false;
  const runBusy =
    activeRun != null &&
    ["pending", "running", "approved", "deploying"].includes(activeRun.status);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    if (!projectId) {
      setError("Pick a project first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      let conv = activeConv;
      if (!conv) {
        conv = await createOperatorConversation(projectId, text.slice(0, 60));
        setConversations((cur) => [conv as OperatorConversation, ...(cur ?? [])]);
        setActiveId(conv.id);
      }
      const run = await createOperatorRun({ conversationId: conv.id, projectId, prompt: text, model, effort });
      const userMsg = await appendOperatorMessage({
        conversationId: conv.id,
        runId: run.id,
        kind: "user",
        content: text,
      });
      setRuns((cur) => upsertById(cur, run));
      setMessages((cur) => upsertById(cur, userMsg));
      setInput("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function decide(status: "approved" | "discarded") {
    if (!activeRun) return;
    setError(null);
    try {
      await setOperatorRunStatus(activeRun.id, status);
      setRuns((cur) => upsertById(cur, { ...activeRun, status }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function startNew() {
    setActiveId(null);
    setInput("");
    setError(null);
    setNewProjectId((cur) => cur || projects?.[0]?.id || "");
  }

  return (
    <div className="op-assistant">
      <aside className="opa-sidebar">
        <div className="opa-sidebar-head">
          <span className="opa-sidebar-title">Assistant</span>
          <button className="opa-new-btn" onClick={startNew}>
            + New
          </button>
        </div>
        <Link to="/dashboard/operator" className="opa-back">
          ← Tenants
        </Link>
        <ul className="opa-conv-list">
          {conversations === null ? (
            <li className="opa-conv-empty">Loading…</li>
          ) : conversations.length === 0 ? (
            <li className="opa-conv-empty">No conversations yet</li>
          ) : (
            conversations.map((c) => {
              const proj = projects?.find((p) => p.id === c.projectId);
              return (
                <li
                  key={c.id}
                  className={`opa-conv-item${c.id === activeId ? " active" : ""}`}
                  onClick={() => setActiveId(c.id)}
                >
                  <span className="opa-conv-title">{c.title}</span>
                  <span className="opa-conv-project">{proj?.name ?? c.projectId}</span>
                </li>
              );
            })
          )}
        </ul>
      </aside>

      <main className="opa-main">
        <header className="opa-main-head">
          <div className="opa-head-project">
            {project ? (
              <>
                <span className={`opa-dot${agentOnline ? " online" : ""}`} aria-hidden="true" />
                <span className="opa-project-name">{project.name}</span>
                <span className="opa-agent-state">{agentOnline ? "agent online" : "agent offline"}</span>
              </>
            ) : (
              <span className="opa-project-name">Personal Assistant</span>
            )}
          </div>
          {activeRun ? (
            <span className={`opa-status opa-status--${activeRun.status}`}>{RUN_LABEL[activeRun.status]}</span>
          ) : null}
        </header>

        {!agentOnline && project ? (
          <p className="opa-warn">
            The local agent for this project isn't running. Start it on your PC
            (<code>cd agent &amp;&amp; node agent.js</code>) — requests will queue and run once it's online.
          </p>
        ) : null}

        <div className="opa-transcript" ref={transcriptRef}>
          {!activeConv && messages.length === 0 ? (
            <div className="opa-placeholder">
              <p>Pick a project and describe a change. The agent edits it on your PC and shows you the diff before anything deploys.</p>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`opa-msg opa-msg--${m.kind}`}>
                {m.kind === "tool" ? <span className="opa-tool-dot">◦</span> : null}
                <span className="opa-msg-body">{m.content}</span>
              </div>
            ))
          )}

          {activeRun && activeRun.status === "awaiting_approval" && activeRun.diff ? (
            <div className="opa-review">
              {activeRun.summary ? <p className="opa-review-summary">{activeRun.summary}</p> : null}
              <DiffView diff={activeRun.diff} />
              <div className="opa-review-actions">
                <button className="opa-approve-btn" onClick={() => void decide("approved")}>
                  Approve &amp; deploy
                </button>
                <button className="opa-discard-btn" onClick={() => void decide("discarded")}>
                  Discard
                </button>
              </div>
              <p className="opa-review-note">Approving commits and pushes — this deploys live to Vercel.</p>
            </div>
          ) : null}
        </div>

        {error ? <p className="opa-error">{error}</p> : null}

        <div className="opa-composer">
          {!activeConv ? (
            <select
              className="opa-project-select"
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value)}
            >
              {projects === null ? (
                <option>Loading projects…</option>
              ) : projects.length === 0 ? (
                <option value="">No projects found — is the agent running?</option>
              ) : (
                projects.map((p) => {
                  const online = p.lastSeen > Date.now() - AGENT_ONLINE_MS;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {online ? "" : " (offline)"}
                    </option>
                  );
                })
              )}
            </select>
          ) : null}
          <textarea
            className="opa-input"
            value={input}
            placeholder={runBusy ? "The agent is working — you can queue the next task after it finishes." : "Describe the change you want…"}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="opa-composer-controls">
            <select className="opa-mini-select" value={model} onChange={(e) => setModel(e.target.value)}>
              {MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select className="opa-mini-select" value={effort} onChange={(e) => setEffort(e.target.value)}>
              {EFFORT_OPTIONS.map((e) => (
                <option key={e} value={e}>
                  effort: {e}
                </option>
              ))}
            </select>
            <button className="opa-send-btn" disabled={sending || !input.trim()} onClick={() => void send()}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// Renders a unified diff with +/- line coloring. Read-only.
function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="opa-diff">
      {lines.map((line, i) => {
        let cls = "opa-diff-line";
        if (line.startsWith("+") && !line.startsWith("+++")) cls += " add";
        else if (line.startsWith("-") && !line.startsWith("---")) cls += " del";
        else if (line.startsWith("@@")) cls += " hunk";
        else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")) cls += " meta";
        return (
          <span key={i} className={cls}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

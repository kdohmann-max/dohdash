import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  listRemoteProjects,
  createRemoteSession,
  subscribeToRemoteSession,
  type RemoteProject,
  type RemoteSession,
} from "../../storage/db";
import "./RemoteClaudeApp.css";

const AGENT_ONLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function agentIsOnline(projects: RemoteProject[]): boolean {
  if (projects.length === 0) return false;
  const latest = Math.max(...projects.map((p) => p.lastSeen));
  return Date.now() - latest < AGENT_ONLINE_THRESHOLD_MS;
}

type View = "pick" | "status";

export function RemoteClaudeApp() {
  const { state } = useAuth();
  const userId = state.status === "authenticated" ? state.profile.id : "";

  const [projects, setProjects] = useState<RemoteProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>("pick");
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    listRemoteProjects()
      .then(setProjects)
      .finally(() => setLoadingProjects(false));
  }, []);

  useEffect(() => {
    if (!session) return;
    const unsub = subscribeToRemoteSession(session.id, (updated) => {
      setSession(updated);
    });
    return unsub;
  }, [session?.id]);

  async function handleStart() {
    if (!selected || !userId) return;
    setStarting(true);
    setStartError(null);
    try {
      const s = await createRemoteSession(userId, selected);
      setSession(s);
      setView("status");
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Failed to start session");
    } finally {
      setStarting(false);
    }
  }

  function handleReset() {
    setSession(null);
    setSelected(null);
    setStartError(null);
    setView("pick");
  }

  const online = agentIsOnline(projects);
  const selectedProject = projects.find((p) => p.id === selected);

  return (
    <div className="remote-claude-app">
      <div className="rca-header">
        <div className="rca-title-row">
          <h1 className="rca-title">Remote Claude</h1>
          <span className={`rca-agent-badge ${online ? "rca-agent-badge--online" : "rca-agent-badge--offline"}`}>
            <span className="rca-agent-dot" />
            {online ? "Agent online" : "Agent offline"}
          </span>
        </div>
        <p className="rca-subtitle">
          Pick a project on your PC to open in VS Code and start a Claude Code session.
        </p>
      </div>

      {view === "pick" && (
        <div className="rca-pick">
          {loadingProjects ? (
            <div className="rca-empty">Loading projects…</div>
          ) : projects.length === 0 ? (
            <div className="rca-empty">
              <strong>No projects found.</strong>
              <span>Make sure the agent is running on your PC — it will sync your Ai folder automatically.</span>
            </div>
          ) : (
            <div className="rca-project-grid">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={`rca-project-card ${selected === p.id ? "rca-project-card--selected" : ""}`}
                  onClick={() => setSelected(p.id)}
                >
                  <span className="rca-project-name">{p.name}</span>
                  <span className="rca-project-path">{p.path}</span>
                </button>
              ))}
            </div>
          )}

          {startError && <div className="rca-error">{startError}</div>}

          <div className="rca-actions">
            <button
              className="rca-btn-primary"
              disabled={!selected || starting || !online}
              onClick={handleStart}
            >
              {starting ? "Starting…" : "Start Session"}
            </button>
            {!online && (
              <span className="rca-hint">Agent must be running on your PC to start a session.</span>
            )}
          </div>
        </div>
      )}

      {view === "status" && session && (
        <div className="rca-status">
          <div className="rca-status-card">
            <div className="rca-status-project">{selectedProject?.name ?? session.projectId}</div>
            <StatusIndicator session={session} />
          </div>
          <button className="rca-btn-secondary" onClick={handleReset}>
            Start Another Session
          </button>
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ session }: { session: RemoteSession }) {
  const steps: { key: RemoteSession["status"]; label: string }[] = [
    { key: "pending", label: "Sending request to PC" },
    { key: "starting", label: "Opening VS Code" },
    { key: "running", label: "Claude session started" },
  ];

  if (session.status === "error") {
    return (
      <div className="rca-status-error">
        <span className="rca-status-icon rca-status-icon--error">✕</span>
        <span>{session.errorMessage ?? "Something went wrong on the PC"}</span>
      </div>
    );
  }

  const currentIndex = steps.findIndex((s) => s.key === session.status);

  return (
    <div className="rca-steps">
      {steps.map((step, i) => {
        const done = i < currentIndex || session.status === "running";
        const active = i === currentIndex && session.status !== "running";
        return (
          <div key={step.key} className={`rca-step ${done ? "rca-step--done" : ""} ${active ? "rca-step--active" : ""}`}>
            <span className="rca-step-dot" />
            <span className="rca-step-label">{step.label}</span>
          </div>
        );
      })}
      {session.status === "running" && (
        <div className="rca-running-hint">
          Open the Claude app on your phone to connect to this session.
        </div>
      )}
    </div>
  );
}

import { supabase } from "./client";

// ---- remote claude (see migration 0014_remote_claude) ----

export interface RemoteProject {
  id: string;
  name: string;
  path: string;
  lastSeen: number;
}

export type RemoteSessionStatus = "pending" | "starting" | "running" | "error";

export interface RemoteSession {
  id: string;
  userId: string;
  projectId: string;
  status: RemoteSessionStatus;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
}

interface RemoteProjectRow {
  id: string;
  name: string;
  path: string;
  last_seen: number;
}

interface RemoteSessionRow {
  id: string;
  user_id: string;
  project_id: string;
  status: RemoteSessionStatus;
  error_message: string | null;
  created_at: number;
  started_at: number | null;
}

function remoteProjectRowToProject(row: RemoteProjectRow): RemoteProject {
  return { id: row.id, name: row.name, path: row.path, lastSeen: row.last_seen };
}

function remoteSessionRowToSession(row: RemoteSessionRow): RemoteSession {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
  };
}

export async function listRemoteProjects(): Promise<RemoteProject[]> {
  const { data, error } = await supabase
    .from("remote_projects")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as RemoteProjectRow[]).map(remoteProjectRowToProject);
}

export async function createRemoteSession(userId: string, projectId: string): Promise<RemoteSession> {
  const { data, error } = await supabase
    .from("remote_sessions")
    .insert({ user_id: userId, project_id: projectId, created_at: Date.now() })
    .select()
    .single();
  if (error) throw error;
  return remoteSessionRowToSession(data as RemoteSessionRow);
}

export function subscribeToRemoteSession(
  sessionId: string,
  onUpdate: (session: RemoteSession) => void,
): () => void {
  const channel = supabase
    .channel(`remote-session:${sessionId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "remote_sessions", filter: `id=eq.${sessionId}` },
      (payload) => onUpdate(remoteSessionRowToSession(payload.new as RemoteSessionRow)),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

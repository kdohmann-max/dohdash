import { supabase } from "./client";

// ---- Operator assistant (see migration 0025_operator_assistant) ----
//
// The platform operator's private in-dashboard coding assistant. Super-admin only
// (gated server-side by the is_super_admin() RLS on these tables). The dashboard
// INSERTs a pending run; the local agent (service role) claims it, streams the
// transcript back, and the operator approves before anything is committed/pushed.
// No tenant_id — operator-global, zero tenant crossover. See operator-control-plane.md.

export interface OperatorConversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type OperatorRunStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "deploying"
  | "deployed"
  | "discarded"
  | "error";

export interface OperatorRun {
  id: string;
  conversationId: string;
  projectId: string;
  prompt: string;
  status: OperatorRunStatus;
  model: string;
  effort: string;
  branch: string | null;
  diff: string | null;
  summary: string | null;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export type OperatorMessageKind = "user" | "assistant" | "tool" | "status" | "error";

export interface OperatorMessage {
  id: string;
  conversationId: string;
  runId: string | null;
  kind: OperatorMessageKind;
  content: string;
  createdAt: number;
}

interface OperatorConversationRow {
  id: string;
  project_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

interface OperatorRunRow {
  id: string;
  conversation_id: string;
  project_id: string;
  prompt: string;
  status: OperatorRunStatus;
  model: string;
  effort: string;
  branch: string | null;
  diff: string | null;
  summary: string | null;
  error_message: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

interface OperatorMessageRow {
  id: string;
  conversation_id: string;
  run_id: string | null;
  kind: OperatorMessageKind;
  content: string;
  created_at: number;
}

function conversationRowToConversation(row: OperatorConversationRow): OperatorConversation {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function runRowToRun(row: OperatorRunRow): OperatorRun {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    projectId: row.project_id,
    prompt: row.prompt,
    status: row.status,
    model: row.model,
    effort: row.effort,
    branch: row.branch,
    diff: row.diff,
    summary: row.summary,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function messageRowToMessage(row: OperatorMessageRow): OperatorMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    runId: row.run_id,
    kind: row.kind,
    content: row.content,
    createdAt: row.created_at,
  };
}

// ---- Conversations ----

export async function listOperatorConversations(): Promise<OperatorConversation[]> {
  const { data, error } = await supabase
    .from("operator_conversations")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as OperatorConversationRow[]).map(conversationRowToConversation);
}

export async function createOperatorConversation(
  projectId: string,
  title = "New conversation",
): Promise<OperatorConversation> {
  const now = Date.now();
  const { data, error } = await supabase
    .from("operator_conversations")
    .insert({ project_id: projectId, title, created_at: now, updated_at: now })
    .select()
    .single();
  if (error) throw error;
  return conversationRowToConversation(data as OperatorConversationRow);
}

export async function renameOperatorConversation(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("operator_conversations")
    .update({ title, updated_at: Date.now() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteOperatorConversation(id: string): Promise<void> {
  // Cascades to runs + messages (FK on delete cascade).
  const { error } = await supabase.from("operator_conversations").delete().eq("id", id);
  if (error) throw error;
}

// ---- Runs ----

export async function listOperatorRuns(conversationId: string): Promise<OperatorRun[]> {
  const { data, error } = await supabase
    .from("operator_runs")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as OperatorRunRow[]).map(runRowToRun);
}

// Queue a run for the local agent to claim, and touch the conversation so it
// floats to the top of the list. The agent polls for status='pending'.
export async function createOperatorRun(input: {
  conversationId: string;
  projectId: string;
  prompt: string;
  model: string;
  effort: string;
}): Promise<OperatorRun> {
  const { data, error } = await supabase
    .from("operator_runs")
    .insert({
      conversation_id: input.conversationId,
      project_id: input.projectId,
      prompt: input.prompt,
      model: input.model,
      effort: input.effort,
      created_at: Date.now(),
    })
    .select()
    .single();
  if (error) throw error;
  await supabase
    .from("operator_conversations")
    .update({ updated_at: Date.now() })
    .eq("id", input.conversationId);
  return runRowToRun(data as OperatorRunRow);
}

// Operator decisions on an awaiting_approval run: 'approved' (agent commits +
// pushes -> deploys) or 'discarded' (agent resets the branch). The agent watches
// for these transitions.
export async function setOperatorRunStatus(id: string, status: OperatorRunStatus): Promise<void> {
  const { error } = await supabase.from("operator_runs").update({ status }).eq("id", id);
  if (error) throw error;
}

// ---- Messages (transcript) ----

export async function listOperatorMessages(conversationId: string): Promise<OperatorMessage[]> {
  const { data, error } = await supabase
    .from("operator_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as OperatorMessageRow[]).map(messageRowToMessage);
}

// The operator's kickoff 'user' message. The agent inserts assistant/tool/status
// rows itself (service role), so the dashboard only ever appends 'user' rows.
export async function appendOperatorMessage(input: {
  conversationId: string;
  runId: string | null;
  kind: OperatorMessageKind;
  content: string;
}): Promise<OperatorMessage> {
  const { data, error } = await supabase
    .from("operator_messages")
    .insert({
      conversation_id: input.conversationId,
      run_id: input.runId,
      kind: input.kind,
      content: input.content,
      created_at: Date.now(),
    })
    .select()
    .single();
  if (error) throw error;
  return messageRowToMessage(data as OperatorMessageRow);
}

// ---- Realtime (mirrors subscribeToRemoteSession in remote.ts) ----

// New transcript rows as the agent streams them.
export function subscribeToOperatorMessages(
  conversationId: string,
  onInsert: (message: OperatorMessage) => void,
): () => void {
  const channel = supabase
    .channel(`operator-messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "operator_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(messageRowToMessage(payload.new as OperatorMessageRow)),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Run status/diff/summary changes (status transitions, diff arriving at
// awaiting_approval, errors). "*" catches both the agent's UPDATEs and any new run.
export function subscribeToOperatorRuns(
  conversationId: string,
  onChange: (run: OperatorRun) => void,
): () => void {
  const channel = supabase
    .channel(`operator-runs:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "operator_runs",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onChange(runRowToRun(payload.new as OperatorRunRow)),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

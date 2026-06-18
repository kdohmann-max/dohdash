/**
 * Remote Claude Agent — Windows
 *
 * Setup:
 *   1. cd agent && npm install
 *   2. Copy .env.example to .env and fill in your values
 *   3. node agent.js
 *
 * To auto-start on login: add a shortcut to this script in
 *   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
 *   pointing to: cmd /k "cd /d C:\path\to\DohDash\agent && node agent.js"
 *
 * Environment variables (set in agent/.env or Windows environment):
 *   SUPABASE_URL            — from Supabase project settings
 *   SUPABASE_SERVICE_KEY    — service role key (bypasses RLS so agent can write)
 *   AI_FOLDER               — path to scan for projects (default: ~/iCloudDrive/Ai)
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const AI_FOLDER = process.env.AI_FOLDER || path.join(os.homedir(), "iCloudDrive", "Ai");
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // re-scan every 5 minutes
const POLL_INTERVAL_MS = 4 * 1000; // poll for pending sessions every 4 seconds

// Track sessions we've already started handling so the Realtime event and the
// polling fallback don't both process the same row.
const handled = new Set();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — check agent/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// Pre-trust a project path in ~/.claude.json so Claude Code never shows the
// "trust this folder?" prompt for agent-launched sessions.
function trustProject(projectPath) {
  const claudeJson = path.join(os.homedir(), ".claude.json");
  try {
    const raw = fs.existsSync(claudeJson) ? fs.readFileSync(claudeJson, "utf8") : "{}";
    const data = JSON.parse(raw);
    if (!data.projects) data.projects = {};
    const normalized = projectPath.replace(/\\/g, "/");
    for (const key of [normalized.replace(/^C:/, "c:"), normalized.replace(/^c:/, "C:")]) {
      if (!data.projects[key]) data.projects[key] = {};
      data.projects[key].hasTrustDialogAccepted = true;
    }
    fs.writeFileSync(claudeJson, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Could not pre-trust project:", e.message);
  }
}

// Scan AI_FOLDER for subdirectories that look like dev projects.
function discoverProjects() {
  let entries;
  try {
    entries = fs.readdirSync(AI_FOLDER, { withFileTypes: true });
  } catch (e) {
    console.error(`Cannot read AI_FOLDER (${AI_FOLDER}):`, e.message);
    return [];
  }

  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(AI_FOLDER, entry.name);
    const isProject =
      fs.existsSync(path.join(fullPath, ".git")) ||
      fs.existsSync(path.join(fullPath, "CLAUDE.md")) ||
      fs.existsSync(path.join(fullPath, "package.json"));

    if (isProject) {
      trustProject(fullPath);
      projects.push({
        id: entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: entry.name,
        path: fullPath,
        last_seen: Date.now(),
      });
    }
  }
  return projects;
}

// Upsert the discovered project list so the web app always sees current state.
async function syncProjects() {
  const projects = discoverProjects();
  if (projects.length === 0) return;

  const { error } = await supabase
    .from("remote_projects")
    .upsert(projects, { onConflict: "id" });

  if (error) {
    console.error("Project sync failed:", error.message);
  } else {
    console.log(`[${new Date().toLocaleTimeString()}] Synced ${projects.length} projects`);
  }
}

// Write a VS Code "folder open" task so that opening this project automatically
// starts a Claude session in VS Code's integrated terminal — no separate window,
// no clicks. Works for any project; written fresh each launch so new projects
// (and updates to this command) are picked up automatically.
// Requires these VS Code USER settings (set once, see README/setup):
//   "task.allowAutomaticTasks": "on"          — run the task without prompting
//   "security.workspace.trust.enabled": false — skip the "trust this folder?" prompt
function ensureClaudeTask(projectPath) {
  const vscodeDir = path.join(projectPath, ".vscode");
  const tasks = {
    version: "2.0.0",
    tasks: [
      {
        label: "Remote Claude",
        type: "shell",
        command: "claude --dangerously-skip-permissions",
        presentation: { reveal: "always", panel: "dedicated", focus: true },
        runOptions: { runOn: "folderOpen" },
        problemMatcher: [],
      },
    ],
  };
  try {
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(path.join(vscodeDir, "tasks.json"), JSON.stringify(tasks, null, 2));
  } catch (e) {
    console.error("Could not write .vscode/tasks.json:", e.message);
  }
}

// Open VS Code on the project. The folder-open task above then starts Claude
// inside VS Code's integrated terminal automatically.
function launchSession(projectPath) {
  ensureClaudeTask(projectPath);
  exec(`code "${projectPath}"`, { shell: true }, (err) => {
    if (err) console.error("VS Code launch error:", err.message);
  });
}

// Handle a pending session row from the DB.
async function handleSession(session) {
  if (handled.has(session.id)) return; // already picked up (by Realtime or a prior poll)
  handled.add(session.id);
  console.log(`[${new Date().toLocaleTimeString()}] Session request: ${session.project_id}`);

  const projects = discoverProjects();
  const project = projects.find((p) => p.id === session.project_id);

  if (!project) {
    await supabase
      .from("remote_sessions")
      .update({ status: "error", error_message: `Project '${session.project_id}' not found on this machine` })
      .eq("id", session.id);
    return;
  }

  await supabase
    .from("remote_sessions")
    .update({ status: "starting", started_at: Date.now() })
    .eq("id", session.id);

  try {
    launchSession(project.path);

    // Brief delay, then mark running so the phone UI updates.
    setTimeout(async () => {
      await supabase
        .from("remote_sessions")
        .update({ status: "running" })
        .eq("id", session.id);
      console.log(`[${new Date().toLocaleTimeString()}] Running: ${project.name}`);
    }, 3000);
  } catch (e) {
    await supabase
      .from("remote_sessions")
      .update({ status: "error", error_message: e.message })
      .eq("id", session.id);
  }
}

// Fallback to Realtime: poll for any pending sessions and handle them. This
// makes the agent work even if Realtime isn't enabled on the table, and catches
// requests made while the agent was briefly down.
async function pollPendingSessions() {
  const { data, error } = await supabase
    .from("remote_sessions")
    .select("*")
    .eq("status", "pending");

  if (error) {
    console.error("Poll failed:", error.message);
    return;
  }
  for (const session of data || []) handleSession(session);
}

async function main() {
  console.log("Remote Claude Agent starting…");
  console.log(`Scanning: ${AI_FOLDER}`);

  await syncProjects();
  setInterval(syncProjects, SYNC_INTERVAL_MS);

  // Polling fallback — the reliable path. Runs regardless of Realtime status.
  await pollPendingSessions();
  setInterval(pollPendingSessions, POLL_INTERVAL_MS);
  console.log(`Polling for pending sessions every ${POLL_INTERVAL_MS / 1000}s`);

  // Realtime — instant pickup when it's working; the poll covers it when it's not.
  supabase
    .channel("remote-sessions-agent")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "remote_sessions" },
      (payload) => { if (payload.new.status === "pending") handleSession(payload.new); },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") console.log("Listening for session requests…");
    });
}

main().catch((e) => {
  console.error("Agent crashed:", e);
  process.exit(1);
});

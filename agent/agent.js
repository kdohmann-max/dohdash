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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY — check agent/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

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

// Open VS Code and a Claude Code terminal for the given project path.
function launchSession(projectPath) {
  exec(`code "${projectPath}"`, (err) => {
    if (err) console.error("VS Code launch error:", err.message);
  });

  // Open a new cmd window in the project directory running `claude`.
  // Type /remote inside Claude to expose the session to the Claude mobile app.
  exec(`start "" cmd /k "cd /d "${projectPath}" && claude"`, { shell: true }, (err) => {
    if (err) console.error("Claude launch error:", err.message);
  });
}

// Handle a pending session row from the DB.
async function handleSession(session) {
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

async function main() {
  console.log("Remote Claude Agent starting…");
  console.log(`Scanning: ${AI_FOLDER}`);

  await syncProjects();
  setInterval(syncProjects, SYNC_INTERVAL_MS);

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

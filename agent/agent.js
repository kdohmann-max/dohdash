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
 *   AGENT_TENANT_SLUG       — tenant these projects belong to (default: built)
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { exec, spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const AI_FOLDER = process.env.AI_FOLDER || path.join(os.homedir(), "iCloudDrive", "Ai");
// Which tenant this agent's projects belong to. DohDash is multi-tenant, so
// remote_projects.tenant_id is NOT NULL; the agent uses the service role (RLS
// bypassed) and thus must stamp tenant_id itself. Defaults to Doh Built.
const AGENT_TENANT_SLUG = process.env.AGENT_TENANT_SLUG || "built";
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

// Resolved once and cached: the tenant id for AGENT_TENANT_SLUG, stamped onto
// every remote_projects upsert (NOT NULL since the multi-tenancy migration).
let tenantId = null;
async function resolveTenantId() {
  if (tenantId) return tenantId;
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", AGENT_TENANT_SLUG)
    .single();
  if (error || !data) {
    console.error(`Cannot resolve tenant '${AGENT_TENANT_SLUG}':`, error ? error.message : "no row");
    return null;
  }
  tenantId = data.id;
  return tenantId;
}

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

  const tid = await resolveTenantId();
  if (!tid) {
    console.error("Project sync skipped: tenant id unresolved.");
    return;
  }
  for (const p of projects) p.tenant_id = tid;

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

// ---- Operator assistant (see migration 0025_operator_assistant) ----
//
// The operator triggers a headless Claude coding run from the DohDash dashboard.
// The run edits the working tree but NEVER commits or pushes — it streams its
// transcript back and stops with a proposed diff. The operator reviews and
// approves, at which point THIS agent commits + pushes (which auto-deploys to
// Vercel). Claude runs with bypassPermissions so it can run build/test commands
// to verify its own changes. The guardrails system prompt tells it not to push;
// the approval gate (diff review) is the real safety wall. Only this agent code
// calls git push, and only on explicit operator approval.

const OP_POLL_INTERVAL_MS = 4 * 1000;
const inFlightRuns = new Set(); // guards the async gap before a run's status flips
const OP_MODEL_RE = /^[a-z0-9.\-]+$/;
const OP_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const OP_GUARDRAILS =
  "You are the operator's in-dashboard coding assistant for this project. " +
  "Make the requested change by editing files. You may run build and test commands " +
  "(npm run build, tsc, npm test, etc.) to verify your work. " +
  "CRITICAL: Do NOT run any git command (git add, git commit, git push, git reset). " +
  "The operator reviews your diff and the agent handles all git operations. " +
  "If .claude/context/operator-journal.md exists, read it first for the operator's " +
  "goals and past decisions, and record any significant new decision there as part of your change.";

function git(projectPath, args) {
  return execSync(`git ${args}`, { cwd: projectPath, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// Creates a temp dir containing a git shim that blocks destructive operations
// (push, commit, reset --hard, clean). Prepend the returned dir to PATH in the
// Claude subprocess's env so its git calls hit the shim first. The agent's own
// git() calls use execSync directly and are unaffected.
// Falls back gracefully if shim creation fails — OP_GUARDRAILS still applies.
function createGitShim() {
  let realGit = "git";
  try {
    const lines = execSync(
      process.platform === "win32" ? "where.exe git" : "which git",
      { encoding: "utf8" }
    ).trim().split(/\r?\n/);
    realGit = lines[0].trim();
    // Prefer git.exe over git.cmd for the shim's internal spawnSync call
    if (process.platform === "win32" && realGit.toLowerCase().endsWith(".cmd")) {
      const exe = realGit.replace(/git\.cmd$/i, "git.exe").replace(/\\cmd\\/i, "\\bin\\");
      if (fs.existsSync(exe)) realGit = exe;
    }
  } catch (_) { /* use fallback */ }

  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), "op-git-shim-"));
  const jsPath = path.join(shimDir, "git-shim.js");

  const shimCode = [
    `const {spawnSync}=require("child_process");`,
    `const args=process.argv.slice(2);`,
    `const cmd=(args[0]||"").toLowerCase();`,
    `if(["push","commit","clean"].includes(cmd)||`,
    `   (cmd==="reset"&&(args.includes("--hard")||args.includes("-h")))||`,
    `   (cmd==="checkout"&&args.includes("--"))){`,
    `  process.stderr.write("[op-assistant] git "+args.join(" ")+" is blocked — the agent handles git operations.\\n");`,
    `  process.exit(1);`,
    `}`,
    `const r=spawnSync(${JSON.stringify(realGit)},args,{stdio:"inherit"});`,
    `process.exit(r.status??1);`,
  ].join("\n");

  fs.writeFileSync(jsPath, shimCode, "utf8");

  if (process.platform === "win32") {
    // cmd.exe / PowerShell find .cmd files in PATH
    fs.writeFileSync(path.join(shimDir, "git.cmd"), `@node "${jsPath}" %*\r\n`, "utf8");
    // Git-for-Windows sh/bash finds no-extension scripts with shebangs
    fs.writeFileSync(path.join(shimDir, "git"), `#!/usr/bin/env node\n${shimCode}`, "utf8");
  } else {
    const p = path.join(shimDir, "git");
    fs.writeFileSync(p, `#!/usr/bin/env node\n${shimCode}`, "utf8");
    fs.chmodSync(p, "755");
  }

  return shimDir;
}

async function opMessage(run, kind, content) {
  if (!content) return;
  const { error } = await supabase.from("operator_messages").insert({
    conversation_id: run.conversation_id,
    run_id: run.id,
    kind,
    content: String(content).slice(0, 20000),
    created_at: Date.now(),
  });
  if (error) console.error("operator_messages insert failed:", error.message);
}

async function opRunUpdate(runId, patch) {
  const { error } = await supabase.from("operator_runs").update(patch).eq("id", runId);
  if (error) console.error("operator_runs update failed:", error.message);
}

// Forward a single stream-json event to the transcript.
async function handleClaudeEvent(run, evt) {
  if (evt.type !== "assistant" || !evt.message || !Array.isArray(evt.message.content)) return;
  for (const block of evt.message.content) {
    if (block.type === "text" && block.text && block.text.trim()) {
      await opMessage(run, "assistant", block.text);
    } else if (block.type === "tool_use") {
      const input = block.input || {};
      const target = input.file_path || input.path || input.pattern || input.command;
      await opMessage(run, "tool", target ? `${block.name}: ${String(target).slice(0, 200)}` : block.name);
    }
  }
}

// Run a headless Claude session, streaming its transcript. Resolves with the
// final result text (used as the change summary). The user prompt is passed via
// stdin so no shell-quoting of operator content is needed.
function runClaudeHeadless(run, projectPath) {
  return new Promise((resolve, reject) => {
    const model = OP_MODEL_RE.test(run.model) ? run.model : "claude-opus-4-8";
    const effort = OP_EFFORTS.has(run.effort) ? run.effort : "high";
    // Git shim: intercepts destructive git commands at the process level.
    // Prepended to PATH so Claude's subprocess finds it before the real git.
    let shimDir;
    try { shimDir = createGitShim(); } catch (e) {
      console.error("git shim creation failed (OP_GUARDRAILS still applies):", e.message);
    }
    const shimEnv = shimDir
      ? { ...process.env, PATH: shimDir + path.delimiter + (process.env.PATH || "") }
      : process.env;
    const cleanup = () => {
      if (shimDir) try { fs.rmSync(shimDir, { recursive: true, force: true }); } catch (_) {}
    };

    // Array-form spawn: no shell, so OP_GUARDRAILS is passed verbatim with zero
    // quoting risk. On Windows, npm installs claude as claude.cmd (a batch wrapper).
    const claudeBin = process.platform === "win32" ? "claude.cmd" : "claude";
    const child = spawn(
      claudeBin,
      [
        "-p", "--output-format", "stream-json", "--verbose",
        "--model", model, "--effort", effort,
        "--permission-mode", "bypassPermissions",
        "--append-system-prompt", OP_GUARDRAILS,
      ],
      { cwd: projectPath, shell: false, env: shimEnv }
    );
    let buffer = "";
    let summary = "";
    let done = false;
    const fail = (e) => { if (!done) { done = true; cleanup(); reject(e); } };

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        handleClaudeEvent(run, evt).catch((e) => console.error("event forward failed:", e.message));
        if (evt.type === "result") {
          if (evt.is_error) { fail(new Error(evt.result || "Claude reported an error")); return; }
          summary = evt.result || summary;
        }
      }
    });
    child.stderr.on("data", (d) => console.error("claude stderr:", d.toString().slice(0, 500)));
    child.on("error", fail);
    child.on("close", (code) => {
      if (done) return;
      done = true;
      cleanup();
      if (code === 0) resolve(summary);
      else reject(new Error(`claude exited with code ${code}`));
    });

    child.stdin.write(run.prompt);
    child.stdin.end();
  });
}

async function startOperatorRun(run) {
  const project = discoverProjects().find((p) => p.id === run.project_id);
  if (!project) {
    await opRunUpdate(run.id, { status: "error", error_message: `Project '${run.project_id}' not found on this machine`, finished_at: Date.now() });
    return;
  }

  // Pre-flight: require a clean working tree so the diff is exactly Claude's work
  // and discard is a clean revert.
  let base;
  try {
    if (git(project.path, "status --porcelain").trim()) {
      await opRunUpdate(run.id, { status: "error", error_message: "Working tree isn't clean — commit or stash your changes first, then retry.", finished_at: Date.now() });
      return;
    }
    base = git(project.path, "rev-parse --abbrev-ref HEAD").trim();
  } catch (e) {
    await opRunUpdate(run.id, { status: "error", error_message: `git pre-flight failed: ${e.message}`, finished_at: Date.now() });
    return;
  }

  await opRunUpdate(run.id, { status: "running", started_at: Date.now(), branch: base });
  await opMessage(run, "status", `Working on "${project.name}" (${base})…`);

  let summary;
  try {
    summary = await runClaudeHeadless(run, project.path);
  } catch (e) {
    await opMessage(run, "error", e.message);
    try { git(project.path, "reset --hard HEAD"); git(project.path, "clean -fd"); } catch (_) { /* best effort */ }
    await opRunUpdate(run.id, { status: "error", error_message: e.message, finished_at: Date.now() });
    return;
  }

  let diff = "";
  try {
    git(project.path, "add -A");
    diff = git(project.path, "diff --cached");
  } catch (e) {
    await opRunUpdate(run.id, { status: "error", error_message: `diff failed: ${e.message}`, finished_at: Date.now() });
    return;
  }

  if (!diff.trim()) {
    await opMessage(run, "status", "No file changes were made.");
    await opRunUpdate(run.id, { status: "deployed", summary: summary || "No changes.", finished_at: Date.now() });
    return;
  }

  await opMessage(run, "status", "Done — review the diff and approve to deploy.");
  await opRunUpdate(run.id, { status: "awaiting_approval", diff: diff.slice(0, 500000), summary: summary || "" });
}

async function deployOperatorRun(run) {
  const project = discoverProjects().find((p) => p.id === run.project_id);
  if (!project) {
    await opRunUpdate(run.id, { status: "error", error_message: "Project not found on this machine", finished_at: Date.now() });
    return;
  }
  await opRunUpdate(run.id, { status: "deploying" });
  await opMessage(run, "status", "Approved — committing and pushing (this deploys)…");
  try {
    git(project.path, "add -A");

    // Safety: confirm the staged diff still matches what the operator approved.
    // Catches the case where a stray file appeared between review and deploy.
    const staged = git(project.path, "diff --cached");
    if (staged.slice(0, 500000) !== (run.diff || "")) {
      throw new Error(
        "Staged diff has changed since you approved it — the working tree may have shifted. Discard this run and start a new one."
      );
    }

    if (git(project.path, "status --porcelain").trim()) {
      const commitMsg =
        (run.summary || run.prompt || "operator assistant change").split("\n")[0].slice(0, 72) +
        "\n\nvia operator assistant";
      // Write commit message to a temp file to avoid Windows cmd.exe quoting issues
      // (JSON.stringify double-quotes break in cmd.exe on special characters).
      const msgFile = path.join(os.tmpdir(), `op-commit-${run.id}.txt`);
      fs.writeFileSync(msgFile, commitMsg, "utf8");
      try {
        git(project.path, `commit -F "${msgFile}"`);
      } finally {
        try { fs.unlinkSync(msgFile); } catch (_) { /* best effort cleanup */ }
      }
    }
    git(project.path, "push");
    await opMessage(run, "status", "Pushed. Vercel will deploy shortly.");
    await opRunUpdate(run.id, { status: "deployed", finished_at: Date.now() });
  } catch (e) {
    await opMessage(run, "error", `Deploy failed: ${e.message}`);
    await opRunUpdate(run.id, { status: "error", error_message: e.message, finished_at: Date.now() });
  }
}

async function discardOperatorRun(run) {
  const project = discoverProjects().find((p) => p.id === run.project_id);
  if (project) {
    try { git(project.path, "reset --hard HEAD"); git(project.path, "clean -fd"); } catch (e) { console.error("discard cleanup failed:", e.message); }
  }
  await opMessage(run, "status", "Discarded — the working tree was reverted.");
  await opRunUpdate(run.id, { status: "discarded", diff: null, finished_at: Date.now() });
}

async function handleOperatorRun(run) {
  if (inFlightRuns.has(run.id)) return;
  const actionable =
    run.status === "pending" ||
    run.status === "approved" ||
    (run.status === "discarded" && !run.finished_at);
  if (!actionable) return;
  inFlightRuns.add(run.id);
  try {
    if (run.status === "pending") await startOperatorRun(run);
    else if (run.status === "approved") await deployOperatorRun(run);
    else if (run.status === "discarded") await discardOperatorRun(run);
  } catch (e) {
    console.error("operator run handler crashed:", e.message);
    await opRunUpdate(run.id, { status: "error", error_message: e.message, finished_at: Date.now() });
  } finally {
    inFlightRuns.delete(run.id);
  }
}

// Poll fallback for operator runs (mirrors pollPendingSessions). Selects every
// actionable state; terminal rows are filtered out by handleOperatorRun.
async function pollOperatorRuns() {
  const { data, error } = await supabase
    .from("operator_runs")
    .select("*")
    .in("status", ["pending", "approved", "discarded"]);
  if (error) {
    console.error("operator poll failed:", error.message);
    return;
  }
  for (const run of data || []) handleOperatorRun(run);
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

  // Operator assistant — same poll + realtime pattern as remote sessions.
  await pollOperatorRuns();
  setInterval(pollOperatorRuns, OP_POLL_INTERVAL_MS);
  supabase
    .channel("operator-runs-agent")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "operator_runs" },
      (payload) => { if (payload.new) handleOperatorRun(payload.new); },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") console.log("Listening for operator runs…");
    });
}

main().catch((e) => {
  console.error("Agent crashed:", e);
  process.exit(1);
});

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const ORIGIN = process.env.ORIGIN ?? "http://localhost:5174";
const STORAGE_STATE = "playwright/.auth/admin.json";
const OUT = "playwright/output";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const log = (...a) => console.log(...a);
try {
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    if (!r.ok() && r.url().includes("supabase.co")) {
      let body = "";
      try { body = (await r.text()).slice(0, 300); } catch {}
      console.log(`[HTTP ${r.status()}] ${r.request().method()} ${r.url().split("supabase.co")[1]}\n   ${body}`);
    }
  });

  await page.goto(`${ORIGIN}/dashboard/app/tasks`);
  await page.waitForLoadState("networkidle");

  if ((await page.locator("body").innerText()).includes("Sign in with Google")) {
    throw new Error("Not authenticated — re-run `npm run auth:mint`.");
  }

  // Create a fresh doc.
  await page.locator("button.new-doc").first().click();
  const surface = page.locator(".ProseMirror").first();
  await surface.waitFor({ state: "visible", timeout: 10000 });
  await surface.click();
  await page.keyboard.type("Install the north wall framing");
  // Select all the text in the editor.
  await page.keyboard.press("Control+A");

  // Open the TAG ribbon, then "TAG with user".
  await page.locator("button.f-button", { hasText: "TAG" }).click();
  await page.locator(".sub-ribbon button", { hasText: "TAG with user" }).click();

  // Picker opens.
  const picker = page.locator(".tag-user-picker");
  await picker.waitFor({ state: "visible", timeout: 5000 });
  // Wait for listProfiles() to resolve and rows to render.
  await picker.locator(".tag-user-row").first().waitFor({ state: "visible", timeout: 8000 });
  const checks = picker.locator(".tag-user-check");
  const n = await checks.count();
  log(`Picker shows ${n} user(s).`);
  if (n === 0) throw new Error("No users in the tag picker.");
  await checks.first().check();
  await page.screenshot({ path: `${OUT}/usertag-picker.png` });
  await picker.locator(".tag-user-apply").click();

  // Verify the highlighted span exists in the editor DOM.
  await page.waitForTimeout(300);
  const span = page.locator(".ProseMirror span.fmt-user-tag");
  const spanCount = await span.count();
  const dataUsers = spanCount ? await span.first().getAttribute("data-users") : null;
  const title = spanCount ? await span.first().getAttribute("title") : null;
  log(`fmt-user-tag spans in editor: ${spanCount}`);
  log(`  data-users: ${dataUsers}`);
  log(`  title:      ${title}`);

  await page.screenshot({ path: `${OUT}/usertag-editor.png`, fullPage: true });

  // Switch to Markdown source view and read the stored markdown.
  await page.locator(".view-toggle button", { hasText: "MD" }).click();
  const md = await page.locator("textarea.source-surface").inputValue();
  log("\n--- Markdown source ---\n" + md + "\n-----------------------");

  const hasComment = /<!--\s*tagged:.*-->/.test(md);
  const hasSpan = /data-fmt="user-tag"/.test(md);
  log(`\nMarkdown has <span data-fmt="user-tag">: ${hasSpan}`);
  log(`Markdown has <!-- tagged: ... -->:        ${hasComment}`);

  const pass = spanCount > 0 && !!dataUsers && hasComment && hasSpan;
  log(`\nRESULT: ${pass ? "PASS ✓" : "FAIL ✗"}`);
  for (const e of errors) console.error("Console error:", e);
  process.exitCode = pass ? 0 : 1;
} finally {
  await browser.close();
}

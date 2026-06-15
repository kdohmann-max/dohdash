import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const DEV_SERVER_ORIGIN = "http://localhost:5173";
const STORAGE_STATE = "playwright/.auth/admin.json";
const OUTPUT_DIR = "playwright/output";

mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(`${DEV_SERVER_ORIGIN}/dashboard`);
  await page.waitForLoadState("networkidle");

  await page.screenshot({ path: `${OUTPUT_DIR}/dashboard.png`, fullPage: true });

  const bodyText = await page.locator("body").innerText();
  const signedOut = bodyText.includes("Sign in with Google");

  console.log(signedOut ? "NOT authenticated: sign-in page shown" : "Authenticated: dashboard loaded");
  for (const e of errors) console.error("Console error:", e);
} finally {
  await browser.close();
}

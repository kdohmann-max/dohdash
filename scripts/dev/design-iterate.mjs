import { chromium } from "playwright";

const DEV_SERVER_ORIGIN = "http://localhost:5173";
const STORAGE_STATE = "playwright/.auth/admin.json";

console.log("🎨 Launching dev browser with pre-authenticated session...");
console.log(`Opening ${DEV_SERVER_ORIGIN}/dashboard\n`);

const browser = await chromium.launch({ headless: false });

try {
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();

  await page.goto(`${DEV_SERVER_ORIGIN}/dashboard`);
  await page.waitForLoadState("networkidle");

  console.log("✅ Browser open. Edit CSS files — changes auto-reload in the browser.");
  console.log("💡 Tip: Press F12 for DevTools to inspect elements\n");

  // Keep the browser open until the user closes it
  await page.waitForEvent("close");
} catch (error) {
  console.error("Error launching browser:", error);
} finally {
  await browser.close();
}

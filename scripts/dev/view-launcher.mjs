import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const authFile = path.resolve("playwright/.auth/admin.json");

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: fs.existsSync(authFile) ? authFile : undefined,
  });

  const page = await context.newPage();
  await page.goto("http://localhost:5177/dashboard", {
    waitUntil: "networkidle",
  });

  // Take a screenshot of the launcher
  await page.screenshot({ path: "launcher-screenshot.png" });
  console.log("Screenshot saved to launcher-screenshot.png");

  // Keep the browser open for inspection
  await page.waitForTimeout(30000);
  await browser.close();
})();

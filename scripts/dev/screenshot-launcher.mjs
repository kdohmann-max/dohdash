import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const authFile = path.resolve("playwright/.auth/admin.json");

(async () => {
  const browser = await chromium.launch({ headless: false });
  
  let context;
  if (fs.existsSync(authFile)) {
    context = await browser.newContext({ storageState: authFile });
  } else {
    context = await browser.newContext();
  }

  const page = await context.newPage();
  
  try {
    await page.goto("http://localhost:5173/dashboard", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ path: "launcher-screenshot.png", fullPage: true });
    console.log("✓ Screenshot saved to launcher-screenshot.png");
  } catch (e) {
    console.error("Error:", e.message);
  }

  await browser.close();
})();

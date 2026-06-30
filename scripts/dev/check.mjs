import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";
const authFile = path.resolve("playwright/.auth/admin.json");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: fs.existsSync(authFile) ? authFile : undefined, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  const target = process.argv[2] || "http://localhost:5173/dashboard";
  await page.goto(target, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: process.argv[3] || "check.png", fullPage: true });
  console.log("shot:", target);
  await browser.close();
})();

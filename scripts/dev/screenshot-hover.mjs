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
    
    // Get all app tiles
    const tiles = await page.locator('.app-tile').all();
    console.log(`Found ${tiles.length} tiles`);
    
    // Hover over the first tile (Job Files - a stub)
    if (tiles.length > 0) {
      await tiles[0].hover();
      await page.waitForTimeout(500);
      await page.screenshot({ path: "launcher-hover-screenshot.png", fullPage: true });
      console.log("✓ Hover screenshot saved");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }

  await browser.close();
})();

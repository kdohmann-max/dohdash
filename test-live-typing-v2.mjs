import { chromium } from "playwright";
import * as fs from "fs";

const BASE_URL = "http://localhost:5173";
const SESSION_FILE = "playwright/.auth/admin.json";

async function testLiveTyping() {
  console.log("🚀 Starting live typing verification...\n");

  const browser = await chromium.launch({ headless: false });

  // Load the authenticated session
  const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));

  // Open first browser context (Editor 1)
  const context1 = await browser.newContext();
  await context1.addCookies(sessionData.cookies);
  const page1 = await context1.newPage();

  // Open second browser context (Editor 2)
  const context2 = await browser.newContext();
  await context2.addCookies(sessionData.cookies);
  const page2 = await context2.newPage();

  try {
    console.log("📖 Navigating to Tasks app...");
    await page1.goto(`${BASE_URL}/dashboard/app/tasks`);
    await page1.waitForLoadState("networkidle");

    // Take a screenshot to debug
    await page1.screenshot({ path: "screenshot1.png" });
    console.log("   Screenshot saved to screenshot1.png");

    // Check what's on the page
    const pageContent = await page1.content();
    console.log("   Page title:", await page1.title());

    // Look for the example doc or any doc
    const allLinks = await page1.$$eval("a", (links) =>
      links.map((l) => ({ text: l.textContent, href: l.href }))
    );
    console.log("   Found links:", allLinks.slice(0, 5));

    // Try to find a creatable example or wait for one to load
    console.log("\n   Waiting for docs to load...");
    await page1.waitForTimeout(2000);

    const docsAvailable = await page1.$$('a[href*="/app/tasks/doc/"]');
    console.log(`   Found ${docsAvailable.length} docs`);

    if (docsAvailable.length === 0) {
      console.log("❌ No docs available - Tasks sidebar is empty");
      console.log("   The app should create an example doc on first load");
      console.log("   Let me wait a bit longer for it to load...");
      await page1.waitForTimeout(3000);

      const docsNow = await page1.$$('a[href*="/app/tasks/doc/"]');
      console.log(`   Now found ${docsNow.length} docs`);

      if (docsNow.length === 0) {
        // Try to find and click "Create Doc" or "New Note" button
        const createBtn = await page1.$("button:has-text('New')") ||
                         await page1.$("button:has-text('Create')") ||
                         await page1.$("[role='button']:has-text('New')");

        if (createBtn) {
          console.log("   Clicking create doc button...");
          await createBtn.click();
          await page1.waitForNavigation({ waitUntil: "networkidle" }).catch(() => {});
          await page1.waitForTimeout(1000);
        }
      }
    }

    // Get first available doc
    const firstDoc = await page1.$('a[href*="/app/tasks/doc/"]');
    if (!firstDoc) {
      throw new Error("Still no docs available after waiting");
    }

    const docHref = await firstDoc.getAttribute("href");
    console.log(`\n📄 Using doc: ${docHref}`);

    const docUrl = `${BASE_URL}${docHref}`;
    console.log("🔗 Opening in both windows...");
    await page1.goto(docUrl);
    await page2.goto(docUrl);
    await page1.waitForLoadState("networkidle");
    await page2.waitForLoadState("networkidle");

    console.log("✅ Both windows open the same doc\n");

    // Wait for editors to be ready
    console.log("⏳ Waiting for editors to initialize...");
    await page1.waitForSelector(".ProseMirror, [contenteditable]", { timeout: 5000 });
    await page2.waitForSelector(".ProseMirror, [contenteditable]", { timeout: 5000 });
    console.log("✅ Editors ready\n");

    // Get baseline content
    const baselineContent1 = await page1.$eval(".ProseMirror, [contenteditable]", (el) => el.textContent || "");
    console.log(`Baseline content (Page 1): "${baselineContent1.substring(0, 100)}..."`);

    // Focus editor 1 and position cursor at end
    const editor1 = await page1.$(".ProseMirror, [contenteditable]");
    await editor1.click();
    await page1.keyboard.press("End");

    // Type test content
    console.log("\n✍️  Page 1 typing: 'LIVE_TYPING_TEST_123'");
    await page1.keyboard.type("LIVE_TYPING_TEST_123", { delay: 50 });

    // Check Page 2 immediately (before save - testing live typing)
    console.log("⏳ Waiting 250ms for live broadcast...");
    await page1.waitForTimeout(250);

    const content2Live = await page2.$eval(".ProseMirror, [contenteditable]", (el) => el.textContent || "");
    console.log(`Page 2 content after typing (before save): "${content2Live.substring(Math.max(0, content2Live.length - 150))}"`);

    if (content2Live.includes("LIVE_TYPING_TEST_123")) {
      console.log("✅ LIVE TYPING WORKS! Text appeared in real-time");
      return true;
    } else {
      console.log("❌ Text did not appear after typing (will check after save)");

      // Wait for auto-save and check again
      console.log("\n⏳ Waiting 400ms for auto-save...");
      await page1.waitForTimeout(400);

      const content2Saved = await page2.$eval(".ProseMirror, [contenteditable]", (el) => el.textContent || "");
      if (content2Saved.includes("LIVE_TYPING_TEST_123")) {
        console.log("⚠️  Text appeared AFTER save (not live typing)");
        return false;
      } else {
        console.log("❌ Text still not visible - broadcast may not be working");
        return false;
      }
    }

  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return false;
  } finally {
    await browser.close();
  }
}

const result = await testLiveTyping();
process.exit(result ? 0 : 1);

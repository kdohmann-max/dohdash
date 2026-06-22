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
    console.log("📖 Navigating to dashboard on both windows...");
    await page1.goto(`${BASE_URL}/dashboard/app/tasks`);
    await page2.goto(`${BASE_URL}/dashboard/app/tasks`);
    await page1.waitForLoadState("networkidle");
    await page2.waitForLoadState("networkidle");

    console.log("✅ Both dashboards loaded\n");

    // Look for an existing doc link
    console.log("📝 Looking for a test document...");
    let docLink = await page1.$('a[href*="/app/tasks/doc/"]');

    if (!docLink) {
      console.log("   No docs found in sidebar, will use example/first available");
      // The app should have at least one example doc or the sidebar should show
      await page1.waitForTimeout(1000);
      docLink = await page1.$('a[href*="/app/tasks/doc/"]');
    }

    if (docLink) {
      const href = await docLink.getAttribute("href");
      console.log(`   Found doc: ${href}`);
      const docUrl = `${BASE_URL}${href}`;

      console.log(`📄 Opening doc in both windows: ${docUrl}\n`);
      await page1.goto(docUrl);
      await page2.goto(docUrl);
      await page1.waitForLoadState("networkidle");
      await page2.waitForLoadState("networkidle");
    } else {
      console.log("⚠️  No docs available - test may be incomplete");
      throw new Error("No documents to test with");
    }

    console.log("🎯 Both windows now have the same doc open\n");

    // Wait for editors to be ready
    await page1.waitForSelector(".ProseMirror, [contenteditable]", { timeout: 5000 });
    await page2.waitForSelector(".ProseMirror, [contenteditable]", { timeout: 5000 });

    console.log("✍️  Page 1 typing: 'Live typing test'");
    const editor1 = await page1.$(".ProseMirror, [contenteditable]");
    if (editor1) {
      await editor1.click();
      await page1.keyboard.type("Live typing test", { delay: 50 });
    }

    // Give time for broadcast
    console.log("⏳ Waiting 300ms for live broadcast...");
    await page1.waitForTimeout(300);

    // Check if text appeared in page2 without saving
    const content2Before = await page2.$eval(".ProseMirror, [contenteditable]", (el) => el.textContent || el.innerText);
    console.log(`\nPage 2 content after typing (before save): "${content2Before}"`);

    if (content2Before.includes("Live typing test")) {
      console.log("✅ LIVE TYPING WORKS! Text appeared in real-time");
    } else {
      console.log("❌ Text did not appear in real-time");
      console.log("   (might appear after save if broadcast not working)");
    }

    // Now trigger a save by waiting 400ms more
    console.log("\n⏳ Waiting 400ms for auto-save...");
    await page1.waitForTimeout(400);

    const content2After = await page2.$eval(".ProseMirror, [contenteditable]", (el) => el.textContent || el.innerText);
    console.log(`Page 2 content after save: "${content2After}"`);

    if (content2After.includes("Live typing test")) {
      console.log("✅ SAVE-BROADCAST WORKS! Text persisted");
    } else {
      console.log("❌ Text still not visible");
    }

    // Probe: rapid typing
    console.log("\n🔍 Probe: Rapid typing...");
    await page1.keyboard.type(" rapid!", { delay: 10 });
    await page1.waitForTimeout(250);

    const content2Rapid = await page2.$eval(".ProseMirror, [contenteditable]", (el) => el.textContent || el.innerText);
    console.log(`Page 2 after rapid typing: "${content2Rapid}"`);

    if (content2Rapid.includes("rapid")) {
      console.log("✅ Rapid typing broadcast works");
    } else {
      console.log("❌ Rapid typing broadcast failed");
    }

    // Probe: Page 2 typing while Page 1 is editing
    console.log("\n🔍 Probe: Simultaneous editing...");
    const editor2 = await page2.$(".ProseMirror, [contenteditable]");
    if (editor2) {
      await editor2.click();
      // Move to end
      await page2.keyboard.press("End");
      await page2.keyboard.type(" [from page2]", { delay: 30 });
    }

    await page1.waitForTimeout(250);
    const content1Now = await page1.$eval(".ProseMirror, [contenteditable]", (el) => el.textContent || el.innerText);
    console.log(`Page 1 sees Page 2's edits: "${content1Now}"`);

    if (content1Now.includes("from page2")) {
      console.log("✅ Simultaneous editing works");
    } else {
      console.log("⚠️  Page 1 doesn't see Page 2 edits yet (dirty state?)");
    }

    console.log("\n✅ Verification complete!");

  } catch (error) {
    console.error("❌ Test failed:", error.message);
  } finally {
    await browser.close();
  }
}

testLiveTyping();

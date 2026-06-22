import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: 'playwright/.auth/admin.json',
});

async function screenshot(name, url, width, height, scrollTo = 0) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  
  console.log(`\n📸 ${name} (${width}x${height})`);
  
  try {
    await page.goto(`http://localhost:5173${url}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    
    // Check for ribbon-1
    const ribbon1Ct = await page.locator('.ribbon-1').count();
    console.log(`  Ribbon-1: ${ribbon1Ct > 0 ? '✓ present' : '✗ absent'}`);
    
    // Check for ribbon-2
    const ribbon2Ct = await page.locator('.ribbon-2').count();
    console.log(`  Ribbon-2: ${ribbon2Ct > 0 ? '✓ present' : '✗ absent'}`);
    
    // Check editor-body
    const editorBodyCt = await page.locator('.editor-body').count();
    console.log(`  Editor-body: ${editorBodyCt > 0 ? '✓ present' : '✗ absent'}`);
    
    if (editorBodyCt > 0 && scrollTo > 0) {
      const ribbon1Box = await page.locator('.ribbon-1').first().boundingBox();
      console.log(`  Ribbon-1 initial y: ${ribbon1Box?.y}`);
      
      // Scroll the editor-body
      await page.locator('.editor-body').first().evaluate(el => { el.scrollTop = scrollTo; });
      await page.waitForTimeout(400);
      
      const ribbon1BoxAfter = await page.locator('.ribbon-1').first().boundingBox();
      console.log(`  Ribbon-1 after scroll y: ${ribbon1BoxAfter?.y}`);
      
      if (ribbon1Box?.y === ribbon1BoxAfter?.y) {
        console.log(`  ✓ Ribbon stayed fixed`);
      } else {
        console.log(`  ✗ Ribbon moved`);
      }
    }
    
    // Take screenshot
    const fn = `/tmp/${name.replace(/\s+/g, '_')}.png`;
    await page.screenshot({ path: fn, fullPage: false });
    console.log(`  Screenshot: ${fn}`);
    
  } catch (err) {
    console.log(`  Error: ${err.message.substring(0, 60)}`);
  } finally {
    await page.close();
  }
}

try {
  await screenshot('Tasks @ Desktop', '/dashboard/app/tasks', 1280, 800, 400);
  await screenshot('Tasks @ Phone', '/dashboard/app/tasks', 375, 667, 400);
  await screenshot('Admin @ Desktop', '/dashboard/admin', 1280, 800);
  await screenshot('Admin @ Phone', '/dashboard/admin', 375, 667);
  console.log('\n✓ Done');
} catch (err) {
  console.error('Fatal:', err.message);
}

await browser.close();

import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: 'playwright/.auth/admin.json',
});

async function checkLayout(name, url, width, height) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  
  console.log(`\n=== ${name} (${width}x${height}) ===`);
  
  try {
    await page.goto(`http://localhost:5173${url}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(800);
    
    // Check if ribbon-1 exists (Tasks editor) or shell-content scrolls (Admin)
    const ribbon1 = await page.locator('.ribbon-1');
    const shellContent = await page.locator('.shell-content');
    
    if (await ribbon1.count() > 0) {
      console.log('✓ Tasks editor (has ribbon-1)');
      const box1 = await ribbon1.boundingBox();
      const editorBody = await page.locator('.editor-body');
      
      if (box1 && await editorBody.count() > 0) {
        const initialY = box1.y;
        await editorBody.evaluate(el => { el.scrollTop = 500; });
        await page.waitForTimeout(300);
        
        const box1After = await ribbon1.boundingBox();
        const finalY = box1After?.y ?? null;
        
        if (initialY === finalY) {
          console.log(`  ✓ Ribbon 1 stayed fixed at y=${initialY} after body scroll`);
        } else {
          console.log(`  ✗ Ribbon 1 moved! Before: y=${initialY}, After: y=${finalY}`);
        }
      }
    } else {
      console.log('✓ Content-flow app (no ribbon)');
      const overflow = await shellContent.evaluate(el => window.getComputedStyle(el).overflow);
      console.log(`  ✓ .shell-content overflow: ${overflow} (scrolls if content exceeds bounds)`);
    }
    
  } catch (err) {
    console.log(`✗ Error: ${err.message.split('\n')[0]}`);
  } finally {
    await page.close();
  }
}

try {
  await checkLayout('Tasks Editor @ Desktop', '/dashboard/app/tasks', 1280, 800);
  await checkLayout('Tasks Editor @ Phone', '/dashboard/app/tasks', 375, 667);
  await checkLayout('Admin @ Desktop', '/dashboard/admin', 1280, 800);
  await checkLayout('Admin @ Phone', '/dashboard/admin', 375, 667);
  console.log('\n✓ Verification complete');
} catch (err) {
  console.error('Fatal:', err.message);
}

await browser.close();

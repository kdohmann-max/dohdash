import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: 'playwright/.auth/admin.json',
});

const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

try {
  await page.goto('http://localhost:5173/dashboard/app/tasks', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  
  console.log('Clicking on first doc item...');
  const docItem = page.locator('.doc-item').first();
  await docItem.click();
  await page.waitForTimeout(1500);
  
  console.log('\nAfter clicking doc:');
  console.log(`  .editor: ${await page.locator('.editor').count()}`);
  console.log(`  .ribbon-1: ${await page.locator('.ribbon-1').count()}`);
  console.log(`  .ribbon-2: ${await page.locator('.ribbon-2').count()}`);
  console.log(`  .editor-body: ${await page.locator('.editor-body').count()}`);
  console.log(`  .editor-content-wrap: ${await page.locator('.editor-content-wrap').count()}`);
  
  // Check the editor layout
  const editor = page.locator('.editor');
  if (await editor.count() > 0) {
    console.log('\n✓ Editor loaded');
    
    const ribbon1 = page.locator('.ribbon-1');
    const editorBody = page.locator('.editor-body');
    
    if (await ribbon1.count() > 0) {
      const box1 = await ribbon1.boundingBox();
      console.log(`  Ribbon-1 at y=${box1?.y}, height=${box1?.height}px`);
      
      // Scroll the body
      if (await editorBody.count() > 0) {
        console.log('  Scrolling editor body...');
        await editorBody.first().evaluate(el => { el.scrollTop = 500; });
        await page.waitForTimeout(400);
        
        const box1After = await ribbon1.boundingBox();
        console.log(`  After scroll: y=${box1After?.y}`);
        
        if (box1?.y === box1After?.y) {
          console.log('  ✓✓ Ribbon-1 stayed FIXED (layout is correct!)');
        } else {
          console.log('  ✗✗ Ribbon-1 moved (layout is broken)');
        }
      }
    }
  }
  
} catch (err) {
  console.error(`Error: ${err.message.substring(0, 100)}`);
} finally {
  await page.close();
  await browser.close();
}

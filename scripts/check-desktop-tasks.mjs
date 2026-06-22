import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: 'playwright/.auth/admin.json',
});

const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

console.log('Loading Tasks app at desktop (1280x800)...\n');

try {
  await page.goto('http://localhost:5173/dashboard/app/tasks', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  
  // Check page structure
  console.log('Checking page structure:');
  console.log(`  .tasks-app: ${await page.locator('.tasks-app').count()}`);
  console.log(`  .sidebar: ${await page.locator('.sidebar').count()}`);
  console.log(`  .main: ${await page.locator('.main').count()}`);
  console.log(`  .editor: ${await page.locator('.editor').count()}`);
  console.log(`  .ribbon-1: ${await page.locator('.ribbon-1').count()}`);
  console.log(`  .empty-main: ${await page.locator('.empty-main').count()}`);
  
  // Check if a doc is selected
  const docItems = await page.locator('.doc-item').count();
  console.log(`\n  Doc items in list: ${docItems}`);
  
  if (docItems === 0) {
    console.log('\n  ℹ No docs found - that\'s why editor is empty. This is expected.');
    console.log('  Let\'s create a test doc and check again...\n');
    
    // Click the "+" (new doc) button
    await page.click('.new-doc');
    await page.waitForTimeout(1000);
    
    console.log('  After creating new doc:');
    console.log(`    .ribbon-1: ${await page.locator('.ribbon-1').count()}`);
    console.log(`    .editor-body: ${await page.locator('.editor-body').count()}`);
    
    // Check ribbon is visible
    const ribbon1 = await page.locator('.ribbon-1');
    if (await ribbon1.count() > 0) {
      const box = await ribbon1.boundingBox();
      console.log(`    ✓ Ribbon-1 visible at y=${box?.y}, height=${box?.height}`);
      
      // Try scrolling
      const editorBody = await page.locator('.editor-body');
      if (await editorBody.count() > 0) {
        await editorBody.first().evaluate(el => { el.scrollTop = 300; });
        await page.waitForTimeout(300);
        
        const boxAfter = await ribbon1.boundingBox();
        console.log(`    After scroll: y=${boxAfter?.y}`);
        console.log(`    ${box?.y === boxAfter?.y ? '✓ Stayed fixed' : '✗ Moved'}`);
      }
    }
  }
  
} catch (err) {
  console.error(`\n✗ Error: ${err.message.substring(0, 100)}`);
} finally {
  await page.close();
  await browser.close();
}

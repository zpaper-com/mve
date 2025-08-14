const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Listen to console messages
  page.on('console', msg => {
    console.log('🖥️ Browser Console:', msg.type(), msg.text());
  });
  
  // Listen to page errors
  page.on('pageerror', error => {
    console.log('❌ Page Error:', error.message);
  });
  
  try {
    // Navigate to the PDF viewer
    console.log('🚀 Navigating to PDF viewer...');
    await page.goto('http://localhost:50004/pdf', { 
      timeout: 15000 
    });
    
    // Wait for page to load
    console.log('⏳ Waiting for page to load...');
    await page.waitForTimeout(3000);
    
    // Click the Send To button
    console.log('📤 Looking for Send To button...');
    const sendToButton = await page.$('text=Send To');
    if (sendToButton) {
      console.log('✅ Send To button found, clicking...');
      await sendToButton.click();
      
      // Wait for dialog to open
      await page.waitForTimeout(2000);
      
      // Take screenshot of the SendTo dialog
      await page.screenshot({ path: 'sendto-dialog-test.png', fullPage: true });
      console.log('📸 SendTo dialog screenshot saved');
    } else {
      console.log('❌ Send To button not found');
      // Take screenshot anyway to see current state
      await page.screenshot({ path: 'no-sendto-button.png', fullPage: true });
    }
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
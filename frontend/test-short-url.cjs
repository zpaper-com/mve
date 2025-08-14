const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    console.log('🚀 Testing short URL route /s/sample123...');
    await page.goto('http://localhost:50004/s/sample123', { 
      waitUntil: 'networkidle',
      timeout: 10000 
    });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Check if PDF viewer loaded
    const canvas = await page.$('canvas');
    if (canvas) {
      console.log('✅ PDF viewer loaded successfully on /s/ route');
    } else {
      console.log('❌ PDF viewer not found');
    }
    
    // Take screenshot
    await page.screenshot({ path: 'short-url-test.png', fullPage: true });
    console.log('📸 Screenshot saved as short-url-test.png');
    
    // Test home page with new route link
    console.log('🏠 Testing home page with new route link...');
    await page.goto('http://localhost:50004/', { 
      waitUntil: 'networkidle',
      timeout: 10000 
    });
    
    await page.waitForTimeout(1000);
    
    // Check if the new route link is visible
    const shortUrlLink = await page.$('text=Short URL Demo');
    if (shortUrlLink) {
      console.log('✅ Short URL Demo link found on home page');
    } else {
      console.log('❌ Short URL Demo link not found');
    }
    
    await page.screenshot({ path: 'home-with-short-url.png', fullPage: true });
    console.log('📸 Home page screenshot saved');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
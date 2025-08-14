const { chromium } = require('playwright');

async function testSite() {
  console.log('🚀 Starting Playwright test...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console messages
  page.on('console', msg => {
    console.log(`[${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  // Listen to page errors
  page.on('pageerror', error => {
    console.log(`❌ Page Error: ${error.message}`);
  });

  // Listen to request failures
  page.on('requestfailed', request => {
    console.log(`❌ Request Failed: ${request.url()} - ${request.failure().errorText}`);
  });

  try {
    console.log('📍 Navigating to home page...');
    const response = await page.goto('http://localhost:50004/', { waitUntil: 'networkidle' });
    
    console.log(`✅ Response Status: ${response.status()}`);
    
    // Take screenshot
    await page.screenshot({ path: 'home-screenshot.png' });
    console.log('📸 Screenshot saved as home-screenshot.png');
    
    // Get page title and content
    const title = await page.title();
    console.log(`📄 Page Title: ${title}`);
    
    // Check if page has content
    const bodyText = await page.textContent('body');
    console.log(`📝 Body text length: ${bodyText?.length || 0} characters`);
    
    if (bodyText && bodyText.length > 0) {
      console.log('📄 First 200 chars of body:', bodyText.substring(0, 200));
    }
    
    // Check for React errors
    const reactErrors = await page.$$eval('*', () => {
      return Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent && el.textContent.includes('Error') || el.textContent.includes('Failed')
      ).map(el => el.textContent);
    });
    
    if (reactErrors.length > 0) {
      console.log('⚠️  Found potential errors on page:', reactErrors);
    }
    
    // Test PDF route
    console.log('📍 Testing PDF route...');
    await page.goto('http://localhost:50004/pdf', { waitUntil: 'networkidle' });
    
    // Wait a bit longer for PDF to potentially load
    console.log('⏳ Waiting 5 seconds for PDF to load...');
    await page.waitForTimeout(5000);
    
    const pdfPageText = await page.textContent('body');
    console.log(`📝 PDF page text length: ${pdfPageText?.length || 0} characters`);
    
    // Check for specific error messages (with timeout)
    try {
      const errorText = await page.textContent('[role="alert"], .MuiAlert-root, .error', { timeout: 2000 });
      if (errorText) {
        console.log('❌ Found error message:', errorText);
      }
    } catch {
      console.log('✅ No visible error messages found');
    }
    
    await page.screenshot({ path: 'pdf-screenshot.png' });
    console.log('📸 PDF page screenshot saved as pdf-screenshot.png');
    
    if (pdfPageText && pdfPageText.length > 0) {
      console.log('📄 First 200 chars of PDF page:', pdfPageText.substring(0, 200));
    }

  } catch (error) {
    console.log(`❌ Test failed: ${error.message}`);
  } finally {
    await browser.close();
    console.log('🏁 Test completed');
  }
}

testSite().catch(console.error);
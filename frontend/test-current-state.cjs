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
    
    // Give time for React to render
    console.log('⏳ Waiting for content to load...');
    await page.waitForTimeout(3000);
    
    // Check for any errors
    const errorAlert = await page.$('.MuiAlert-root[role="alert"]');
    if (errorAlert) {
      const errorText = await errorAlert.textContent();
      console.log('❌ Error found:', errorText);
    } else {
      console.log('✅ No visible errors');
    }
    
    // Check if PDF canvas is present
    const canvas = await page.$('canvas');
    if (canvas) {
      console.log('✅ PDF canvas found');
      const canvasSize = await canvas.boundingBox();
      console.log('📏 Canvas dimensions:', canvasSize);
      
      // Get container dimensions for comparison
      const container = await page.$('[ref="containerRef"]');
      if (container) {
        const containerSize = await container.boundingBox();
        console.log('📦 Container dimensions:', containerSize);
      }
      
      // Check the actual canvas element size
      const canvasElement = await canvas.evaluate(el => ({
        width: el.width,
        height: el.height,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight
      }));
      console.log('🖼️ Canvas element size:', canvasElement);
      
    } else {
      console.log('❌ No PDF canvas found');
    }
    
    // Check zoom level display
    const zoomDisplay = await page.$('text=/\\d+%/');
    if (zoomDisplay) {
      const zoomText = await zoomDisplay.textContent();
      console.log('🔍 Current zoom:', zoomText);
    }
    
    // Take screenshot
    await page.screenshot({ path: 'current-pdf-test.png', fullPage: true });
    console.log('📸 Screenshot saved as current-pdf-test.png');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
const { chromium } = require('playwright');

const codes = [
  'PHY-W2JE', 'PHY-MSW2', 'PHY-ZGDZ', 'PHY-XFTB', 'PHY-SA2Q',
  'PHY-PG2Z', 'PHY-T49W', 'PHY-CCXY', 'PHY-EZCK', 'PHY-4PZ7',
  'PHY-HHGQ', 'PHY-JD7F', 'PHY-8QYP', 'PHY-KSH6', 'PHY-7YS6',
  'PHY-W8NE', 'PHY-7JJV', 'PHY-9FM4', 'PHY-P9AX', 'PHY-48CC',
  'PHY-PA5Q', 'PHY-L5T2', 'PHY-AYQK', 'PHY-G2NG', 'PHY-JQFP',
  'PHY-AJQ8', 'PHY-J8RE', 'PHY-VXL3', 'PHY-3Q67', 'PHY-FK52',
  'PHY-JDSZ', 'PHY-VAKK', 'PHY-ZKB4', 'PHY-UF82', 'PHY-86B5'
];

async function simulateUser(browser, code) {
  // Create an isolated context so sessionStorage is unique per user
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Bypass Anti-Cheat so our bot doesn't get kicked for switching tabs
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', { get: () => false });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    document.documentElement.requestFullscreen = async () => {};
    Object.defineProperty(document, 'fullscreenElement', { get: () => document.documentElement });
  });

  try {
    await page.goto('https://summons.ssdssc.com/summons');
    
    // 1. Enter Code
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.fill('input[type="text"]', code);
    await page.click('button[type="submit"]');
    
    // 2. Wait for language selection
    await page.waitForSelector('#lang-english', { timeout: 15000 });
    await page.click('#lang-english');
    
    // 3. Wait for "Enter The Summons" when quiz goes live
    await page.waitForSelector('button:has-text("Enter The Summons")', { timeout: 0 }); // No timeout, wait for admin
    await page.click('button:has-text("Enter The Summons")');
    
    console.log(`[${code}] Entered quiz.`);
    let lastAnsweredQuestion = null;
    
    // 4. In the Quiz Loop
    while (true) {
      // Check if quiz ended
      const ended = await page.evaluate(() => document.body.innerText.includes('Quiz Complete'));
      if (ended) {
        console.log(`[${code}] Finished quiz.`);
        break;
      }

      // Check if kicked modal is there
      const kicked = await page.evaluate(() => document.body.innerText.includes('Session Ended'));
      if (kicked) {
        console.log(`[${code}] Session kicked.`);
        break;
      }
      
      try {
        // Find active option buttons (not disabled)
        const activeOptions = await page.$$('.option-btn:not([disabled])');
        
        if (activeOptions.length > 0) {
          // Wait random time to simulate thinking (1.5 - 5 seconds)
          const waitTime = Math.floor(Math.random() * 3500) + 1500;
          await page.waitForTimeout(waitTime);
          
          // Re-fetch in case they got disabled while waiting (e.g., time ran out)
          const freshOptions = await page.$$('.option-btn:not([disabled])');
          if (freshOptions.length > 0) {
            const randomPick = freshOptions[Math.floor(Math.random() * freshOptions.length)];
            await randomPick.click();
            console.log(`[${code}] Answer submitted!`);
            
            // Wait a bit to prevent double-clicking
            await page.waitForTimeout(1000);
          }
        }
      } catch (e) {
        // ignore occasional errors during loop
      }
      
      await page.waitForTimeout(500); // Check again every 0.5s
    }
  } catch (error) {
    console.error(`[${code}] Error:`, error.message);
  }
}

async function main() {
  // Use headless: false to actually open a visible browser with tabs
  // We use channel: 'msedge' so it uses your local Microsoft Edge and skips the download!
  const browser = await chromium.launch({ headless: false, channel: 'msedge' });
  
  // Use only 5 codes
  const testCodes = codes.slice(0, 5);
  console.log(`Starting simulation for ${testCodes.length} users...`);
  
  const promises = [];
  
  // 1. Open User Tabs
  for (let i = 0; i < testCodes.length; i++) {
    // Stagger joins by 500ms so backend doesn't get flooded all at once
    await new Promise(r => setTimeout(r, 500));
    promises.push(simulateUser(browser, testCodes[i]));
  }
  
  await Promise.all(promises);
  console.log('All simulations complete.');
}

main();

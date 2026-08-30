const { chromium, devices } = require('playwright');

// ── Config ──────────────────────────────────────────────────────────────────
const DESKTOP_COUNT = 5;
const MOBILE_COUNT  = 3;
const BASE_URL      = 'https://summons.ssdssc.com';

const codes = [
  'PHY-W2JE', 'PHY-MSW2', 'PHY-ZGDZ', 'PHY-XFTB', 'PHY-SA2Q',
  'PHY-PG2Z', 'PHY-T49W', 'PHY-CCXY', 'PHY-EZCK', 'PHY-4PZ7',
  'PHY-HHGQ', 'PHY-JD7F', 'PHY-8QYP', 'PHY-KSH6', 'PHY-7YS6',
  'PHY-W8NE', 'PHY-7JJV', 'PHY-9FM4', 'PHY-P9AX', 'PHY-48CC',
  'PHY-PA5Q', 'PHY-L5T2', 'PHY-AYQK', 'PHY-G2NG', 'PHY-JQFP',
  'PHY-AJQ8', 'PHY-J8RE', 'PHY-VXL3', 'PHY-3Q67', 'PHY-FK52',
  'PHY-JDSZ', 'PHY-VAKK', 'PHY-ZKB4', 'PHY-UF82', 'PHY-86B5'
];

const iphone = devices['iPhone 14'];

// ── Anti-cheat bypass ────────────────────────────────────────────────────────
// Patches ALL anti-cheat hooks the quiz page uses:
//   - document.hidden / visibilityState   (tab-switch check)
//   - window blur event                   (focus-lost check)
//   - document.fullscreenElement          (fullscreen check)
//   - requestFullscreen                   (fullscreen request)
const anticheatBypass = () => {
  // Tab visibility
  Object.defineProperty(document, 'hidden',          { get: () => false,    configurable: true });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });

  // Fullscreen — make the page think it's always in fullscreen
  document.documentElement.requestFullscreen = async () => {};
  Object.defineProperty(document, 'fullscreenElement', {
    get: () => document.documentElement,
    configurable: true,
  });

  // Window blur — suppress the event so the anti-cheat handler never fires
  const origAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = function (type, listener, options) {
    if (type === 'blur') return; // drop blur listeners silently
    origAddEventListener(type, listener, options);
  };
};

// ── Single user simulation ───────────────────────────────────────────────────
async function simulateUser(browser, code, mobile = false) {
  const context = mobile
    ? await browser.newContext({ ...iphone })
    : await browser.newContext();

  await context.addInitScript(anticheatBypass);

  const page = await context.newPage();
  const label = `[${mobile ? '📱' : '🖥️'} ${code}]`;

  // Detect unexpected navigation away from the quiz (crash / kick / redirect)
  let pageAlive = true;
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      const url = frame.url();
      if (!url.includes('/summons')) {
        pageAlive = false;
        console.log(`${label} Navigated away → ${url}`);
      }
    }
  });

  try {
    // ── Step 1: Enter code ─────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/summons`);
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.fill('input[type="text"]', code);
    await page.click('button[type="submit"]');

    // ── Step 2: Language selection ─────────────────────────────────────────
    await page.waitForSelector('#lang-english', { timeout: 15000 });
    await page.click('#lang-english');

    // ── Step 3: Wait for quiz to go live ───────────────────────────────────
    // After lang pick, if quiz is already active the page auto-navigates to /quiz.
    // If not, admin starts it later and the realtime subscription navigates automatically.
    // We wait for EITHER the "Enter The Summons" button OR the quiz page URL.
    console.log(`${label} Waiting for quiz to start...`);
    await Promise.race([
      page.waitForSelector('button:has-text("Enter The Summons")', { timeout: 0 }),
      page.waitForURL(`${BASE_URL}/summons/quiz`, { timeout: 0 }),
    ]);

    // If the "Enter" button appeared (quiz was already active), click it
    const enterBtn = await page.$('button:has-text("Enter The Summons")');
    if (enterBtn) await enterBtn.click();

    // Ensure we're on the quiz page now
    await page.waitForURL(`${BASE_URL}/summons/quiz`, { timeout: 10000 });
    console.log(`${label} ✅ Entered quiz.`);

    // ── Step 4: Quiz loop ──────────────────────────────────────────────────
    while (pageAlive) {
      const currentUrl = page.url();

      // If redirected to results, we're done
      if (currentUrl.includes('/summons/results')) {
        console.log(`${label} 🏁 Redirected to results.`);
        break;
      }

      // Check for Quiz Complete / Quiz Ended state
      const isDone = await page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('Quiz Complete') ||
               text.includes('Quiz Ended') ||
               text.includes('Results Published');
      }).catch(() => false);
      if (isDone) { console.log(`${label} 🏁 Quiz finished.`); break; }

      // Check for kicked modal
      const isKicked = await page.evaluate(() =>
        document.body.innerText.includes('Session Ended')
      ).catch(() => false);
      if (isKicked) { console.log(`${label} ⛔ Session kicked.`); break; }

      // Try to answer the current question
      try {
        const activeOptions = await page.$$('.option-btn:not([disabled])');

        if (activeOptions.length > 0) {
          // Simulate realistic thinking time: 2–8 seconds
          const waitTime = Math.floor(Math.random() * 6000) + 2000;
          await page.waitForTimeout(waitTime);

          // Re-fetch after thinking delay (options may have been disabled by timeout)
          const freshOptions = await page.$$('.option-btn:not([disabled])');
          if (freshOptions.length > 0) {
            const pick = freshOptions[Math.floor(Math.random() * freshOptions.length)];
            await pick.click();
            console.log(`${label} 📝 Answer submitted!`);
            // Brief pause to avoid double-click and let UI settle
            await page.waitForTimeout(800);
          }
        }
      } catch {
        // Ignore transient errors (element detached mid-click, etc.)
      }

      await page.waitForTimeout(400); // Poll interval
    }
  } catch (error) {
    // TimeoutError on waitForURL usually means browser was closed or page crashed
    if (!error.message.includes('closed')) {
      console.error(`${label} ❌ Error: ${error.message}`);
    }
  } finally {
    await context.close().catch(() => {});
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: false, channel: 'msedge' });

  // Graceful shutdown on Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n⛔ Interrupted — closing browser...');
    await browser.close().catch(() => {});
    process.exit(0);
  });

  const desktopCodes = codes.slice(0, DESKTOP_COUNT);
  const mobileCodes  = codes.slice(DESKTOP_COUNT, DESKTOP_COUNT + MOBILE_COUNT);

  console.log(`🚀 Starting ${desktopCodes.length} desktop + ${mobileCodes.length} mobile simulations...`);

  const promises = [];

  // Desktop users — staggered by 500ms each
  for (const code of desktopCodes) {
    await new Promise(r => setTimeout(r, 500));
    promises.push(simulateUser(browser, code, false));
  }

  // Mobile users — staggered by 500ms each
  for (const code of mobileCodes) {
    await new Promise(r => setTimeout(r, 500));
    promises.push(simulateUser(browser, code, true));
  }

  await Promise.all(promises);
  console.log('✅ All simulations complete.');
  await browser.close().catch(() => {});
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

const { chromium, devices } = require('playwright');

// ── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = process.env.QUIZ_URL || 'https://summons.ssdssc.com';
const DESKTOP_PER_SUBJECT = 20;
const requestedSubject = (process.argv[2] || 'all').toLowerCase();

if (!['all', 'physics', 'chemistry'].includes(requestedSubject)) {
  throw new Error('Usage: bun simulate_users.js [physics|chemistry|all]');
}

const physicsCodes = [
  'PHY-SA2Q', 'PHY-AYQK', 'PHY-PA5Q', 'PHY-L5T2', 'PHY-7YS6',
  'PHY-ZGDZ', 'PHY-J8RE', 'PHY-JDSZ', 'PHY-8QYP', 'PHY-KSH6',
  'PHY-PG2Z', 'PHY-MSW2', 'PHY-G2NG', 'PHY-FK52', 'PHY-P9AX',
  'PHY-48CC', 'PHY-CCXY', 'PHY-UF82', 'PHY-7JJV', 'PHY-XFTB',
  'PHY-HHGQ', 'PHY-9FM4', 'PHY-JD7F', 'PHY-ZKB4', 'PHY-W8NE',
  'PHY-4PZ7', 'PHY-86B5', 'PHY-3Q67', 'PHY-W2JE', 'PHY-EZCK',
  'PHY-AJQ8', 'PHY-JQFP', 'PHY-VAKK', 'PHY-T49W', 'PHY-VXL3',
];

const chemistryCodes = [
  'CHE-CW5S', 'CHE-V7YH', 'CHE-964S', 'CHE-PNB4', 'CHE-4PHF',
  'CHE-E6NC', 'CHE-FDCH', 'CHE-3H6L', 'CHE-CMXZ', 'CHE-Q8EM',
  'CHE-SNL4', 'CHE-HNEG', 'CHE-UUTF', 'CHE-9TED', 'CHE-MDA3',
  'CHE-BDX3', 'CHE-LKKE', 'CHE-JKQK', 'CHE-Q5CM', 'CHE-5GMP',
  'CHE-XVXT', 'CHE-QVDM', 'CHE-AAV6', 'CHE-J5HS', 'CHE-VN6X',
  'CHE-ZRMQ', 'CHE-54QU', 'CHE-D6KY', 'CHE-Z7L7', 'CHE-N6E4',
  'CHE-F3HJ', 'CHE-U6ZF', 'CHE-2L8K', 'CHE-LKU8', 'CHE-EV6T',
];

if (physicsCodes.length !== 35 || chemistryCodes.length !== 35) {
  throw new Error('Expected exactly 35 Physics and 35 Chemistry users');
}

// Interleave subjects: first 20 of each are desktop, remaining 15 are mobile.
const allUsers = physicsCodes.flatMap((code, index) => [
  { code, mobile: index >= DESKTOP_PER_SUBJECT },
  { code: chemistryCodes[index], mobile: index >= DESKTOP_PER_SUBJECT },
]);

if (allUsers.length !== 70 || allUsers.filter(user => !user.mobile).length !== 40) {
  throw new Error('Expected exactly 70 users: 40 desktop and 30 mobile');
}

const users = requestedSubject === 'all'
  ? allUsers
  : allUsers.filter(user => user.code.startsWith(requestedSubject === 'physics' ? 'PHY-' : 'CHE-'));

if (users.length !== (requestedSubject === 'all' ? 70 : 35)) {
  throw new Error(`Unexpected ${requestedSubject} user count`);
}

const iphone = devices['iPhone 14'];
let readyCount = 0;

// ── Single user simulation ───────────────────────────────────────────────────
async function simulateUser(context, code, mobile = false) {
  const page = await context.newPage();
  const label = `[${mobile ? '📱' : '🖥️'} ${code}]`;
  const metrics = {
    subject: code.startsWith('PHY-') ? 'physics' : 'chemistry',
    device: mobile ? 'mobile' : 'desktop',
    verifyMs: 0,
    waitingMs: 0,
    quizEnteredAt: 0,
    questionSeenAt: {},
    answerMs: [],
    errors: [],
  };
  const recordError = message => {
    if (metrics.errors.length < 20) metrics.errors.push(message);
  };

  page.on('pageerror', error => recordError(`page: ${error.message}`));
  page.on('requestfailed', request =>
    recordError(`request: ${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`));
  page.on('console', message => {
    if (message.type() === 'error') recordError(`console: ${message.text()}`);
  });

  try {
    // ── Step 1: Enter code ─────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/summons`);
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.fill('input[type="text"]', code);
    const verifyStartedAt = Date.now();
    await page.click('button[type="submit"]');

    // ── Step 2: Language selection ─────────────────────────────────────────
    await page.waitForSelector('#lang-english', { timeout: 15000 });
    metrics.verifyMs = Date.now() - verifyStartedAt;
    const languageStartedAt = Date.now();
    await page.click('#lang-english');

    // ── Step 3: Wait for quiz to go live ───────────────────────────────────
    // Require the waiting room so every user is ready before either quiz starts.
    const initialState = await Promise.race([
      page.waitForSelector('text=Standing By', { timeout: 15000 }).then(() => 'waiting'),
      page.waitForURL(`${BASE_URL}/summons/quiz`, { timeout: 15000 }).then(() => 'active'),
    ]);
    if (initialState === 'active') throw new Error('Quiz started before all users were ready');
    metrics.waitingMs = Date.now() - languageStartedAt;

    readyCount++;
    console.log(`${label} Ready (${readyCount}/${users.length})`);
    if (readyCount === users.length) {
      const label = requestedSubject === 'all' ? 'Physics and Chemistry' : requestedSubject;
      console.log(`✅ All ${users.length} ${label} users are waiting. Start the quiz now.`);
    }

    await page.waitForURL(`${BASE_URL}/summons/quiz`, { timeout: 0 });
    metrics.quizEnteredAt = Date.now();
    console.log(`${label} ✅ Entered quiz.`);

    // ── Step 4: Quiz loop ──────────────────────────────────────────────────
    const answeredQuestions = new Set();
    let loadingSince = 0;
    const finish = () => ({
      ...metrics,
      answered: answeredQuestions.size,
      ok: answeredQuestions.size === 20 && metrics.errors.length === 0,
    });

    while (!page.isClosed()) {
      const currentUrl = page.url();

      // If redirected to results, we're done
      if (currentUrl.includes('/summons/results')) {
        console.log(`${label} 🏁 Redirected to results.`);
        return finish();
      }

      if (!currentUrl.includes('/summons/quiz')) {
        throw new Error(`Unexpected navigation → ${currentUrl}`);
      }

      const pageText = await page.locator('body').innerText().catch(() => '');

      if (pageText.includes('Quiz Complete') || pageText.includes('Results Published')) {
        console.log(`${label} 🏁 Quiz finished.`);
        return finish();
      }

      if (pageText.includes('Session Ended')) throw new Error('Session kicked');
      if (pageText.includes('This page couldn’t load')) throw new Error('Quiz page crashed');

      if (pageText.includes('Loading quiz...')) {
        loadingSince ||= Date.now();
        if (Date.now() - loadingSince > 15000) throw new Error('Quiz stuck loading for 15 seconds');
      } else {
        loadingSince = 0;
      }

      // Try to answer the current question
      try {
        const questionMatch = pageText.match(/(?:^|\n)Q(\d+)(?:\n|$)/);
        const questionNumber = questionMatch ? Number(questionMatch[1]) : 0;
        const activeOptions = page.locator('.option-btn:not([disabled])');

        if (questionNumber && !metrics.questionSeenAt[questionNumber]) {
          metrics.questionSeenAt[questionNumber] = Date.now();
        }

        if (questionNumber && !answeredQuestions.has(questionNumber) && await activeOptions.count()) {
          // Simulate realistic thinking time: 2–8 seconds
          const waitTime = Math.floor(Math.random() * 6000) + 2000;
          await page.waitForTimeout(waitTime);

          // Skip if the admin advanced while this user was thinking.
          const freshText = await page.locator('body').innerText();
          const freshQuestion = Number(freshText.match(/(?:^|\n)Q(\d+)(?:\n|$)/)?.[1] ?? 0);
          const freshOptions = page.locator('.option-btn:not([disabled])');
          const optionCount = await freshOptions.count();

          if (freshQuestion === questionNumber && optionCount) {
            const pick = freshOptions.nth(Math.floor(Math.random() * optionCount));
            const choice = (await pick.locator('.option-letter').innerText()).trim();
            const answerStartedAt = Date.now();
            const [response] = await Promise.all([
              page.waitForResponse(
                res => res.url().includes('/api/submit-answer') && res.request().method() === 'POST',
                { timeout: 10000 },
              ),
              pick.click(),
            ]);
            const answerMs = Date.now() - answerStartedAt;

            const responseBody = await response.json().catch(() => ({}));
            if (response.ok()) {
              metrics.answerMs.push(answerMs);
              answeredQuestions.add(questionNumber);
              console.log(`${label} 📝 Q${questionNumber} → ${choice}`);
            } else {
              const message = `Q${questionNumber} rejected (${response.status()}): ${responseBody.error ?? 'unknown error'}`;
              recordError(message);
              console.error(`${label} ⚠️ ${message}`);
            }
          }
        }
      } catch (error) {
        recordError(`answer: ${error.message}`);
        console.error(`${label} ⚠️ Transient answer error: ${error.message}`);
      }

      await page.waitForTimeout(400); // Poll interval
    }
    throw new Error('Quiz page closed unexpectedly');
  } catch (error) {
    // TimeoutError on waitForURL usually means browser was closed or page crashed
    if (!error.message.includes('closed')) {
      console.error(`${label} ❌ Error: ${error.message}`);
    }
    recordError(error.message);
    return { ...metrics, ok: false };
  } finally {
    await page.close().catch(() => {});
  }
}

function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { samples: 0 };
  const at = percentile => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)];
  return {
    samples: sorted.length,
    avg: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: at(0.5),
    p95: at(0.95),
    max: sorted.at(-1),
  };
}

function printBenchmark(results) {
  const completed = results.filter(result => result?.ok);
  const answerTimes = results.flatMap(result => result?.answerMs ?? []);
  const questionGroups = new Map();

  for (const result of results) {
    for (const [question, seenAt] of Object.entries(result?.questionSeenAt ?? {})) {
      const key = `${result.subject}-Q${question}`;
      questionGroups.set(key, [...(questionGroups.get(key) ?? []), seenAt]);
    }
  }

  const questionFanout = [...questionGroups.values()]
    .filter(times => times.length > 1)
    .map(times => Math.max(...times) - Math.min(...times));
  const startFanout = Object.fromEntries(['physics', 'chemistry'].map(subject => {
    const times = results.filter(result => result?.subject === subject && result.quizEnteredAt).map(result => result.quizEnteredAt);
    return [subject, times.length > 1 ? Math.max(...times) - Math.min(...times) : null];
  }));

  console.log('\n📊 Client benchmark (milliseconds)');
  console.log(JSON.stringify({
    users: results.length,
    completed: completed.length,
    failed: results.length - completed.length,
    clientErrors: results.reduce((sum, result) => sum + (result?.errors.length ?? 0), 0),
    verifyAccess: stats(results.map(result => result?.verifyMs).filter(value => value > 0)),
    languageToWaiting: stats(results.map(result => result?.waitingMs).filter(value => value > 0)),
    answerApi: stats(answerTimes),
    quizStartFanout: startFanout,
    questionRenderFanout: stats(questionFanout),
  }, null, 2));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const desktopContext = await browser.newContext();
  const mobileContext = await browser.newContext({ ...iphone });

  // Graceful shutdown on Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n⛔ Interrupted — closing browser...');
    await browser.close().catch(() => {});
    process.exit(0);
  });

  const desktopCount = users.filter(user => !user.mobile).length;
  const mobileCount = users.length - desktopCount;
  console.log(`🚀 Starting ${desktopCount} desktop + ${mobileCount} mobile simulations...`);

  const promises = [];

  // Interleaved Physics/Chemistry users — staggered by 500ms each.
  for (const user of users) {
    await new Promise(r => setTimeout(r, 500));
    promises.push(simulateUser(user.mobile ? mobileContext : desktopContext, user.code, user.mobile));
  }

  const results = await Promise.all(promises);
  const passed = results.filter(result => result?.ok).length;
  console.log(`✅ Simulations complete: ${passed}/${results.length} finished cleanly.`);
  printBenchmark(results);
  if (passed !== results.length) process.exitCode = 1;
  await Promise.all([desktopContext.close(), mobileContext.close()]);
  await browser.close().catch(() => {});
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { stats, users };

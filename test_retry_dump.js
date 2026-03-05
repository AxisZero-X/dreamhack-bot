const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

(async () => {
  let browser, page;
  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    await ensureLoggedIn(page);

    console.log('Navigating to Exam 916...');
    await page.goto('https://learn.dreamhack.io/exam/916', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    // Click choice
    await page.evaluate(() => {
      const q = document.querySelector('.quiz-question');
      q.querySelector('.choice').click();
    });
    await randomDelay(1000);

    // Click submit
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
      btns.find(b => b.innerText.includes('확인')).click();
    });
    await randomDelay(1000);

    // Wait for wrong state
    await page.waitForFunction(() => document.querySelector('.is-wrong') !== null);
    console.log('State is now wrong. Clicking Retry...');

    // Try Ghost-cursor click on retry
    const { createCursor } = require('ghost-cursor');
    const cursor = createCursor(page);
    const retryHandle = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('.btn.btn-primary')).find(b => b.innerText.includes('재도전'));
    });
    const el = retryHandle.asElement();
    if (el) {
       await cursor.click(el);
       await retryHandle.dispose();
    } else {
       console.log("NO RETRY BUTTON FOUND!");
    }

    await randomDelay(2000, 2000);
    
    // Dump state
    const dump = await page.evaluate(() => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      return qs.map(q => ({
        classes: q.className,
        mainClasses: q.querySelector('.question-main')?.className,
        display: getComputedStyle(q).display,
        isWrong: !!q.querySelector('.is-wrong') || q.classList.contains('is-wrong'),
        choices: Array.from(q.querySelectorAll('.choice')).map(c => c.className),
        html: q.innerHTML.substring(0, 100)
      }));
    });
    console.log(JSON.stringify(dump, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
})();

const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

(async () => {
  let browser, page;
  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    await ensureLoggedIn(page);

    console.log('Navigating to Exam...');
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
    console.log('State is now wrong. Clicking Retry using mouse coords...');

    const box = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
      const retry = btns.find(b => b.innerText.includes('재도전'));
      if (!retry) return null;
      retry.scrollIntoView({block: 'center'});
      const rect = retry.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    if (box) {
      console.log('Retry button box:', box);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      console.log('Retry button not found!');
    }

    await randomDelay(2000);
    const hasRetry = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
      return !!btns.find(b => b.innerText.includes('재도전'));
    });
    
    console.log(`Has retry button still? ${hasRetry}`);
    
    // dump classes to see if is-wrong is gone
    const isWrong = await page.evaluate(() => !!document.querySelector('.is-wrong'));
    console.log(`Is wrong class present? ${isWrong}`);

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
})();

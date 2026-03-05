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

    await page.evaluate(() => {
      const q = document.querySelector('.quiz-question');
      q.querySelector('.choice').click();
    });
    await randomDelay(1000);

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary'));
      btns.find(b => b.innerText.includes('확인')).click();
    });
    await randomDelay(1000);

    await page.waitForFunction(() => document.querySelector('.is-wrong') !== null);
    console.log('State is now wrong. Taking screenshot...');
    
    await page.screenshot({ path: 'exam_wrong_state.png', fullPage: true });
    
    const btnsInfo = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.btn.btn-primary')).map(b => ({
        text: b.innerText.trim(),
        visible: b.offsetParent !== null,
        classes: b.className
      }));
    });
    console.log('Buttons:', btnsInfo);

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
})();

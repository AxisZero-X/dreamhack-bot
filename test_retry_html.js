const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

(async () => {
  let browser, page;
  try {
    browser = await launchBrowser();
    page = await browser.newPage();
    await ensureLoggedIn(page);

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

    await page.waitForFunction(() => document.querySelector('.is-wrong') !== null);
    
    // Dump HTML of retry button and its parent
    const dump = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button'));
      const retry = btns.find(b => b.innerText.includes('재도전'));
      if (!retry) return 'Not found';
      return {
        outerHTML: retry.outerHTML,
        parentHTML: retry.parentElement ? retry.parentElement.outerHTML : null,
        tag: retry.tagName,
        classes: retry.className
      };
    });
    console.log(JSON.stringify(dump, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
})();

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
      const submitBtn = btns.find(b => b.offsetParent !== null && b.innerText.includes('확인'));
      if(submitBtn) submitBtn.click();
    });
    await randomDelay(1000);

    await page.waitForFunction(() => document.querySelector('.is-wrong') !== null);
    
    // Dump all retry buttons
    const dump = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button'));
      const retries = btns.filter(b => b.innerText.includes('재도전'));
      return retries.map(r => ({
        visible: r.offsetParent !== null,
        classes: r.className,
        parentTag: r.parentElement ? r.parentElement.tagName : null,
        outerHTML: r.outerHTML
      }));
    });
    console.log(JSON.stringify(dump, null, 2));
    
    // Test click on the VISIBLE one
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button'));
      const retry = btns.find(b => b.innerText.includes('재도전') && b.offsetParent !== null);
      if (retry) {
        retry.click();
      }
    });
    
    await randomDelay(1000);
    const isWrong = await page.evaluate(() => !!document.querySelector('.is-wrong'));
    console.log('Is still wrong after clicking VISIBLE retry?', isWrong);

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
})();

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

    // Click the first choice of the first question
    console.log('Clicking first choice...');
    const choiceClicked = await page.evaluate(() => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const q = qs.find(el => el.offsetParent !== null);
      if (!q) return false;
      const choice = q.querySelector('.choice');
      if (choice) {
        choice.scrollIntoView({block: 'center'});
        choice.click();
        return true;
      }
      return false;
    });
    console.log('Choice clicked:', choiceClicked);
    await randomDelay(1000, 1000);

    // Click '확인' (Submit)
    console.log('Clicking Submit...');
    const submitClicked = await page.evaluate(() => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const q = qs.find(el => el.offsetParent !== null);
      const btns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).filter(b => b.offsetParent !== null);
      const btn = btns.find(b => b.innerText.includes('확인') && (!b.closest('.quiz-question') || b.closest('.quiz-question') === q));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });
    console.log('Submit clicked:', submitClicked);
    await randomDelay(1000, 1000);

    // Check state (should be wrong)
    const isWrong = await page.evaluate(() => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const q = qs.find(el => el.offsetParent !== null);
      return q && q.querySelector('.question-main').classList.contains('is-wrong');
    });
    console.log('Is wrong state:', isWrong);

    if (isWrong) {
      console.log('Trying to click Retry...');
      const hasRetry = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary'));
        const retryBtn = btns.find(b => b.offsetParent !== null && (b.innerText.includes('재도전') || b.innerText.includes('다시')));
        if (retryBtn) {
          console.log('Found retry button. Clicking using pure JS click()...');
          retryBtn.click();
          return true;
        }
        return false;
      });
      console.log('Has retry button and clicked:', hasRetry);
      
      await randomDelay(1000, 1000);

      const stillWrong = await page.evaluate(() => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetParent !== null);
        return q && q.querySelector('.question-main').classList.contains('is-wrong');
      });
      console.log('Still wrong after native click?', stillWrong);
    }

  } catch (err) {
    console.error(err);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
})();

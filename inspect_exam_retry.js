require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function inspectRetry() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 수료 퀴즈 페이지로 이동합니다...');
    await page.goto('https://learn.dreamhack.io/exam/916', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    // 스텝 기반이면 첫 번째 문제
    console.log('옵션 클릭 시도...');
    const result = await page.evaluate(async () => {
      const q = document.querySelector('.quiz-question');
      if (!q) return 'No question found';
      
      const choice = q.querySelector('.choice');
      if (choice) {
        choice.click();
        return 'Clicked choice: ' + choice.innerText;
      }
      return 'No choice found';
    });
    console.log(result);
    await randomDelay(1000, 1500);

    console.log('확인 버튼 클릭 시도...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('.btn')).find(b => b.innerText.includes('확인'));
      if (btn) btn.click();
    });
    await randomDelay(2000, 3000);

    console.log('재도전 버튼 분석...');
    const retryInfo = await page.evaluate(() => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const visibleQs = qs.filter(el => el.offsetParent !== null);
      const q = visibleQs[0] || qs[0];
      
      const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
        if (!(b.offsetParent !== null)) return false;
        const parentQ = b.closest('.quiz-question');
        return (!parentQ || parentQ === q) && (b.innerText.includes('재도전') || b.innerText.includes('다시'));
      });

      if (!btn) return '재도전 버튼 없음';
      
      return {
        html: btn.outerHTML,
        className: btn.className,
        disabled: btn.disabled,
        pointerEvents: window.getComputedStyle(btn).pointerEvents,
        opacity: window.getComputedStyle(btn).opacity,
        display: window.getComputedStyle(btn).display,
        visibility: window.getComputedStyle(btn).visibility,
      };
    });
    console.log('Retry btn info:', retryInfo);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

inspectRetry();

require('dotenv').config();
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');

async function testSolveQuiz() {
  let browser, page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());

    await ensureLoggedIn(page);

    console.log('🔗 퀴즈 24 페이지로 이동합니다...');
    await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
    await randomDelay(3000, 4000);

    const qs = await page.$$('.quiz-question');
    console.log(`총 ${qs.length}문제`);

    for (let qIdx = 0; qIdx < qs.length; qIdx++) {
      console.log(`\nBrute forcing Q${qIdx + 1}...`);
      
      const choiceCount = await page.evaluate((idx) => {
        return document.querySelectorAll('.quiz-question')[idx].querySelectorAll('.choice').length;
      }, qIdx);

      let correct = false;
      for (let c = 0; c < choiceCount; c++) {
        await page.evaluate((idx, cIdx) => {
          const q = document.querySelectorAll('.quiz-question')[idx];
          q.querySelectorAll('.choice')[cIdx].click();
        }, qIdx, c);
        await randomDelay(500, 1000);
        
        await page.evaluate((idx) => {
          const q = document.querySelectorAll('.quiz-question')[idx];
          const btn = q.querySelector('.btn.btn-primary');
          if (btn) btn.click();
        }, qIdx);
        await randomDelay(1000, 2000);

        correct = await page.evaluate((idx) => {
          const q = document.querySelectorAll('.quiz-question')[idx];
          const btn = q.querySelector('.btn.btn-primary');
          if (q.querySelector('.is-correct') || q.querySelector('.is-success') || q.querySelector('.check-icon')) return true;
          if (btn && btn.innerText.includes('다음 문제')) return true;
          if (btn && btn.innerText.includes('재도전')) {
              btn.click();
              return false;
          }
          return false;
        }, qIdx);

        if (correct) {
          console.log(`Q${qIdx + 1} Correct at choice ${c}!`);
          break;
        }
        await randomDelay(1000, 2000);
      }

      if (correct) {
        const hasNext = await page.evaluate((idx) => {
            const q = document.querySelectorAll('.quiz-question')[idx];
            const btn = q.querySelector('.btn.btn-primary');
            if (btn && btn.innerText.includes('다음 문제')) {
                btn.click();
                return true;
            }
            return false;
        }, qIdx);
        if (hasNext) {
            console.log(`Clicked '다음 문제' for Q${qIdx + 1}`);
            await randomDelay(2000, 3000);
        } else {
            console.log(`No '다음 문제' button for Q${qIdx + 1}`);
        }
      }
    }

    console.log("\n모든 문제 풀이 완료. 최종 버튼 상태 확인:");
    const finalState = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, a, .btn, .el-button')).filter(b => b.offsetParent !== null && b.innerText.trim().length > 0);
      return allBtns.map(b => ({ tag: b.tagName, text: b.innerText.trim() }));
    });
    console.table(finalState);

  } catch (error) {
    console.error('테스트 실패:', error);
  } finally {
    if (browser) await browser.disconnect();
    process.exit(0);
  }
}

testSolveQuiz();

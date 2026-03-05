const puppeteer = require('puppeteer-core');
const { createCursor } = require('ghost-cursor');
const { CHROME_PATH, SELECTORS } = require('./config');

const randomDelay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    userDataDir: './.chrome_profile',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  
  const page = await browser.newPage();
  const cursor = createCursor(page);
  
  // Go directly to quiz 24
  await page.goto('https://learn.dreamhack.io/quiz/24', { waitUntil: 'networkidle2' });
  await randomDelay(3000, 5000);
  
  console.log('🏁 퀴즈/수료 퀴즈 최종 제출을 시도합니다...');
  await randomDelay(3000, 5000);

  try {
    const btnText = await page.evaluate(() => {
      const submitKeywords = ['제출', '결과', 'Finish', 'Submit', 'Done', '채점', '완료'];
      const btns = Array.from(document.querySelectorAll('button, a, .btn, .el-button'));
      const visibleBtns = btns.filter(b => b.offsetParent !== null);

      const targetBtn = visibleBtns.find(btn =>
        submitKeywords.some(k => btn.innerText.includes(k)) &&
        !btn.innerText.includes('재도전') &&
        !btn.innerText.includes('다시') &&
        !btn.innerText.includes('다음 문제') &&
        !btn.innerText.includes('다음 주제로') &&
        !btn.innerText.includes('진행하기')
      );
      
      if (!targetBtn) {
        // Log all visible buttons to help debug
        const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
        console.log("DEBUG_VISIBLE_BTNS:", JSON.stringify(allBtnTexts));
      }

      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      
      const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
      return { debugBtns: allBtnTexts };
    });

    if (btnText && typeof btnText === 'string') {
      console.log(`🖱️  최종 제출 버튼 [${btnText}] 클릭 완료`);
      await randomDelay(3000, 5000);

      // 혹시 모를 확인 모달 처리 (예: "정말 제출하시겠습니까?")
      await page.evaluate(() => {
        const confirmBtn = document.querySelector('.el-message-box__btns .el-button--primary');
        if (confirmBtn) confirmBtn.click();
      });
      await randomDelay(2000, 4000);
    } else if (btnText && btnText.debugBtns) {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 현재 보이는 버튼들:', btnText.debugBtns);
    } else {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 이미 제출되었거나 버튼 형식이 다를 수 있습니다.');
    }
    
    // 최종 수료 팝업 확인 (임시 mock 함수 구현)
    const checkCompletionPopup = async () => false;
    const completed = await checkCompletionPopup(page, cursor);
    if (completed) {
      console.log('🎉 퀴즈가 성공적으로 처리되었습니다.');
    } else {
      // 팝업이 안 떴다면 다음 주제로 / 진행하기 버튼 클릭 시도 (일반 퀴즈인 경우)
      console.log('팝업 안뜸. 다음 주제로/진행하기 버튼 클릭 시도');
      
      const completeBtnText = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a, .btn, .el-button'));
        const visibleBtns = btns.filter(b => b.offsetParent !== null);
  
        // '진행하기' 버튼을 우선적으로 찾음
        let completeBtn = visibleBtns.find(btn => btn.innerText.includes('진행하기'));
  
        // 없으면 '다음 주제로' 버튼 찾음
        if (!completeBtn) {
          completeBtn = visibleBtns.find(btn => btn.innerText.includes('다음 주제로'));
        }
        
        // 없으면 '목록으로' 버튼 찾음
        if (!completeBtn) {
          completeBtn = visibleBtns.find(btn => btn.innerText.includes('목록으로'));
        }
  
        if (completeBtn) {
          completeBtn.click();
          return completeBtn.innerText.trim();
        }
        
        const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
        return { debugBtns: allBtnTexts };
      });
      
      if (completeBtnText && typeof completeBtnText === 'string') {
        console.log(`🖱️  [${completeBtnText}] 버튼 클릭 완료`);
      } else if (completeBtnText && completeBtnText.debugBtns) {
        console.log('⚠️  수강 완료 버튼("진행하기"/"다음 주제로")을 찾지 못했습니다. 현재 보이는 버튼들:', completeBtnText.debugBtns);
      }
      
      await randomDelay(2000, 4000);
    }
  } catch (err) {
    console.log('⚠️  퀴즈 최종 제출 처리 중 에러:', err.message);
  }
  
  await browser.close();
}

main();

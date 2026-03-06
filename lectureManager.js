const { DELAY, SELECTORS } = require('./config');
const { randomDelay, randomScroll, getDynamicDelayFromPage } = require('./utils');
const logger = require('./logger');

/**
 * 일반 강의 시청 (체류 및 스크롤) 후 '진행하기'/'다음 주제로' 클릭 처리
 * bot.js의 인라인 강의 처리 로직을 통합한 강화 버전
 */
async function processLecture(page, cursor, { skipQuiz = false, detectQuizFn = null, solveQuizFn = null } = {}) {
  let lectureCompleted = false;
  let previousWordCount = 0; // 이전에 이미 읽고 지나간 텍스트 분량 추적

  while (!lectureCompleted) {
    // 난이도별 동적 딜레이 적용 (새로 노출된 텍스트 분량만 계산)
    const dynamicDelay = await getDynamicDelayFromPage(page, previousWordCount);
    logger.info(`📖 강의 내용 읽는 중... (난이도: ${dynamicDelay.level}, ${Math.floor(dynamicDelay.min / 1000)}~${Math.floor(dynamicDelay.max / 1000)}초)`);

    // 다음에 읽을 분량 누적을 위해 현재 총 글자 수 기록
    if (dynamicDelay.totalWordCount !== undefined) {
      previousWordCount = dynamicDelay.totalWordCount;
    }

    await Promise.all([
      randomDelay(dynamicDelay.min, dynamicDelay.max),
      randomScroll(page),
    ]);

    // 강의 중간에 삽입된 퀴즈 확인
    if (!skipQuiz && solveQuizFn) {
      let hasQuizInPage = false;
      try {
        hasQuizInPage = await page.evaluate((choiceSel) => {
          const choices = document.querySelectorAll(choiceSel);
          return Array.from(choices).some(el => el.offsetParent !== null);
        }, SELECTORS.QUIZ_CHOICE);
      } catch { /* 페이지 이동 중일 수 있음 */ }

      if (hasQuizInPage) {
        logger.info('💡 강의 내에 퀴즈가 감지되었습니다. 퀴즈 풀이를 시도합니다.');
        await solveQuizFn(page, cursor);
        await randomDelay(1000, 2000);
      }
    }

    // 수강 완료 버튼 클릭
    await clickCompleteButton(page, cursor);
    await randomDelay(3000, 5000);

    // 팝업 검사
    lectureCompleted = await checkCompletionPopup(page, cursor);

    if (!lectureCompleted) {
      logger.info('➡️ 다음 단락/페이지로 넘어갔습니다. 새로 노출된 내용을 읽습니다.');
    }
  }
}

/**
 * 수강 완료 버튼 클릭 (있을 경우) — bot.js의 강화된 버전
 */
async function clickCompleteButton(page, cursor) {
  try {
    await page.waitForFunction((sel) => {
      const btns = Array.from(document.querySelectorAll(sel));
      const visibleBtns = btns.filter(b => b.offsetParent !== null);
      return visibleBtns.some(btn => btn.innerText.includes('진행하기') || btn.innerText.includes('다음 주제로'));
    }, { timeout: 5000 }, SELECTORS.COMPLETE_BTN).catch(() => { });

    const btnText = await page.evaluate((sel) => {
      const btns = Array.from(document.querySelectorAll(sel));
      const visibleBtns = btns.filter(b => b.offsetParent !== null);

      let targetBtn = visibleBtns.find(btn => btn.innerText.includes('진행하기'));
      if (!targetBtn) targetBtn = visibleBtns.find(btn => btn.innerText.includes('다음 주제로'));
      if (!targetBtn) targetBtn = visibleBtns.find(btn => btn.innerText.includes('목록으로'));

      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      return null;
    }, SELECTORS.COMPLETE_BTN);

    if (btnText) {
      logger.info(`🖱️  [${btnText}] 버튼 클릭 완료`);
    } else {
      logger.warn('⚠️  수강 완료 버튼("진행하기"/"다음 주제로")을 찾지 못했습니다.');
    }
  } catch (err) {
    // 버튼 대기 에러 무시
  }
}

/**
 * 축하 팝업 확인 (커리큘럼으로 / 다음 목표로)
 * 팝업이 뜨면 해당 버튼을 클릭하고 true를 반환. 안 뜨면 false.
 */
async function checkCompletionPopup(page, cursor) {
  try {
    const isPopupVisible = await page.evaluate((headerSel) => {
      const header = document.querySelector(headerSel);
      return header && header.innerText.includes('축하합니다');
    }, SELECTORS.POPUP_HEADER);

    if (isPopupVisible) {
      logger.info('🎉 축하합니다! 팝업 확인됨.');

      const btnText = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, a, div[role="button"], .slot-wrapper'));
        const visibleElements = elements.filter(el => el.offsetParent !== null);

        let targetBtn = visibleElements.find(el => el.innerText.includes('다음 목표로'));
        if (!targetBtn) targetBtn = visibleElements.find(el => el.innerText.includes('커리큘럼으로'));

        if (targetBtn) {
          targetBtn.click();
          return targetBtn.innerText.trim();
        }
        return null;
      });

      if (btnText) {
        logger.info(`🖱️  팝업 내 [${btnText}] 버튼 클릭 완료`);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

module.exports = {
  processLecture,
  clickCompleteButton,
  checkCompletionPopup,
};

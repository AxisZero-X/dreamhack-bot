const { DELAY, SELECTORS } = require('./config');
const { randomDelay, randomScroll } = require('./utils');
const logger = require('./logger');

/**
 * 일반 강의 시청 (체류 및 스크롤) 후 '진행하기'/'다음 주제로' 클릭 처리
 */
async function processLecture(page, cursor) {
  let lectureCompleted = false;

  while (!lectureCompleted) {
    logger.info('📖 강의 내용 읽는 중... (스크롤 + 체류)');
    await Promise.all([
      randomDelay(DELAY.PAGE_STAY_MIN, DELAY.PAGE_STAY_MAX),
      randomScroll(page),
    ]);

    // 페이지 하단의 '진행하기' 혹은 '다음 주제로' 버튼 클릭 (이동이 발생할 수 있음)
    await clickCompleteButton(page, cursor);

    // 클릭 후 페이지가 변경/렌더링 될 시간을 대기
    await randomDelay(2000, 4000);

    // 팝업 검사 (축하합니다!)
    lectureCompleted = await checkCompletionPopup(page, cursor);

    if (!lectureCompleted) {
      logger.info('➡️ 다음 페이지로 넘어갔습니다. 계속 진행합니다.');
    }
  }
}

/**
 * 수강 완료 버튼 클릭 (있을 경우)
 */
async function clickCompleteButton(page, cursor) {
  try {
    // 버튼이 나타날 때까지 최대 5초 대기
    await page.waitForFunction((sel) => {
      const btns = document.querySelectorAll(sel);
      return Array.from(btns).some(btn => btn.innerText.includes('진행하기') || btn.innerText.includes('다음 주제로'));
    }, { timeout: 5000 }, SELECTORS.COMPLETE_BTN).catch(() => {});

    const btnText = await page.evaluate((sel) => {
      const btns = Array.from(document.querySelectorAll(sel));

      // '진행하기' 버튼을 우선적으로 찾음
      let targetBtn = btns.find(btn => btn.innerText.includes('진행하기'));

      // 없으면 '다음 주제로' 버튼 찾음
      if (!targetBtn) {
        targetBtn = btns.find(btn => btn.innerText.includes('다음 주제로'));
      }

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
    logger.warn(`⚠️  버튼 대기 에러 (강의 종료 또는 다음 버튼 없음): ${err.message}`);
  }
}

/**
 * 축하 팝업 확인 (커리큘럼으로 / 다음 목표로)
 * 팝업이 뜨면 해당 버튼을 클릭하고 true를 반환. 안 뜨면 false.
 */
async function checkCompletionPopup(page, cursor) {
  try {
    // 팝업 헤더가 있는지 확인
    const isPopupVisible = await page.evaluate((headerSel) => {
      const header = document.querySelector(headerSel);
      return header && header.innerText.includes('축하합니다');
    }, SELECTORS.POPUP_HEADER);

    if (isPopupVisible) {
      logger.info('🎉 축하합니다! 팝업 확인됨.');

      // '커리큘럼으로' 혹은 '다음 목표로' 버튼 클릭
      const btnText = await page.evaluate((sel) => {
        const wrappers = document.querySelectorAll(sel);
        for (const w of wrappers) {
          if (w.innerText.includes('커리큘럼으로') || w.innerText.includes('다음 목표로')) {
            w.click();
            return w.innerText.trim();
          }
        }
        return null;
      }, SELECTORS.SLOT_WRAPPER);

      if (btnText) {
        logger.info(`🖱️  팝업 내 [${btnText}] 버튼 클릭 완료`);
      }
      return true; // 강의 완전히 수료됨
    }
    return false; // 아직 팝업 안뜸, 계속 진행
  } catch (err) {
    return false;
  }
}

module.exports = {
  processLecture,
};
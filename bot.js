const { createCursor } = require('ghost-cursor');
const { CURRICULUM_URL, DELAY, SELECTORS } = require('./config');
const { launchBrowser, ensureLoggedIn, randomDelay, safeGoto } = require('./utils');
const { detectQuiz, solveQuiz } = require('./quizManager');
const { processLecture } = require('./lectureManager');
const logger = require('./logger');

(async () => {
  logger.info('🚀 드림핵 자동 수강 봇 시작...\n');

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);

  try {
    // === 0단계: 로그인 확인 ===
    await ensureLoggedIn(page);

    // === 1단계: 커리큘럼 페이지에서 미완료 강의 목록 추출 ===
    logger.info(`📚 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await safeGoto(page, CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 5000);

    logger.info('🔍 미완료 강의 목록 파싱 중...');
    const lectureUrls = await page.evaluate(
      (itemSel, incompleteSel, linkSel) => {
        const urls = [];
        const items = document.querySelectorAll(itemSel);
        items.forEach(item => {
          const isIncomplete = item.querySelector(incompleteSel) !== null;
          if (isIncomplete) {
            const linkEl = item.querySelector(linkSel);
            if (linkEl && linkEl.href) {
              urls.push(linkEl.href);
            }
          }
        });
        return urls;
      },
      SELECTORS.LECTURE_ITEM,
      SELECTORS.INCOMPLETE_INDICATOR,
      SELECTORS.LECTURE_LINK,
    );

    logger.info(`🎯 미완료 강의 ${lectureUrls.length}개 발견\n`);

    if (lectureUrls.length === 0) {
      logger.info('✅ 모든 강의가 수료되었거나, 셀렉터를 확인하세요.');
      await browser.close();
      return;
    }

    // === 2단계: 각 강의 순회 ===
    for (let i = 0; i < lectureUrls.length; i++) {
      const url = lectureUrls[i];
      logger.info(`\n▶️  [${i + 1}/${lectureUrls.length}] ${url}`);

      // 자동화 불가능한 페이지(예: 워게임 챌린지) 스킵
      if (url.includes('wargame/challenges')) {
        logger.warn('⚠️  워게임 챌린지 페이지가 감지되었습니다. 자동화를 스킵합니다.');
        continue;
      }

      try {
        await safeGoto(page, url, { waitUntil: 'networkidle2' });

        // 퀴즈 페이지인지 확인
        const isQuiz = await detectQuiz(page);

        if (isQuiz) {
          await solveQuiz(page, cursor);
        } else {
          await processLecture(page, cursor);
        }

        logger.info(`✅ [${i + 1}] 완료`);
      } catch (lectureError) {
        logger.error(`❌ 강의 처리 중 에러 발생 (건너뜀): ${url}`);
        logger.error(lectureError.message);
        // 다음 강의로 계속 진행
      }

      // 다음 강의 전 자연스러운 대기
      if (i < lectureUrls.length - 1) {
        logger.info('🔄 다음 강의 준비...');
        await randomDelay(DELAY.BETWEEN_LECTURES_MIN, DELAY.BETWEEN_LECTURES_MAX);
      }
    }

    logger.info('\n🎉 모든 강의 순회 완료!');

    // === 3단계: 최종 완료 검증 ===
    logger.info(`\n🔍 최종 검증을 위해 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await safeGoto(page, CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 5000);

    const remainingUrls = await page.evaluate(
      (itemSel, incompleteSel, linkSel) => {
        const urls = [];
        const items = document.querySelectorAll(itemSel);
        items.forEach(item => {
          const isIncomplete = item.querySelector(incompleteSel) !== null;
          if (isIncomplete) {
            const linkEl = item.querySelector(linkSel);
            if (linkEl && linkEl.href) {
              urls.push(linkEl.href);
            }
          }
        });
        return urls;
      },
      SELECTORS.LECTURE_ITEM,
      SELECTORS.INCOMPLETE_INDICATOR,
      SELECTORS.LECTURE_LINK,
    );

    if (remainingUrls.length === 0) {
      logger.info('✅ 완벽합니다! 모든 강의와 퀴즈가 성공적으로 수료 처리되었습니다.');
    } else {
      logger.warn(`⚠️ 검증 결과, 아직 미완료 처리된 항목이 ${remainingUrls.length}개 남아있습니다.`);
      remainingUrls.forEach((url, idx) => {
        logger.warn(`  - [${idx + 1}] ${url}`);
      });
      logger.info('재실행을 통해 남은 항목들을 마저 수료할 수 있습니다.');
    }

  } catch (error) {
    logger.error(`❌ 에러 발생: ${error.message}`);
    logger.error(error.stack);
  } finally {
    logger.info('브라우저 세션 유지 중. 수동으로 닫아주세요.');
    // await browser.close();
  }
})();

const { DELAY, SELECTORS } = require('./config');
const { randomDelay } = require('./utils');
const logger = require('./logger');

/**
 * 퀴즈 페이지 감지
 */
async function detectQuiz(page) {
  try {
    await page.waitForSelector(SELECTORS.QUIZ_TITLE, { timeout: 3000 });
    logger.info('📝 퀴즈 페이지 감지됨!');
    return true;
  } catch {
    return false;
  }
}

/**
 * 퀴즈 풀이 (멀티스텝 브루트포스)
 */
async function solveQuiz(page, cursor) {
  const quizTitle = await page.$eval(SELECTORS.QUIZ_TITLE, (el) => el.innerText.trim()).catch(() => '(추출 실패)');
  logger.info(`📝 퀴즈: "${quizTitle}"`);

  // 총 스텝 수 확인
  const totalSteps = await page.$$eval(SELECTORS.QUIZ_STEP, (steps) => steps.length);
  logger.info(`📋 총 ${totalSteps}개 문제`);

  // 오답 캐시 (스텝별로 실패한 인덱스 기록)
  const failedChoicesCache = Array.from({ length: totalSteps }, () => new Set());

  for (let step = 0; step < totalSteps; step++) {
    logger.info(`\n  --- 문제 ${step + 1}/${totalSteps} ---`);

    // 현재 스텝이 이미 완료되었는지 확인
    const stepCompleted = await isCurrentStepCompleted(page);
    if (stepCompleted) {
      logger.info('  ⏭️  이미 완료된 문제, 다음으로 이동');
      await clickNextStep(page, cursor, step + 1);
      continue;
    }

    // 문제 읽는 시간
    await randomDelay(DELAY.QUIZ_READ_MIN, DELAY.QUIZ_READ_MAX);

    // 현재 문제의 보기 수집
    const choiceCount = await page.evaluate(
      (sel, currentSel) => {
        const currentStep = document.querySelector(currentSel);
        let choices;
        if (currentStep) {
          choices = [...currentStep.querySelectorAll(sel)];
        } else {
          choices = [...document.querySelectorAll(sel)];
        }
        const visible = choices.filter((el) => el.offsetParent !== null);
        return visible.length;
      },
      SELECTORS.QUIZ_CHOICE,
      SELECTORS.QUIZ_STEP_CURRENT,
    );

    logger.info(`  🔘 보기 ${choiceCount}개 발견`);

    if (choiceCount === 0) {
      logger.warn('  ⚠️  보기를 찾지 못함. 셀렉터를 확인하세요.');
      break;
    }

    // 브루트포스: 각 보기 시도
    let solved = false;
    for (let c = 0; c < choiceCount; c++) {
      if (failedChoicesCache[step].has(c)) {
        logger.info(`  ⏩ [보기 ${c + 1}/${choiceCount}] 이미 실패한 보기. 건너뜀.`);
        continue;
      }

      logger.info(`  🔄 [보기 ${c + 1}/${choiceCount}] 선택 중...`);

      const visibleChoices = await page.evaluateHandle(
        (sel, currentSel) => {
          const currentStep = document.querySelector(currentSel);
          let choices = currentStep ? [...currentStep.querySelectorAll(sel)] : [...document.querySelectorAll(sel)];
          return choices.filter((el) => el.offsetParent !== null);
        },
        SELECTORS.QUIZ_CHOICE,
        SELECTORS.QUIZ_STEP_CURRENT,
      );

      const choiceHandle = await visibleChoices.evaluateHandle((arr, idx) => arr[idx], c);
      if (!choiceHandle) break;
      await cursor.click(choiceHandle);
      await visibleChoices.dispose();
      await randomDelay(800, 1500);

      // 확인 버튼 대기
      try {
        await page.waitForFunction(
          (sel) => {
            const btn = document.querySelector(sel);
            return btn && !btn.classList.contains('disabled');
          },
          { timeout: 3000 },
          SELECTORS.QUIZ_SUBMIT_BTN,
        );
      } catch {
        logger.warn('  ⚠️  확인 버튼이 활성화되지 않음');
        continue;
      }

      // 확인 버튼 클릭
      const submitBtn = await page.$(SELECTORS.QUIZ_SUBMIT_BTN + ':not(.disabled)');
      if (submitBtn) {
        await cursor.click(submitBtn);
        logger.info('  📤 확인 클릭');
      }

      await randomDelay(1500, 3000);

      // 정답 여부 확인
      const correct = await isCurrentStepCompleted(page);

      if (correct) {
        logger.info('  🎉 정답!');
        solved = true;
        break;
      }

      logger.info('  ❌ 오답. 다음 보기 시도...');
      failedChoicesCache[step].add(c); // 오답 캐시에 추가
      await randomDelay(DELAY.QUIZ_RETRY_MIN, DELAY.QUIZ_RETRY_MAX);
    }

    if (!solved) {
      logger.warn('  ⚠️  모든 보기를 시도했으나 정답을 찾지 못함.');
    }

    // 다음 스텝으로 이동
    if (step < totalSteps - 1) {
      await clickNextStep(page, cursor, step + 1);
      await randomDelay(1000, 2000);
    }
  }

  logger.info('  📝 퀴즈 풀이 완료');
}

async function isCurrentStepCompleted(page) {
  return page.evaluate(
    (currentSel, completedSel) => {
      const currentStep = document.querySelector(currentSel);
      if (!currentStep) return false;
      return currentStep.querySelector(completedSel) !== null;
    },
    SELECTORS.QUIZ_STEP_CURRENT,
    SELECTORS.QUIZ_STEP_COMPLETED,
  );
}

async function clickNextStep(page, cursor, nextIndex) {
  const steps = await page.$$(SELECTORS.QUIZ_STEP);
  if (steps[nextIndex]) {
    await cursor.click(steps[nextIndex]);
    await randomDelay(500, 1000);
  }
}

module.exports = {
  detectQuiz,
  solveQuiz,
};

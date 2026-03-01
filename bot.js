const { createCursor } = require('ghost-cursor');
const { CURRICULUM_URL, DELAY, SELECTORS } = require('./config');
const { launchBrowser, randomDelay, randomScroll } = require('./utils');

(async () => {
  console.log('🚀 드림핵 자동 수강 봇 시작...\n');

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);

  try {
    // === 1단계: 커리큘럼 페이지에서 미완료 강의 목록 추출 ===
    console.log(`📚 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await page.goto(CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 5000);

    console.log('🔍 미완료 강의 목록 파싱 중...');
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

    console.log(`🎯 미완료 강의 ${lectureUrls.length}개 발견\n`);

    if (lectureUrls.length === 0) {
      console.log('✅ 모든 강의가 수료되었거나, 셀렉터를 확인하세요.');
      await browser.close();
      return;
    }

    // === 2단계: 각 강의 순회 ===
    for (let i = 0; i < lectureUrls.length; i++) {
      const url = lectureUrls[i];
      console.log(`\n▶️  [${i + 1}/${lectureUrls.length}] ${url}`);

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 퀴즈 페이지인지 확인
      const isQuiz = await detectQuiz(page);

      if (isQuiz) {
        await solveQuiz(page, cursor);
      } else {
        // === 일반 강의 처리 ===
        console.log('📖 강의 내용 읽는 중... (스크롤 + 체류)');
        await Promise.all([
          randomDelay(DELAY.PAGE_STAY_MIN, DELAY.PAGE_STAY_MAX),
          randomScroll(page),
        ]);

        await clickCompleteButton(page, cursor);
      }

      console.log(`✅ [${i + 1}] 완료`);

      // 다음 강의 전 자연스러운 대기
      if (i < lectureUrls.length - 1) {
        console.log('🔄 다음 강의 준비...');
        await randomDelay(DELAY.BETWEEN_LECTURES_MIN, DELAY.BETWEEN_LECTURES_MAX);
      }
    }

    console.log('\n🎉 모든 강의 순회 완료!');
  } catch (error) {
    console.error('❌ 에러 발생:', error);
  } finally {
    console.log('브라우저 세션 유지 중. 수동으로 닫아주세요.');
    // await browser.close();
  }
})();

/**
 * 퀴즈 페이지 감지
 */
async function detectQuiz(page) {
  try {
    await page.waitForSelector(SELECTORS.QUIZ_TITLE, { timeout: 3000 });
    console.log('📝 퀴즈 페이지 감지됨!');
    return true;
  } catch {
    return false;
  }
}

/**
 * 퀴즈 풀이 (멀티스텝 브루트포스)
 * 각 스텝(문제)마다: 보기 하나씩 선택 → 확인 → 정답이면 다음 스텝
 */
async function solveQuiz(page, cursor) {
  const quizTitle = await page.$eval(SELECTORS.QUIZ_TITLE, el => el.innerText.trim()).catch(() => '(추출 실패)');
  console.log(`📝 퀴즈: "${quizTitle}"`);

  // 총 스텝 수 확인
  const totalSteps = await page.$$eval(SELECTORS.QUIZ_STEP, steps => steps.length);
  console.log(`📋 총 ${totalSteps}개 문제`);

  for (let step = 0; step < totalSteps; step++) {
    console.log(`\n  --- 문제 ${step + 1}/${totalSteps} ---`);

    // 현재 스텝이 이미 완료되었는지 확인
    const stepCompleted = await isCurrentStepCompleted(page);
    if (stepCompleted) {
      console.log('  ⏭️  이미 완료된 문제, 다음으로 이동');
      await clickNextStep(page, cursor, step + 1);
      continue;
    }

    // 문제 읽는 시간
    await randomDelay(DELAY.QUIZ_READ_MIN, DELAY.QUIZ_READ_MAX);

    // 현재 문제의 보기 수집
    const choices = await page.$$(SELECTORS.QUIZ_CHOICE);
    console.log(`  🔘 보기 ${choices.length}개 발견`);

    if (choices.length === 0) {
      console.log('  ⚠️  보기를 찾지 못함. 셀렉터를 확인하세요.');
      break;
    }

    // 브루트포스: 각 보기 시도
    let solved = false;
    for (let c = 0; c < choices.length; c++) {
      console.log(`  🔄 [보기 ${c + 1}/${choices.length}] 선택 중...`);

      // 보기 클릭
      const currentChoices = await page.$$(SELECTORS.QUIZ_CHOICE);
      if (!currentChoices[c]) break;
      await cursor.click(currentChoices[c]);
      await randomDelay(800, 1500);

      // 확인 버튼 대기 (disabled 해제될 때까지)
      try {
        await page.waitForFunction(
          (sel, disSel) => {
            const btn = document.querySelector(sel);
            return btn && !btn.classList.contains('disabled');
          },
          { timeout: 3000 },
          SELECTORS.QUIZ_SUBMIT_BTN,
          SELECTORS.QUIZ_SUBMIT_DISABLED,
        );
      } catch {
        console.log('  ⚠️  확인 버튼이 활성화되지 않음');
        continue;
      }

      // 확인 버튼 클릭
      const submitBtn = await page.$(SELECTORS.QUIZ_SUBMIT_BTN + ':not(.disabled)');
      if (submitBtn) {
        await cursor.click(submitBtn);
        console.log('  📤 확인 클릭');
      }

      await randomDelay(1500, 3000);

      // 정답 여부 확인: 현재 스텝에 check-icon이 생겼는지
      const correct = await isCurrentStepCompleted(page);

      if (correct) {
        console.log('  🎉 정답!');
        solved = true;
        break;
      }

      console.log('  ❌ 오답. 다음 보기 시도...');
      await randomDelay(DELAY.QUIZ_RETRY_MIN, DELAY.QUIZ_RETRY_MAX);
    }

    if (!solved) {
      console.log('  ⚠️  모든 보기를 시도했으나 정답을 찾지 못함.');
    }

    // 다음 스텝으로 이동
    if (step < totalSteps - 1) {
      await clickNextStep(page, cursor, step + 1);
      await randomDelay(1000, 2000);
    }
  }

  console.log('  📝 퀴즈 풀이 완료');
}

/**
 * 현재 스텝이 완료되었는지 확인
 */
async function isCurrentStepCompleted(page) {
  return page.evaluate((currentSel, completedSel) => {
    const currentStep = document.querySelector(currentSel);
    if (!currentStep) return false;
    return currentStep.querySelector(completedSel) !== null;
  }, SELECTORS.QUIZ_STEP_CURRENT, SELECTORS.QUIZ_STEP_COMPLETED);
}

/**
 * 다음 스텝(문제) 클릭
 */
async function clickNextStep(page, cursor, nextIndex) {
  const steps = await page.$$(SELECTORS.QUIZ_STEP);
  if (steps[nextIndex]) {
    await cursor.click(steps[nextIndex]);
    await randomDelay(500, 1000);
  }
}

/**
 * 수강 완료 버튼 클릭 (있을 경우)
 */
async function clickCompleteButton(page, cursor) {
  try {
    await page.waitForSelector(SELECTORS.COMPLETE_BTN, { timeout: 3000 });
    await cursor.click(SELECTORS.COMPLETE_BTN);
    console.log('🖱️  수강 완료 버튼 클릭');
    await randomDelay(1000, 3000);
  } catch {
    // 버튼 없으면 무시 (체류만으로 완료되는 경우)
  }
}

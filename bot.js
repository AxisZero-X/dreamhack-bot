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
        // === 퀴즈 처리 ===
        await solveQuizBruteForce(page, cursor);
      } else {
        // === 일반 강의 처리 ===
        console.log('📖 강의 내용 읽는 중... (스크롤 + 체류)');
        await Promise.all([
          randomDelay(DELAY.PAGE_STAY_MIN, DELAY.PAGE_STAY_MAX),
          randomScroll(page),
        ]);

        // 수강 완료 버튼이 있으면 클릭
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
 * 퀴즈 브루트포스 풀이 (객관식)
 * 보기를 하나씩 선택 → 제출 → 오답이면 다음 보기
 */
async function solveQuizBruteForce(page, cursor) {
  // 문제 읽는 시간
  await randomDelay(DELAY.QUIZ_READ_MIN, DELAY.QUIZ_READ_MAX);

  // 문제 텍스트 추출 (로깅용)
  const questionText = await page.$eval(SELECTORS.QUIZ_TITLE, el => el.innerText.trim()).catch(() => '(추출 실패)');
  console.log(`📝 문제: "${questionText}"`);

  // 모든 라디오 버튼(보기) 수집
  const radioInputs = await page.$$(SELECTORS.RADIO_INPUT);
  console.log(`🔘 보기 ${radioInputs.length}개 발견`);

  if (radioInputs.length === 0) {
    console.log('⚠️  라디오 버튼을 찾지 못함. 셀렉터를 확인하세요.');
    return;
  }

  for (let i = 0; i < radioInputs.length; i++) {
    console.log(`\n  🔄 [보기 ${i + 1}/${radioInputs.length}] 선택 중...`);

    // 보기 클릭 (ghost-cursor)
    await cursor.click(radioInputs[i]);
    await randomDelay(1000, 2000);

    // 제출 버튼 클릭
    try {
      await page.waitForSelector(SELECTORS.SUBMIT_BTN, { timeout: 3000 });
      await cursor.click(SELECTORS.SUBMIT_BTN);
      console.log('  📤 제출 완료');
    } catch {
      console.log('  ⚠️  제출 버튼 없음. 셀렉터를 확인하세요.');
      return;
    }

    // 결과 확인
    await randomDelay(1500, 3000);

    const isCorrect = await checkAnswer(page);

    if (isCorrect) {
      console.log('  🎉 정답!');
      return;
    }

    console.log('  ❌ 오답. 다음 보기 시도...');
    await randomDelay(DELAY.QUIZ_RETRY_MIN, DELAY.QUIZ_RETRY_MAX);
  }

  console.log('⚠️  모든 보기를 시도했으나 정답을 찾지 못함.');
}

/**
 * 정답/오답 결과 확인
 */
async function checkAnswer(page) {
  try {
    // 정답 피드백 요소가 있으면 정답
    const correct = await page.$(SELECTORS.CORRECT_FEEDBACK);
    if (correct) return true;

    // 오답 피드백 요소가 있으면 오답
    const wrong = await page.$(SELECTORS.WRONG_FEEDBACK);
    if (wrong) return false;

    // 둘 다 없으면 페이지 변화로 판단 (다음 페이지로 넘어갔으면 정답)
    return false;
  } catch {
    return false;
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

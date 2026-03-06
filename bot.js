const { createCursor } = require('ghost-cursor');
const { EXAM_URL, DELAY, SELECTORS, SKIP_QUIZ, AUTO_LOGIN } = require('./config');
const { launchBrowser, ensureLoggedIn, randomDelay, randomScroll, getDynamicDelayFromPage } = require('./utils');
const { detectQuiz, solveQuiz, finishQuiz } = require('./quizManager');
const { processLecture } = require('./lectureManager');
const { solveWargameChallenge } = require('./wargameManager');
const logger = require('./logger');
const readline = require('readline');

// ─── 입력 프롬프트 ────────────────────────────────────────────────────────────

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

async function askCurriculumId() {
  const rl = createRl();
  return new Promise((resolve) => {
    rl.question('📚 커리큘럼 ID를 입력하세요 (예: 920, Enter=916): ', (answer) => {
      rl.close();
      resolve(parseInt(answer.trim()) || 916);
    });
  });
}

async function askTargetRate() {
  const rl = createRl();
  return new Promise((resolve) => {
    rl.question('🎯 목표 수강률을 입력하세요 (1-100, Enter=100): ', (answer) => {
      rl.close();
      const rate = parseInt(answer.trim()) || 100;
      resolve(Math.min(100, Math.max(1, rate)));
    });
  });
}

async function askSkipMode() {
  const rl = createRl();
  console.log('\n🛠️  실행 모드를 선택하세요:');
  console.log('1) 🚀 전체 자동 (워게임 + 퀴즈 모두 진행)');
  console.log('2) ⏭️ 워게임 스킵 (퀴즈만 풀기)');
  console.log('3) ⏭️ 퀴즈 스킵 (워게임만 풀기)');
  console.log('4) ⏩ 전체 스킵 (강의 수강만 진행)');

  return new Promise((resolve) => {
    rl.question('\n선택 (1-4, Enter=1): ', (answer) => {
      rl.close();
      const choice = answer.trim() || '1';
      let skipWargame = false, skipQuiz = false;
      if (choice === '2') skipWargame = true;
      else if (choice === '3') skipQuiz = true;
      else if (choice === '4') { skipWargame = true; skipQuiz = true; }
      resolve({ skipWargame, skipQuiz });
    });
  });
}

async function askCredentials() {
  const rl = createRl();
  return new Promise((resolve) => {
    rl.question('📧 드림핵 이메일을 입력하세요: ', (email) => {
      if (!process.stdin.isTTY) {
        rl.question('🔐 비밀번호를 입력하세요: ', (password) => {
          rl.close();
          resolve({ email: email.trim(), password: password.trim() });
        });
        return;
      }
      const stdin = process.stdin;
      const stdout = process.stdout;
      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();
      let password = '';
      stdout.write('🔐 비밀번호를 입력하세요: ');
      stdin.on('data', function onData(key) {
        const char = key.toString();
        if (char === '\r' || char === '\n' || char.charCodeAt(0) === 13) {
          stdin.removeListener('data', onData);
          stdin.setRawMode(wasRaw);
          stdin.pause();
          stdout.write('\n');
          rl.close();
          resolve({ email: email.trim(), password: password.trim() });
          return;
        }
        if (char.charCodeAt(0) === 127 || char.charCodeAt(0) === 8) {
          if (password.length > 0) { password = password.slice(0, -1); stdout.write('\b \b'); }
          return;
        }
        if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) { password += char; stdout.write('*'); }
      });
    });
  });
}

// ─── 수강률 추출 ──────────────────────────────────────────────────────────────

async function getCurrentCompletionRate(page, curriculumUrl) {
  await page.goto(curriculumUrl, { waitUntil: 'networkidle2' });
  await randomDelay(1000, 2000);
  const rate = await page.evaluate(() => {
    const periodDiv = document.querySelector('.type-period');
    if (!periodDiv) return 0;
    const text = periodDiv.innerText || periodDiv.textContent;
    const match = text.match(/(\d+\.?\d*)%/);
    return match ? parseFloat(match[1]) : 0;
  });
  logger.info(`📊 현재 수강률: ${rate}%`);
  return rate;
}

// ─── 미완료 강의 및 함께실습 매핑 추출 ─────────────────────────────────────────

async function extractLectureData(page) {
  return page.evaluate((itemSel, linkSel) => {
    const urls = [];
    const practiceMap = {};
    const items = document.querySelectorAll(itemSel);
    if (items.length === 0) return { lectureUrls: [], togetherPracticeMap: {} };

    // 함께실습 매핑
    document.querySelectorAll('.objective').forEach(objective => {
      const titleEl = objective.querySelector('.objective-title');
      if (!titleEl) return;
      const objectiveTitle = titleEl.innerText.trim();
      if (objectiveTitle.includes('함께 실습') || objectiveTitle.includes('함께실습')) {
        const entities = objective.querySelectorAll('.entity');
        entities.forEach(entity => {
          const title = entity.querySelector('.entity-title, .title')?.innerText.trim();
          const link = entity.querySelector(linkSel)?.href;
          if (!title || !link || !link.includes('wargame/challenges')) return;
          entities.forEach(other => {
            const otherTitle = other.querySelector('.entity-title, .title')?.innerText.trim();
            const otherLink = other.querySelector(linkSel)?.href;
            if (otherLink && !otherLink.includes('wargame/challenges') &&
              (otherTitle?.includes('Exercise:') || otherTitle?.includes('연습문제'))) {
              practiceMap[title] = otherLink;
            }
          });
        });
      }
    });

    // 미완료 강의
    items.forEach(item => {
      const linkEl = item.querySelector(linkSel);
      const link = linkEl ? linkEl.href : null;
      const actionTexts = Array.from(item.querySelectorAll('.action-text'));
      const progressEl = item.querySelector('.progress-text, .progress');
      const progressText = progressEl ? progressEl.innerText.trim() : '';
      const isIncomplete = actionTexts.some(el =>
        !el.classList.contains('completed') &&
        ['시작하기', '이어하기', '재도전'].includes(el.innerText.trim())
      );
      if (isIncomplete && link && progressText !== '100%') urls.push(link);
    });

    return { lectureUrls: urls, togetherPracticeMap: practiceMap };
  }, SELECTORS.LECTURE_ITEM, SELECTORS.LECTURE_LINK);
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

(async () => {
  logger.info('🚀 드림핵 자동 수강 봇 시작...\n');

  const CURRICULUM_ID = await askCurriculumId();
  const CURRICULUM_URL = `https://dreamhack.io/euser/curriculums/${CURRICULUM_ID}`;
  logger.info(`✅ 커리큘럼 URL: ${CURRICULUM_URL}\n`);

  const TARGET_RATE = await askTargetRate();
  logger.info(`✅ 목표 수강률: ${TARGET_RATE}%\n`);

  const { skipWargame, skipQuiz } = await askSkipMode();
  const EFFECTIVE_SKIP_QUIZ = SKIP_QUIZ || skipQuiz;
  logger.info(`✅ 워게임 스킵: ${skipWargame ? '활성화' : '비활성화'}`);
  logger.info(`✅ 퀴즈 스킵: ${EFFECTIVE_SKIP_QUIZ ? '활성화' : '비활성화'}\n`);

  // 로그인 정보
  const email = process.env.DH_EMAIL;
  const password = process.env.DH_PASSWORD;
  let credentials = { email, password };

  if (!email || !password) {
    logger.info('📧 .env에 DH_EMAIL/DH_PASSWORD가 없습니다. 직접 입력해주세요.');
    credentials = await askCredentials();
  }
  logger.info(`✅ 로그인 정보 준비 완료 (이메일: ${credentials.email})\n`);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);

  try {
    // === 0단계: 로그인 ===
    if (AUTO_LOGIN) {
      logger.info('🤖 자동 로그인 모드 활성화');
      await ensureLoggedIn(page, credentials.email, credentials.password);
    } else {
      logger.info('👤 수동 로그인 모드 — 60초 대기');
      await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
      await randomDelay(2000, 4000);

      for (let i = 60; i > 0; i--) {
        if (i % 10 === 0 || i <= 5) logger.info(`⏱️ ${i}초 남았습니다...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      logger.info('✅ 로그인 대기 완료');
    }

    // === 1단계: 커리큘럼에서 미완료 강의 추출 ===
    logger.info(`🔍 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await page.goto(CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    const currentUrl = page.url();
    if (currentUrl.includes('/login') || !currentUrl.includes('dreamhack.io')) {
      logger.error('⚠️ 로그인 상태 확인 필요. 로그인 후 다시 시도해주세요.');
      return;
    }

    const { lectureUrls, togetherPracticeMap } = await extractLectureData(page);

    if (lectureUrls.length === 0) {
      const hasItems = await page.evaluate((sel) => document.querySelectorAll(sel).length > 0, SELECTORS.LECTURE_ITEM);
      logger.info(hasItems ? '✅ 모든 강의가 이미 완료되었습니다.' : '⚠️ 강의 항목을 찾을 수 없습니다.');
      return;
    }
    logger.info(`📚 총 ${lectureUrls.length}개의 미완료 강의를 발견했습니다.`);

    // === 2단계: 강의 순회 ===
    const MAX_DAILY_MINUTES = 150;
    let totalMinutes = 0;
    let completedLectures = 0;

    for (let i = 0; i < lectureUrls.length; i++) {
      if (totalMinutes >= MAX_DAILY_MINUTES) {
        logger.info(`⏰ 오늘 수강 시간 종료 (${totalMinutes}분). 내일 다시 실행하세요.`);
        break;
      }

      const url = lectureUrls[i];
      logger.info(`\n▶️  [${i + 1}/${lectureUrls.length}] ${url}`);

      // 워게임 챌린지
      if (url.includes('wargame/challenges')) {
        if (skipWargame) {
          logger.info('⏭️ 워게임 스킵');
        } else {
          logger.info('⚠️ 워게임 챌린지 감지, AI를 통해 플래그 해결 시도.');
          await solveWargameChallenge(browser, page, url, togetherPracticeMap);
          totalMinutes += Math.floor(Math.random() * 5) + 3;
        }
        continue;
      }

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 퀴즈 페이지 확인
      const isQuiz = await detectQuiz(page);
      if (isQuiz) {
        if (EFFECTIVE_SKIP_QUIZ) {
          logger.info('⏭️ 퀴즈 스킵');
        } else {
          let unsolvedCount = await solveQuiz(page, cursor);
          for (let retry = 0; retry < 2 && unsolvedCount > 0; retry++) {
            logger.info(`  🔁 미해결 ${unsolvedCount}문제 재시도 (${retry + 1}/2)...`);
            await randomDelay(500, 1000);
            unsolvedCount = await solveQuiz(page, cursor);
          }
          await finishQuiz(page, cursor);
          totalMinutes += Math.floor(Math.random() * 8) + 5;
        }
      } else {
        // 일반 강의
        await processLecture(page, cursor, {
          skipQuiz: EFFECTIVE_SKIP_QUIZ,
          solveQuizFn: solveQuiz,
        });
        totalMinutes += Math.floor(Math.random() * 4) + 2;
      }

      logger.info(`✅ [${i + 1}] 완료 (누적: ${totalMinutes}분)`);
      completedLectures++;

      // 수강률 체크
      const currentRate = await getCurrentCompletionRate(page, CURRICULUM_URL);
      logger.info(`📊 현재 수강률: ${currentRate}% (목표: ${TARGET_RATE}%)`);
      if (currentRate >= TARGET_RATE) {
        logger.info(`\n🎉 목표 수강률 ${TARGET_RATE}% 달성! (현재: ${currentRate}%)`);
        break;
      }

      // 휴식
      if ((completedLectures % (Math.floor(Math.random() * 3) + 3)) === 0) {
        const breakTime = Math.floor(Math.random() * 240000) + 60000;
        logger.info(`☕ 휴식 시간 (${Math.floor(breakTime / 60000)}분)`);
        await randomDelay(breakTime, breakTime + 30000);
        totalMinutes += Math.floor(breakTime / 60000);
      }

      if (i < lectureUrls.length - 1) {
        await randomDelay(DELAY.BETWEEN_LECTURES_MIN, DELAY.BETWEEN_LECTURES_MAX);
      }
    }

    logger.info('\n🎉 모든 강의 순회 완료!');

    // === 2.5단계: 수료 퀴즈 ===
    if (!EFFECTIVE_SKIP_QUIZ) {
      logger.info('\n📝 수료 퀴즈(exam) 응시 시도...');
      try {
        await page.goto(CURRICULUM_URL, { waitUntil: 'networkidle2' });
        await randomDelay(2000, 3000);
        const examUrl = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'));
          const examLink = links.find(a => a.innerText.includes('수료 퀴즈') || a.href.includes('/exam/'));
          return examLink ? examLink.href : null;
        });
        const resolvedExamUrl = examUrl || EXAM_URL;
        if (resolvedExamUrl) {
          logger.info(`📝 수료 퀴즈 URL: ${resolvedExamUrl}`);
          await page.goto(resolvedExamUrl, { waitUntil: 'networkidle2' });
          await randomDelay(2000, 4000);
          await solveQuiz(page, cursor);
          await finishQuiz(page, cursor);
          logger.info('✅ 수료 퀴즈 응시 완료');
        }
      } catch (err) {
        logger.warn(`⚠️ 수료 퀴즈 처리 중 에러: ${err.message}`);
      }
    }

    // === 3단계: 최종 수강률 검증 ===
    const finalRate = await getCurrentCompletionRate(page, CURRICULUM_URL);
    logger.info(`📊 최종 수강률: ${finalRate}% (목표: ${TARGET_RATE}%)`);

    if (finalRate >= TARGET_RATE) {
      logger.info(`🎉 목표 달성! ✅ 봇 실행 완료.`);
    } else {
      logger.warn(`⚠️ 목표 미달성 (${finalRate}%). 재실행 권장.`);
    }

  } catch (error) {
    logger.error('❌ 에러 발생:', error);
  } finally {
    logger.info('브라우저 세션 유지 중. 수동으로 닫아주세요.');
  }
})();

const { DELAY, SELECTORS } = require('./config');
const { randomDelay } = require('./utils');
const aiProvider = require('./aiProvider');
const logger = require('./logger');

// ─── 퀴즈 감지 ──────────────────────────────────────────────────────────────

/**
 * 퀴즈 페이지 감지 (강화된 버전)
 * URL 패턴, 셀렉터, 텍스트 기반으로 다단계 감지
 */
async function detectQuiz(page) {
  try {
    const currentUrl = page.url();
    const isQuizUrl = /\/quiz\/\d+/.test(currentUrl) || /\/exam\/\d+/.test(currentUrl);
    const isLectureUrl = /\/learn\.dreamhack\.io\/\d+$/.test(currentUrl) && !isQuizUrl;

    if (isLectureUrl) {
      logger.info('📖 강의 페이지 감지됨 (URL 패턴)');
      return false;
    }
    if (isQuizUrl) {
      logger.info('📝 퀴즈 페이지 감지됨! (URL 기반)');
      return true;
    }

    // 셀렉터 기반
    await page.waitForSelector(SELECTORS.QUIZ_TITLE, { timeout: 3000 });
    logger.info('📝 퀴즈 페이지 감지됨! (기본 셀렉터)');
    return true;
  } catch {
    try {
      await page.waitForSelector('.quiz-title, .quiz-header, [class*="quiz"] h1, [class*="quiz"] h2, .quiz-question, .question-main, .markdown-content', { timeout: 2000 });
      logger.info('📝 퀴즈 페이지 감지됨! (대체 셀렉터)');
      return true;
    } catch {
      // 텍스트 기반
      const hasQuizText = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        const lectureKeywords = ['들어가며', '시작하기', '이어하기', '강의', 'lecture', 'chapter'];
        const hasLectureKeyword = lectureKeywords.some(keyword => bodyText.includes(keyword));
        const quizKeywords = ['quiz', '퀴즈', '문제', 'question', '정답', '보기', '선택', '다음 문제', '재도전', '채점', '점수'];
        const questionKeywords = ['다음 중', '옳은 것은', '틀린 것은', '알맞은', '올바른', '선택하세요', '고르세요'];
        const hasQuizKeyword = quizKeywords.some(keyword => bodyText.includes(keyword));
        const hasQuestionFormat = questionKeywords.some(keyword => bodyText.includes(keyword));
        const hasChoices = document.querySelectorAll('.choice, .quiz-choice, .option, .el-radio, .el-checkbox').length > 0;
        if (hasLectureKeyword && !hasQuizKeyword) return false;
        return hasQuizKeyword || (hasQuestionFormat && hasChoices);
      });

      if (hasQuizText) {
        logger.info('📝 퀴즈 페이지 감지됨! (텍스트 기반)');
        return true;
      }

      // 버튼 텍스트 확인
      const hasQuizButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, .btn, .el-button'));
        const quizButtonTexts = ['확인', '제출', '재도전', '다음 문제', '결과 확인', '채점하기'];
        return buttons.some(button => {
          const text = button.innerText.toLowerCase();
          return quizButtonTexts.some(btnText => text.includes(btnText.toLowerCase()));
        });
      });

      if (hasQuizButtons) {
        logger.info('📝 퀴즈 페이지 감지됨! (버튼 텍스트 기반)');
        return true;
      }

      logger.info('⚠️ 퀴즈 페이지 감지 실패');
      return false;
    }
  }
}

// ─── 퀴즈 제목 추출 ──────────────────────────────────────────────────────────

async function extractQuizTitle(page) {
  try {
    const title = await page.$eval(SELECTORS.QUIZ_TITLE, el => el.innerText.trim());
    if (title && title.length > 0) return title;
  } catch {
    try {
      const title = await page.$eval('.quiz-title, .quiz-header, [class*="quiz"] h1, [class*="quiz"] h2, h1, h2', el => el.innerText.trim());
      if (title && title.length > 0) return title;
    } catch {
      const titleFromPage = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, .title, .header'));
        for (const heading of headings) {
          const text = heading.innerText.trim();
          if (text.length > 0 && (text.includes('퀴즈') || text.includes('Quiz') || text.includes('문제'))) return text;
        }
        const mainContent = document.querySelector('.main-content, .content, .container, .quiz-container');
        if (mainContent) {
          const firstHeading = mainContent.querySelector('h1, h2, h3, .title');
          if (firstHeading) return firstHeading.innerText.trim();
        }
        return null;
      });
      if (titleFromPage) return titleFromPage;
    }
  }

  const url = page.url();
  if (url.includes('/quiz/') || url.includes('/exam/')) {
    const match = url.match(/\/(quiz|exam)\/(\d+)/);
    if (match) return `퀴즈 ${match[2]}`;
    return '퀴즈 페이지';
  }
  return '(제목 추출 실패)';
}

// ─── 문제 수 카운트 ───────────────────────────────────────────────────────────

async function countQuizQuestions(page) {
  try {
    const count1 = await page.$$eval('.quiz-question', els => els.length);
    if (count1 > 0) return count1;
  } catch {}
  try {
    const count2 = await page.$$eval('.question-main, .question-markdown, .markdown-content', els => els.length);
    if (count2 > 0) return count2;
  } catch {}
  try {
    const count3 = await page.$$eval('.choice, .quiz-choice, .option', els => {
      const containers = new Set();
      els.forEach(el => {
        const container = el.closest('.quiz-question, .question-container, .question-item');
        if (container) containers.add(container);
      });
      return containers.size;
    });
    if (count3 > 0) return count3;
  } catch {}

  return await page.evaluate(() => {
    const text = document.body.innerText;
    const m = text.match(/(\d+\.\s*문제|\d+\.\s*Question|문제\s*\d+|Question\s*\d+)/gi);
    if (m) return m.length;
    const n = text.match(/\n\d+\.\s/g);
    return n ? n.length : 0;
  });
}

// ─── 디버그 스크린샷 ──────────────────────────────────────────────────────────

async function takeDebugScreenshot(page, context = 'quiz_stuck') {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `./logs/debug_${context}_${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    logger.info(`📸 디버그 스크린샷 저장: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    logger.warn(`⚠️ 스크린샷 캡처 실패: ${error.message}`);
    return null;
  }
}

// ─── 헬퍼: 현재 문제 요소 선택 공통 코드 ──────────────────────────────────────
// 아래 함수들에서 반복적으로 사용하는 page.evaluate 내부의 문제 요소 선택 로직
const Q_SELECTOR_JS = `
  const qs = Array.from(document.querySelectorAll('.quiz-question'));
  const visibleQs = qs.filter(el => el.offsetParent !== null);
  const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
`;

// ─── 재도전 버튼 클릭 ─────────────────────────────────────────────────────────

async function clickRetry(page, cursor, qIndex) {
  let isReloaded = false;
  const handle = await page.evaluateHandle((idx) => {
    const qs = Array.from(document.querySelectorAll('.quiz-question'));
    const visibleQs = qs.filter(el => el.offsetParent !== null);
    const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
    const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
      if (!(b.offsetParent !== null) || !(b.innerText.includes('재도전') || b.innerText.includes('다시'))) return false;
      const parentQ = b.closest('.quiz-question');
      return !parentQ || parentQ === q;
    });
    return btn || null;
  }, qIndex);

  const el = handle.asElement();
  if (el) {
    logger.info('  🔄 재도전 버튼 클릭');
    await page.evaluate(b => { b.scrollIntoView({block: 'center'}); b.click(); }, el);

    try {
      await page.waitForFunction((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return true;
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const hasResultClass = main && resultClasses.some(c => main.classList.contains(c));
        const qHasResultClass = resultClasses.some(c => q.classList.contains(c));
        const anyChildHasResult = q.querySelector('.is-wrong, .is-incorrect, .is-success, .is-correct, .is-danger, .is-valid');
        const retryBtn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('재도전') || b.innerText.includes('다시'));
        });
        return (!main || !hasResultClass) && !qHasResultClass && !anyChildHasResult && !retryBtn;
      }, { timeout: 8000, polling: 500 }, qIndex);
    } catch {
      logger.warn('  ⚠️ 재도전 버튼 타임아웃. 상태 클래스를 직접 제거합니다...');
      await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return;
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const removeClasses = (el) => { if (!el) return; resultClasses.forEach(c => el.classList.remove(c)); };
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
        removeClasses(main); removeClasses(q); q.querySelectorAll('*').forEach(removeClasses);
        const confirmBtn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('확인') || b.innerText.includes('제출'));
        });
        if (confirmBtn && (confirmBtn.classList.contains('is-disabled') || confirmBtn.classList.contains('disabled'))) {
          confirmBtn.classList.remove('is-disabled', 'disabled'); confirmBtn.disabled = false;
        }
      }, qIndex);
      await randomDelay(1500, 2500);

      const stillHasRetry = await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        const retryBtn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('재도전') || b.innerText.includes('다시'));
        });
        return !!retryBtn;
      }, qIndex);

      if (stillHasRetry) {
        logger.warn('  ⚠️ 페이지를 강제로 새로고침합니다...');
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForFunction(() => document.readyState === 'complete', {timeout: 10000}).catch(()=>null);
        isReloaded = true;
      }
    }
  } else {
    logger.warn('  ⚠️ 재도전 버튼을 찾을 수 없습니다.');
  }
  handle.dispose();

  if (isReloaded) {
    await randomDelay(2000, 3000);
    return 'RELOAD_REQUIRED';
  } else {
    await randomDelay(1000, 2000);
  }
}

// ─── 정답 후 다음 버튼 클릭 ───────────────────────────────────────────────────

async function handleCorrect(page, cursor, qIndex, maxAttempts = 10) {
  const nextKeywords = ['다음 문제', '다음', '완료', '계속', 'Next', 'Continue', '진행하기', '다음 주제로'];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const btnHandle = await page.evaluateHandle((idx, keywords) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const q = qs.find(el => el.offsetParent !== null) || qs[idx] || qs[0] || document.querySelector('.quiz-question');
      const allBtns = Array.from(document.querySelectorAll('.btn, .el-button, .el-button--primary, .el-button--success, .dh3-button'))
                           .filter(b => (b.offsetParent !== null));

      const possibleBtns = allBtns.filter(b => {
        const text = b.innerText.trim();
        if (b.classList.contains('is-disabled') || b.disabled) return false;
        const matchesKeyword = keywords.some(k => text.includes(k));
        if (!matchesKeyword) return false;
        const parentQ = b.closest('.quiz-question');
        return !parentQ || parentQ === q;
      });

      const priorityOrder = ['다음 문제', '다음', '완료', '계속', '진행하기', '다음 주제로', 'Next', 'Continue'];
      const sortedBtns = possibleBtns.sort((a, b) => {
        const aPriority = priorityOrder.findIndex(k => a.innerText.trim().includes(k));
        const bPriority = priorityOrder.findIndex(k => b.innerText.trim().includes(k));
        return aPriority - bPriority;
      });

      return sortedBtns[0] || null;
    }, qIndex, nextKeywords);

    const btn = btnHandle.asElement();
    if (btn) {
      const txt = await page.evaluate(el => el.innerText.trim(), btn);
      logger.info(`  ➡️ 다음 버튼 클릭 시도 (btn="${txt}")`);
      await btn.scrollIntoViewIfNeeded();
      await page.evaluate(el => {
        el.click();
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, btn);
      await randomDelay(1500, 2500);

      const clickedSuccessfully = await page.evaluate((idx, keywords) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetParent !== null) || qs[idx] || qs[0] || document.querySelector('.quiz-question');
        if (!q) return true;
        const allBtns = Array.from(document.querySelectorAll('.btn, .el-button, .el-button--primary, .el-button--success, .dh3-button'))
                           .filter(b => (b.offsetParent !== null));
        const stillHasSameBtn = allBtns.some(b => {
          const text = b.innerText.trim();
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && keywords.some(k => text.includes(k));
        });
        return !stillHasSameBtn;
      }, qIndex, nextKeywords);

      if (clickedSuccessfully) {
        logger.info(`  ✅ 다음 버튼 클릭 성공`);
        return;
      }
    }

    // 스텝 네비게이션
    const nextStepClicked = await page.evaluate((idx) => {
      const steps = Array.from(document.querySelectorAll('.step'));
      if (steps.length > idx + 1) {
        const nextStep = steps[idx + 1];
        if (nextStep.classList.contains('is-accessible') || nextStep.querySelector('.check-icon')) {
          nextStep.click();
          return true;
        }
      }
      return false;
    }, qIndex);

    if (nextStepClicked) {
      logger.info(`  🪜 다음 스텝 네비게이션 클릭 완료`);
      await randomDelay(1500, 2500);
      return;
    }

    // 자동 이동 확인
    const hasMovedToNext = await page.evaluate((idx) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const visibleQs = qs.filter(el => el.offsetParent !== null);
      const currentQ = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
      return !currentQ || currentQ.offsetParent === null;
    }, qIndex);

    if (hasMovedToNext) {
      logger.info(`  ✅ 자동으로 다음 문제로 이동됨`);
      return;
    }

    logger.info(`  ⏳ 다음 단계 대기 중... (${attempt + 1}/${maxAttempts})`);
    await randomDelay(1500, 2500);
  }

  // 최후의 수단: 스텝 강제 클릭
  await page.evaluate((idx) => {
    const steps = Array.from(document.querySelectorAll('.step'));
    if (steps.length > idx + 1) steps[idx + 1].click();
    else if (steps.length > 0) steps[0].click();
  }, qIndex);
  await randomDelay(2000, 3000);
}

// ─── 스텝 이동 ────────────────────────────────────────────────────────────────

async function clickNextStep(page, cursor, nextIndex) {
  const steps = await page.$$(SELECTORS.QUIZ_STEP);
  if (steps[nextIndex]) {
    await cursor.click(steps[nextIndex]);
    await randomDelay(500, 1000);
  }
}

// ─── 메인: 퀴즈 풀이 (멀티스텝 브루트포스 + AI) ──────────────────────────────

async function solveQuiz(page, cursor) {
  const quizTitle = await extractQuizTitle(page);
  logger.info(`📝 퀴즈: "${quizTitle}"`);

  const totalQuestions = await countQuizQuestions(page);
  logger.info(`📋 총 ${totalQuestions}개 문제`);
  if (totalQuestions === 0) { logger.warn('⚠️ 문제를 찾지 못했습니다.'); return 0; }

  const totalSteps = await page.$$eval(SELECTORS.QUIZ_STEP, el => el.length);
  const isStepBased = totalSteps > 0;
  if (isStepBased) logger.info(`🪜 스텝 기반 퀴즈 감지: 총 ${totalSteps}단계`);

  let unsolved = 0;
  const loopCount = isStepBased ? totalSteps : totalQuestions;

  for (let qIndex = 0; qIndex < loopCount; qIndex++) {
    if (isStepBased) {
      const currentStepIdx = await page.evaluate((sel) => {
        const steps = Array.from(document.querySelectorAll(sel));
        return steps.findIndex(s => s.classList.contains('is-current'));
      }, SELECTORS.QUIZ_STEP);
      if (currentStepIdx !== -1 && currentStepIdx < qIndex) {
        await clickNextStep(page, cursor, qIndex);
        await randomDelay(1000, 2000);
      }
    }

    logger.info(`\n  --- 문제/스텝 ${qIndex + 1}/${loopCount} ---`);
    await randomDelay(200, 400);

    // 이미 완료된 문제 확인
    const completionState = await page.evaluate((idx) => {
      const nextKeywords = ['다음 문제', '다음', '완료하기', '진행하기', '다음 주제로', '제출', '계속', 'Next', 'Continue'];
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const visibleQs = qs.filter(el => el.offsetParent !== null);
      const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
      if (!q) return { isCompleted: false };

      const containers = [q, q.querySelector('.question-main'), q.querySelector('.question-markdown'), q.querySelector('.markdown-content')].filter(Boolean);
      const isWrong = containers.some(c => c.classList.contains('is-wrong') || c.classList.contains('is-incorrect') || c.classList.contains('is-danger') || c.classList.contains('is-error'));
      if (isWrong) return { isCompleted: false };

      const isCorrect = q.querySelector('.check-icon, .is-success, .is-correct') ||
                       containers.some(c => c.classList.contains('is-success') || c.classList.contains('is-correct'));
      if (isCorrect) return { isCompleted: true, hasNext: false };

      const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary, .el-button--success')).find(b => {
        if (!(b.offsetParent !== null) || !nextKeywords.some(k => b.innerText.includes(k))) return false;
        const parentQ = b.closest('.quiz-question');
        return !parentQ || parentQ === q;
      });
      if (btn) return { isCompleted: true, hasNext: true };

      const qText = q.innerText || '';
      if (['정답을 맞췄습니다', '정답입니다', '잘했습니다', '축하합니다', 'Correct'].some(t => qText.includes(t))) return { isCompleted: true, hasNext: false };
      if (!q.querySelector('.choice') && !q.querySelector('textarea') && !btn) return { isCompleted: true, hasNext: false };
      return { isCompleted: false };
    }, qIndex);

    if (completionState.isCompleted) {
      logger.info('  ⏭️  이미 완료된 문제, 다음으로 이동');
      if (completionState.hasNext) await handleCorrect(page, cursor, qIndex, 1);
      continue;
    }

    // 보기 수 확인
    const choiceCount = await page.evaluate((idx) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const visibleQs = qs.filter(el => el.offsetParent !== null);
      const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
      if (!q) return 0;
      return Array.from(q.querySelectorAll('.choice')).filter(el => (el.offsetParent !== null)).length;
    }, qIndex);

    logger.info(`  🔘 보기 ${choiceCount}개 발견`);

    if (choiceCount === 0) {
      // 주관식 처리
      const hasTextarea = await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return false;
        return q.querySelector('textarea') !== null;
      }, qIndex);

      if (hasTextarea) {
        logger.info('  ✍️  주관식 문제 감지 — 스킵');
      } else {
        logger.warn('  ⚠️  보기를 찾지 못함');
      }
      continue;
    }

    // ─── 브루트포스 + AI 루프 ───────────────────────────────────────
    let solved = false;
    let attempts = 0;
    const triedTexts = new Set();
    const MAX_ATTEMPTS = 15;

    // 보기 텍스트 읽기
    const getChoiceTexts = async () => {
      return page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return [];
        const allChoices = [];
        ['.choice', '.quiz-choice', '.choice-item', '.option', '.el-radio', '.el-checkbox'].forEach(selector => {
          q.querySelectorAll(selector).forEach(el => {
            if (el.offsetParent !== null) {
              const text = el.innerText.trim();
              if (text && !allChoices.includes(text)) allChoices.push(text);
            }
          });
        });
        return allChoices;
      }, qIndex);
    };

    // 보기 선택 → 제출 → 결과 확인
    const tryChoiceTexts = async (texts) => {
      for (const text of texts) {
        const handle = await page.evaluateHandle((idx, t) => {
          const qs = Array.from(document.querySelectorAll('.quiz-question'));
          const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
          if (!q) return null;
          const choices = Array.from(q.querySelectorAll('.choice')).filter(el => (el.offsetParent !== null));
          return choices.find(el => el.innerText.trim() === t) || null;
        }, qIndex, text);
        const el = handle.asElement();
        if (!el) { if (handle) await handle.dispose(); return false; }
        try {
          await page.evaluate(e => { e.scrollIntoView({block: 'center', behavior: 'smooth'}); }, el);
          await randomDelay(200, 400);
          await page.evaluate(e => { e.click(); }, el);
          await randomDelay(300, 500);
        } catch (err) {
          logger.warn(`  ⚠️ 보기 클릭 실패: ${err.message}`);
          await handle.dispose(); return false;
        }
        await handle.dispose();
      }
      await randomDelay(400, 800);

      // 확인 버튼 대기 및 클릭
      try {
        await page.waitForFunction((idx) => {
          const qs = Array.from(document.querySelectorAll('.quiz-question'));
          const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
          const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).filter(b => (b.offsetParent !== null));
          const qBtn = q ? Array.from(q.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => (b.offsetParent !== null)) : null;
          const globalBtn = allBtns.find(b => !b.closest('.quiz-question'));
          const b = qBtn || globalBtn;
          if (b && !b.classList.contains('is-disabled') && !b.classList.contains('disabled')) {
            const t = b.innerText.trim();
            return !['재도전', '다시', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'].some(k => t.includes(k));
          }
          return false;
        }, { timeout: 3000 }, qIndex);
      } catch { /* 단일클릭 제출 또는 버튼 없음 */ }

      const submitted = await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).filter(b => (b.offsetParent !== null));
        const qBtn = q ? Array.from(q.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => (b.offsetParent !== null)) : null;
        const globalBtn = allBtns.find(b => { const parent = b.closest('.quiz-question'); return !parent || parent === q; });
        const b = qBtn || globalBtn;
        if (!b || b.classList.contains('disabled') || b.classList.contains('is-disabled')) return false;
        const t = b.innerText.trim();
        if (['재도전', '다시', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'].some(k => t.includes(k))) return false;
        b.scrollIntoView({ block: 'center' }); b.click();
        return true;
      }, qIndex);

      if (submitted) {
        logger.info('  📤 확인 클릭');
        try {
          await page.waitForFunction((idx) => {
            const qs = Array.from(document.querySelectorAll('.quiz-question'));
            const visibleQs = qs.filter(el => el.offsetParent !== null);
            const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
            if (!q) return true;
            const hasResultClass = q.querySelector('.is-correct, .is-wrong, .is-success, .is-error, .check-icon');
            const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).filter(el => (el.offsetParent !== null)).filter(el => { const p = el.closest('.quiz-question'); return !p || p === q; });
            if (allBtns.some(b => b.innerText.includes('재도전') || b.innerText.includes('다시'))) return true;
            if (allBtns.some(b => ['다음 문제', '다음', '완료', '계속', 'Next', 'Continue'].some(k => b.innerText.includes(k)))) return true;
            return !!hasResultClass;
          }, { timeout: 5000 }, qIndex);
        } catch { /* timeout */ }
        await randomDelay(1000, 2000);
      } else {
        await randomDelay(2000, 3500);
      }

      // 정답 여부 판별
      const CORRECT_TEXTS = ['정답을 맞췄습니다', '정답입니다', '잘했습니다', 'Correct', '축하합니다', '성공'];

      const evalResult = await page.evaluate((idx, correctTexts) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return { isCorrect: true };

        const allVisibleBtns = Array.from(document.querySelectorAll('.btn, .el-button, .el-button--primary, .el-button--success')).filter(b => (b.offsetParent !== null));
        const mainContainer = q.querySelector('.question-main, .question-markdown, .markdown-content');
        const containers = [q, mainContainer].filter(Boolean);

        // 모달 확인
        const alertBox = document.querySelector('.el-message-box, .el-notification');
        if (alertBox) {
          const text = alertBox.innerText || '';
          const alertBtn = alertBox.querySelector('.el-button--primary, .btn-primary');
          if (alertBtn) alertBtn.click();
          if (['정답', 'Correct', '축하', '성공', '통과', '맞췄습니다'].some(t => text.includes(t))) return { isCorrect: true };
        }

        const qText = q.innerText || '';
        if (correctTexts.some(t => qText.includes(t))) return { isCorrect: true };
        if (q.querySelector('.check-icon, .is-success, .is-correct')) return { isCorrect: true };
        if (containers.some(c => c.classList.contains('is-success') || c.classList.contains('is-correct'))) return { isCorrect: true };

        // 재도전 버튼 → 오답
        const retryBtn = allVisibleBtns.find(b =>
          (b.innerText.includes('재도전') || b.innerText.includes('다시')) &&
          (!b.closest('.quiz-question') || b.closest('.quiz-question') === q)
        );
        if (retryBtn) return { isCorrect: false };

        // 오답 클래스
        const isWrong = containers.some(c => c.classList.contains('is-wrong') || c.classList.contains('is-incorrect') || c.classList.contains('is-danger') || c.classList.contains('is-error'));
        if (isWrong) return { isCorrect: false };

        return { isCorrect: false };
      }, qIndex, CORRECT_TEXTS);

      return evalResult.isCorrect;
    };

    // ─── AI + 브루트포스 반복 ───────────────────────────────────────
    let lastQuestionText = '';
    while (!solved) {
      attempts++;
      if (attempts > MAX_ATTEMPTS) { logger.warn(`  🛑 시도 횟수 초과 (${MAX_ATTEMPTS}회). 건너뜁니다.`); break; }

      const currentQuestionData = await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return null;
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
        let questionText = '';
        if (main) {
          const clone = main.cloneNode(true);
          clone.querySelectorAll('pre, code, .hljs, .hljs-dreamhack-quiz').forEach(block => {
            if (block.innerText.includes('[CODE_START]')) return;
            block.innerText = `\n[CODE_START]\n${block.innerText}\n[CODE_END]\n`;
          });
          questionText = clone.innerText.trim();
        }
        const finalContent = questionText || q.innerText.trim();
        const multiKeywords = ['모두', '있는 대로', '옳은 것', '다르지 않은', '옳지 않은 것', '모두 선택'];
        return {
          questionText: finalContent,
          isMulti: q.querySelector('.el-checkbox') !== null || q.querySelector('.is-multiple') !== null || multiKeywords.some(k => finalContent.includes(k)),
          choices: Array.from(q.querySelectorAll('.choice')).filter(el => (el.offsetParent !== null)).map(el => el.innerText.trim())
        };
      }, qIndex);

      if (!currentQuestionData || currentQuestionData.choices.length === 0) break;

      const currentTexts = currentQuestionData.choices;
      const currentTextsKey = JSON.stringify(currentTexts);

      if (lastQuestionText && lastQuestionText !== currentQuestionData.questionText) {
        logger.info('  🔄 문제 내용이 바뀌었습니다. 새로운 문제로 인식.');
      }
      lastQuestionText = currentQuestionData.questionText;

      // AI 예측 (70% 확률)
      let aiIndices = null;
      if (Math.random() < 0.7 && aiProvider.isAIAvailable()) {
        const systemPrompt = "당신은 리버싱 및 x86-64, x86(32비트) 어셈블리 전문가입니다. 주어진 레지스터 상태와 메모리, 코드를 분석하여 정확한 결과값을 도출합니다.";
        const prompt = `드림핵 보안 퀴즈 문제입니다. 다음 내용을 분석하여 정답 보기의 인덱스(0부터 시작)를 JSON 배열로만 출력하세요.\n\n출력 형식: [2] 또는 [1, 3] (반드시 JSON 배열만 출력)\n\n문제:\n${currentQuestionData.questionText}\n\n보기:\n${currentTexts.map((text, idx) => `[${idx}] ${text}`).join('\n')}\n\nJSON 배열만 출력, 다른 설명 생략.`;

        try {
          const raw = await aiProvider.getCompletion(prompt, systemPrompt);
          if (raw) {
            const parsed = JSON.parse(raw.match(/[\d,\s]+\]/)?.[0] || 'null');
            if (Array.isArray(parsed) && parsed.length > 0) {
              aiIndices = parsed.filter(i => i >= 0 && i < currentTexts.length);
              logger.info(`  🤖 AI 예측: [${aiIndices.join(', ')}]`);
            }
          }
        } catch (err) {
          logger.warn(`  ⚠️ AI 예측 에러: ${err.message}`);
        }
      }

      // 의도적 오답 (30% 확률) - 봇 감지 회피
      if (Math.random() < 0.3 && currentTexts.length > 1) {
        logger.info(`  🎭 의도적 오답 시도 (봇 감지 회피)`);
        const wrongChoices = [...Array(currentTexts.length).keys()].filter(i => !aiIndices || !aiIndices.includes(i));
        if (wrongChoices.length > 0) {
          const wrongIdx = wrongChoices[Math.floor(Math.random() * wrongChoices.length)];
          await tryChoiceTexts([currentTexts[wrongIdx]]);
          const retryRes = await clickRetry(page, cursor, qIndex);
          if (retryRes === 'RELOAD_REQUIRED') continue;
          await randomDelay(3000, 8000);
        }
      }

      // AI 예측으로 시도
      if (aiIndices) {
        const aiTexts = aiIndices.map(i => currentTexts[i]).filter(Boolean);
        if (aiTexts.length === aiIndices.length) {
          const ok = await tryChoiceTexts(aiTexts);
          if (ok) {
            logger.info('  🎉 AI 정답!');
            solved = true;
            await handleCorrect(page, cursor, qIndex);
            break;
          } else {
            logger.info('  ❌ AI 오답. 브루트포스 전환...');
            const retryRes = await clickRetry(page, cursor, qIndex);
            if (retryRes === 'RELOAD_REQUIRED') continue;
          }
        }
      }

      if (solved) break;

      // 보기 변경 확인
      const afterAiTexts = await getChoiceTexts();
      if (JSON.stringify(afterAiTexts) !== currentTextsKey) {
        logger.info('  🔄 보기가 재생성되었습니다.');
        continue;
      }

      if (aiIndices) {
        const aiTexts = aiIndices.map(i => currentTexts[i]).filter(Boolean);
        triedTexts.add(JSON.stringify(aiTexts.slice().sort()));
      }

      // 단일 보기 순회 (무작위)
      let viewChanged = false;
      const shuffledIndices = [...Array(currentTexts.length).keys()].sort(() => Math.random() - 0.5);

      for (const c of shuffledIndices) {
        const text = currentTexts[c];
        const key = JSON.stringify([text]);
        if (triedTexts.has(key)) continue;
        triedTexts.add(key);
        logger.info(`  🔄 [보기 ${c + 1}/${currentTexts.length}]: "${text.substring(0, 30)}"`);
        const ok = await tryChoiceTexts([text]);
        if (ok) {
          logger.info('  🎉 정답!');
          solved = true;
          await handleCorrect(page, cursor, qIndex);
        } else {
          logger.info('  ❌ 오답.');
          const retryRes = await clickRetry(page, cursor, qIndex);
          if (retryRes === 'RELOAD_REQUIRED') { viewChanged = true; break; }
          const newTexts = await getChoiceTexts();
          if (JSON.stringify(newTexts) !== currentTextsKey) { viewChanged = true; break; }
        }
      }

      if (solved || viewChanged) continue;

      // 복수 조합 (다중 선택형)
      if (!solved && currentQuestionData.isMulti) {
        for (let a = 0; a < currentTexts.length && !solved; a++) {
          for (let b = a + 1; b < currentTexts.length && !solved; b++) {
            const combo = [currentTexts[a], currentTexts[b]].sort();
            const key = JSON.stringify(combo);
            if (triedTexts.has(key)) continue;
            triedTexts.add(key);
            logger.info(`  🔄 복수선택 [${a+1},${b+1}]`);
            const ok = await tryChoiceTexts([currentTexts[a], currentTexts[b]]);
            if (ok) {
              logger.info('  🎉 정답!');
              solved = true;
              await handleCorrect(page, cursor, qIndex);
            } else {
              const retryRes = await clickRetry(page, cursor, qIndex);
              if (retryRes === 'RELOAD_REQUIRED') { viewChanged = true; break; }
              const nextData = await page.evaluate((idx) => {
                const qs = Array.from(document.querySelectorAll('.quiz-question'));
                const visibleQs = qs.filter(el => el.offsetParent !== null);
                const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
                return q ? Array.from(q.querySelectorAll('.choice')).filter(el => (el.offsetParent !== null)).map(el => el.innerText.trim()) : [];
              }, qIndex);
              if (JSON.stringify(nextData) !== currentTextsKey) { viewChanged = true; break; }
            }
          }
          if (viewChanged) break;
        }
      }

      if (solved || viewChanged) continue;
      if (!solved && !viewChanged) break;
    }

    if (!solved) { logger.warn('  ⚠️  정답을 찾지 못함.'); unsolved++; }
  }

  logger.info(`  📝 퀴즈 풀이 완료 (미해결: ${unsolved}/${loopCount})`);
  return unsolved;
}

// ─── 퀴즈 최종 제출 ───────────────────────────────────────────────────────────

async function finishQuiz(page, cursor) {
  logger.info('🏁 퀴즈/수료 퀴즈 최종 제출을 시도합니다...');
  await randomDelay(3000, 5000);

  try {
    const btnText = await page.evaluate(() => {
      const submitKeywords = ['제출', '결과', 'Finish', 'Submit', 'Done', '채점', '완료', '최종 제출', '최종 확인'];
      const btns = Array.from(document.querySelectorAll('button, a, .btn, .el-button, .dh3-button'));
      const visibleBtns = btns.filter(b => b.offsetParent !== null);

      let targetBtn = visibleBtns.find(btn =>
        submitKeywords.some(k => btn.innerText.includes(k)) &&
        !btn.innerText.includes('재도전') && !btn.innerText.includes('다시') &&
        !btn.innerText.includes('다음 문제') && !btn.innerText.includes('다음 주제로') &&
        !btn.innerText.includes('진행하기') && !btn.innerText.includes('본 워게임')
      );

      if (!targetBtn) {
        targetBtn = visibleBtns.find(btn =>
          (btn.innerText.includes('다음 주제로') || btn.innerText.includes('목록으로') || btn.innerText.includes('본 워게임')) &&
          !btn.innerText.includes('재도전') && !btn.innerText.includes('다시')
        );
      }

      if (targetBtn) { targetBtn.click(); return targetBtn.innerText.trim(); }
      return null;
    });

    if (btnText) {
      logger.info(`🖱️  최종 제출 버튼 [${btnText}] 클릭 완료`);
      await randomDelay(3000, 5000);

      await page.evaluate(() => {
        const confirmBtn = document.querySelector('.el-message-box__btns .el-button--primary, .el-message-box__btns .btn-primary');
        if (confirmBtn) confirmBtn.click();
      });
      await randomDelay(2000, 4000);
    }

    // 팝업 확인
    const { checkCompletionPopup, clickCompleteButton } = require('./lectureManager');
    const completed = await checkCompletionPopup(page, cursor);
    if (completed) {
      logger.info('🎉 퀴즈가 성공적으로 처리되었습니다.');
    } else {
      await clickCompleteButton(page, cursor);
      await randomDelay(2000, 4000);
    }
  } catch (err) {
    logger.warn('⚠️  퀴즈 최종 제출 처리 중 에러:', err.message);
  }
}

module.exports = {
  detectQuiz,
  solveQuiz,
  finishQuiz,
  extractQuizTitle,
  countQuizQuestions,
  takeDebugScreenshot,
};

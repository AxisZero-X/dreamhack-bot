const { createCursor } = require('ghost-cursor');
const { CURRICULUM_URL, EXAM_URL, DELAY, SELECTORS } = require('./config');
const { launchBrowser, ensureLoggedIn, randomDelay, randomScroll, humanType } = require('./utils');
const { searchFlagForWargame } = require('./search');
const aiProvider = require('./aiProvider');

(async () => {
  console.log('🚀 드림핵 자동 수강 봇 시작...\n');

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);

  try {
    // === 0단계: 로그인 확인 ===
    await ensureLoggedIn(page);

    // === 1단계: 커리큘럼에서 미완료 강의 추출 ===
    console.log(`🔍 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await page.goto(CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    const { lectureUrls, togetherPracticeMap } = await page.evaluate(
      (itemSel, linkSel) => {
        const urls = [];
        const practiceMap = {};
        const items = document.querySelectorAll(itemSel);
        items.forEach(item => {
          const titleEl = item.querySelector('.entity-title, .title');
          const title = titleEl ? titleEl.innerText.trim() : '';
          const linkEl = item.querySelector(linkSel);
          const link = linkEl ? linkEl.href : null;

          // [함께실습] 맵핑 (워게임 해결용)
          if (title.includes('함께실습') && link) {
            const problemName = title.replace('[함께실습]', '').trim();
            practiceMap[problemName] = link;
          }

          // 미완료 강의 수집
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          const isIncomplete = actionTexts.some(el =>
            !el.classList.contains('completed') &&
            (el.innerText.trim() === '시작하기' || el.innerText.trim() === '이어하기')
          );

          if (isIncomplete && link) {
            urls.push(link);
          }
        });
        return { lectureUrls: urls, togetherPracticeMap: practiceMap };
      },
      SELECTORS.LECTURE_ITEM,
      SELECTORS.LECTURE_LINK,
    );

    if (lectureUrls.length === 0) {
      console.log('✅ 모든 강의가 이미 완료되었습니다.');
    } else {
      console.log(`📚 총 ${lectureUrls.length}개의 미완료 강의를 발견했습니다.`);
    }

    // === 2단계: 각 강의 순회 ===
    for (let i = 0; i < lectureUrls.length; i++) {
      const url = lectureUrls[i];
      console.log(`\n▶️  [${i + 1}/${lectureUrls.length}] ${url}`);

      // 자동화 불가능한 페이지(예: 워게임 챌린지) 스킵
      if (url.includes('wargame/challenges')) {
        console.log('⚠️  워게임 챌린지 페이지가 감지되었습니다. [함께실습] 강의 및 인터넷 검색으로 플래그 해결을 시도합니다.');
        await solveWargameChallenge(browser, page, url, togetherPracticeMap);
        continue;
      }

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 퀴즈 페이지인지 확인
      const isQuiz = await detectQuiz(page);

      if (isQuiz) {
        let unsolvedCount = await solveQuiz(page, cursor);
        // 미해결 문제가 있으면 최대 2회 재시도
        for (let retry = 0; retry < 2 && unsolvedCount > 0; retry++) {
          console.log(`  🔁 미해결 ${unsolvedCount}문제 재시도 (${retry + 1}/2)...`);
          await randomDelay(500, 1000);
          unsolvedCount = await solveQuiz(page, cursor);
        }
      } else {
        // === 일반 강의 처리 ===
        let lectureCompleted = false;

        while (!lectureCompleted) {
          console.log('📖 강의 내용 읽는 중... (스크롤 + 체류)');
          await Promise.all([
            randomDelay(DELAY.PAGE_STAY_MIN, DELAY.PAGE_STAY_MAX),
            randomScroll(page),
          ]);

          // === 강의 중간에 삽입된 퀴즈가 있는지 확인 ===
          let hasQuizInPage = false;
          try {
            hasQuizInPage = await page.evaluate((choiceSel) => {
              const choices = document.querySelectorAll(choiceSel);
              return Array.from(choices).some(el => el.offsetParent !== null);
            }, SELECTORS.QUIZ_CHOICE);
          } catch (err) {
            // console.log('⚠️ 퀴즈 확인 중 에러 (페이지 이동 중일 수 있음):', err.message);
          }

          if (hasQuizInPage) {
            console.log('💡 강의 내에 퀴즈가 감지되었습니다. 퀴즈 풀이를 시도합니다.');
            await solveQuiz(page, cursor);
            await randomDelay(1000, 2000);
          }

          // 페이지 하단의 '진행하기' 혹은 '다음 주제로' 버튼 클릭 (이동이 발생할 수 있음)
          await clickCompleteButton(page, cursor);

          // 클릭 후 페이지가 변경/렌더링 될 시간을 대기
          await randomDelay(3000, 5000);

          // 팝업 검사 (축하합니다!)
          lectureCompleted = await checkCompletionPopup(page, cursor);

          if (!lectureCompleted) {
            console.log('➡️ 다음 페이지로 넘어갔습니다. 계속 진행합니다.');
          }
        }
      }

      console.log(`✅ [${i + 1}] 완료`);

      // 다음 강의 전 자연스러운 대기
      if (i < lectureUrls.length - 1) {
        console.log('🔄 다음 강의 준비...');
        await randomDelay(DELAY.BETWEEN_LECTURES_MIN, DELAY.BETWEEN_LECTURES_MAX);
      }
    }

    console.log('\n🎉 모든 강의 순회 완료!');

    // === 2.5단계: 수료 퀴즈 응시 ===
    console.log('\n📝 수료 퀴즈(exam) 응시 시도...');
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
        console.log(`📝 수료 퀴즈 URL: ${resolvedExamUrl}`);
        await page.goto(resolvedExamUrl, { waitUntil: 'networkidle2' });
        await randomDelay(2000, 4000);
        await solveQuiz(page, cursor);
        await finishExam(page, cursor); // 최종 제출 처리 추가
        console.log('✅ 수료 퀴즈 응시 완료');
      } else {
        console.log('⚠️ 수료 퀴즈 링크를 찾지 못했습니다. EXAM_URL을 .env에 설정하세요.');
      }
    } catch (err) {
      console.log(`⚠️ 수료 퀴즈 처리 중 에러: ${err.message}`);
    }

    // === 3단계: 최종 완료 검증 ===
    console.log(`\n🔍 최종 검증을 위해 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await page.goto(CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 5000);

    const remainingUrls = await page.evaluate(
      (itemSel, linkSel) => {
        const urls = [];
        const items = document.querySelectorAll(itemSel);
        items.forEach(item => {
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          if (hasStart) {
            const linkEl = item.querySelector(linkSel);
            if (linkEl && linkEl.href) {
              urls.push(linkEl.href);
            }
          }
        });
        return urls;
      },
      SELECTORS.LECTURE_ITEM,
      SELECTORS.LECTURE_LINK,
    );

    if (remainingUrls.length === 0) {
      console.log('✅ 완벽합니다! 모든 강의와 퀴즈가 성공적으로 수료 처리되었습니다.');
    } else {
      console.log(`⚠️ 검증 결과, 아직 미완료 처리된 항목이 ${remainingUrls.length}개 남아있습니다.`);
      remainingUrls.forEach((url, idx) => {
        console.log(`  - [${idx + 1}] ${url}`);
      });
      console.log('재실행을 통해 남은 항목들을 마저 수료할 수 있습니다.');
    }

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

  // 총 문제 수 확인
  const totalQuestions = await page.$$eval('.quiz-question', qs => qs.length);
  console.log(`📋 총 ${totalQuestions}개 문제`);

  if (totalQuestions === 0) {
    console.log('⚠️ 문제를 찾지 못했습니다.');
    return 0;
  }

  // 스텝 기반인지 단일 페이지 기반인지 확인
  const totalSteps = await page.$$eval(SELECTORS.QUIZ_STEP, el => el.length);
  const isStepBased = totalSteps > 0;

  if (isStepBased) {
    console.log(`🪜 스텝 기반 퀴즈 감지: 총 ${totalSteps}단계`);
  }

  // qIndex 루프를 돌되, 스텝 기반인 경우 현재 스텝 정보를 동적으로 확인
  let unsolved = 0;
  for (let qIndex = 0; qIndex < (isStepBased ? totalSteps : totalQuestions); qIndex++) {
    if (isStepBased) {
      // 현재 스텝으로 이동 (필요한 경우)
      const currentStepIdx = await page.evaluate((sel) => {
        const steps = Array.from(document.querySelectorAll(sel));
        return steps.findIndex(s => s.classList.contains('is-current'));
      }, SELECTORS.QUIZ_STEP);

      if (currentStepIdx !== -1 && currentStepIdx < qIndex) {
        console.log(`🪜 스텝 ${qIndex + 1}으로 이동 시도...`);
        await clickNextStep(page, cursor, qIndex);
        await randomDelay(1000, 2000);
      }
    }

    console.log(`\n  --- 문제/스텝 ${qIndex + 1}/${isStepBased ? totalSteps : totalQuestions} ---`);

    await randomDelay(200, 400);

    // 해당 문제(qIndex)가 이미 완료(정답) 처리되었는지 확인
    const completionState = await page.evaluate((idx) => {
      const nextKeywords = ['다음 문제', '다음', '완료', '계속', 'Next', 'Continue'];
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      // 가시적인 문제를 우선 찾고, 없으면 인덱스로 접근
      const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
      if (!q) return { isCompleted: false };

      // 결과 상태 확인을 위한 컨테이너들
      const containers = [q, q.querySelector('.question-main'), q.querySelector('.question-markdown'), q.querySelector('.markdown-content')].filter(Boolean);

      // 오답 상태(is-wrong)면 완료 아님
      const isWrong = containers.some(c =>
        c.classList.contains('is-wrong') ||
        c.classList.contains('is-incorrect') ||
        c.classList.contains('is-danger') ||
        c.classList.contains('is-error')
      );
      if (isWrong) return { isCompleted: false };

      // 정답 아이콘이나 정답 클래스가 있으면 완료
      const isCorrect = q.querySelector('.check-icon, .is-success, .is-correct') ||
                       containers.some(c => c.classList.contains('is-success') || c.classList.contains('is-correct'));

      if (isCorrect) return { isCompleted: true, hasNext: false };

      // "다음 문제" 버튼 확인: 현재 문제 내부 또는 문제 외부(다른 문제에 속하지 않은 버튼)
      const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary, .el-button--success')).find(b => {
        if (!(b.offsetWidth > 0 || b.offsetHeight > 0) || !nextKeywords.some(k => b.innerText.includes(k))) return false;
        const parentQ = b.closest('.quiz-question');
        return !parentQ || parentQ === q;
      });
      if (btn) return { isCompleted: true, hasNext: true };

      // 정답 텍스트가 있으면 완료
      const qText = q.innerText || '';
      if (['정답을 맞췄습니다', '정답입니다', '잘했습니다', '축하합니다', 'Correct'].some(t => qText.includes(t))) return { isCompleted: true, hasNext: false };

      // 보기도 없고 버튼도 없으면 완료 (다음 문제로 넘어간 상태)
      if (!q.querySelector('.choice') && !q.querySelector('textarea') && !btn) return { isCompleted: true, hasNext: false };
      return { isCompleted: false };
    }, qIndex);

    if (completionState.isCompleted) {
      console.log('  ⏭️  이미 완료된 문제, 다음으로 이동');
      if (completionState.hasNext) {
        await handleCorrect(page, cursor, qIndex, 1); // 이미 완료되었으므로 짧게 확인 후 클릭
      }
      continue;
    }

    // 현재 문제의 보기 개수 수집
    const choiceCount = await page.evaluate((idx) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
      if (!q) return 0;
      const choices = q.querySelectorAll('.choice');
      return Array.from(choices).filter(el => (el.offsetWidth > 0 || el.offsetHeight > 0)).length;
    }, qIndex);

    console.log(`  🔘 보기 ${choiceCount}개 발견`);

    // 문제 데이터 추출 (AI 프롬프트용)
    const questionData = await page.evaluate((idx) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
      if (!q) return { questionText: '', isMulti: false };

      // .question-main, .question-markdown 등을 모두 고려
      const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
      const text = main ? main.innerText.trim() : q.innerText.trim();

      // 다중 선택 여부 확인
      const multiKeywords = ['모두', '있는 대로', '옳은 것', '다르지 않은', '옳지 않은 것', '모두 선택'];
      const isMulti = q.querySelector('.el-checkbox') !== null ||
                     q.querySelector('.is-multiple') !== null ||
                     multiKeywords.some(k => text.includes(k));
      return { questionText: text, isMulti: isMulti };
    }, qIndex);

    if (choiceCount === 0) {
      // 주관식(textarea) 처리
      const hasTextarea = await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
        if (!q) return false;
        return q.querySelector('textarea') !== null;
      }, qIndex);

      if (hasTextarea) {
        console.log('  ✍️  주관식 문제 감지. 미리 계산된 답변 입력 시도...');
        const currentUrl = page.url();
        const shortAnswerMap = {
          'quiz/17': 'Welcome to assembly world!',
        };
        const matchedKey = Object.keys(shortAnswerMap).find(k => currentUrl.includes(k));
        const answer = matchedKey ? shortAnswerMap[matchedKey] : null;

        if (answer) {
          await page.evaluate((idx, ans) => {
            const qs = Array.from(document.querySelectorAll('.quiz-question'));
            const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
            if (!q) return;
            const ta = q.querySelector('textarea');
            if (!ta) return;
            ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
            ta.focus();
            ta.value = ans;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
          }, qIndex, answer);
          await randomDelay(500, 1000);

          await page.evaluate((idx) => {
            const qs = Array.from(document.querySelectorAll('.quiz-question'));
            const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
            if (!q) return;
            // 현재 문제 내부 또는 문제 외부(다른 문제에 속하지 않은 버튼) 검색
            const confirmKeywords = ['확인', '제출', 'Confirm', 'Submit'];
            const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary, .el-button--success')).find(b => {
              if (!(b.offsetWidth > 0 || b.offsetHeight > 0) || !confirmKeywords.some(k => b.innerText.includes(k))) return false;
              const parentQ = b.closest('.quiz-question');
              return !parentQ || parentQ === q;
            });
            if (btn) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
          }, qIndex);
          console.log('  📤 주관식 답변 제출 완료');
          await randomDelay(1500, 3000);
        } else {
          console.log('  ⚠️  이 주관식 문제에 대한 답변이 없습니다. 스킵.');
        }
      } else {
        console.log('  ⚠️  보기를 찾지 못함. 셀렉터를 확인하세요.');
      }
      continue;
    }


    let solved = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 15;

    // 현재 보기 텍스트 목록 읽기 (셔플 후 매번 호출)
    const getChoiceTexts = async () => {
      return page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
        if (!q) return [];
        return Array.from(q.querySelectorAll('.choice'))
          .filter(el => (el.offsetWidth > 0 || el.offsetHeight > 0))
          .map(el => el.innerText.trim());
      }, qIndex);
    };

    // 텍스트 목록을 받아 해당 보기들을 클릭 후 결과 확인
    const tryChoiceTexts = async (texts) => {
      // cursor.click(el) 대신 Puppeteer 네이티브 클릭을 사용하여 Vue.js 반응성 보장
      for (const text of texts) {
        const handle = await page.evaluateHandle((idx, t) => {
          const qs = Array.from(document.querySelectorAll('.quiz-question'));
          const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
          if (!q) return null;
          const choices = Array.from(q.querySelectorAll('.choice'))
            .filter(el => (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0));
          return choices.find(el => el.innerText.trim() === t) || null;
        }, qIndex, text);

        const el = handle.asElement();
        if (!el) {
          if (handle) await handle.dispose();
          return false;
        }

        try {
          await el.scrollIntoViewIfNeeded();
          await el.click(); // 네이티브 클릭으로 Vue.js 이벤트 트리거
          await randomDelay(300, 500);
        } catch (err) {
          console.log(`  ⚠️ 보기 클릭 실패: ${err.message}`);
          await handle.dispose();
          return false;
        }
        await handle.dispose();
      }
      await randomDelay(400, 800);

      // 확인 버튼 활성화 대기 후 클릭 (단일클릭 퀴즈는 바로 결과가 나오므로 timeout 무시)
      try {
        await page.waitForFunction(
          (idx) => {
            const qs = Array.from(document.querySelectorAll('.quiz-question'));
            const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
            const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary'))
                                 .filter(b => (b.offsetWidth > 0 || b.offsetHeight > 0 || b.getClientRects().length > 0));
            const qBtn = q ? q.querySelector('.btn.btn-primary, .el-button--primary') : null;
            const globalBtn = allBtns.find(b => !b.closest('.quiz-question'));
            const b = qBtn || globalBtn;

            if (b && !b.classList.contains('is-disabled') && !b.classList.contains('disabled')) {
              const t = b.innerText.trim();
              const isConfirm = !['재도전', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'].some(k => t.includes(k));
              return isConfirm;
            }
            return false;
          },
          { timeout: 3000 }, qIndex
        );
      } catch { /* 단일클릭 제출이거나 버튼 없는 경우 */ }

      const submitted = await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
        const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary'))
                             .filter(b => (b.offsetWidth > 0 || b.offsetHeight > 0 || b.getClientRects().length > 0));

        // 현재 문제 컨테이너 안의 버튼 우선, 없으면 전역 버튼 중 현재 문제와 연관된 것 탐색
        const qBtn = q ? q.querySelector('.btn.btn-primary, .el-button--primary') : null;
        const globalBtn = allBtns.find(b => {
          const parent = b.closest('.quiz-question');
          return !parent || parent === q;
        });
        const b = qBtn || globalBtn;

        if (!b || b.classList.contains('disabled') || b.classList.contains('is-disabled')) return false;

        const t = b.innerText.trim();
        const nextKeywords = ['재도전', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'];
        if (nextKeywords.some(k => t.includes(k))) return false;

        b.scrollIntoView({ block: 'center' });
        b.click();
        return true;
      }, qIndex);

      if (submitted) {
        console.log('  📤 확인 클릭');
        // 제출 후 상태 변화 대기 (결과 클래스가 붙거나 버튼 텍스트가 바뀔 때까지)
        try {
          await page.waitForFunction(
            (idx) => {
              const qs = Array.from(document.querySelectorAll('.quiz-question'));
              const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
              if (!q) return true;

              const hasResultClass = q.querySelector('.is-correct, .is-wrong, .is-success, .is-error, .check-icon') ||
                                     q.classList.contains('is-correct') || q.classList.contains('is-wrong');

              const b = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary'))
                             .filter(el => (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0))
                             .find(el => {
                               const p = el.closest('.quiz-question');
                               return !p || p === q;
                             });

              if (!b) return hasResultClass;
              const t = b.innerText.trim();
              const hasNextOrRetry = ['재도전', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'].some(k => t.includes(k));

              return hasResultClass || hasNextOrRetry;
            },
            { timeout: 5000 }, qIndex
          );
        } catch { /* timeout */ }
        await randomDelay(1000, 2000);
      } else {
        console.log('  ℹ️ 확인 버튼 없음 (단일클릭 또는 이미 결과 노출)');
        await randomDelay(2000, 3500);
      }

      // === 정답 여부 판별 로직 (evalResult) ===
      const CORRECT_TEXTS = ['정답을 맞췄습니다', '정답입니다', '잘했습니다', 'Correct', '축하합니다', '성공'];
      const NEXT_KEYS = ['다음 문제', '다음', '완료', '계속', 'Next', 'Continue'];

      // 결과 폴링: 정답/오답 상태가 확정될 때까지 대기
      try {
        await page.waitForFunction(
          (idx, correctTexts, nextKeys) => {
            const qs = Array.from(document.querySelectorAll('.quiz-question'));
            const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
            if (!q) return true;
            const text = q.innerText || '';

            // 1. 정답 징후 (텍스트, 아이콘, 클래스)
            if (correctTexts.some(t => text.includes(t))) return true;
            if (q.querySelector('.check-icon, .is-success, .is-correct')) return true;

            // 2. 오답 상태 감지
            const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
            if (main && (main.classList.contains('is-wrong') || main.classList.contains('is-incorrect') || main.classList.contains('is-danger'))) return true;

            // 3. 버튼 상태 감지 (재도전 또는 다음)
            const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).filter(b => (b.offsetWidth > 0 || b.offsetHeight > 0));
            const qBtns = allBtns.filter(b => b.closest('.quiz-question') === q);
            const globalBtns = allBtns.filter(b => !b.closest('.quiz-question'));
            const btns = [...qBtns, ...globalBtns];

            if (btns.some(b => b.innerText.includes('재도전') || b.innerText.includes('다시'))) return true;
            if (btns.some(b => nextKeys.some(k => b.innerText.includes(k)))) return true;

            // 4. 보기가 사라졌는데 정답도 오답도 아니면 (다음 단계로 넘어간 특수 케이스)
            if (!q.querySelector('.choice') && !q.querySelector('textarea') && !btns.length) return true;

            // 5. 400 에러 등으로 버튼이 다시 활성화된 경우 (제출 실패)
            const confirmBtn = btns.find(b => !['재도전', '다시', ...nextKeys].some(k => b.innerText.includes(k)));
            if (confirmBtn && !confirmBtn.classList.contains('is-disabled') && !confirmBtn.classList.contains('disabled')) {
                return true;
            }
            return false;
          },
          { timeout: 10000, polling: 300 }, qIndex, CORRECT_TEXTS, NEXT_KEYS
        );
      } catch { /* timeout */ }

      // 최종 정답 여부 판별
      const evalResult = await page.evaluate((idx, correctTexts, nextKeys) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
        if (!q) return { isCorrect: true };

        const allVisibleBtns = Array.from(document.querySelectorAll('.btn, .el-button, .el-button--primary, .el-button--success'))
          .filter(b => (b.offsetWidth > 0 || b.offsetHeight > 0 || b.getClientRects().length > 0));

        const qBtns = allVisibleBtns.filter(b => b.closest('.quiz-question') === q);
        const globalBtns = allVisibleBtns.filter(b => !b.closest('.quiz-question'));

        const mainContainer = q.querySelector('.question-main, .question-markdown, .markdown-content');
        const containers = [q, mainContainer].filter(Boolean);

        const debugInfo = {
          qClasses: q.className,
          mainClasses: mainContainer?.className || 'none',
          innerBtns: allVisibleBtns.map(b => ({
            text: b.innerText.trim(),
            parent: b.closest('.quiz-question') === q ? 'current' : (b.closest('.quiz-question') ? 'other' : 'global'),
            visible: b.offsetWidth > 0 || b.offsetHeight > 0
          })),
        };

        const alertBox = document.querySelector('.el-message-box, .el-notification');
        if (alertBox) {
          const text = alertBox.innerText || '';
          const alertBtn = alertBox.querySelector('.el-button--primary, .btn-primary');
          if (alertBtn) alertBtn.click();
          if (['정답', 'Correct', '축하', '성공', '통과', '맞췄습니다'].some(t => text.includes(t))) {
            return { isCorrect: true, modalText: text, debug: debugInfo };
          }
        }

        const qText = q.innerText || '';
        if (correctTexts.some(t => qText.includes(t))) return { isCorrect: true, debug: debugInfo };
        if (q.querySelector('.check-icon, .is-success, .is-correct')) return { isCorrect: true, debug: debugInfo };
        if (q.querySelector('.caption')?.innerText.includes('정답')) return { isCorrect: true, debug: debugInfo };
        if (containers.some(c => c.classList.contains('is-success') || c.classList.contains('is-correct'))) return { isCorrect: true, debug: debugInfo };

        const targetBtns = qBtns.length > 0 ? qBtns : globalBtns;
        // 다음 문제 버튼이 있으면 무조건 정답 상태로 간주
        const nextBtn = targetBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        if (nextBtn) return { isCorrect: true, debug: debugInfo };

        // 오답 상태 명시적 확인 (재도전 버튼이 있으면 오답)
        const retryBtn = targetBtns.find(b => b.innerText.includes('재도전') || b.innerText.includes('다시'));
        if (retryBtn) return { isCorrect: false, debug: debugInfo };

        const isWrong = containers.some(c =>
          c.classList.contains('is-wrong') ||
          c.classList.contains('is-incorrect') ||
          c.classList.contains('is-danger') ||
          c.classList.contains('is-error')
        ) || qText.includes('아쉽게도 틀렸습니다') || q.querySelector('.icon.wrong') || q.querySelector('img[src*="wrong"]');

        if (isWrong) return { isCorrect: false, debug: debugInfo };

        // 보기도 없고 확인 버튼도 없으면 (다음 단계로 넘어감)
        const hasVisibleChoices = Array.from(q.querySelectorAll('.choice')).some(el => el.offsetWidth > 0 || el.offsetHeight > 0);
        const hasConfirmBtn = targetBtns.some(b => {
          const t = b.innerText.trim();
          const isActionBtn = t.includes('확인') || t.includes('제출') || t.includes('Confirm') || t.includes('Submit');
          return isActionBtn && !['재도전', '다시', ...nextKeys].some(k => t.includes(k));
        });

        if (!hasVisibleChoices && !hasConfirmBtn && !q.querySelector('textarea')) return { isCorrect: true, debug: debugInfo };

        return { isCorrect: false, debug: debugInfo };
      }, qIndex, CORRECT_TEXTS, NEXT_KEYS);

      if (evalResult.debug) {
        console.log(`  🔍 디버그: [${evalResult.debug.qClasses}] main: [${evalResult.debug.mainClasses}]`);
        if (evalResult.debug.innerBtns.length > 0) {
          console.log(`  🔍 버튼: ${evalResult.debug.innerBtns.map(b => `${b.parent === 'current' ? '*' : ''}${b.text}(${b.visible ? 'V' : 'H'})`).join(', ')}`);
        }
      }
      if (evalResult.modalText) {
        console.log(`  💬 모달 텍스트 확인: "${evalResult.modalText.replace(/\n/g, ' ')}"`);
      }
      return evalResult.isCorrect;
    };

    // AI와 브루트포스를 반복하며, 보기 내용이나 문제 텍스트가 동적으로 바뀌면 새 시도로 인식
    let lastQuestionText = '';
    while (!solved) {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        console.log(`  🛑 시도 횟수 초과 (${MAX_ATTEMPTS}회). 이 문제는 건너뜁니다.`);
        break;
      }

      // 매 시도마다 최신 문제 데이터 추출
      const currentQuestionData = await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
        if (!q) return null;

        // 문제 텍스트 추출 시 코드 블록 구조 보존 (.question-main, .question-markdown 등 모두 탐색)
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
          isMulti: q.querySelector('.el-checkbox') !== null ||
                   q.querySelector('.is-multiple') !== null ||
                   multiKeywords.some(k => finalContent.includes(k)),
          choices: Array.from(q.querySelectorAll('.choice'))
            .filter(el => (el.offsetWidth > 0 || el.offsetHeight > 0))
            .map(el => el.innerText.trim())
        };
      }, qIndex);

      if (!currentQuestionData || currentQuestionData.choices.length === 0) break;

      const currentTexts = currentQuestionData.choices;
      const currentTextsKey = JSON.stringify(currentTexts);

      // 문제 내용이 바뀌었는지 감지
      if (lastQuestionText && lastQuestionText !== currentQuestionData.questionText) {
        console.log('  🔄 문제 내용이 바뀌었습니다. 새로운 문제로 인식하여 재시도합니다.');
      }
      lastQuestionText = currentQuestionData.questionText;

      // 현재 보기에 대해 AI 예측 요청
      const systemPrompt = "당신은 리버싱 및 x86-64, x86(32비트) 어셈블리 전문가입니다. 주어진 레지스터 상태와 메모리, 코드를 분석하여 정확한 결과값을 도출합니다.";
      const prompt = `드림핵 보안 퀴즈 문제입니다. 다음 내용을 분석하여 정답 보기의 인덱스(0부터 시작)를 JSON 배열로만 출력하세요.

문제 유형: 어셈블리 코드 실행 추론 또는 보안 개념
출력 형식: [2] 또는 [1, 3] (반드시 JSON 배열만 출력)

문제:
${currentQuestionData.questionText}

보기:
${currentTexts.map((text, idx) => `[${idx}] ${text}`).join('\n')}

분석 가이드:
1. 호출 규약(Calling Convention) 확인:
   - x64 (Linux/SysV): rdi, rsi, rdx, rcx, r8, r9 순으로 인자 전달.
   - x64 (Windows): rcx, rdx, r8, r9 순으로 인자 전달.
   - x86 (cdecl/stdcall): 모든 인자를 **역순(오른쪽에서 왼쪽)**으로 스택에 push.
2. 레지스터(rax, rbx 등)와 메모리 상태 변화를 단계별로 추적하세요.
3. 16진수(0x) 계산에 주의하세요.
4. 문제에서 요구하는 특정 시점(예: "(c)에 들어갈 내용")을 정확히 파악하세요.

JSON 배열만 출력, 다른 설명 생략.`;

      let aiIndices = null;
      try {
        const raw = await aiProvider.getCompletion(prompt, systemPrompt);
        if(!raw) throw new Error('Empty response from AI');
        const parsed = JSON.parse(raw.match(/\[[\d,\s]+\]/)?.[0] || 'null');
        if (Array.isArray(parsed) && parsed.length > 0) {
          aiIndices = parsed.filter(i => i >= 0 && i < currentTexts.length);
          console.log(`  🤖 AI 예측: [${aiIndices.join(', ')}]`);
        } else {
          console.log(`  ⚠️ AI 응답 파싱 실패: ${raw}`);
        }
      } catch (err) {
        console.log(`  ⚠️ AI 예측 에러: ${err.message}`);
      }

      // AI 예측 결과로 먼저 시도
      if (aiIndices) {
        const aiTexts = aiIndices.map(i => currentTexts[i]).filter(Boolean);
        if (aiTexts.length === aiIndices.length) {
          const ok = await tryChoiceTexts(aiTexts);
          if (ok) {
            console.log('  🎉 AI 정답!');
            solved = true;
            await handleCorrect(page, cursor, qIndex);
            break; // 해당 문제 해결 완료
          } else {
            console.log('  ❌ AI 오답. 브루트포스 전환...');
            await clickRetry(page, cursor, qIndex);
          }
        }
      }

      if (solved) break;

      // 보기가 바뀌었는지 확인 (틀렸을 때 보기가 새로 렌더링되었을 수 있음)
      const afterAiTexts = await getChoiceTexts();
      if (JSON.stringify(afterAiTexts) !== currentTextsKey) {
        console.log('  🔄 보기가 재생성되었습니다. AI 예측을 다시 시도합니다.');
        continue; // 보기가 바뀌었으면 처음부터 다시 (while 루프)
      }

      // 2) 브루트포스 (현재 고정된 텍스트 목록 기반)
      const triedTexts = new Set();
      if (aiIndices) {
        const aiTexts = aiIndices.map(i => currentTexts[i]).filter(Boolean);
        if (aiTexts.length === aiIndices.length) {
          triedTexts.add(JSON.stringify(aiTexts.slice().sort()));
        }
      }

      // 단일 보기 순회
      let viewChanged = false;
      for (let c = 0; c < currentTexts.length && !solved; c++) {
        const text = currentTexts[c];
        const key = JSON.stringify([text]);
        if (triedTexts.has(key)) continue;
        triedTexts.add(key);
        console.log(`  🔄 [보기 ${c + 1}/${currentTexts.length}]: "${text.substring(0, 30)}"`);
        const ok = await tryChoiceTexts([text]);
        if (ok) {
          console.log('  🎉 정답!');
          solved = true;
          await handleCorrect(page, cursor, qIndex);
        } else {
          console.log('  ❌ 오답.');
          await clickRetry(page, cursor, qIndex);

          // 오답 후 보기가 셔플되거나 재생성되었는지 확인
          const newTexts = await getChoiceTexts();
          if (JSON.stringify(newTexts) !== currentTextsKey) {
            console.log('  🔄 보기가 재생성되었습니다. 브루트포스 중단 및 재시도.');
            viewChanged = true;
            break; // 현재 브루트포스 for문 탈출
          }
        }
      }

      if (solved || viewChanged) continue;

      // 복수 조합 (단일 정답 실패 시) - 다중 선택형인 경우에만
      if (!solved && currentQuestionData.isMulti) {
        for (let a = 0; a < currentTexts.length && !solved; a++) {
          for (let b = a + 1; b < currentTexts.length && !solved; b++) {
            const combo = [currentTexts[a], currentTexts[b]].sort();
            const key = JSON.stringify(combo);
            if (triedTexts.has(key)) continue;
            triedTexts.add(key);
            console.log(`  🔄 복수선택 [${a+1},${b+1}]`);
            const ok = await tryChoiceTexts([currentTexts[a], currentTexts[b]]);
            if (ok) {
              console.log('  🎉 정답!');
              solved = true;
              await handleCorrect(page, cursor, qIndex);
            } else {
              await clickRetry(page, cursor, qIndex);

              const nextData = await page.evaluate((idx) => {
                const qs = Array.from(document.querySelectorAll('.quiz-question'));
                const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
                return q ? Array.from(q.querySelectorAll('.choice')).filter(el => (el.offsetWidth > 0 || el.offsetHeight > 0)).map(el => el.innerText.trim()) : [];
              }, qIndex);
              if (JSON.stringify(nextData) !== currentTextsKey) {
                console.log('  🔄 보기가 재생성되었습니다. 복수선택 중단 및 재시도.');
                viewChanged = true;
                break;
              }
            }
          }
          if (viewChanged) break;
        }
      }

      if (solved || viewChanged) continue;

      // 3-combo 브루트포스 - 다중 선택형인 경우에만
      if (!solved && currentQuestionData.isMulti) {
        for (let a = 0; a < currentTexts.length && !solved; a++) {
          for (let b = a + 1; b < currentTexts.length && !solved; b++) {
            for (let c = b + 1; c < currentTexts.length && !solved; c++) {
              const combo = [currentTexts[a], currentTexts[b], currentTexts[c]].sort();
              const key = JSON.stringify(combo);
              if (triedTexts.has(key)) continue;
              triedTexts.add(key);
              console.log(`  🔄 3중선택 [${a+1},${b+1},${c+1}]`);
              const ok = await tryChoiceTexts([currentTexts[a], currentTexts[b], currentTexts[c]]);
              if (ok) {
                console.log('  🎉 정답!');
                solved = true;
                await handleCorrect(page, cursor, qIndex);
              } else {
                await clickRetry(page, cursor, qIndex);

                const nextData = await page.evaluate((idx) => {
                  const qs = Array.from(document.querySelectorAll('.quiz-question'));
                  const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
                  return q ? Array.from(q.querySelectorAll('.choice')).filter(el => (el.offsetWidth > 0 || el.offsetHeight > 0)).map(el => el.innerText.trim()) : [];
                }, qIndex);
                if (JSON.stringify(nextData) !== currentTextsKey) {
                  console.log('  🔄 보기가 재생성되었습니다. 3중선택 중단 및 재시도.');
                  viewChanged = true;
                  break;
                }
              }
            }
            if (viewChanged) break;
          }
          if (viewChanged) break;
        }
      }

      // 여기까지 왔는데도 못 풀었고 뷰도 바뀌지 않았다면 이 조합으로는 못 푸는 것이므로 무한루프 방지
      if (!solved && !viewChanged) {
        break;
      }
    }

    if (!solved) {
      console.log('  ⚠️  정답을 찾지 못함.');
      unsolved++;
    }

  }

  console.log(`  📝 퀴즈 풀이 완료 (미해결: ${unsolved}/${totalQuestions})`);
  return unsolved;
}

/**
 * 오답 후 재도전 버튼 클릭
 */
async function clickRetry(page, cursor, qIndex) {
  const handle = await page.evaluateHandle((idx) => {
    const qs = Array.from(document.querySelectorAll('.quiz-question'));
    const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
    const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
      if (!(b.offsetWidth > 0 || b.offsetHeight > 0) || !b.innerText.includes('재도전')) return false;
      const parentQ = b.closest('.quiz-question');
      return !parentQ || parentQ === q; // 현재 문제 내부 또는 전역 재도전 버튼
    });
    return btn || null;
  }, qIndex);
  const el = handle.asElement();
  if (el) {
    console.log('  🔄 재도전 버튼 클릭');
    await el.scrollIntoView();
    await cursor.click(el);

    // 재도전 클릭 후 오답/정답 상태 클래스가 사라질 때까지 대기
    try {
      await page.waitForFunction((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
        if (!q) return true;
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');

        // 결과 관련 클래스들 (더 포괄적으로)
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const hasResultClass = main && resultClasses.some(c => main.classList.contains(c));
        const qHasResultClass = resultClasses.some(c => q.classList.contains(c));
        const anyChildHasResult = q.querySelector('.is-wrong, .is-incorrect, .is-success, .is-correct, .is-danger, .is-valid');

        // 버튼 텍스트가 "확인"으로 돌아왔는지도 체크하면 더 정확함
        const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetWidth > 0 || b.offsetHeight > 0)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('확인') || b.innerText.includes('제출'));
        });

        // "재도전" 버튼이 사라졌는지 확인
        const retryBtn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetWidth > 0 || b.offsetHeight > 0)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && b.innerText.includes('재도전');
        });

        return (!main || !hasResultClass) && !qHasResultClass && !anyChildHasResult && !retryBtn;
      }, { timeout: 6000, polling: 500 }, qIndex);
    } catch (e) {
      console.log('  ⚠️ 재도전 후 상태 초기화 대기 타임아웃. 강제 초기화 및 추가 대기.');
      await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0];
        if (!q) return;
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const removeClasses = (el) => {
          if (!el) return;
          el.classList.remove(...resultClasses);
          Array.from(el.querySelectorAll('*')).forEach(child => child.classList.remove(...resultClasses));
        };
        removeClasses(q);
      }, qIndex);
      await randomDelay(1000, 2000); // 강제 초기화 후 안정화 대기
    }
  }
  handle.dispose();
  await randomDelay(800, 1500); // 상태 초기화 후 약간 더 긴 대기
}

/**
 * 정답 후 다음 버튼 클릭
 */
async function handleCorrect(page, cursor, qIndex, maxAttempts = 8) {
  const nextKeywords = ['다음 문제', '다음', '완료', '계속', 'Next', 'Continue'];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1. 일반적인 "다음" 버튼 찾기
    const btnHandle = await page.evaluateHandle((idx, keywords) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const q = qs.find(el => el.offsetWidth > 0 && el.offsetHeight > 0) || qs[idx] || qs[0] || document.querySelector('.quiz-question');
      const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary, .el-button--success'))
                           .filter(b => (b.offsetWidth > 0 || b.offsetHeight > 0 || b.getClientRects().length > 0));

      return allBtns.find(b => {
        const text = b.innerText.trim();
        if (!keywords.some(k => text.includes(k))) return false;
        if (b.classList.contains('is-disabled') || b.disabled) return false;
        const parentQ = b.closest('.quiz-question');
        return !parentQ || parentQ === q;
      });
    }, qIndex, nextKeywords);

    const btn = btnHandle.asElement();
    if (btn) {
      const txt = await page.evaluate(el => el.innerText.trim(), btn);
      console.log(`  ➡️ 다음 버튼 클릭 시도 (btn="${txt}")`);
      await btn.scrollIntoViewIfNeeded();
      await btn.click(); // Puppeteer의 네이티브 클릭 사용 (Vue.js 반응성 트리거)
      await randomDelay(1000, 2000);
      return;
    }

    // 2. 버튼이 없다면 스텝 네비게이션 확인 (다음 스텝이 'is-accessible' 인지)
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
      console.log(`  🪜 다음 스텝 네비게이션 클릭 완료`);
      await randomDelay(1500, 2500);
      return;
    }

    console.log(`  ⏳ 다음 단계 대기 중... (${attempt + 1}/${maxAttempts})`);
    await randomDelay(1000, 1500);
  }
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
    // 버튼이 나타날 때까지 최대 5초 대기
    await page.waitForFunction((sel) => {
      const btns = Array.from(document.querySelectorAll(sel));
      const visibleBtns = btns.filter(b => (b.offsetWidth > 0 || b.offsetHeight > 0));
      return visibleBtns.some(btn => btn.innerText.includes('진행하기') || btn.innerText.includes('다음 주제로'));
    }, { timeout: 5000 }, SELECTORS.COMPLETE_BTN).catch(() => {});

    const btnText = await page.evaluate((sel) => {
      const btns = Array.from(document.querySelectorAll(sel));
      const visibleBtns = btns.filter(b => (b.offsetWidth > 0 || b.offsetHeight > 0));

      // '진행하기' 버튼을 우선적으로 찾음
      let targetBtn = visibleBtns.find(btn => btn.innerText.includes('진행하기'));

      // 없으면 '다음 주제로' 버튼 찾음
      if (!targetBtn) {
        targetBtn = visibleBtns.find(btn => btn.innerText.includes('다음 주제로'));
      }

      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      return null;
    }, SELECTORS.COMPLETE_BTN);

    if (btnText) {
      console.log(`🖱️  [${btnText}] 버튼 클릭 완료`);
    } else {
      console.log('⚠️  수강 완료 버튼("진행하기"/"다음 주제로")을 찾지 못했습니다.');
    }
  } catch (err) {
    // console.log('⚠️  버튼 대기 에러 (강의 종료 또는 다음 버튼 없음):', err.message);
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
      console.log('🎉 축하합니다! 팝업 확인됨.');

      // '다음 목표로' 혹은 '커리큘럼으로' 버튼 클릭
    const btnText = await page.evaluate(() => {
        // 모든 잠재적 버튼/링크 요소 탐색
        const elements = Array.from(document.querySelectorAll('button, a, div[role="button"], .slot-wrapper'));
        const visibleElements = elements.filter(el => (el.offsetWidth > 0 || el.offsetHeight > 0));

        // '다음 목표로'를 최우선으로 찾음 (확실한 완료 처리)
        let targetBtn = visibleElements.find(el => el.innerText.includes('다음 목표로'));

        // 없으면 '커리큘럼으로' 탐색
        if (!targetBtn) {
          targetBtn = visibleElements.find(el => el.innerText.includes('커리큘럼으로'));
        }

        if (targetBtn) {
          targetBtn.click();
          return targetBtn.innerText.trim();
        }
        return null;
      });

      if (btnText) {
        console.log(`🖱️  팝업 내 [${btnText}] 버튼 클릭 완료`);
      }
      return true; // 강의 완전히 수료됨
    }
    return false; // 아직 팝업 안뜸, 계속 진행
  } catch (err) {
    return false;
  }
}

/**
 * 수료 퀴즈(Exam) 최종 제출 처리
 */
async function finishExam(page, cursor) {
  console.log('🏁 수료 퀴즈 최종 제출을 시도합니다...');
  await randomDelay(2000, 4000);

  try {
    const btnText = await page.evaluate(() => {
      const submitKeywords = ['제출', '완료', '결과', 'Finish', 'Submit', 'Done'];
      const btns = Array.from(document.querySelectorAll('button, .btn, .el-button, .el-button--primary'));
      const visibleBtns = btns.filter(b => (b.offsetWidth > 0 || b.offsetHeight > 0 || b.getClientRects().length > 0));

      const targetBtn = visibleBtns.find(btn =>
        submitKeywords.some(k => btn.innerText.includes(k)) &&
        !btn.innerText.includes('재도전') &&
        !btn.innerText.includes('다음')
      );

      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      return null;
    });

    if (btnText) {
      console.log(`🖱️  최종 제출 버튼 [${btnText}] 클릭 완료`);
      await randomDelay(3000, 5000);

      // 혹시 모를 확인 모달 처리 (예: "정말 제출하시겠습니까?")
      await page.evaluate(() => {
        const confirmBtn = document.querySelector('.el-message-box__btns .el-button--primary');
        if (confirmBtn) confirmBtn.click();
      });
      await randomDelay(2000, 4000);
    } else {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 이미 제출되었거나 버튼 형식이 다를 수 있습니다.');
    }

    // 최종 수료 팝업 확인
    const completed = await checkCompletionPopup(page, cursor);
    if (completed) {
      console.log('🎉 수료 퀴즈가 성공적으로 처리되었습니다.');
    }
  } catch (err) {
    console.log('⚠️  수료 퀴즈 최종 제출 처리 중 에러:', err.message);
  }
}

/**
 * 워게임 챌린지 풀이 시도
 */
async function solveWargameChallenge(browser, page, url, togetherPracticeMap = {}) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    // 문제 제목 추출 (Dreamhack 워게임 페이지의 h1 태그들 확인)
    const title = await page.evaluate(() => {
      const h1s = Array.from(document.querySelectorAll('h1'));
      // 주로 문제 제목을 포함하는 h1 찾기 (클래스가 없거나 challenge-title 등)
      for (const h1 of h1s) {
        if (h1.innerText.trim().length > 0) return h1.innerText.trim();
      }
      return null;
    });

    if (!title) {
      console.log('⚠️ 워게임 문제 제목을 추출할 수 없습니다. 스킵합니다.');
      return;
    }

    console.log(`🎮 워게임 [${title}] 도전을 시작합니다.`);

    // 이미 해결된 문제인지 확인 (보통 'Clear' 뱃지나 텍스트가 뜸)
    const isSolved = await page.evaluate(() => {
      return document.body.innerText.includes('이미 해결한 문제입니다') ||
             document.querySelector('.solved-badge, .is-solved') !== null ||
             document.body.innerText.includes('Clear');
    });

    if (isSolved) {
      console.log(`✅ 이미 해결된 워게임 [${title}] 입니다. 다음으로 넘어갑니다.`);
      return;
    }

    let flag = null;

    // === 1단계: [함께실습] 강의에서 플래그 탐색 ===
    const togetherUrl = togetherPracticeMap[title] ||
      Object.entries(togetherPracticeMap).find(([k]) => k.includes(title) || title.includes(k))?.[1];

    if (togetherUrl) {
      console.log(`📖 [함께실습] 강의 전체 수집 중: ${togetherUrl}`);
      try {
        const searchPage = await browser.newPage();
        await searchPage.goto(togetherUrl, { waitUntil: 'networkidle2' });
        await randomDelay(1500, 2500);

        // 전 슬라이드 텍스트 수집
        const allPageTexts = [];
        let pageIndex = 0;
        const maxPages = 50;

        while (pageIndex < maxPages) {
          const text = await searchPage.evaluate(() => document.body.innerText.trim());
          allPageTexts.push(text);

          const hasNext = await searchPage.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const nextBtn = btns.find(b => {
              const t = b.innerText.trim();
              return (t === '다음' || t === 'Next' || t.includes('다음')) && !b.disabled && (b.offsetWidth > 0 || b.offsetHeight > 0);
            });
            if (nextBtn) { nextBtn.click(); return true; }
            return false;
          });

          if (!hasNext) break;
          await randomDelay(700, 1200);
          pageIndex++;
        }

        await searchPage.close();

        const lectureText = allPageTexts.join('\n\n--- 슬라이드 구분 ---\n\n');

        // 직접 DH{...} 패턴 탐색 (단순 케이스: 플레이스홀더/예시가 아닌 실제 플래그)
        const allMatches = [...lectureText.matchAll(/DH\{[^}]+\}/g)].map(m => m[0]);
        // 플레이스홀더 제외: "flag1", "flag2", "...", "여기", "값" 등 추상적 표현 포함된 것
        const realFlags = allMatches.filter(f =>
          !f.match(/DH\{flag\d/i) &&   // DH{flag1}, DH{flag2} 등
          !f.includes('...') &&
          !f.includes('어쩌구') &&
          !f.includes('여기') &&
          f.length > 8                  // DH{ab} 같은 너무 짧은 것 제외
        );
        if (realFlags.length > 0) {
          flag = realFlags[realFlags.length - 1]; // 마지막(최종) 플래그 사용
          console.log(`🎯 [함께실습] 강의에서 플래그 직접 발견: ${flag}`);
        } else {
          // AI 분석 요청
          console.log(`🤖 AI에게 [함께실습] 강의 분석 요청 중...`);
          try {
            const wargameProblemText = await page.evaluate(() => document.body.innerText.trim().substring(0, 3000));
            const systemPrompt = "당신은 드림핵(Dreamhack) 워게임 문제 풀이 전문가입니다.";
            const aiPrompt = `워게임 문제 "[${title}]"의 설명입니다:
${wargameProblemText.substring(0, 1500)}

아래는 이 문제와 연관된 [함께실습] 강의의 전체 내용입니다:
${lectureText.substring(0, 6000)}

위 강의 내용을 바탕으로 워게임 플래그를 찾아주세요.
- DH{...} 형식의 플래그가 직접 있으면 그것을 반환
- 플래그가 직접 없고 힌트(특정 값, 연산 결과 등)만 있다면, 그 힌트로부터 최종 플래그를 계산/조합
- 강의 내용에서도 찾기 어렵다면, 문제 제목과 설명을 토대로 가장 그럴듯한 플래그를 추론

응답 형식: 플래그 문자열만 출력 (예: DH{some_flag_here}). 확신이 없으면 "모름"이라고만 출력.`;

            const aiAnswer = await aiProvider.getCompletion(aiPrompt, systemPrompt);
            console.log(`🤖 AI 응답: ${aiAnswer}`);

            const aiFlag = aiAnswer.match(/DH\{[^}]+\}/)?.[0];
            if (aiFlag) {
              flag = aiFlag;
              console.log(`🎯 AI가 플래그를 추론/추출: ${flag}`);
            }
          } catch (err) {
            console.log(`⚠️ AI API 호출 실패: ${err.message}`);
          }
        }
      } catch (err) {
        console.log(`⚠️ [함께실습] 강의 탐색 중 에러: ${err.message}`);
      }
    }

    // === 2단계: 웹 검색을 통한 플래그 획득 시도 ===
    if (!flag) {
      console.log(`🔍 검색용 새 탭을 엽니다...`);
      const searchPage = await browser.newPage();
      flag = await searchFlagForWargame(searchPage, title);
      await searchPage.close();
      console.log(`🔍 검색용 새 탭을 닫았습니다.`);
    }

    // === 3단계: AI에게 문제 설명만으로 최후 추론 요청 ===
    if (!flag) {
      try {
        console.log(`🤖 AI에게 문제 설명 기반 추론 요청 중...`);
        await page.bringToFront();
        const problemText = await page.evaluate(() => document.body.innerText.trim().substring(0, 3000));
        const aiPrompt = `드림핵 워게임 문제 "[${title}]"입니다. 문제 설명:
${problemText}

이 문제의 DH{...} 형식 플래그를 추론해주세요. 확신이 없으면 "모름"이라고만 출력.`;

        const aiAnswer = await aiProvider.getCompletion(aiPrompt);
        const aiFlag = aiAnswer.match(/DH\{[^}]+\}/)?.[0];
        if (aiFlag) {
          flag = aiFlag;
          console.log(`🤖 AI 최후 추론 플래그: ${flag}`);
        }
      } catch (err) {
        console.log(`⚠️ AI 최후 추론 실패: ${err.message}`);
      }
    }

    // 브라우저 포커스를 다시 기존 페이지로
    await page.bringToFront();
    await randomDelay(1500, 3000);

    if (flag) {
      console.log(`🔑 워게임 [${title}] 에 플래그 입력 시도: ${flag}`);

      // 플래그 입력 필드 찾아서 입력 (placeholder="플래그 형식을 참고하여 정답을 입력해주세요" 등)
      const inputExists = await page.evaluate((f) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const targetInput = inputs.find(i =>
          i.placeholder.includes('플래그') ||
          i.placeholder.includes('DH{') ||
          i.placeholder.includes('flag') ||
          i.className.includes('flag')
        ) || inputs[0];

        if (targetInput) {
          targetInput.value = f;
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          targetInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, flag);

      if (inputExists) {
        await randomDelay(500, 1000);

        // 제출 버튼 클릭 ('제출', '인증', 'Submit' 등)
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const submitBtn = btns.find(b => b.innerText.includes('제출') || b.innerText.includes('인증') || b.innerText.includes('Submit'));
          if (submitBtn) {
            submitBtn.click();
          }
        });

        await randomDelay(2000, 4000);

        // 제출 후 모달/메시지 확인
        const isSuccess = await page.evaluate(() => {
          const text = document.body.innerText;
          // 성공/실패 모달 닫기
          const alertBtn = document.querySelector('.el-message-box__btns .el-button--primary');
          if (alertBtn) {
            alertBtn.click();
          }
          return text.includes('정답입니다') || text.includes('Correct') || text.includes('축하합니다');
        });

        if (isSuccess) {
          console.log(`🎉 워게임 [${title}] 정답 처리됨!`);
        } else {
          console.log(`❌ 워게임 [${title}] 플래그 제출 실패(오답이거나 이미 풀었음). 넘어갑니다.`);
        }
      } else {
        console.log('⚠️ 플래그 입력 칸을 찾지 못했습니다.');
      }
    } else {
      console.log(`⚠️ 워게임 [${title}] 플래그를 찾지 못해 건너뜁니다.`);
    }
  } catch (err) {
    console.log(`⚠️ 워게임 처리 중 에러: ${err.message}`);
  }
}

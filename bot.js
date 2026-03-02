const { createCursor } = require('ghost-cursor');
const { CURRICULUM_URL, EXAM_URL, DELAY, SELECTORS } = require('./config');
const { launchBrowser, ensureLoggedIn, randomDelay, randomScroll, humanType } = require('./utils');
const { searchFlagForWargame } = require('./search');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

(async () => {
  console.log('🚀 드림핵 자동 수강 봇 시작...\n');

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);

  try {
    // === 0단계: 로그인 확인 ===
    await ensureLoggedIn(page);

    // === 1단계: 커리큘럼 페이지에서 미완료 강의 목록 추출 ===
    console.log(`📚 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await page.goto(CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 5000);

    console.log('🔍 미완료 강의 목록 파싱 중...');
    const { lectureUrls, togetherPracticeMap } = await page.evaluate(
      (itemSel, linkSel) => {
        const urls = [];
        // [함께실습] 강의: 제목([ ] 제거) → URL 매핑
        const togetherMap = {};
        const items = document.querySelectorAll(itemSel);
        items.forEach(item => {
          const linkEl = item.querySelector(linkSel);
          if (!linkEl || !linkEl.href) return;

          // [함께실습] 강의 수집 (learn.dreamhack.io/숫자 형태)
          const titleEl = item.querySelector('.entity-title, .entity-body, .title');
          const rawTitle = (titleEl?.innerText || item.innerText || '').trim();
          if (rawTitle.includes('[함께실습]') && linkEl.href.match(/learn\.dreamhack\.io\/\d+/)) {
            // "[함께실습] Exercise: GDB" → "Exercise: GDB"
            const cleanTitle = rawTitle.replace(/\[함께실습\]\s*/g, '').split('\n')[0].trim();
            togetherMap[cleanTitle] = linkEl.href;
          }

          // "시작하기" 텍스트를 가진 .action-text만 미완료로 판별
          // "실습하기" 같은 부가 버튼은 제외, "완료"가 있으면 완료로 간주
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          const hasCompleted = actionTexts.some(el => el.classList.contains('completed'));
          const hasStart = actionTexts.some(el => !el.classList.contains('completed') && el.innerText.trim() === '시작하기');
          const isIncomplete = !hasCompleted || hasStart;
          if (isIncomplete && hasStart) {
            urls.push(linkEl.href);
          }
        });
        return { lectureUrls: urls, togetherPracticeMap: togetherMap };
      },
      SELECTORS.LECTURE_ITEM,
      SELECTORS.LECTURE_LINK,
    );

    if (Object.keys(togetherPracticeMap).length > 0) {
      console.log(`📚 [함께실습] 강의 매핑: ${Object.keys(togetherPracticeMap).join(', ')}`);
    }

    console.log(`🎯 미완료 강의 ${lectureUrls.length}개 발견\n`);

    if (lectureUrls.length === 0) {
      console.log('✅ 모든 강의가 수료되었습니다. 수료 퀴즈로 이동합니다.');
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

  let unsolved = 0;
  for (let qIndex = 0; qIndex < totalQuestions; qIndex++) {
    console.log(`\n  --- 문제 ${qIndex + 1}/${totalQuestions} ---`);

    await randomDelay(200, 400);

    // 해당 문제(qIndex)가 이미 완료(정답) 처리되었는지 확인
    const isCompleted = await page.evaluate((idx) => {
      const qs = document.querySelectorAll('.quiz-question');
      if (!qs[idx]) return false;
      const q = qs[idx];
      // 오답 상태(is-wrong)면 완료 아님
      const main = q.querySelector('.question-main');
      if (main && main.classList.contains('is-wrong')) return false;
      // 정답 아이콘이나 정답 클래스가 있으면 완료
      if (q.querySelector('.check-icon, .is-success, .is-correct')) return true;
      // 보기도 없고 버튼도 없으면 완료 (다음 문제로 넘어간 상태)
      if (!q.querySelector('.choice') && !q.querySelector('.btn.btn-primary')) return true;
      return false;
    }, qIndex);

    if (isCompleted) {
      console.log('  ⏭️  이미 완료된 문제, 다음으로 이동');
      continue;
    }

    // 현재 문제의 보기 개수 수집
    const choiceCount = await page.evaluate((idx) => {
      const qs = document.querySelectorAll('.quiz-question');
      if (!qs[idx]) return 0;
      const choices = qs[idx].querySelectorAll('.choice');
      return Array.from(choices).filter(el => el.offsetParent !== null).length;
    }, qIndex);

    console.log(`  🔘 보기 ${choiceCount}개 발견`);

    if (choiceCount === 0) {
      // 주관식(textarea) 처리
      const hasTextarea = await page.evaluate((idx) => {
        const qs = document.querySelectorAll('.quiz-question');
        if (!qs[idx]) return false;
        return qs[idx].querySelector('textarea') !== null;
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
            const qs = document.querySelectorAll('.quiz-question');
            if (!qs[idx]) return;
            const ta = qs[idx].querySelector('textarea');
            if (!ta) return;
            ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
            ta.focus();
            ta.value = ans;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
            ta.dispatchEvent(new Event('change', { bubbles: true }));
          }, qIndex, answer);
          await randomDelay(500, 1000);

          await page.evaluate((idx) => {
            const qs = document.querySelectorAll('.quiz-question');
            if (!qs[idx]) return;
            const btn = qs[idx].querySelector('.btn.btn-primary:not(.disabled)');
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

    // 현재 보기 텍스트 목록 읽기 (셔플 후 매번 호출)
    const getChoiceTexts = async () => {
      return page.evaluate((idx) => {
        const q = document.querySelectorAll('.quiz-question')[idx];
        if (!q) return [];
        return Array.from(q.querySelectorAll('.choice'))
          .filter(el => el.offsetParent !== null)
          .map(el => el.innerText.trim());
      }, qIndex);
    };

    // 텍스트 목록을 받아 해당 보기들을 클릭 후 결과 확인
    const tryChoiceTexts = async (texts) => {
      // 현재 DOM에서 텍스트와 일치하는 보기 인덱스를 찾아 클릭
      const clicked = await page.evaluate((idx, textList) => {
        const q = document.querySelectorAll('.quiz-question')[idx];
        if (!q) return false;
        const choices = Array.from(q.querySelectorAll('.choice')).filter(el => el.offsetParent !== null);
        for (const text of textList) {
          const match = choices.find(el => el.innerText.trim() === text);
          if (!match) return false;
          match.scrollIntoView({ block: 'center' });
          match.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          match.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
        return true;
      }, qIndex, texts);
      if (!clicked) return false;
      await randomDelay(600, 900);
      // 확인 버튼 활성화 대기 후 클릭
      try {
        await page.waitForFunction(
          (idx) => { const q = document.querySelectorAll('.quiz-question')[idx]; if (!q) return false; const b = q.querySelector('.btn.btn-primary'); return b && !b.classList.contains('disabled'); },
          { timeout: 3000 }, qIndex
        );
      } catch { return false; }
      await page.evaluate((idx) => {
        const q = document.querySelectorAll('.quiz-question')[idx];
        if (!q) return;
        const b = q.querySelector('.btn.btn-primary:not(.disabled)');
        if (b) { b.scrollIntoView({ block: 'center' }); b.click(); }
      }, qIndex);
      console.log('  📤 확인 클릭');
      // 결과 폴링
      const CORRECT_KEYWORDS = ['정답을 맞췄습니다', '정답입니다', '정답', 'Correct', '축하합니다', '성공', '통과'];
      const NEXT_KEYWORDS = ['다음 문제', '다음', '계속', '완료', 'Next', 'Continue'];
      try {
        await page.waitForFunction(
          (idx, correctKws, nextKws) => {
            if (document.querySelector('.el-message-box')) return true;
            // 페이지 전체에서 정답 피드백 텍스트 확인
            const bodyText = document.body.innerText;
            if (correctKws.some(k => bodyText.includes(k))) return true;
            const q = document.querySelectorAll('.quiz-question')[idx];
            if (!q) return true;
            const main = q.querySelector('.question-main');
            if (main && main.classList.contains('is-wrong')) return true;
            if (q.querySelector('.check-icon, .is-success, .is-correct')) return true;
            const btn = q.querySelector('.btn.btn-primary');
            if (btn && nextKws.some(k => btn.innerText.includes(k))) return true;
            if (btn && btn.innerText.includes('재도전')) return true;
            if (!btn && !q.querySelector('.choice')) return true;
            return false;
          },
          { timeout: 5000, polling: 100 }, qIndex, CORRECT_KEYWORDS, NEXT_KEYWORDS
        );
      } catch { /* timeout */ }
      // 정답 여부 판별
      const evalResult = await page.evaluate((idx, correctKws, nextKws) => {
        const alertBox = document.querySelector('.el-message-box');
        if (alertBox) {
          const text = alertBox.innerText || '';
          const alertBtn = alertBox.querySelector('.el-button--primary');
          if (alertBtn) alertBtn.click();
          if (correctKws.some(k => text.includes(k))) {
            return { isCorrect: true, modalText: text };
          }
          return { isCorrect: false, modalText: text };
        }
        // 페이지 전체 정답 피드백 텍스트 확인 (question 영역 밖에 표시될 수 있음)
        const bodyText = document.body.innerText;
        if (correctKws.some(k => bodyText.includes(k))) {
          return { isCorrect: true };
        }
        const q = document.querySelectorAll('.quiz-question')[idx];
        if (!q) return { isCorrect: true };
        const main = q.querySelector('.question-main');
        if (main && (main.classList.contains('is-wrong') || main.classList.contains('is-error'))) return { isCorrect: false };
        const btn = q.querySelector('.btn.btn-primary');
        if (btn && btn.innerText.includes('재도전')) return { isCorrect: false };
        const isNextBtn = btn && nextKws.some(k => btn.innerText.includes(k));
        const isCorrect = q.querySelector('.check-icon, .is-success, .is-correct') !== null ||
               (!btn && !q.querySelector('.choice')) ||
               isNextBtn;
        const debugInfo = !isCorrect ? { btnText: btn ? btn.innerText.trim() : null } : null;
        return { isCorrect, debugInfo };
      }, qIndex, CORRECT_KEYWORDS, NEXT_KEYWORDS);

      if (evalResult.modalText) {
        console.log(`  💬 모달: "${evalResult.modalText.replace(/\n/g, ' ').substring(0, 80)}"`);
      }
      if (evalResult.debugInfo) {
        console.log(`  🔍 btn="${evalResult.debugInfo.btnText}"`);
      }
      return evalResult.isCorrect;
    };

    const handleCorrect = async () => {
      const nextKeywords = ['다음 문제', '다음', '계속', '완료', 'Next', 'Continue'];
      const clicked = await page.evaluate((idx, keywords) => {
        // 1) question 내부 버튼 먼저 탐색
        const q = document.querySelectorAll('.quiz-question')[idx];
        if (q) {
          const btn = q.querySelector('.btn.btn-primary');
          if (btn && keywords.some(k => btn.innerText.includes(k))) {
            btn.scrollIntoView({ block: 'center' });
            btn.click();
            return btn.innerText.trim();
          }
        }
        // 2) 페이지 전체에서 다음 버튼 탐색 (정답 피드백 후 외부에 버튼이 생기는 경우)
        const allBtns = [...document.querySelectorAll('.btn.btn-primary')];
        const nextBtn = allBtns.find(b => keywords.some(k => b.innerText.includes(k)));
        if (nextBtn) {
          nextBtn.scrollIntoView({ block: 'center' });
          nextBtn.click();
          return nextBtn.innerText.trim();
        }
        return false;
      }, qIndex, nextKeywords);
      if (clicked) {
        console.log(`  ➡️ "${clicked}" 버튼 클릭`);
        await randomDelay(800, 1200);
      }
    };

    // 오답 후 재도전 버튼 클릭 (상태 초기화)
    const clickRetry = async () => {
      await page.evaluate((idx) => {
        const q = document.querySelectorAll('.quiz-question')[idx];
        if (!q) return;
        const btn = q.querySelector('.btn.btn-primary');
        if (btn && btn.innerText.includes('재도전')) { btn.scrollIntoView({ block: 'center' }); btn.click(); }
      }, qIndex);
      await randomDelay(200, 400);
    };

    // 문제 텍스트와 보기 텍스트 수집
    const questionData = await page.evaluate((idx) => {
      const qs = document.querySelectorAll('.quiz-question');
      if (!qs[idx]) return null;
      const q = qs[idx];
      const choices = Array.from(q.querySelectorAll('.choice'))
        .filter(el => el.offsetParent !== null)
        .map((el, i) => ({ idx: i, text: el.innerText.trim() }));
      const isMulti = q.querySelector('input[type="checkbox"]') !== null;
      return { questionText: q.innerText.trim().substring(0, 3000), choices, isMulti };
    }, qIndex);

    if (!questionData) continue;

    // AI와 브루트포스를 반복하며, 보기 내용이 동적으로 바뀌면 새 문제로 인식
    while (!solved) {
      // 1) 현재 상태의 보기 텍스트 목록 저장
      const currentTexts = await getChoiceTexts();
      if (currentTexts.length === 0) break; // 더 이상 보기가 없으면 종료 (혹은 주관식)

      // 이전 텍스트와 현재 텍스트가 다르면 문제(보기)가 재생성된 것으로 간주
      const currentTextsKey = JSON.stringify(currentTexts);

      // 현재 보기에 대해 AI 예측 요청
      const prompt = `드림핵 보안 퀴즈 문제입니다. 정답 보기의 인덱스(0부터 시작)를 JSON 배열로만 출력하세요.
단일정답이면 [2], 복수정답이면 [1, 3] 형식. 반드시 JSON 배열만 출력.

문제:
${questionData.questionText}

보기:
${currentTexts.map((text, idx) => `[${idx}] ${text}`).join('\n')}

출력 예시(단일): [2]
출력 예시(복수): [1, 3]
JSON 배열만 출력, 다른 말 없이.`;

      let aiIndices = null;
      try {
        const msg = await anthropic.messages.create({
          model: 'gemini-3-flash',
          max_tokens: 128,
          messages: [{ role: 'user', content: prompt }],
        });
        const textBlock = msg.content.find(b => b.type === 'text');
        const raw = textBlock ? textBlock.text.trim() : '';
        if(!raw) throw new Error('No text in response: ' + JSON.stringify(msg));
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
            await handleCorrect();
            break; // 해당 문제 해결 완료
          } else {
            console.log('  ❌ AI 오답. 브루트포스 전환...');
            await clickRetry();
            await randomDelay(600, 900);
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
          await handleCorrect();
        } else {
          console.log('  ❌ 오답.');
          await clickRetry();
          await randomDelay(600, 900);

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
      if (!solved && questionData.isMulti) {
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
              await handleCorrect();
            } else {
              await clickRetry();
              await randomDelay(600, 900);

              const newTexts = await getChoiceTexts();
              if (JSON.stringify(newTexts) !== currentTextsKey) {
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
      if (!solved && questionData.isMulti) {
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
                await handleCorrect();
              } else {
                await clickRetry();
                await randomDelay(600, 900);

                const newTexts = await getChoiceTexts();
                if (JSON.stringify(newTexts) !== currentTextsKey) {
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
      const visibleBtns = btns.filter(b => b.offsetParent !== null);
      return visibleBtns.some(btn => btn.innerText.includes('진행하기') || btn.innerText.includes('다음 주제로'));
    }, { timeout: 5000 }, SELECTORS.COMPLETE_BTN).catch(() => {});

    const btnText = await page.evaluate((sel) => {
      const btns = Array.from(document.querySelectorAll(sel));
      const visibleBtns = btns.filter(b => b.offsetParent !== null);

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
        const visibleElements = elements.filter(el => el.offsetParent !== null);

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
              return (t === '다음' || t === 'Next' || t.includes('다음')) && !b.disabled && b.offsetParent !== null;
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
          // Claude에게 분석 요청: 플래그 직접 추출 or 힌트 조합 or 이름 기반 추론
          console.log(`🤖 Claude에게 [함께실습] 강의 분석 요청 중...`);
          try {
            const wargameProblemText = await page.evaluate(() => document.body.innerText.trim().substring(0, 3000));

            const msg = await anthropic.messages.create({
              model: 'gemini-3-flash',
              max_tokens: 256,
              messages: [{
                role: 'user',
                content: `당신은 드림핵(Dreamhack) 워게임 문제 풀이 전문가입니다.

아래는 워게임 문제 "[${title}]"의 설명입니다:
${wargameProblemText.substring(0, 1500)}

아래는 이 문제와 연관된 [함께실습] 강의의 전체 내용입니다:
${lectureText.substring(0, 6000)}

위 강의 내용을 바탕으로 워게임 플래그를 찾아주세요.
- DH{...} 형식의 플래그가 직접 있으면 그것을 반환
- 플래그가 직접 없고 힌트(특정 값, 연산 결과 등)만 있다면, 그 힌트로부터 최종 플래그를 계산/조합
- 강의 내용에서도 찾기 어렵다면, 문제 제목과 설명을 토대로 가장 그럴듯한 플래그를 추론

응답 형식: 플래그 문자열만 출력 (예: DH{some_flag_here}). 확신이 없으면 "모름"이라고만 출력.`,
              }],
            });

            const claudeAnswer = msg.content[0].text.trim();
            console.log(`🤖 Claude 응답: ${claudeAnswer}`);

            const claudeFlag = claudeAnswer.match(/DH\{[^}]+\}/)?.[0];
            if (claudeFlag) {
              flag = claudeFlag;
              console.log(`🎯 Claude가 플래그를 추론/추출: ${flag}`);
            }
          } catch (err) {
            console.log(`⚠️ Claude API 호출 실패: ${err.message}`);
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

    // === 3단계: Claude에게 문제 설명만으로 최후 추론 요청 ===
    if (!flag) {
      try {
        console.log(`🤖 Claude에게 문제 설명 기반 추론 요청 중...`);
        await page.bringToFront();
        const problemText = await page.evaluate(() => document.body.innerText.trim().substring(0, 3000));
        const msg = await anthropic.messages.create({
          model: 'gemini-3-flash',
          max_tokens: 128,
          messages: [{
            role: 'user',
            content: `드림핵 워게임 문제 "[${title}]"입니다. 문제 설명:
${problemText}

이 문제의 DH{...} 형식 플래그를 추론해주세요. 확신이 없으면 "모름"이라고만 출력.`,
          }],
        });
        const claudeAnswer = msg.content[0].text.trim();
        const claudeFlag = claudeAnswer.match(/DH\{[^}]+\}/)?.[0];
        if (claudeFlag) {
          flag = claudeFlag;
          console.log(`🤖 Claude 최후 추론 플래그: ${flag}`);
        }
      } catch (err) {
        console.log(`⚠️ Claude 최후 추론 실패: ${err.message}`);
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

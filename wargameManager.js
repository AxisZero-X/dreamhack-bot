const { randomDelay } = require('./utils');
const { searchFlagForWargame } = require('./search');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('./logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
      logger.warn('⚠️ 워게임 문제 제목을 추출할 수 없습니다. 스킵합니다.');
      return;
    }

    logger.info(`🎮 워게임 [${title}] 도전을 시작합니다.`);

    // 이미 해결된 문제인지 확인 (보통 'Clear' 뱃지나 텍스트가 뜸)
    const isSolved = await page.evaluate(() => {
      return (
        document.body.innerText.includes('이미 해결한 문제입니다') ||
        document.querySelector('.solved-badge, .is-solved') !== null ||
        document.body.innerText.includes('Clear')
      );
    });

    if (isSolved) {
      logger.info(`✅ 이미 해결된 워게임 [${title}] 입니다. 다음으로 넘어갑니다.`);
      return;
    }

    let flag = null;

    // === 1단계: [함께실습] 강의에서 플래그 탐색 ===
    const togetherUrl =
      togetherPracticeMap[title] ||
      Object.entries(togetherPracticeMap).find(([k]) => k.includes(title) || title.includes(k))?.[1];

    if (togetherUrl) {
      logger.info(`📖 [함께실습] 강의 전체 수집 중: ${togetherUrl}`);
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
            const nextBtn = btns.find((b) => {
              const t = b.innerText.trim();
              return (
                (t === '다음' || t === 'Next' || t.includes('다음')) && !b.disabled && b.offsetParent !== null
              );
            });
            if (nextBtn) {
              nextBtn.click();
              return true;
            }
            return false;
          });

          if (!hasNext) break;
          await randomDelay(700, 1200);
          pageIndex++;
        }

        await searchPage.close();

        const lectureText = allPageTexts.join('\n\n--- 슬라이드 구분 ---\n\n');

        // 직접 DH{...} 패턴 탐색 (단순 케이스: 플레이스홀더/예시가 아닌 실제 플래그)
        const allMatches = [...lectureText.matchAll(/DH\{[^}]+\}/g)].map((m) => m[0]);
        // 플레이스홀더 제외: "flag1", "flag2", "...", "여기", "값" 등 추상적 표현 포함된 것
        const realFlags = allMatches.filter(
          (f) =>
            !f.match(/DH\{flag\d/i) && // DH{flag1}, DH{flag2} 등
            !f.includes('...') &&
            !f.includes('어쩌구') &&
            !f.includes('여기') &&
            f.length > 8, // DH{ab} 같은 너무 짧은 것 제외
        );

        if (realFlags.length > 0) {
          flag = realFlags[realFlags.length - 1]; // 마지막(최종) 플래그 사용
          logger.info(`🎯 [함께실습] 강의에서 플래그 직접 발견: ${flag}`);
        } else {
          // Claude에게 분석 요청: 플래그 직접 추출 or 힌트 조합 or 이름 기반 추론
          logger.info(`🤖 Claude에게 [함께실습] 강의 분석 요청 중...`);
          try {
            const wargameProblemText = await page.evaluate(() => document.body.innerText.trim().substring(0, 3000));

            const msg = await anthropic.messages.create({
              model: 'gemini-3-flash', // Note: anthropic SDK is being used with gemini model name in previous script, keep as is or adjust to claude
              max_tokens: 256,
              messages: [
                {
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
                },
              ],
            });

            const claudeAnswer = msg.content[0].text.trim();
            logger.info(`🤖 Claude 응답: ${claudeAnswer}`);

            const claudeFlag = claudeAnswer.match(/DH\{[^}]+\}/)?.[0];
            if (claudeFlag) {
              flag = claudeFlag;
              logger.info(`🎯 Claude가 플래그를 추론/추출: ${flag}`);
            }
          } catch (err) {
            logger.error(`⚠️ Claude API 호출 실패: ${err.message}`);
          }
        }
      } catch (err) {
        logger.error(`⚠️ [함께실습] 강의 탐색 중 에러: ${err.message}`);
      }
    }

    // === 2단계: 웹 검색을 통한 플래그 획득 시도 ===
    if (!flag) {
      logger.info(`🔍 검색용 새 탭을 엽니다...`);
      const searchPage = await browser.newPage();
      flag = await searchFlagForWargame(searchPage, title);
      await searchPage.close();
      logger.info(`🔍 검색용 새 탭을 닫았습니다.`);
    }

    // === 3단계: Claude에게 문제 설명만으로 최후 추론 요청 ===
    if (!flag) {
      try {
        logger.info(`🤖 Claude에게 문제 설명 기반 추론 요청 중...`);
        await page.bringToFront();
        const problemText = await page.evaluate(() => document.body.innerText.trim().substring(0, 3000));
        const msg = await anthropic.messages.create({
          model: 'gemini-3-flash', // Note: keep matching original script model param
          max_tokens: 128,
          messages: [
            {
              role: 'user',
              content: `드림핵 워게임 문제 "[${title}]"입니다. 문제 설명:
${problemText}

이 문제의 DH{...} 형식 플래그를 추론해주세요. 확신이 없으면 "모름"이라고만 출력.`,
            },
          ],
        });
        const claudeAnswer = msg.content[0].text.trim();
        const claudeFlag = claudeAnswer.match(/DH\{[^}]+\}/)?.[0];
        if (claudeFlag) {
          flag = claudeFlag;
          logger.info(`🤖 Claude 최후 추론 플래그: ${flag}`);
        }
      } catch (err) {
        logger.error(`⚠️ Claude 최후 추론 실패: ${err.message}`);
      }
    }

    // 브라우저 포커스를 다시 기존 페이지로
    await page.bringToFront();
    await randomDelay(1500, 3000);

    if (flag) {
      logger.info(`🔑 워게임 [${title}] 에 플래그 입력 시도: ${flag}`);

      // 플래그 입력 필드 찾아서 입력
      const inputExists = await page.evaluate((f) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const targetInput =
          inputs.find(
            (i) =>
              i.placeholder.includes('플래그') ||
              i.placeholder.includes('DH{') ||
              i.placeholder.includes('flag') ||
              i.className.includes('flag'),
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

        // 제출 버튼 클릭
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const submitBtn = btns.find(
            (b) => b.innerText.includes('제출') || b.innerText.includes('인증') || b.innerText.includes('Submit'),
          );
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
          logger.info(`🎉 워게임 [${title}] 정답 처리됨!`);
        } else {
          logger.info(`❌ 워게임 [${title}] 플래그 제출 실패(오답이거나 이미 풀었음). 넘어갑니다.`);
        }
      } else {
        logger.warn('⚠️ 플래그 입력 칸을 찾지 못했습니다.');
      }
    } else {
      logger.warn(`⚠️ 워게임 [${title}] 플래그를 찾지 못해 건너뜁니다.`);
    }
  } catch (err) {
    logger.error(`⚠️ 워게임 처리 중 에러: ${err.message}`);
  }
}

module.exports = {
  solveWargameChallenge,
};
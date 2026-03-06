const { createCursor } = require('ghost-cursor');
const { EXAM_URL, DELAY, SELECTORS, SKIP_QUIZ, AUTO_LOGIN } = require('./config');
const { launchBrowser, ensureLoggedIn, randomDelay, randomScroll, humanType, getDynamicDelayFromPage } = require('./utils');
const { searchFlagForWargame } = require('./search');
const aiProvider = require('./aiProvider');
const readline = require('readline');
const logger = require('./logger');

/**
 * 커리큘럼 ID 입력 프롬프트
 */
async function askCurriculumId() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('📚 커리큘럼 ID를 입력하세요 (예: 920, Enter=916): ', (answer) => {
      rl.close();
      const id = parseInt(answer.trim()) || 916;
      resolve(id);
    });
  });
}

/**
 * 목표 수강률 입력 프롬프트
 */
async function askTargetRate() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('🎯 목표 수강률을 입력하세요 (1-100, Enter=100): ', (answer) => {
      rl.close();
      const rate = parseInt(answer.trim()) || 100;
      const validRate = Math.min(100, Math.max(1, rate));
      resolve(validRate);
    });
  });
}

/**
 * 드림핵 로그인 정보 입력 프롬프트 (비밀번호 마스킹 지원)
 */
async function askCredentials() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('📧 드림핵 이메일을 입력하세요: ', (email) => {
      // TTY가 아닌 경우 (자식 프로세스 등) 간단한 비밀번호 입력 사용
      if (!process.stdin.isTTY) {
        rl.question('🔐 비밀번호를 입력하세요: ', (password) => {
          rl.close();
          resolve({ email: email.trim(), password: password.trim() });
        });
        return;
      }
      
      // TTY인 경우 마스킹 처리
      const stdin = process.stdin;
      const stdout = process.stdout;
      
      // 원래의 raw 모드 저장
      const wasRaw = stdin.isRaw;
      
      // 비밀번호 입력을 위한 설정
      stdin.setRawMode(true);
      stdin.resume();
      
      let password = '';
      stdout.write('🔐 비밀번호를 입력하세요: ');
      
      stdin.on('data', function onData(key) {
        const char = key.toString();
        
        // Enter 키 (ASCII 13, \r)
        if (char === '\r' || char === '\n' || char.charCodeAt(0) === 13) {
          stdin.removeListener('data', onData);
          stdin.setRawMode(wasRaw);
          stdin.pause();
          stdout.write('\n');
          rl.close();
          resolve({ email: email.trim(), password: password.trim() });
          return;
        }
        
        // Backspace 키 (ASCII 127 또는 8)
        if (char.charCodeAt(0) === 127 || char.charCodeAt(0) === 8) {
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write('\b \b'); // 커서를 뒤로 이동하고 공백으로 덮은 후 다시 뒤로 이동
          }
          return;
        }
        
        // 일반 문자 입력 (32-126 ASCII 범위의 출력 가능 문자)
        if (char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126) {
          password += char;
          stdout.write('*');
        }
      });
    });
  });
}

/**
 * 커리큘럼 페이지에서 현재 수강률 추출
 */
async function getCurrentCompletionRate(page, curriculumUrl) {
  await page.goto(curriculumUrl, { waitUntil: 'networkidle2' });
  await randomDelay(1000, 2000);
  
  const rate = await page.evaluate(() => {
    const periodDiv = document.querySelector('.type-period');
    if (!periodDiv) return 0;
    
    const text = periodDiv.innerText || periodDiv.textContent;
    // "통합 과제 커리큘럼 / 총 368일 (D-277) / 30.9%" 형식에서 숫자 추출
    const match = text.match(/(\d+\.?\d*)%/);
    return match ? parseFloat(match[1]) : 0;
  });
  
  console.log(`📊 현재 수강률: ${rate}%`);
  return rate;
}

(async () => {
  console.log('🚀 드림핵 자동 수강 봇 시작...\n');
  
  // 📚 커리큘럼 ID 입력 받기
  const CURRICULUM_ID = await askCurriculumId();
  const CURRICULUM_URL = `https://dreamhack.io/euser/curriculums/${CURRICULUM_ID}`;
  console.log(`✅ 커리큘럼 URL: ${CURRICULUM_URL}\n`);
  
  // 🎯 목표 수강률 입력 받기
  const TARGET_RATE = await askTargetRate();
  console.log(`✅ 목표 수강률: ${TARGET_RATE}%\n`);
  
  // 📧 로그인 정보 입력 받기
  const { email, password } = await askCredentials();
  console.log(`✅ 로그인 정보 입력 완료 (이메일: ${email})\n`);
  
  console.log('🛡️  Anomaly Detection 우회 모드 활성화 (Priority 3 적용)\n');

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);

  try {
    // === 0단계: 로그인 확인 ===
    if (AUTO_LOGIN) {
      console.log('🤖 자동 로그인 모드 활성화');
      await ensureLoggedIn(page, email, password);
    } else {
      console.log('👤 수동 로그인 모드 활성화');
      console.log('📢 브라우저가 열렸습니다. 드림핵 로그인 페이지에서 직접 로그인해주세요.');
      console.log('⏱️ 60초 동안 대기합니다...');
      
      // 로그인 페이지로 이동
      await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
      await randomDelay(2000, 4000);
      
      // 카운트다운 표시
      for (let i = 60; i > 0; i--) {
        if (i % 10 === 0 || i <= 5) {
          console.log(`⏱️ ${i}초 남았습니다...`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 주기적으로 로그인 상태 확인 (강화된 검증)
        if (i % 15 === 0) {
          try {
            const isLoggedIn = await verifyLoginStatus(page);
            
            if (isLoggedIn) {
              console.log('✅ 로그인 감지됨! 계속 진행합니다.');
              break;
            }
          } catch (err) {
            // 로그인 확인 중 에러 무시
          }
        }
      }
      
      console.log('✅ 로그인 대기 완료. 로그인 상태를 확인합니다...');
      
      // 최종 로그인 상태 확인 (개선된 검증)
      const isLoggedIn = await verifyLoginStatus(page);
      const currentUrl = page.url();
      
      if (isLoggedIn) {
        console.log('✅ 로그인 성공 확인');
      } else {
        // 검증 실패해도 계속 진행 (실제 작업 가능성 확인)
        console.log('⚠️ 로그인 검증 실패, 하지만 실제 작업 가능성 확인을 위해 계속 진행합니다.');
        console.log('현재 URL:', currentUrl);
      }
    }

    // === 1단계: 커리큘럼에서 미완료 강의 추출 ===
    console.log(`🔍 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await page.goto(CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    // 강의 항목 추출 전 로그인 상태 재확인
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || !currentUrl.includes('dreamhack.io')) {
      console.log('⚠️ 로그인 상태 확인 필요: 현재 로그인 페이지에 있습니다.');
      console.log('⚠️ 강의 항목을 추출할 수 없습니다. 로그인 후 다시 시도해주세요.');
      console.log('현재 URL:', currentUrl);
      return;
    }

    const { lectureUrls, togetherPracticeMap } = await page.evaluate(
      (itemSel, linkSel) => {
        const urls = [];
        const practiceMap = {};
        const items = document.querySelectorAll(itemSel);
        
        // 강의 항목이 있는지 확인
        if (items.length === 0) {
          console.log('⚠️ 강의 항목을 찾을 수 없습니다. 로그인 상태를 확인해주세요.');
          return { lectureUrls: [], togetherPracticeMap: {} };
        }
        
        // 함께실습 섹션 매핑을 위한 로직 개선
        // .objective 컨테이너 단위로 처리
        const objectives = document.querySelectorAll('.objective');
        objectives.forEach(objective => {
          const objectiveTitleEl = objective.querySelector('.objective-title');
          if (!objectiveTitleEl) return;
          
          const objectiveTitle = objectiveTitleEl.innerText.trim();
          // "[함께 실습]"이 포함된 섹션인지 확인
          if (objectiveTitle.includes('함께 실습') || objectiveTitle.includes('함께실습')) {
            // 해당 섹션 내의 모든 entity 항목 수집
            const entities = objective.querySelectorAll('.entity');
            entities.forEach(entity => {
              const titleEl = entity.querySelector('.entity-title, .title');
              const title = titleEl ? titleEl.innerText.trim() : '';
              const linkEl = entity.querySelector(linkSel);
              const link = linkEl ? linkEl.href : null;
              
              if (!title || !link) return;
              
              // 워게임 챌린지인지 확인 (wargame/challenges 포함)
              if (link.includes('wargame/challenges')) {
                // 워게임 제목을 키로, 함께실습 강의 URL을 값으로 매핑
                // 함께실습 섹션 내의 다른 항목들(강의)을 찾아 매핑
                entities.forEach(otherEntity => {
                  const otherTitleEl = otherEntity.querySelector('.entity-title, .title');
                  const otherTitle = otherTitleEl ? otherTitleEl.innerText.trim() : '';
                  const otherLinkEl = otherEntity.querySelector(linkSel);
                  const otherLink = otherLinkEl ? otherLinkEl.href : null;
                  
                  // 워게임이 아니고, Exercise: 형식의 강의인 경우
                  if (otherLink && !otherLink.includes('wargame/challenges') && 
                      (otherTitle.includes('Exercise:') || otherTitle.includes('연습문제'))) {
                    practiceMap[title] = otherLink;
                    console.log(`🔗 함께실습 매핑: "${title}" → "${otherTitle}" (${otherLink})`);
                  }
                });
              }
            });
          }
        });
        
        // 미완료 강의 수집 (기존 로직 유지)
        items.forEach(item => {
          const titleEl = item.querySelector('.entity-title, .title');
          const title = titleEl ? titleEl.innerText.trim() : '';
          const linkEl = item.querySelector(linkSel);
          const link = linkEl ? linkEl.href : null;

          // 미완료 강의 수집
          const actionTexts = Array.from(item.querySelectorAll('.action-text'));
          const progressEl = item.querySelector('.progress-text, .progress');
          const progressText = progressEl ? progressEl.innerText.trim() : '';

          const isIncomplete = actionTexts.some(el =>
            !el.classList.contains('completed') &&
            (el.innerText.trim() === '시작하기' || el.innerText.trim() === '이어하기' || el.innerText.trim() === '재도전')
          );

          if (isIncomplete && link && progressText !== '100%') {
            urls.push(link);
          }
        });
        
        console.log('📋 함께실습 매핑 결과:', JSON.stringify(practiceMap, null, 2));
        return { lectureUrls: urls, togetherPracticeMap: practiceMap };
      },
      SELECTORS.LECTURE_ITEM,
      SELECTORS.LECTURE_LINK,
    );

    if (lectureUrls.length === 0) {
      // 강의 항목이 아예 없는 경우와 모든 강의가 완료된 경우 구분
      const hasAnyItems = await page.evaluate((itemSel) => {
        return document.querySelectorAll(itemSel).length > 0;
      }, SELECTORS.LECTURE_ITEM);
      
      if (!hasAnyItems) {
        console.log('⚠️ 강의 항목을 찾을 수 없습니다. 로그인 상태를 확인해주세요.');
        console.log('⚠️ 현재 페이지가 커리큘럼 페이지인지 확인해주세요.');
        return;
      } else {
        console.log('✅ 모든 강의가 이미 완료되었습니다.');
        return;
      }
    } else {
      console.log(`📚 총 ${lectureUrls.length}개의 미완료 강의를 발견했습니다.`);
    }

    // 세션 시간 제한 설정 (하루 최대 2.5시간)
    const MAX_DAILY_MINUTES = 150; // 2.5시간
    let totalMinutes = 0;
    let completedLectures = 0;

    // === 2단계: 각 강의 순회 ===
    for (let i = 0; i < lectureUrls.length; i++) {
      // 세션 시간 체크
      if (totalMinutes >= MAX_DAILY_MINUTES) {
        console.log(`⏰ 오늘 수강 시간 종료 (${totalMinutes}분). 내일 다시 실행하세요.`);
        break;
      }

      const url = lectureUrls[i];
      console.log(`\n▶️  [${i + 1}/${lectureUrls.length}] ${url}`);

      // 자동화 불가능한 페이지(예: 워게임 챌린지) 스킵
      if (url.includes('wargame/challenges')) {
        console.log('⚠️  워게임 챌린지 페이지가 감지되었습니다. [함께실습] 강의 및 인터넷 검색으로 플래그 해결을 시도합니다.');
        await solveWargameChallenge(browser, page, url, togetherPracticeMap);
        totalMinutes += Math.floor(Math.random() * 5) + 3; // 3~8분 소요 추정
        continue;
      }

      await page.goto(url, { waitUntil: 'networkidle2' });

      // 퀴즈 페이지인지 확인
      const isQuiz = await detectQuiz(page);

      if (isQuiz) {
        if (SKIP_QUIZ) {
          console.log('⏭️ 퀴즈 건너뛰기 모드: 퀴즈 페이지 스킵');
          // 다음 강의로 넘어가기
          continue;
        } else {
          let unsolvedCount = await solveQuiz(page, cursor);
          // 미해결 문제가 있으면 최대 2회 재시도
          for (let retry = 0; retry < 2 && unsolvedCount > 0; retry++) {
            console.log(`  🔁 미해결 ${unsolvedCount}문제 재시도 (${retry + 1}/2)...`);
            await randomDelay(500, 1000);
            unsolvedCount = await solveQuiz(page, cursor);
          }
          await finishQuiz(page, cursor); // 퀴즈 최종 제출 및 다음 페이지 이동
          totalMinutes += Math.floor(Math.random() * 8) + 5; // 퀴즈: 5~13분 소요 추정
        }
      } else {
        // === 일반 강의 처리 ===
        let lectureCompleted = false;
        let dynamicDelay; // 외부 스코프에서 선언

        while (!lectureCompleted) {
          // 난이도별 동적 딜레이 적용
          dynamicDelay = await getDynamicDelayFromPage(page);
          console.log(`📖 강의 내용 읽는 중... (난이도: ${dynamicDelay.level}, ${Math.floor(dynamicDelay.min/1000)}~${Math.floor(dynamicDelay.max/1000)}초)`);
          
          await Promise.all([
            randomDelay(dynamicDelay.min, dynamicDelay.max),
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
            if (SKIP_QUIZ) {
              console.log('⏭️ 퀴즈 건너뛰기 모드: 강의 내 퀴즈 무시');
            } else {
              console.log('💡 강의 내에 퀴즈가 감지되었습니다. 퀴즈 풀이를 시도합니다.');
              await solveQuiz(page, cursor);
              await randomDelay(1000, 2000);
            }
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
        
        // 강의 소요 시간 추정 (난이도별)
        const lectureTime = dynamicDelay.level === 'hard' ? 
          Math.floor(Math.random() * 4) + 3 : // 3~7분
          dynamicDelay.level === 'medium' ? 
          Math.floor(Math.random() * 3) + 2 : // 2~5분
          Math.floor(Math.random() * 2) + 1;  // 1~3분
        totalMinutes += lectureTime;
      }

      console.log(`✅ [${i + 1}] 완료 (누적: ${totalMinutes}분)`);
      completedLectures++;

      // 🎯 수강률 체크
      const currentRate = await getCurrentCompletionRate(page, CURRICULUM_URL);
      console.log(`📊 현재 수강률: ${currentRate}% (목표: ${TARGET_RATE}%)`);
      
      if (currentRate >= TARGET_RATE) {
        console.log(`\n🎉 목표 수강률 ${TARGET_RATE}% 달성! (현재: ${currentRate}%)`);
        console.log('봇을 종료합니다.\n');
        break;
      }

      // 3~5개 강의마다 1~5분 휴식
      if ((completedLectures % (Math.floor(Math.random() * 3) + 3)) === 0) {
        const breakTime = Math.floor(Math.random() * 240000) + 60000; // 1~5분
        const breakMinutes = Math.floor(breakTime / 60000);
        console.log(`☕ 휴식 시간 (${breakMinutes}분)`);
        await randomDelay(breakTime, breakTime + 30000);
        totalMinutes += breakMinutes;
      }

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
        if (SKIP_QUIZ) {
          console.log('⏭️ 퀴즈 건너뛰기 모드: 수료 퀴즈 스킵');
        } else {
          await solveQuiz(page, cursor);
          await finishQuiz(page, cursor); // 최종 제출 처리 추가
          console.log('✅ 수료 퀴즈 응시 완료');
        }
      } else {
        console.log('⚠️ 수료 퀴즈 링크를 찾지 못했습니다. EXAM_URL을 .env에 설정하세요.');
      }
    } catch (err) {
      console.log(`⚠️ 수료 퀴즈 처리 중 에러: ${err.message}`);
    }

    // === 3단계: 최종 수강률 검증 ===
    console.log(`\n🔍 최종 수강률 검증을 위해 커리큘럼 페이지 접속: ${CURRICULUM_URL}`);
    await page.goto(CURRICULUM_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 5000);

    // 최종 수강률 확인
    const finalRate = await getCurrentCompletionRate(page, CURRICULUM_URL);
    console.log(`📊 최종 수강률: ${finalRate}% (목표: ${TARGET_RATE}%)`);

    if (finalRate >= TARGET_RATE) {
      console.log(`🎉 목표 수강률 ${TARGET_RATE}% 달성 성공! (현재: ${finalRate}%)`);
      console.log('✅ 봇 실행이 완료되었습니다.');
    } else {
      console.log(`⚠️ 목표 수강률 ${TARGET_RATE}% 미달성 (현재: ${finalRate}%)`);
      console.log('재실행을 통해 남은 강의를 수료할 수 있습니다.');
      
      // 디버깅을 위해 남은 강의 목록도 표시
      const remainingUrls = await page.evaluate(
        (itemSel, linkSel) => {
          const urls = [];
          const items = document.querySelectorAll(itemSel);
          items.forEach(item => {
            const actionTextEl = item.querySelector('.action-text');
            if (!actionTextEl) return;
            const text = actionTextEl.innerText.trim();
            const isCompleted = actionTextEl.classList.contains('completed');

            const progressEl = item.querySelector('.progress-text, .progress');
            const progressText = progressEl ? progressEl.innerText.trim() : '';

            if (!isCompleted && progressText !== '100%' && (text === '시작하기' || text === '이어하기' || text === '재도전')) {
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
      
      if (remainingUrls.length > 0) {
        console.log(`📚 남은 미완료 강의: ${remainingUrls.length}개`);
        remainingUrls.forEach((url, idx) => {
          console.log(`  - [${idx + 1}] ${url}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ 에러 발생:', error);
  } finally {
    console.log('브라우저 세션 유지 중. 수동으로 닫아주세요.');
    // await browser.close();
  }
})();

/**
 * 퀴즈 페이지 감지 (강화된 버전)
 */
async function detectQuiz(page) {
  try {
    // 0. URL 기반 정확한 검증 (가장 먼저)
    const currentUrl = page.url();
    
    // 정확한 퀴즈/시험 URL 패턴 확인
    const isQuizUrl = /\/quiz\/\d+/.test(currentUrl) || /\/exam\/\d+/.test(currentUrl);
    
    // 강의 페이지 배제: /learn.dreamhack.io/숫자 (퀴즈/시험 번호가 아닌 경우)
    const isLectureUrl = /\/learn\.dreamhack\.io\/\d+$/.test(currentUrl) && !isQuizUrl;
    
    if (isLectureUrl) {
      console.log('📖 강의 페이지 감지됨 (URL 패턴)');
      return false;
    }
    
    if (isQuizUrl) {
      console.log('📝 퀴즈 페이지 감지됨! (URL 기반)');
      return true;
    }
    
    // 1. 기본 셀렉터로 시도
    await page.waitForSelector(SELECTORS.QUIZ_TITLE, { timeout: 3000 });
    console.log('📝 퀴즈 페이지 감지됨! (기본 셀렉터)');
    return true;
  } catch {
    // 2. 대체 셀렉터 시도 (더 많은 셀렉터 추가)
    try {
      await page.waitForSelector('.quiz-title, .quiz-header, [class*="quiz"] h1, [class*="quiz"] h2, .quiz-question, .question-main, .markdown-content', { timeout: 2000 });
      console.log('📝 퀴즈 페이지 감지됨! (대체 셀렉터)');
      return true;
    } catch {
      // 3. 텍스트 기반 검색 (강화된 버전)
      const hasQuizText = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        
        // 일반 강의 텍스트 배제 (들어가며, 시작하기 등)
        const lectureKeywords = ['들어가며', '시작하기', '이어하기', '강의', 'lecture', 'chapter'];
        const hasLectureKeyword = lectureKeywords.some(keyword => bodyText.includes(keyword));
        
        // 퀴즈 관련 키워드 확인 (더 정확한 키워드)
        const quizKeywords = ['quiz', '퀴즈', '문제', 'question', '정답', '보기', '선택', '다음 문제', '재도전', '채점', '점수'];
        const questionKeywords = ['다음 중', '옳은 것은', '틀린 것은', '알맞은', '올바른', '선택하세요', '고르세요'];
        
        // 퀴즈 관련 키워드 확인
        const hasQuizKeyword = quizKeywords.some(keyword => bodyText.includes(keyword));
        
        // 문제 형식 키워드 확인
        const hasQuestionFormat = questionKeywords.some(keyword => bodyText.includes(keyword));
        
        // 선택지가 있는지 확인
        const hasChoices = document.querySelectorAll('.choice, .quiz-choice, .option, .el-radio, .el-checkbox').length > 0;
        
        // 강의 키워드가 있으면 퀴즈가 아님
        if (hasLectureKeyword && !hasQuizKeyword) {
          return false;
        }
        
        return hasQuizKeyword || (hasQuestionFormat && hasChoices);
      });
      
      if (hasQuizText) {
        console.log('📝 퀴즈 페이지 감지됨! (텍스트 기반)');
        return true;
      }
      
      // 4. 버튼 텍스트 확인
      const hasQuizButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, .btn, .el-button'));
        const quizButtonTexts = ['확인', '제출', '재도전', '다음 문제', '결과 확인', '채점하기'];
        
        return buttons.some(button => {
          const text = button.innerText.toLowerCase();
          return quizButtonTexts.some(btnText => text.includes(btnText.toLowerCase()));
        });
      });
      
      if (hasQuizButtons) {
        console.log('📝 퀴즈 페이지 감지됨! (버튼 텍스트 기반)');
        return true;
      }
      
      console.log('⚠️ 퀴즈 페이지 감지 실패');
      return false;
    }
  }
}

/**
 * 퀴즈 제목 추출 (다양한 방법으로 시도)
 */
async function extractQuizTitle(page) {
  try {
    // 1. 기본 셀렉터로 시도
    const title = await page.$eval(SELECTORS.QUIZ_TITLE, el => el.innerText.trim());
    if (title && title.length > 0) return title;
  } catch {
    // 2. 대체 셀렉터 시도
    try {
      const title = await page.$eval('.quiz-title, .quiz-header, [class*="quiz"] h1, [class*="quiz"] h2, h1, h2', el => el.innerText.trim());
      if (title && title.length > 0) return title;
    } catch {
      // 3. 페이지에서 퀴즈 관련 텍스트 찾기
      const titleFromPage = await page.evaluate(() => {
        // h1, h2 태그 중 퀴즈 관련 텍스트가 있는지 확인
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, .title, .header'));
        for (const heading of headings) {
          const text = heading.innerText.trim();
          if (text.length > 0 && (text.includes('퀴즈') || text.includes('Quiz') || text.includes('문제'))) {
            return text;
          }
        }
        
        // 페이지 상단의 첫 번째 주요 텍스트
        const mainContent = document.querySelector('.main-content, .content, .container, .quiz-container');
        if (mainContent) {
          const firstHeading = mainContent.querySelector('h1, h2, h3, .title');
          if (firstHeading) {
            return firstHeading.innerText.trim();
          }
        }
        
        return null;
      });
      
      if (titleFromPage) return titleFromPage;
    }
  }
  
  // 4. URL에서 추론
  const url = page.url();
  if (url.includes('/quiz/') || url.includes('/exam/')) {
    const match = url.match(/\/(quiz|exam)\/(\d+)/);
    if (match) {
      return `퀴즈 ${match[2]}`;
    }
    return '퀴즈 페이지';
  }
  
  return '(제목 추출 실패)';
}

/**
 * 퀴즈 문제 수 카운트 (다양한 방법으로 시도)
 */
async function countQuizQuestions(page) {
  try {
    // 1. .quiz-question 셀렉터로 시도
    const count1 = await page.$$eval('.quiz-question', els => els.length);
    if (count1 > 0) return count1;
  } catch {}
  
  try {
    // 2. .question-main 또는 .question-markdown 셀렉터로 시도
    const count2 = await page.$$eval('.question-main, .question-markdown, .markdown-content', els => els.length);
    if (count2 > 0) return count2;
  } catch {}
  
  try {
    // 3. 선택지가 있는 요소 찾기
    const count3 = await page.$$eval('.choice, .quiz-choice, .option', els => {
      // 선택지를 포함하는 상위 컨테이너 수 세기
      const containers = new Set();
      els.forEach(el => {
        const container = el.closest('.quiz-question, .question-container, .question-item');
        if (container) {
          containers.add(container);
        }
      });
      return containers.size;
    });
    if (count3 > 0) return count3;
  } catch {}
  
  // 4. 페이지에서 문제 번호 찾기 (1., 2., 3. 등)
  const questionCount = await page.evaluate(() => {
    const text = document.body.innerText;
    const questionNumberMatches = text.match(/(\d+\.\s*문제|\d+\.\s*Question|문제\s*\d+|Question\s*\d+)/gi);
    if (questionNumberMatches) {
      return questionNumberMatches.length;
    }
    
    // 숫자로 시작하는 문단 찾기 (1., 2., 3. 등)
    const numberedItems = text.match(/\n\d+\.\s/g);
    if (numberedItems) {
      return numberedItems.length;
    }
    
    return 0;
  });
  
  return questionCount;
}

/**
 * 스크린샷 디버깅 (퀴즈 stuck 시 자동 캡처)
 */
async function takeDebugScreenshot(page, context = 'quiz_stuck') {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `./logs/debug_${context}_${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 디버그 스크린샷 저장: ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    console.log(`⚠️ 스크린샷 캡처 실패: ${error.message}`);
    return null;
  }
}

/**
 * 퀴즈 풀이 (멀티스텝 브루트포스)
 * 각 스텝(문제)마다: 보기 하나씩 선택 → 확인 → 정답이면 다음 스텝
 */
async function solveQuiz(page, cursor) {
  // Improved quiz title extraction with multiple fallback methods
  const quizTitle = await extractQuizTitle(page);
  console.log(`📝 퀴즈: "${quizTitle}"`);

  // 총 문제 수 확인 (다양한 방법으로)
  const totalQuestions = await countQuizQuestions(page);
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
      const nextKeywords = ['다음 문제', '다음', '완료하기', '진행하기', '다음 주제로', '제출', '계속', 'Next', 'Continue'];
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      // 가시적인 문제를 우선 찾고, 없으면 인덱스로 접근
      const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
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
        if (!(b.offsetParent !== null) || !nextKeywords.some(k => b.innerText.includes(k))) return false;
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
      const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
      if (!q) return 0;
      const choices = q.querySelectorAll('.choice');
      return Array.from(choices).filter(el => (el.offsetParent !== null)).length;
    }, qIndex);

    console.log(`  🔘 보기 ${choiceCount}개 발견`);

    // 문제 데이터 추출 (AI 프롬프트용)
    const questionData = await page.evaluate((idx) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
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
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
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
            const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
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
            const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
            if (!q) return;
            // 현재 문제 내부 또는 문제 외부(다른 문제에 속하지 않은 버튼) 검색
            const confirmKeywords = ['확인', '제출', 'Confirm', 'Submit'];
            const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary, .el-button--success')).find(b => {
              if (!(b.offsetParent !== null) || !confirmKeywords.some(k => b.innerText.includes(k))) return false;
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
    const triedTexts = new Set();
    const MAX_ATTEMPTS = 15;

    // 현재 보기 텍스트 목록 읽기 (셔플 후 매번 호출) - 강화된 버전
    const getChoiceTexts = async () => {
      return page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
        const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return [];
        
        // 다양한 선택자로 보기 찾기
        const choiceSelectors = [
          '.choice',
          '.quiz-choice',
          '.choice-item',
          '.option',
          '.answer-option',
          '[class*="choice"]',
          '[class*="option"]',
          '.el-radio',
          '.el-checkbox',
          'input[type="radio"] + label',
          'input[type="checkbox"] + label'
        ];
        
        const allChoices = [];
        choiceSelectors.forEach(selector => {
          const elements = q.querySelectorAll(selector);
          elements.forEach(el => {
            if (el.offsetParent !== null) {
              const text = el.innerText.trim();
              if (text && !allChoices.includes(text)) {
                allChoices.push(text);
              }
            }
          });
        });
        
        return allChoices;
      }, qIndex);
    };

    // 텍스트 목록을 받아 해당 보기들을 클릭 후 결과 확인
    const tryChoiceTexts = async (texts) => {
      // cursor.click(el) 대신 Puppeteer 네이티브 클릭을 사용하여 Vue.js 반응성 보장
      for (const text of texts) {
        const handle = await page.evaluateHandle((idx, t) => {
          const qs = Array.from(document.querySelectorAll('.quiz-question'));
          const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
          if (!q) return null;
          const choices = Array.from(q.querySelectorAll('.choice'))
            .filter(el => (el.offsetParent !== null));
          return choices.find(el => el.innerText.trim() === t) || null;
        }, qIndex, text);

        const el = handle.asElement();
        if (!el) {
          if (handle) await handle.dispose();
          return false;
        }

        try {
          // 마우스 움직임 다양화
          await cursor.moveTo({ 
            x: Math.random() * 50 - 25, 
            y: Math.random() * 50 - 25 
          });
          await randomDelay(100, 300);
          
          await page.evaluate(e => { 
            e.scrollIntoView({block: 'center', behavior: 'smooth'}); 
          }, el);
          
          // 약간의 무작위 딜레이 후 클릭
          await randomDelay(200, 400);
          await page.evaluate(e => { e.click(); }, el);
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
            const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
            const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary'))
                                 .filter(b => (b.offsetParent !== null));
            const qBtn = q ? Array.from(q.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => (b.offsetParent !== null)) : null;
            const globalBtn = allBtns.find(b => !b.closest('.quiz-question'));
            const b = qBtn || globalBtn;
        if (b) console.log('  🔍 확인/제출 버튼 찾음: ' + b.innerText.trim());

            if (b && !b.classList.contains('is-disabled') && !b.classList.contains('disabled')) {
              const t = b.innerText.trim();
              const isConfirm = !['재도전', '다시', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'].some(k => t.includes(k));
              if (isConfirm) console.log('  🔍 버튼 활성화 상태 확인:', t);
              return isConfirm;
            }
            return false;
          },
          { timeout: 3000 }, qIndex
        );
      } catch { /* 단일클릭 제출이거나 버튼 없는 경우 */ }

      const submitted = await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary'))
                             .filter(b => (b.offsetParent !== null));

        // 현재 문제 컨테이너 안의 버튼 우선, 없으면 전역 버튼 중 현재 문제와 연관된 것 탐색
        const qBtn = q ? Array.from(q.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => (b.offsetParent !== null)) : null;
        const globalBtn = allBtns.find(b => {
          const parent = b.closest('.quiz-question');
          return !parent || parent === q;
        });
        const b = qBtn || globalBtn;
        if (b) console.log('  🔍 확인/제출 버튼 찾음: ' + b.innerText.trim());

        if (!b || b.classList.contains('disabled') || b.classList.contains('is-disabled')) return false;

        const t = b.innerText.trim();
        const nextKeywords = ['재도전', '다시', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'];
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
              const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
              if (!q) return true;

              const hasResultClass = q.querySelector('.is-correct, .is-wrong, .is-success, .is-error, .check-icon') ||
                                     q.classList.contains('is-correct') || q.classList.contains('is-wrong');

              const b = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary'))
                             .filter(el => (el.offsetParent !== null))
                             .find(el => {
                               const p = el.closest('.quiz-question');
                               return !p || p === q;
                             });

              if (!b) return hasResultClass;
              const t = b.innerText.trim();
              const hasNextOrRetry = ['재도전', '다시', '다음 문제', '다음', '계속', '완료', 'Next', 'Continue'].some(k => t.includes(k));

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
            const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
            if (!q) return true;
            const text = q.innerText || '';

            // 1. 정답 징후 (텍스트, 아이콘, 클래스)
            if (correctTexts.some(t => text.includes(t))) return true;
            if (q.querySelector('.check-icon, .is-success, .is-correct')) return true;

            // 2. 오답 상태 감지
            const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
            if (main && (main.classList.contains('is-wrong') || main.classList.contains('is-incorrect') || main.classList.contains('is-danger'))) return true;

            // 3. 버튼 상태 감지 (재도전 또는 다음)
            const allBtns = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).filter(b => (b.offsetParent !== null));
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

      // 최종 정답 여부 판별 (개선된 버전)
      const evalResult = await page.evaluate((idx, correctTexts, nextKeys) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return { isCorrect: true };

        const allVisibleBtns = Array.from(document.querySelectorAll('.btn, .el-button, .el-button--primary, .el-button--success'))
          .filter(b => (b.offsetParent !== null));

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
            visible: b.offsetParent !== null
          })),
        };

        // 1. 모달 알림 처리
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
        
        // 2. 명시적 정답 텍스트 확인
        if (correctTexts.some(t => qText.includes(t))) return { isCorrect: true, debug: debugInfo };
        
        // 3. 정답 아이콘/클래스 확인
        if (q.querySelector('.check-icon, .is-success, .is-correct')) return { isCorrect: true, debug: debugInfo };
        if (q.querySelector('.caption')?.innerText.includes('정답')) return { isCorrect: true, debug: debugInfo };
        if (containers.some(c => c.classList.contains('is-success') || c.classList.contains('is-correct'))) return { isCorrect: true, debug: debugInfo };

        // 4. 오답 상태 우선 확인 (재도전 버튼이 있으면 무조건 오답)
        const retryBtn = allVisibleBtns.find(b => 
          (b.innerText.includes('재도전') || b.innerText.includes('다시')) &&
          (!b.closest('.quiz-question') || b.closest('.quiz-question') === q)
        );
        if (retryBtn) return { isCorrect: false, debug: debugInfo, reason: 'retry_button_found' };

        // 5. 명시적 오답 클래스 확인
        const isWrong = containers.some(c =>
          c.classList.contains('is-wrong') ||
          c.classList.contains('is-incorrect') ||
          c.classList.contains('is-danger') ||
          c.classList.contains('is-error')
        ) || qText.includes('아쉽게도 틀렸습니다') || q.querySelector('.icon.wrong') || q.querySelector('img[src*="wrong"]');

        if (isWrong) return { isCorrect: false, debug: debugInfo, reason: 'wrong_class_or_text' };

        // 6. "다음 문제" 버튼 확인 (더 보수적으로)
        const targetBtns = qBtns.length > 0 ? qBtns : globalBtns;
        const nextBtn = targetBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        
        // "다음 문제" 버튼이 있더라도, 정답 표시가 먼저 확인되어야 함
        if (nextBtn) {
          // 정답 표시가 있는지 다시 확인
          const hasPositiveFeedback = correctTexts.some(t => qText.includes(t)) ||
                                     q.querySelector('.check-icon, .is-success, .is-correct') ||
                                     containers.some(c => c.classList.contains('is-success') || c.classList.contains('is-correct'));
          
          if (hasPositiveFeedback) {
            return { isCorrect: true, debug: debugInfo, reason: 'next_button_with_positive_feedback' };
          }
          
          // 정답 표시가 없으면 보수적으로 오답 처리
          return { isCorrect: false, debug: debugInfo, reason: 'next_button_without_positive_feedback' };
        }

        // 7. 전역 "다음" 버튼 확인 (동일한 보수적 접근)
        const globalNextBtn = allVisibleBtns.find(b => nextKeys.some(k => b.innerText.includes(k)));
        if (globalNextBtn) {
          const hasPositiveFeedback = correctTexts.some(t => qText.includes(t)) ||
                                     q.querySelector('.check-icon, .is-success, .is-correct') ||
                                     containers.some(c => c.classList.contains('is-success') || c.classList.contains('is-correct'));
          
          if (hasPositiveFeedback) {
            return { isCorrect: true, debug: debugInfo, reason: 'global_next_button_with_positive_feedback' };
          }
          
          return { isCorrect: false, debug: debugInfo, reason: 'global_next_button_without_positive_feedback' };
        }

        // 8. 보기와 확인 버튼이 모두 없으면 (다음 단계로 넘어간 상태)
        const hasVisibleChoices = Array.from(q.querySelectorAll('.choice')).some(el => el.offsetParent !== null);
        const hasConfirmBtn = targetBtns.some(b => {
          const t = b.innerText.trim();
          const isActionBtn = t.includes('확인') || t.includes('제출') || t.includes('Confirm') || t.includes('Submit');
          return isActionBtn && !['재도전', '다시', ...nextKeys].some(k => t.includes(k));
        });

        if (!hasVisibleChoices && !hasConfirmBtn && !q.querySelector('textarea')) {
          // 이 경우에도 정답 표시가 있는지 확인
          const hasPositiveFeedback = correctTexts.some(t => qText.includes(t)) ||
                                     q.querySelector('.check-icon, .is-success, .is-correct') ||
                                     containers.some(c => c.classList.contains('is-success') || c.classList.contains('is-correct'));
          
          if (hasPositiveFeedback) {
            return { isCorrect: true, debug: debugInfo, reason: 'no_choices_with_positive_feedback' };
          }
          
          return { isCorrect: false, debug: debugInfo, reason: 'no_choices_without_positive_feedback' };
        }

        // 9. 기본적으로 오답 처리 (불확실한 경우)
        return { isCorrect: false, debug: debugInfo, reason: 'default_false' };
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
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
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
            .filter(el => (el.offsetParent !== null))
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

      // AI 정답률 조절 (70% 확률로만 AI 사용)
      let aiIndices = null;
      if (Math.random() < 0.7) {
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

        try {
          const raw = await aiProvider.getCompletion(prompt, systemPrompt);
          if (raw === null) {
            console.log(`  🤖 AI 사용 불가 - 브루트포스 모드로 전환`);
            aiIndices = null;
          } else if (!raw) {
            console.log(`  ⚠️ AI 응답이 비어있습니다`);
            aiIndices = null;
          } else {
            const parsed = JSON.parse(raw.match(/\[[\d,\s]+\]/)?.[0] || 'null');
            if (Array.isArray(parsed) && parsed.length > 0) {
              aiIndices = parsed.filter(i => i >= 0 && i < currentTexts.length);
              console.log(`  🤖 AI 예측: [${aiIndices.join(', ')}]`);
            } else {
              console.log(`  ⚠️ AI 응답 파싱 실패: ${raw}`);
              aiIndices = null;
            }
          }
        } catch (err) {
          console.log(`  ⚠️ AI 예측 에러: ${err.message}`);
        }
      } else {
        console.log(`  🤖 AI 사용 안함 (정답률 조절)`);
      }

      // 의도적 오답 추가 (30% 확률)
      if (Math.random() < 0.3 && currentTexts.length > 1) {
        console.log(`  🎭 의도적 오답 시도 (30% 확률)`);
        const wrongChoices = [...Array(currentTexts.length).keys()]
          .filter(i => !aiIndices || !aiIndices.includes(i));
        
        if (wrongChoices.length > 0) {
          const numWrong = Math.random() < 0.5 ? 1 : 2; // 1~2개 오답
          const selectedWrong = [];
          
          for (let w = 0; w < numWrong && w < wrongChoices.length; w++) {
            const wrongIdx = wrongChoices[Math.floor(Math.random() * wrongChoices.length)];
            selectedWrong.push(wrongIdx);
            console.log(`  🎭 의도적 오답: 보기 ${wrongIdx + 1}`);
          }
          
          const wrongTexts = selectedWrong.map(i => currentTexts[i]);
          await tryChoiceTexts(wrongTexts);
          const retryRes = await clickRetry(page, cursor, qIndex);
          if (retryRes === 'RELOAD_REQUIRED') {
            continue;
          }
          await randomDelay(3000, 8000);
        }
      }

      // AI 예측 결과로 시도
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
            const retryRes = await clickRetry(page, cursor, qIndex);
            if (retryRes === 'RELOAD_REQUIRED') {
              // AI 예측 실패 후 reload된 경우 다시 바깥 for/while 루프로 넘김
              continue; 
            }
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

      if (aiIndices) {
        const aiTexts = aiIndices.map(i => currentTexts[i]).filter(Boolean);
        if (aiTexts.length === aiIndices.length) {
          if (typeof triedTexts !== 'undefined') {
            triedTexts.add(JSON.stringify(aiTexts.slice().sort()));
          }
        }
      }

      // 단일 보기 순회 (무작위 순서)
      let viewChanged = false;
      const shuffledIndices = [...Array(currentTexts.length).keys()]
        .sort(() => Math.random() - 0.5);
      
      for (const c of shuffledIndices) {
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
          const retryRes = await clickRetry(page, cursor, qIndex);
          if (retryRes === 'RELOAD_REQUIRED') {
            viewChanged = true;
            break;
          }

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
              const retryRes = await clickRetry(page, cursor, qIndex);
              if (retryRes === 'RELOAD_REQUIRED') {
                viewChanged = true;
                break;
              }

              const nextData = await page.evaluate((idx) => {
                const qs = Array.from(document.querySelectorAll('.quiz-question'));
                const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
                return q ? Array.from(q.querySelectorAll('.choice')).filter(el => (el.offsetParent !== null)).map(el => el.innerText.trim()) : [];
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
                const retryRes = await clickRetry(page, cursor, qIndex);
                if (retryRes === 'RELOAD_REQUIRED') {
                  viewChanged = true;
                  break;
                }

                const nextData = await page.evaluate((idx) => {
                  const qs = Array.from(document.querySelectorAll('.quiz-question'));
                  const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
                  return q ? Array.from(q.querySelectorAll('.choice')).filter(el => (el.offsetParent !== null)).map(el => el.innerText.trim()) : [];
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
 * 오답 후 재도전 버튼 클릭 (개선된 버전)
 */
async function clickRetry(page, cursor, qIndex) {
  let isReloaded = false;
  const handle = await page.evaluateHandle((idx) => {
    const qs = Array.from(document.querySelectorAll('.quiz-question'));
    const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
    const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
      if (!(b.offsetParent !== null) || !(b.innerText.includes('재도전') || b.innerText.includes('다시'))) return false;
      const parentQ = b.closest('.quiz-question');
      return !parentQ || parentQ === q; // 현재 문제 내부 또는 전역 재도전 버튼
    });
    return btn || null;
  }, qIndex);
  const el = handle.asElement();
  if (el) {
    console.log('  🔄 재도전 버튼 클릭');
    await page.evaluate(b => { b.scrollIntoView({block: 'center'}); b.click(); }, el);

    // 재도전 클릭 후 오답/정답 상태 클래스가 사라질 때까지 대기
    try {
      await page.waitForFunction((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return true;
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');

        // 결과 관련 클래스들 (더 포괄적으로)
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const hasResultClass = main && resultClasses.some(c => main.classList.contains(c));
        const qHasResultClass = resultClasses.some(c => q.classList.contains(c));
        const anyChildHasResult = q.querySelector('.is-wrong, .is-incorrect, .is-success, .is-correct, .is-danger, .is-valid');

        // 버튼 텍스트가 "확인"으로 돌아왔는지도 체크하면 더 정확함
        const btn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('확인') || b.innerText.includes('제출'));
        });

        // "재도전" 버튼이 사라졌는지 확인
        const retryBtn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('재도전') || b.innerText.includes('다시'));
        });

        return (!main || !hasResultClass) && !qHasResultClass && !anyChildHasResult && !retryBtn;
      }, { timeout: 8000, polling: 500 }, qIndex);
    } catch (e) {
      console.log('  ⚠️ 재도전 버튼 타임아웃. 상태 클래스를 직접 제거하고 초기화합니다...');
      // 타임아웃 시 상태 클래스 직접 제거
      await page.evaluate((idx) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const visibleQs = qs.filter(el => el.offsetParent !== null);
          const q = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
        if (!q) return;
        
        const resultClasses = ['is-wrong', 'is-incorrect', 'is-success', 'is-correct', 'is-danger', 'is-valid', 'is-invalid', 'has-error'];
        const removeClasses = (el) => {
          if (!el) return;
          resultClasses.forEach(c => el.classList.remove(c));
        };
        
        const main = q.querySelector('.question-main, .question-markdown, .markdown-content');
        removeClasses(main);
        removeClasses(q);
        q.querySelectorAll('*').forEach(removeClasses);
        
        // 확인 버튼 활성화 시도
        const confirmBtn = Array.from(document.querySelectorAll('.btn.btn-primary, .el-button--primary')).find(b => {
          if (!(b.offsetParent !== null)) return false;
          const parentQ = b.closest('.quiz-question');
          return (!parentQ || parentQ === q) && (b.innerText.includes('확인') || b.innerText.includes('제출'));
        });
        if (confirmBtn && (confirmBtn.classList.contains('is-disabled') || confirmBtn.classList.contains('disabled'))) {
          confirmBtn.classList.remove('is-disabled', 'disabled');
          confirmBtn.disabled = false;
        }
      }, qIndex);
      
      // 상태 초기화 후 추가 대기
      await randomDelay(1500, 2500);
      
      // 그래도 문제가 지속되면 페이지 새로고침 (최후의 수단)
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
        console.log('  ⚠️ 여전히 재도전 버튼이 존재합니다. 페이지를 강제로 새로고침합니다...');
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForFunction(() => document.readyState === 'complete', {timeout: 10000}).catch(()=>null);
        isReloaded = true;
      }
    }
  } else {
    console.log('  ⚠️ 재도전 버튼을 찾을 수 없습니다.');
  }
  handle.dispose();
  
  if (isReloaded) {
      await randomDelay(2000, 3000); // 새로고침 후 대기
      return 'RELOAD_REQUIRED';
  } else {
      await randomDelay(1000, 2000); // 상태 초기화 후 적절한 대기
  }
}

/**
 * 정답 후 다음 버튼 클릭 (개선된 버전)
 */
async function handleCorrect(page, cursor, qIndex, maxAttempts = 10) {
  const nextKeywords = ['다음 문제', '다음', '완료', '계속', 'Next', 'Continue', '진행하기', '다음 주제로'];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1. 일반적인 "다음" 버튼 찾기 (확장된 검색)
    const btnHandle = await page.evaluateHandle((idx, keywords) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const q = qs.find(el => el.offsetParent !== null) || qs[idx] || qs[0] || document.querySelector('.quiz-question');
      const allBtns = Array.from(document.querySelectorAll('.btn, .el-button, .el-button--primary, .el-button--success, .dh3-button'))
                           .filter(b => (b.offsetParent !== null));

      // 여러 버튼 텍스트 패턴 시도
      const possibleBtns = allBtns.filter(b => {
        const text = b.innerText.trim();
        if (b.classList.contains('is-disabled') || b.disabled) return false;
        
        // 키워드 매칭
        const matchesKeyword = keywords.some(k => text.includes(k));
        if (!matchesKeyword) return false;
        
        // 현재 문제와 연관된 버튼인지 확인
        const parentQ = b.closest('.quiz-question');
        return !parentQ || parentQ === q;
      });

      // 우선순위: "다음 문제" > "다음" > "완료" > "계속" > "진행하기" > "다음 주제로"
      const priorityOrder = ['다음 문제', '다음', '완료', '계속', '진행하기', '다음 주제로', 'Next', 'Continue'];
      const sortedBtns = possibleBtns.sort((a, b) => {
        const aText = a.innerText.trim();
        const bText = b.innerText.trim();
        const aPriority = priorityOrder.findIndex(k => aText.includes(k));
        const bPriority = priorityOrder.findIndex(k => bText.includes(k));
        return aPriority - bPriority;
      });

      return sortedBtns[0] || null;
    }, qIndex, nextKeywords);

    const btn = btnHandle.asElement();
    if (btn) {
      const txt = await page.evaluate(el => el.innerText.trim(), btn);
      console.log(`  ➡️ 다음 버튼 클릭 시도 (btn="${txt}")`);
      await btn.scrollIntoViewIfNeeded();
      
      // 더 안정적인 클릭 방식
      await page.evaluate(el => {
        el.click();
        // 추가 이벤트 트리거
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      }, btn);
      
      await randomDelay(1500, 2500);
      
      // 클릭 후 상태 확인
      const clickedSuccessfully = await page.evaluate((idx, keywords) => {
        const qs = Array.from(document.querySelectorAll('.quiz-question'));
        const q = qs.find(el => el.offsetParent !== null) || qs[idx] || qs[0] || document.querySelector('.quiz-question');
        if (!q) return true;
        
        // 클릭 후 버튼이 사라졌는지 확인
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
        console.log(`  ✅ 다음 버튼 클릭 성공`);
        return;
      } else {
        console.log(`  ⚠️ 버튼 클릭 후 여전히 존재함. 재시도...`);
      }
    }

    // 2. 스텝 네비게이션 확인 (다음 스텝이 'is-accessible' 인지)
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

    // 3. 페이지가 자동으로 다음 문제로 넘어갔는지 확인
    const hasMovedToNext = await page.evaluate((idx) => {
      const qs = Array.from(document.querySelectorAll('.quiz-question'));
      const visibleQs = qs.filter(el => el.offsetParent !== null);
      const currentQ = visibleQs.length > 1 ? qs[idx] : (visibleQs[0] || qs[idx] || qs[0]);
      
      // 현재 문제가 더 이상 보이지 않으면 다음으로 넘어간 것으로 간주
      return !currentQ || currentQ.offsetParent === null;
    }, qIndex);

    if (hasMovedToNext) {
      console.log(`  ✅ 자동으로 다음 문제로 이동됨`);
      return;
    }

    console.log(`  ⏳ 다음 단계 대기 중... (${attempt + 1}/${maxAttempts})`);
    await randomDelay(1500, 2500);
  }
  
  console.log(`  ⚠️ 다음 버튼을 찾지 못했습니다. 수동으로 다음 문제로 이동합니다.`);
  
  // 최후의 수단: 스텝 네비게이션 강제 클릭
  await page.evaluate((idx) => {
    const steps = Array.from(document.querySelectorAll('.step'));
    if (steps.length > idx + 1) {
      const nextStep = steps[idx + 1];
      nextStep.click();
    } else if (steps.length > 0) {
      // 마지막 스텝이면 첫 번째 스텝 클릭
      steps[0].click();
    }
  }, qIndex);
  
  await randomDelay(2000, 3000);
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
  const steps = await page.$(SELECTORS.QUIZ_STEP);
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
      
      // 없으면 '목록으로' 버튼 찾음
      if (!targetBtn) {
        targetBtn = visibleBtns.find(btn => btn.innerText.includes('목록으로'));
      }

      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      
      const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
      return { debugBtns: allBtnTexts };
    }, SELECTORS.COMPLETE_BTN);

    if (btnText && typeof btnText === 'string') {
      console.log(`🖱️  [${btnText}] 버튼 클릭 완료`);
    } else if (btnText && btnText.debugBtns) {
      console.log('⚠️  수강 완료 버튼("진행하기"/"다음 주제로")을 찾지 못했습니다. 현재 보이는 버튼들:', btnText.debugBtns);
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
 * 수료 퀴즈(Exam) 및 일반 퀴즈 최종 제출 처리
 */
async function finishQuiz(page, cursor) {
  console.log('🏁 퀴즈/수료 퀴즈 최종 제출을 시도합니다...');
  await randomDelay(3000, 5000);

  try {
    const btnText = await page.evaluate(() => {
      const submitKeywords = ['제출', '결과', 'Finish', 'Submit', 'Done', '채점', '완료', '최종 제출', '최종 확인'];
      const btns = Array.from(document.querySelectorAll('button, a, .btn, .el-button, .dh3-button'));
      const visibleBtns = btns.filter(b => b.offsetParent !== null);

      // 1. 먼저 정확한 제출 버튼 찾기
      let targetBtn = visibleBtns.find(btn =>
        submitKeywords.some(k => btn.innerText.includes(k)) &&
        !btn.innerText.includes('재도전') &&
        !btn.innerText.includes('다시') &&
        !btn.innerText.includes('다음 문제') &&
        !btn.innerText.includes('다음 주제로') &&
        !btn.innerText.includes('진행하기') &&
        !btn.innerText.includes('본 워게임')
      );
      
      // 2. 없으면 더 넓은 범위로 검색 (다음 주제로 버튼도 포함)
      if (!targetBtn) {
        targetBtn = visibleBtns.find(btn =>
          (btn.innerText.includes('다음 주제로') || btn.innerText.includes('목록으로') || btn.innerText.includes('본 워게임')) &&
          !btn.innerText.includes('재도전') &&
          !btn.innerText.includes('다시')
        );
      }
      
      // 3. 그래도 없으면 첫 번째 활성화된 버튼 사용
      if (!targetBtn) {
        targetBtn = visibleBtns.find(btn => 
          !btn.disabled && 
          !btn.classList.contains('disabled') &&
          !btn.classList.contains('is-disabled')
        );
      }
      
      if (!targetBtn) {
        // Log all visible buttons to help debug
        const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
        console.log("DEBUG_VISIBLE_BTNS:", JSON.stringify(allBtnTexts));
      }

      if (targetBtn) {
        targetBtn.click();
        return targetBtn.innerText.trim();
      }
      
      const allBtnTexts = visibleBtns.map(b => b.innerText.trim()).filter(t => t);
      return { debugBtns: allBtnTexts };
    });

    if (btnText && typeof btnText === 'string') {
      console.log(`🖱️  최종 제출 버튼 [${btnText}] 클릭 완료`);
      await randomDelay(3000, 5000);

      // 혹시 모를 확인 모달 처리 (예: "정말 제출하시겠습니까?")
      await page.evaluate(() => {
        const confirmBtn = document.querySelector('.el-message-box__btns .el-button--primary, .el-message-box__btns .btn-primary');
        if (confirmBtn) confirmBtn.click();
      });
      await randomDelay(2000, 4000);
    } else if (btnText && btnText.debugBtns) {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 현재 보이는 버튼들:', btnText.debugBtns);
    } else {
      console.log('⚠️  최종 제출 버튼을 찾지 못했습니다. 이미 제출되었거나 버튼 형식이 다를 수 있습니다.');
    }

    // 최종 수료 팝업 확인
    const completed = await checkCompletionPopup(page, cursor);
    if (completed) {
      console.log('🎉 퀴즈가 성공적으로 처리되었습니다.');
    } else {
      // 팝업이 안 떴다면 다음 주제로 / 진행하기 버튼 클릭 시도 (일반 퀴즈인 경우)
      await clickCompleteButton(page, cursor);
      await randomDelay(2000, 4000);
    }
  } catch (err) {
    console.log('⚠️  퀴즈 최종 제출 처리 중 에러:', err.message);
  }
}

/**
 * 로그인 상태 검증 (개선된 버전)
 * - URL 기반 빠른 검증 추가
 * - 다단계 검증 완화 (OR 조건 적용)
 * - 불필요한 콘텐츠 접근 테스트 제거
 * - 실제 작업 가능성 검증 강화
 */
async function verifyLoginStatus(page) {
  try {
    const currentUrl = page.url();
    
    // === 1단계: URL 기반 빠른 검증 ===
    // euser 페이지에 접근 가능하면 이미 로그인된 상태
    if (currentUrl.includes('/euser') && currentUrl.includes('dreamhack.io')) {
      console.log('✅ URL 검증 통과: euser 페이지 접근 가능');
      return true;
    }
    
    // 로그인 페이지에 머물러 있으면 실패
    if (currentUrl.includes('/login') || !currentUrl.includes('dreamhack.io')) {
      console.log('🔍 URL 검증 실패: 로그인 페이지에 머물러 있음');
      return false;
    }
    
    // === 2단계: 로그인 폼 요소 확인 ===
    const hasLoginForm = await page.evaluate(() => {
      const loginFormSelectors = [
        'input[type="email"]',
        'input[type="password"]',
        'input[name="email"]',
        'input[name="password"]',
        'input[placeholder*="이메일"]',
        'input[placeholder*="비밀번호"]',
        'form[action*="login"]',
        '.login-form',
        '.signin-form'
      ];
      
      return loginFormSelectors.some(selector => {
        const element = document.querySelector(selector);
        return element && element.offsetParent !== null;
      });
    });
    
    if (hasLoginForm) {
      console.log('🔍 로그인 폼 검증 실패: 로그인 폼 요소가 존재함');
      return false;
    }
    
    // === 3단계: 사용자 요소 확인 (완화된 버전) ===
    const hasUserElements = await page.evaluate(() => {
      // 다양한 사용자 요소 셀렉터 (더 포괄적)
      const userSelectors = [
        '.user-info',
        '.user-menu',
        '[data-testid="user-menu"]',
        '.header-user',
        '.profile-image',
        '.avatar',
        'img[src*="avatar"]',
        '.el-dropdown-menu',
        '.user-name',
        '.profile-info',
        // 일반적인 헤더 요소도 포함 (로그인 후 나타나는 것들)
        'header button:not(.login-button)',
        '.header-actions button',
        '.dh3-button:not(.btn-login)'
      ];
      
      // 로그인 실패 메시지가 없는지 확인
      const pageText = document.body.innerText.toLowerCase();
      const failureKeywords = ['잘못된', '틀렸', '오류', '실패', 'error', 'invalid', 'incorrect', 'wrong'];
      const hasFailure = failureKeywords.some(keyword => pageText.includes(keyword));
      
      if (hasFailure) {
        return false;
      }
      
      // 사용자 요소가 하나라도 있으면 통과
      return userSelectors.some(selector => {
        const elements = document.querySelectorAll(selector);
        return Array.from(elements).some(el => el.offsetParent !== null);
      });
    });
    
    if (hasUserElements) {
      console.log('✅ 사용자 요소 검증 통과');
      return true;
    }
    
    // === 4단계: 세션 쿠키 확인 ===
    try {
      const cookies = await page.cookies();
      const hasSessionCookie = cookies.some(cookie => 
        cookie.name.includes('session') || 
        cookie.name.includes('auth') || 
        cookie.name.includes('token') ||
        cookie.name.includes('dreamhack')
      );
      
      if (hasSessionCookie) {
        console.log('✅ 세션 쿠키 검증 통과');
        return true;
      }
    } catch (error) {
      // 쿠키 확인 실패는 무시
    }
    
    // === 5단계: 페이지 텍스트 기반 검증 ===
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const loginKeywords = ['로그인', 'login', 'sign in'];
    const hasLoginText = loginKeywords.some(keyword => pageText.includes(keyword));
    
    if (!hasLoginText) {
      // 로그인 관련 텍스트가 없으면 로그인된 상태로 간주
      console.log('✅ 페이지 텍스트 검증 통과 (로그인 텍스트 없음)');
      return true;
    }
    
    // 모든 검증 실패
    console.log('🔍 로그인 검증 실패: 모든 검증 단계 통과하지 못함');
    return false;
    
  } catch (error) {
    console.log('🔍 로그인 검증 중 에러:', error.message);
    // 에러 발생 시에도 false 반환 (안전한 실패 처리)
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
      return (
        document.body.innerText.includes('이미 해결한 문제입니다') ||
        document.querySelector('.solved-badge, .is-solved') !== null ||
        document.body.innerText.includes('Clear')
      );
    });

    if (isSolved) {
      console.log(`✅ 이미 해결된 워게임 [${title}] 입니다. 다음으로 넘어갑니다.`);
      return;
    }

    let flag = null;

    // === 1단계: [함께실습] 강의에서 플래그 탐색 ===
    const togetherUrl =
      togetherPracticeMap[title] ||
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
          console.log(`🎯 [함께실습] 강의에서 플래그 직접 발견: ${flag}`);
        } else {
          // AI에게 분석 요청: 플래그 직접 추출 or 힌트 조합 or 이름 기반 추론
          console.log(`🤖 AI에게 [함께실습] 강의 분석 요청 중...`);
          try {
            const wargameProblemText = await page.evaluate(() => document.body.innerText.trim().substring(0, 3000));
            const systemPrompt = "당신은 드림핵(Dreamhack) 워게임 문제 풀이 전문가입니다.";
            const aiPrompt = `아래는 워게임 문제 "[${title}]"의 설명입니다:
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

        // 제출 후 모달/메시지 확인 - 개선된 버전
        const result = await page.evaluate(() => {
          const text = document.body.innerText;
          
          // 1. 먼저 메시지 분석 (모달 닫기 전에)
          const successKeywords = ['정답입니다', 'Correct', '축하합니다', '성공', '통과', '맞췄습니다'];
          const failureKeywords = ['아쉽게도 틀렸습니다', '틀렸', '오답', 'Incorrect', 'Wrong', '실패', 'Failed'];
          
          let isSuccess = false;
          let isFailure = false;
          
          // 텍스트 기반 판단
          for (const keyword of successKeywords) {
            if (text.includes(keyword)) {
              isSuccess = true;
              break;
            }
          }
          
          for (const keyword of failureKeywords) {
            if (text.includes(keyword)) {
              isFailure = true;
              break;
            }
          }
          
          // 2. 시각적 요소 확인 (클래스, 아이콘 등)
          const successElements = document.querySelectorAll('.is-success, .is-correct, .check-icon, .success-icon');
          const failureElements = document.querySelectorAll('.is-wrong, .is-incorrect, .is-error, .wrong-icon');
          
          if (successElements.length > 0) isSuccess = true;
          if (failureElements.length > 0) isFailure = true;
          
          // 3. 모달 닫기 버튼 클릭 (있으면)
          const alertBtn = document.querySelector('.el-message-box__btns .el-button--primary, .el-message-box__btns .btn-primary');
          if (alertBtn) {
            alertBtn.click();
          }
          
          return { isSuccess, isFailure };
        });

        if (result.isSuccess) {
          console.log(`🎉 워게임 [${title}] 정답 처리됨!`);
        } else if (result.isFailure) {
          console.log(`❌ 워게임 [${title}] 플래그 제출 실패(오답이거나 이미 풀었음). 넘어갑니다.`);
        } else {
          console.log(`⚠️ 워게임 [${title}] 제출 결과를 확인할 수 없습니다.`);
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

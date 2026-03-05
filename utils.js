const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CHROME_PATH, DELAY } = require('./config');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

puppeteer.use(StealthPlugin());

// 메인 레포 루트의 프로필 디렉토리 사용 (워크트리에서도 동일 세션 유지)
let REPO_ROOT;
try {
  const gitCommonDir = execSync('git rev-parse --git-common-dir', { cwd: __dirname, encoding: 'utf8' }).trim();
  const absGitDir = path.isAbsolute(gitCommonDir) ? gitCommonDir : path.resolve(__dirname, gitCommonDir);
  REPO_ROOT = path.dirname(absGitDir);
} catch {
  REPO_ROOT = __dirname;
}
const USER_PROFILE = path.join(REPO_ROOT, '.chrome_profile');

/**
 * Chrome을 사용자 전용 프로필 + 디버깅 모드로 실행, puppeteer 연결
 */
async function launchBrowser() {
  // 1. 기존 Chrome 정리 (안전하게 종료하도록 안내하거나 강제 종료)
  try {
    execSync('pkill -9 -f "Google Chrome" 2>/dev/null');
  } catch {}
  await sleep(2000);

  // 2. Chrome 실행
  logger.info('🌐 Chrome 실행 중...');
  const chrome = spawn(
    CHROME_PATH,
    [
      `--user-data-dir=${USER_PROFILE}`,
      '--profile-directory=Default', // Default 프로필 사용 (필요시 변경)
      '--remote-debugging-port=9222',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  // 3. stderr에서 WS endpoint 추출
  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Chrome 실행 타임아웃 (30초)\nstderr: ${stderr.substring(0, 500)}`));
    }, 30000);

    chrome.stderr.on('data', (data) => {
      stderr += data.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });

    chrome.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome 종료됨 (code: ${code})\nstderr: ${stderr.substring(0, 500)}`));
    });
  });

  logger.info('🔗 Chrome 연결 성공');

  // 4. puppeteer 연결
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
    protocolTimeout: 3000000, // 50분으로 타임아웃 대폭 증가
  });

  // cleanup 등록 (프로필은 유지 - 세션 보존)
  const cleanup = () => {
    try {
      chrome.kill('SIGTERM');
    } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit();
  });

  return browser;
}

/**
 * 로그인 상태 확인 + 미로그인 시 자동 로그인 시도
 */
async function ensureLoggedIn(page, email, password) {
  await safeGoto(page, 'https://dreamhack.io', { waitUntil: 'networkidle2' });

  const isLoggedIn = await page.evaluate(() => {
    // 로그인 시 user-icon에 사용자 이름 텍스트가 있음
    const icon = document.querySelector('.user-icon');
    if (!icon) return false;
    const text = icon.innerText?.trim();
    return text.length > 0 && !text.includes('로그인');
  });

  if (isLoggedIn) {
    logger.info('🔑 로그인 상태 확인됨');
    return;
  }

  // 자동 로그인 시도
  logger.info('🔑 자동 로그인 시도 중...');
  await safeGoto(page, 'https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
  
  try {
    // 이메일 입력 필드 찾기
    await page.waitForSelector('input[type="email"], input[name="email"], #email', { timeout: 5000 });
    await humanType(page, email);
    await randomDelay(500, 1000);
    
    // 비밀번호 입력 필드 찾기
    await page.waitForSelector('input[type="password"], input[name="password"], #password', { timeout: 5000 });
    await humanType(page, password);
    await randomDelay(500, 1000);
    
    // 로그인 버튼 찾기 및 클릭
    const loginBtn = await page.$('button[type="submit"], .login-button, .btn-primary');
    if (loginBtn) {
      await loginBtn.click();
      logger.info('🖱️ 로그인 버튼 클릭');
    } else {
      // 버튼을 찾지 못하면 Enter 키 입력
      await page.keyboard.press('Enter');
      logger.info('⌨️ Enter 키로 로그인 시도');
    }
    
    // 로그인 성공 대기 (최대 30초)
    await page.waitForFunction(() => {
      const icon = document.querySelector('.user-icon');
      if (!icon) return false;
      const text = icon.innerText?.trim();
      return text.length > 0 && !text.includes('로그인');
    }, { timeout: 30000 });
    
    logger.info('✅ 자동 로그인 성공!');
    return;
  } catch (error) {
    logger.warn(`⚠️ 자동 로그인 실패: ${error.message}`);
    logger.info('📌 수동 로그인 대기 모드로 전환합니다...');
  }

  // 자동 로그인 실패 시 수동 로그인 대기
  logger.warn('⚠️  로그인이 필요합니다!');
  logger.info('📌 열린 Chrome 창에서 드림핵에 로그인해주세요.');
  logger.info('⏳ 로그인 완료 대기 중...');

  // 로그인 완료까지 폴링 (최대 5분)
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    try {
      // dreamhack.io로 돌아왔는지 확인
      const url = page.url();
      if (!url.includes('dreamhack.io')) continue;

      const loggedIn = await page.evaluate(() => {
        const icon = document.querySelector('.user-icon');
        if (!icon) return false;
        const text = icon.innerText?.trim();
        return text.length > 0 && !text.includes('로그인');
      });
      if (loggedIn) {
        logger.info('🔑 로그인 완료!');
        return;
      }
    } catch {
      // 페이지 네비게이션 중일 수 있음
    }
  }

  throw new Error('로그인 타임아웃 (5분)');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 정규분포(가우시안) 난수 생성
 */
function gaussianRandom(mean, stdDev) {
  let u1 = Math.random();
  let u2 = Math.random();
  let z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * 무작위 대기 (가우시안 분포 적용)
 */
async function randomDelay(min, max) {
  // 가우시안 분포 사용 (중간값 근처에 집중)
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6; // 99.7%가 min~max 범위 내
  let delay = Math.floor(gaussianRandom(mean, stdDev));
  
  // 범위 제한
  delay = Math.max(min, Math.min(max, delay));

  if (process.env.TEST_MODE === '1') {
    return sleep(Math.min(delay, 500));
  }

  const minutes = Math.floor(delay / 60000);
  const seconds = ((delay % 60000) / 1000).toFixed(0);
  const display = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
  logger.info(`⏱️  대기 중... (${display})`);
  return sleep(delay);
}

/**
 * 사람처럼 위아래 무작위 스크롤
 */
async function randomScroll(page) {
  const scrolls = Math.floor(Math.random() * 6) + 5;
  for (let i = 0; i < scrolls; i++) {
    const direction = Math.random() > 0.5 ? 1 : -1;
    const amount = (Math.floor(Math.random() * 700) + 300) * direction;

    try {
      await page.evaluate((scrollAmount) => {
        window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
      }, amount);
    } catch (err) {
      // 프레임 분리(detached frame) 등 에러 시 무시하고 스크롤 종료 (네비게이션 중일 수 있음)
      break;
    }

    await randomDelay(DELAY.SCROLL_PAUSE_MIN, DELAY.SCROLL_PAUSE_MAX);
  }
}

/**
 * 사람처럼 한 글자씩 타이핑
 */
async function humanType(page, text) {
  for (const char of text) {
    await page.keyboard.type(char);
    const delay = Math.floor(Math.random() * (DELAY.TYPE_CHAR_MAX - DELAY.TYPE_CHAR_MIN + 1)) + DELAY.TYPE_CHAR_MIN;
    await sleep(delay);
  }
}

/**
 * 페이지 이동 시 재시도 로직 추가
 */
async function safeGoto(page, url, options = { waitUntil: 'networkidle2' }, maxRetries = 3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      await page.goto(url, options);
      return;
    } catch (error) {
      retries++;
      logger.warn(`⚠️ 페이지 이동 실패 (시도 ${retries}/${maxRetries}): ${url}`);
      if (retries >= maxRetries) {
        throw new Error(`페이지 이동 실패 (최대 재시도 초과): ${url} - ${error.message}`);
      }
      await sleep(3000 * retries); // 점진적 대기
    }
  }
}

/**
 * 강의 난이도 분석 및 동적 딜레이 계산
 */
async function getDynamicDelay(page) {
  try {
    const analysis = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const textLength = bodyText.length;
      const codeBlocks = document.querySelectorAll('pre, code, .hljs').length;
      const hasVideo = document.querySelector('video') !== null;
      const title = document.querySelector('h1, .lecture-title, .quiz-title')?.innerText || '';
      const hasQuiz = document.querySelector('.quiz-question, .quiz-title') !== null;
      
      return { 
        textLength, 
        codeBlocks, 
        hasVideo, 
        hasQuiz,
        title, 
        bodyText: bodyText.substring(0, 500) 
      };
    });
    
    let score = 0;
    
    // 키워드 분석
    const hardKeywords = ['어셈블리', '리버싱', '익스플로잇', 'ROP', 'shellcode', 'heap', 'stack', 'pwnable', 'x86-64', 'gdb', '디버깅', '메모리'];
    const easyKeywords = ['소개', '개요', '기초', '입문', '시작', '개념', '이란', '환경설정', '설치'];
    const text = (analysis.title + ' ' + analysis.bodyText).toLowerCase();
    
    hardKeywords.forEach(k => { if (text.includes(k)) score += 2; });
    easyKeywords.forEach(k => { if (text.includes(k)) score -= 1; });
    
    // 내용 길이 분석
    if (analysis.textLength > 5000) score += 2;
    else if (analysis.textLength > 2000) score += 1;
    
    if (analysis.codeBlocks > 5) score += 2;
    else if (analysis.codeBlocks > 2) score += 1;
    
    if (analysis.hasVideo) score += 2; // 영상은 시간이 더 걸림
    if (analysis.hasQuiz) score += 1;  // 퀴즈가 있으면 더 오래 체류
    
    // 난이도별 딜레이 반환
    if (score >= 5) {
      return { min: 120000, max: 300000, level: 'hard' }; // 2~5분
    } else if (score >= 2) {
      return { min: 60000, max: 180000, level: 'medium' }; // 1~3분
    } else {
      return { min: 30000, max: 90000, level: 'easy' }; // 30초~1.5분
    }
  } catch (error) {
    logger.warn(`⚠️ 난이도 분석 실패: ${error.message}`);
    // 기본값 반환
    return { min: 60000, max: 120000, level: 'medium' };
  }
}

module.exports = {
  launchBrowser,
  ensureLoggedIn,
  randomDelay,
  randomScroll,
  humanType,
  safeGoto,
  getDynamicDelay,
};

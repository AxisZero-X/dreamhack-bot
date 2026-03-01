const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CHROME_PATH, USER_DATA_DIR, PROFILE_NAME, DELAY } = require('./config');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const TMP_PROFILE = '/tmp/dreamhack_chrome_profile';

/**
 * Chrome 프로필 복사 후 디버깅 모드로 실행, puppeteer 연결
 */
async function launchBrowser() {
  // 1. 기존 Chrome 정리
  try { execSync('pkill -9 -f "Google Chrome" 2>/dev/null'); } catch {}
  await sleep(2000);

  // 2. 프로필 복사 (원본 잠금 우회, 쿠키는 Keychain으로 복호화 가능)
  console.log('🔄 Chrome 프로필 복사 중...');
  execSync(`rm -rf "${TMP_PROFILE}"`);
  execSync(`rsync -a --exclude='SingletonLock' --exclude='SingletonCookie' --exclude='SingletonSocket' --exclude='LOCK' --exclude='crashpad' --exclude='BrowserMetrics' "${USER_DATA_DIR}/" "${TMP_PROFILE}/"`);

  // 3. Chrome 디버깅 모드 실행
  console.log('🌐 Chrome 실행 중...');
  const chrome = spawn(CHROME_PATH, [
    `--user-data-dir=${TMP_PROFILE}`,
    `--profile-directory=${PROFILE_NAME}`,
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-gpu',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // 4. stderr에서 WS endpoint 추출
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

  console.log('🔗 Chrome 연결 성공');

  // 5. puppeteer 연결
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
  });

  // cleanup 등록
  const cleanup = () => {
    try { chrome.kill('SIGTERM'); } catch {}
    try { execSync(`rm -rf "${TMP_PROFILE}" 2>/dev/null`); } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(); });

  return browser;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 무작위 대기
 */
async function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  const minutes = Math.floor(delay / 60000);
  const seconds = ((delay % 60000) / 1000).toFixed(0);
  const display = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
  console.log(`⏱️  대기 중... (${display})`);
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

    await page.evaluate((scrollAmount) => {
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }, amount);

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

module.exports = {
  launchBrowser,
  randomDelay,
  randomScroll,
  humanType,
};

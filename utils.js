const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CHROME_PATH, DELAY } = require('./config');
const logger = require('./logger');

puppeteer.use(StealthPlugin());

/**
 * 브라우저 실행
 */
async function launchBrowser() {
  logger.info('🌐 브라우저 실행 중...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-infobars',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-extensions',
      '--mute-audio',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-translate',
      '--disable-logging',
      '--disable-breakpad',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-client-side-phishing-detection',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-prompt-on-repost',
      '--disable-background-networking',
      '--disable-component-cloud-policy',
    ],
  });
  return browser;
}

/**
 * 가우시안 분포 딜레이 (균등 분포 → 가우시안 분포로 변경)
 * 로그 출력을 최소화하여 반복적인 메시지 방지
 */
async function randomDelay(min, max) {
  // 균등 분포 → 가우시안 분포로 변경
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6; // 99.7% within ±3σ
  
  let delay;
  do {
    // Box-Muller transform for Gaussian distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    delay = mean + stdDev * z0;
  } while (delay < min || delay > max);
  
  const delayMs = Math.round(delay);
  const delaySec = Math.round(delayMs / 1000);
  
  // 긴 딜레이(5초 이상)만 로깅하여 반복적인 메시지 방지
  if (delaySec >= 5) {
    logger.debug(`⏱️ 대기 중... (${delaySec}초)`);
  }
  
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return delayMs;
}

/**
 * 동적 딜레이 계산 (상황에 맞는 딜레이)
 */
function getDynamicDelay(base, multiplier = 1) {
  return Math.round(base * (0.8 + Math.random() * 0.4) * multiplier);
}

/**
 * 무작위 스크롤 (사용자 행동 모방)
 */
async function randomScroll(page) {
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  
  if (scrollHeight > viewportHeight * 1.5) {
    const scrollTo = Math.floor(Math.random() * (scrollHeight - viewportHeight));
    await page.evaluate((y) => {
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, scrollTo);
    await randomDelay(300, 800);
  }
}

/**
 * 인간형 타이핑 (텍스트 입력 모방)
 */
async function humanType(page, selector, text, options = {}) {
  const { delayMin = 50, delayMax = 150 } = options;
  await page.focus(selector);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.value = '';
  }, selector);
  
  for (const char of text) {
    await page.type(selector, char, { delay: Math.random() * (delayMax - delayMin) + delayMin });
    // 가끔 실수 모방 (백스페이스)
    if (Math.random() < 0.05) {
      await page.keyboard.press('Backspace');
      await randomDelay(50, 150);
      await page.type(selector, char, { delay: Math.random() * (delayMax - delayMin) + delayMin });
    }
  }
}

/**
 * 드림핵 로그인 확인 및 수행
 */
async function ensureLoggedIn(page, email, password) {
  const currentUrl = page.url();
  
  // 이미 로그인된 상태인지 확인
  if (currentUrl.includes('dreamhack.io') && !currentUrl.includes('/login')) {
    try {
      await page.waitForSelector('.user-info, [data-testid="user-menu"]', { timeout: 5000 });
      logger.info('✅ 이미 로그인된 상태입니다.');
      return;
    } catch {
      // 로그인 필요
    }
  }
  
  logger.info('🔐 로그인 시도 중...');
  
  // 로그인 페이지로 이동
  await page.goto('https://dreamhack.io/login', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 4000);
  
  // 이메일 입력
  await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });
  await humanType(page, 'input[type="email"], input[name="email"]', email);
  await randomDelay(500, 1000);
  
  // 비밀번호 입력
  await humanType(page, 'input[type="password"], input[name="password"]', password);
  await randomDelay(500, 1000);
  
  // 로그인 버튼 클릭
  await page.click('button[type="submit"], .login-button, .el-button--primary');
  await randomDelay(3000, 6000);
  
  // 로그인 성공 확인
  try {
    await page.waitForSelector('.user-info, [data-testid="user-menu"]', { timeout: 10000 });
    logger.info('✅ 로그인 성공!');
  } catch (error) {
    logger.error('❌ 로그인 실패. 수동으로 확인해주세요.');
    throw error;
  }
}

module.exports = {
  launchBrowser,
  randomDelay,
  getDynamicDelay,
  randomScroll,
  humanType,
  ensureLoggedIn,
};
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
 * 드림핵 로그인 확인 및 수행 (개선된 버전)
 */
async function ensureLoggedIn(page, email, password) {
  const currentUrl = page.url();
  
  // 이미 로그인된 상태인지 확인 (다양한 셀렉터로 시도)
  if (currentUrl.includes('dreamhack.io') && !currentUrl.includes('/login')) {
    try {
      // 다양한 로그인 성공 셀렉터 시도
      const loginSelectors = [
        '.user-info',
        '[data-testid="user-menu"]',
        '.user-menu',
        '[class*="user"]',
        '.avatar',
        '.profile',
        '.el-dropdown', // 드림핵에서 사용하는 드롭다운 메뉴
        'img[src*="avatar"]',
        'button:has(svg)', // 아이콘 버튼
        'header button', // 헤더의 버튼
        '.header-actions button'
      ];
      
      // 3초 내에 로그인 상태 확인 시도
      await page.waitForSelector(loginSelectors.join(', '), { timeout: 3000 });
      logger.info('✅ 이미 로그인된 상태입니다.');
      return;
    } catch {
      // 로그인 필요 - 계속 진행
    }
  }
  
  logger.info('🔐 로그인 시도 중...');
  
  // 로그인 페이지로 이동
  await page.goto('https://dreamhack.io/login', { waitUntil: 'networkidle2' });
  await randomDelay(2000, 4000);
  
  // 이메일 입력 필드 찾기 (다양한 셀렉터 시도)
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="이메일"]',
    'input[placeholder*="Email"]',
    '#email',
    '.email-input'
  ];
  
  try {
    await page.waitForSelector(emailSelectors.join(', '), { timeout: 10000 });
    await humanType(page, emailSelectors.join(', '), email);
  } catch (error) {
    logger.error('❌ 이메일 입력 필드를 찾을 수 없습니다.');
    throw error;
  }
  
  await randomDelay(500, 1000);
  
  // 비밀번호 입력 필드 찾기
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[placeholder*="비밀번호"]',
    'input[placeholder*="Password"]',
    '#password',
    '.password-input'
  ];
  
  try {
    await page.waitForSelector(passwordSelectors.join(', '), { timeout: 5000 });
    await humanType(page, passwordSelectors.join(', '), password);
  } catch (error) {
    logger.error('❌ 비밀번호 입력 필드를 찾을 수 없습니다.');
    throw error;
  }
  
  await randomDelay(500, 1000);
  
  // 로그인 버튼 클릭
  const loginButtonSelectors = [
    'button[type="submit"]',
    '.login-button',
    '.el-button--primary',
    'button:contains("로그인")',
    'button:contains("Login")',
    '.submit-button'
  ];
  
  try {
    await page.waitForSelector(loginButtonSelectors.join(', '), { timeout: 5000 });
    await page.click(loginButtonSelectors.join(', '));
  } catch (error) {
    logger.error('❌ 로그인 버튼을 찾을 수 없습니다.');
    throw error;
  }
  
  await randomDelay(3000, 6000);
  
  // 로그인 성공 확인 (다양한 방법으로 시도)
  let loginSuccess = false;
  let errorMessage = '';
  
  // 방법 1: 다양한 셀렉터로 로그인 상태 확인
  const successSelectors = [
    '.user-info',
    '[data-testid="user-menu"]',
    '.user-menu',
    '[class*="user"]',
    '.avatar',
    '.profile',
    '.el-dropdown',
    'img[src*="avatar"]',
    'header button',
    '.header-actions button'
  ];
  
  try {
    await page.waitForSelector(successSelectors.join(', '), { timeout: 15000 });
    logger.info('✅ 로그인 성공! (셀렉터 확인)');
    loginSuccess = true;
  } catch (error) {
    errorMessage = `셀렉터 확인 실패: ${error.message}`;
  }
  
  // 방법 2: URL 확인 (로그인 후 특정 페이지로 이동하는지)
  if (!loginSuccess) {
    const newUrl = page.url();
    if (!newUrl.includes('/login') && newUrl.includes('dreamhack.io')) {
      logger.info('✅ 로그인 성공! (URL 확인)');
      loginSuccess = true;
    } else {
      errorMessage += ` | URL 확인 실패: ${newUrl}`;
    }
  }
  
  // 방법 3: 페이지 텍스트 확인 (로그인 실패 메시지가 없는지)
  if (!loginSuccess) {
    const pageText = await page.evaluate(() => document.body.innerText);
    const failureKeywords = ['잘못된', '틀렸', '오류', '실패', 'error', 'invalid', 'incorrect'];
    const hasFailure = failureKeywords.some(keyword => pageText.toLowerCase().includes(keyword));
    
    if (!hasFailure) {
      logger.info('✅ 로그인 성공! (텍스트 확인)');
      loginSuccess = true;
    } else {
      errorMessage += ` | 텍스트 확인 실패: 실패 키워드 발견`;
    }
  }
  
  if (!loginSuccess) {
    logger.error(`❌ 로그인 실패. 수동으로 확인해주세요. 에러: ${errorMessage}`);
    
    // 디버깅을 위한 스크린샷 캡처
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `./logs/login_failure_${timestamp}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info(`📸 로그인 실패 스크린샷 저장: ${screenshotPath}`);
    } catch (screenshotError) {
      logger.warn(`⚠️ 스크린샷 캡처 실패: ${screenshotError.message}`);
    }
    
    throw new Error(`로그인 실패: ${errorMessage}`);
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
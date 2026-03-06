const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CHROME_PATH, DELAY } = require('./config');
const logger = require('./logger');
const { retryManager } = require('./retryManager');
const { errorHandler } = require('./errorHandler');

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
      '--lang=ko', // 한국어 언어 설정
      '--accept-lang=ko', // 언어 수락 설정 추가
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
 * 페이지에서 난이도 정보 추출 및 딜레이 계산
 */
async function getDynamicDelayFromPage(page) {
  try {
    // 페이지에서 난이도 정보 추출
    const difficulty = await page.evaluate(() => {
      // 다양한 방법으로 난이도 추출 시도
      const bodyText = document.body.innerText.toLowerCase();

      if (bodyText.includes('어려움') || bodyText.includes('hard') || bodyText.includes('advanced')) {
        return 'hard';
      } else if (bodyText.includes('쉬움') || bodyText.includes('easy') || bodyText.includes('beginner')) {
        return 'easy';
      } else {
        return 'medium';
      }
    });

    // 난이도별 딜레이 설정
    const delays = {
      easy: { min: 30000, max: 60000 },    // 30-60초
      medium: { min: 60000, max: 120000 },  // 60-120초
      hard: { min: 90000, max: 180000 }     // 90-180초
    };

    const { min, max } = delays[difficulty] || delays.medium;

    return {
      level: difficulty,
      min,
      max
    };
  } catch (error) {
    // 에러 발생 시 기본값 반환
    return {
      level: 'medium',
      min: 60000,
      max: 120000
    };
  }
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
 * 드림핵 로그인 확인 및 수행 (강화된 버전)
 * 실제로 보호된 콘텐츠에 접근할 수 있는지 확인
 * 에러 처리 및 재시도 기능 통합
 */
async function ensureLoggedIn(page, email, password) {
  return await errorHandler.withErrorHandling(async () => {
    const currentUrl = page.url();

    // 이미 로그인된 상태인지 확인 - 실제 콘텐츠 접근 테스트
    if (currentUrl.includes('dreamhack.io') && !currentUrl.includes('/login')) {
      try {
        // 실제로 로그인되었는지 확인: 커리큘럼 페이지에 접근 시도
        const testUrl = 'https://dreamhack.io/euser/curriculums/916'; // 테스트용 커리큘럼
        await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 10000 });
        await randomDelay(2000, 3000);

        // 실제 강의 항목이 보이는지 확인
        const hasContent = await page.evaluate(() => {
          // 다양한 강의 항목 셀렉터
          const contentSelectors = [
            '.entity',
            '.lecture-item',
            '.course-item',
            '.curriculum-item',
            '[class*="item"]',
            '.entity-title',
            '.title'
          ];

          return contentSelectors.some(selector => {
            const elements = document.querySelectorAll(selector);
            return Array.from(elements).some(el =>
              el.offsetParent !== null &&
              el.innerText &&
              el.innerText.trim().length > 0
            );
          });
        });

        if (hasContent) {
          logger.info('✅ 이미 로그인된 상태입니다. (실제 콘텐츠 확인)');
          return;
        } else {
          logger.warn('⚠️ 로그인 상태 불확실 - 콘텐츠를 찾을 수 없습니다. 재로그인 시도합니다.');
        }
      } catch (error) {
        logger.warn(`⚠️ 로그인 상태 확인 중 에러: ${error.message}. 재로그인 시도합니다.`);
      }
    }

    logger.info('🔐 로그인 시도 중...');

    // 로그인 페이지로 이동
    await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    // 이메일 입력 (Value 직접 설정 + 이벤트 발생으로 버튼 활성화 유도)
    const emailSelector = 'input#login-email';
    try {
      await page.waitForSelector(emailSelector, { timeout: 10000 });

      await page.evaluate((selector, val) => {
        const el = document.querySelector(selector);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, emailSelector, email);

      logger.info(`📧 이메일 입력 완료 (길이: ${email ? email.length : 0})`);
      await page.screenshot({ path: './logs/debug_email_typed.png' });
    } catch (error) {
      logger.error('❌ 이메일 입력 필드를 찾을 수 없습니다.');
      throw error;
    }

    await randomDelay(800, 1200);

    // 비밀번호 입력
    const passwordSelector = 'input#login-password';
    try {
      await page.waitForSelector(passwordSelector, { timeout: 10000 });

      await page.evaluate((selector, val) => {
        const el = document.querySelector(selector);
        if (el) {
          el.value = val;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, passwordSelector, password);

      logger.info(`🔐 비밀번호 입력 완료 (길이: ${password ? password.length : 0})`);
      await page.screenshot({ path: './logs/debug_password_typed.png' });
    } catch (error) {
      logger.error('❌ 비밀번호 입력 필드를 찾을 수 없습니다.');
      throw error;
    }

    await randomDelay(1000, 2000); // 버튼 활성화 대기 (중요)

    // 로그인 버튼 클릭 (업데이트된 셀렉터)
    const loginButtonSelectors = [
      '.btn-login',
      '.login-form button',
      'button[type="submit"]',
      '.btn.btn-login',
      '.dh3-button.btn-secondary',
      '.submit-button',
      '#login-button',
      '[data-testid="login-button"]'
    ];

    // 로그인 버튼 클릭 또는 엔터키 입력
    try {
      logger.info('🖱️ 로그인 시도 (Enter 키 입력)...');
      await page.focus(passwordSelector);
      await page.keyboard.press('Enter');

      // 약간의 대기 후 버튼 상태 확인 및 클릭 (엔터가 안 먹힐 경우 대비)
      await randomDelay(1500, 2500);

      const isStillOnLoginPage = page.url().includes('/users/login');
      if (isStillOnLoginPage) {
        logger.info('🖱️ 여전히 로그인 페이지입니다. 버튼 직접 클릭 시도...');
        const specificLoginButton = 'button.btn-login.variant-primary';
        const found = await page.waitForSelector(specificLoginButton, { timeout: 5000 }).catch(() => null);

        if (found) {
          await page.screenshot({ path: './logs/debug_before_click_retry.png' });
          await page.click(specificLoginButton);
          logger.info('✅ 로그인 버튼 클릭 완료');
        } else {
          logger.warn('⚠️ 특정 로그인 버튼을 찾을 수 없습니다. JavaScript로 모든 로그인 버튼 클릭 시도...');
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const loginBtn = buttons.find(btn =>
              btn.offsetParent !== null &&
              !btn.disabled &&
              (btn.innerText.includes('로그인') || btn.className.includes('btn-login'))
            );
            if (loginBtn) loginBtn.click();
          });
        }
      }
    } catch (error) {
      logger.error('❌ 로그인 동작 수행 중 에러 발생:', error.message);
    }

    await randomDelay(3000, 6000);

    // 로그인 성공 확인 - 실제 콘텐츠 접근 테스트
    let loginSuccess = false;
    let errorMessage = '';

    // 방법 1: 실제 커리큘럼 콘텐츠 접근 테스트 (가장 신뢰성 높음)
    try {
      // 커리큘럼 페이지로 이동 시도
      const testUrl = 'https://dreamhack.io/euser/curriculums/916';
      await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 15000 });
      await randomDelay(2000, 3000);

      // 실제 강의 콘텐츠가 보이는지 확인
      const hasActualContent = await page.evaluate(() => {
        // 강의 항목이 실제로 보이는지 확인
        const contentSelectors = [
          'a.title',
          'a.action-text',
          '.lecture-item',
          '.course-item',
          '.curriculum-item',
          '.curriculum-list .entity',
          '.curriculum-detail'
        ];

        return contentSelectors.some(selector => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).some(el =>
            el.offsetParent !== null &&
            el.textContent &&
            el.textContent.trim().length > 0
          );
        });
      });

      if (hasActualContent) {
        logger.info('✅ 로그인 성공! (실제 콘텐츠 확인)');
        loginSuccess = true;
      } else {
        errorMessage = '실제 콘텐츠 확인 실패: 강의 항목을 찾을 수 없음';
      }
    } catch (error) {
      errorMessage = `실제 콘텐츠 확인 실패: ${error.message}`;
    }

    // 방법 2: 다양한 셀렉터로 로그인 상태 확인 (보조 확인)
    if (!loginSuccess) {
      try {
        const successSelectors = [
          'a[href="/myaccount/"]',
          'a.menu-item[href="/euser/mypage"]',
          '.user-info',
          '[data-testid="user-menu"]',
          '.user-menu',
          '.avatar',
          '.profile',
          '.el-dropdown',
          'img[src*="avatar"]'
        ];

        await page.waitForSelector(successSelectors.join(', '), { timeout: 10000 });
        logger.info('✅ 로그인 성공! (셀렉터 확인)');
        loginSuccess = true;
      } catch (error) {
        errorMessage += ` | 셀렉터 확인 실패: ${error.message}`;
      }
    }

    // (방법 3, 4번은 텍스트 및 URL 기반 불확실한 인증이라 제거함)

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

    logger.info('🎉 로그인 완료! 실제 콘텐츠 접근 가능 확인됨.');
  }, {
    page,
    credentials: { email, password },
    operation: 'login'
  });
}

module.exports = {
  launchBrowser,
  randomDelay,
  getDynamicDelay,
  getDynamicDelayFromPage,
  randomScroll,
  humanType,
  ensureLoggedIn,
};

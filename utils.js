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
/**
 * 페이지에서 난이도 정보 추출 및 딜레이 계산
 */
async function getDynamicDelayFromPage(page) {
  try {
    // 페이지에서 난이도 정보 추출 (텍스트 길이 기반)
    const { wordCount, hasVideo } = await page.evaluate(() => {
      // 본문 텍스트 길이 (불필요한 공백 제거)
      const text = document.body.innerText || '';
      const cleanText = text.replace(/\s+/g, ' ').trim();
      const hasVideo = document.querySelectorAll('video, iframe[src*="youtube"]').length > 0;

      return {
        wordCount: cleanText.length,
        hasVideo
      };
    });

    // config.js의 DELAY를 불러와 기본값으로 활용
    const { DELAY } = require('./config');

    // 테스트 모드인 경우
    if (DELAY.PAGE_STAY_MIN && DELAY.PAGE_STAY_MIN < 5000) {
      return { level: 'test', min: DELAY.PAGE_STAY_MIN, max: DELAY.PAGE_STAY_MAX };
    }

    let difficulty = 'medium';
    let minDelay, maxDelay;

    // 빠른 스키밍 속도 (1000자/분), 꼼꼼한 독해 속도 (800자/분)
    const charsPerMinFast = 1000;
    const charsPerMinSlow = 800;

    if (wordCount < 500) {
      // 500자 미만: 약 30~40초 소요 
      difficulty = 'very_easy';
      minDelay = Math.max(15000, Math.floor((wordCount / charsPerMinFast) * 60000));
      maxDelay = Math.max(30000, Math.floor((wordCount / charsPerMinSlow) * 60000) + 15000);
    } else if (wordCount < 1500) {
      // 1500자 미만
      difficulty = 'easy';
      minDelay = Math.floor((wordCount / charsPerMinFast) * 60000);
      maxDelay = Math.floor((wordCount / charsPerMinSlow) * 60000) + 30000;
      minDelay = Math.max(minDelay, 20000); // 최소 20초 대기
    } else if (wordCount < 4000) {
      // 4000자 미만
      difficulty = 'medium';
      minDelay = Math.floor((wordCount / charsPerMinFast) * 60000);
      maxDelay = Math.floor((wordCount / charsPerMinSlow) * 60000) + 60000;
      minDelay = Math.max(minDelay, 45000); // 최소 45초 대기
    } else if (wordCount < 8000) {
      // 8000자 미만
      difficulty = 'hard';
      minDelay = Math.floor((wordCount / charsPerMinFast) * 60000);
      maxDelay = Math.floor((wordCount / charsPerMinSlow) * 60000) + 90000;
      minDelay = Math.max(minDelay, 90000); // 최소 1.5분 대기
    } else {
      // 8000자 이상
      difficulty = 'very_hard';
      minDelay = Math.floor((wordCount / charsPerMinFast) * 60000);
      maxDelay = Math.floor((wordCount / charsPerMinSlow) * 60000) + 120000;
      minDelay = Math.max(minDelay, 120000); // 최소 2분 대기
    }

    // 비디오가 있는 경우 시청 시간 고려해 추가 딜레이 (최소 3분 추가, 최대 제한 없음)
    if (hasVideo) {
      minDelay = Math.max(minDelay, 180000); // 비디오가 있으면 최소 3분 시청
      maxDelay = maxDelay + 300000; // 최대 시간에 5분 추가 
      difficulty += '_video';
    }

    return {
      level: difficulty,
      min: minDelay,
      max: maxDelay
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

    // 이메일 입력 필드 찾기 (다양한 셀렉터로 시도)
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="이메일"]',
      'input[placeholder*="Email"]',
      '#email',
      '.email-input',
      'input[autocomplete="email"]',
      'input[autocomplete="username"]'
    ];

    try {
      await page.waitForSelector(emailSelectors.join(', '), { timeout: 10000 });
      await humanType(page, emailSelectors.join(', '), email);
    } catch (error) {
      logger.error('❌ 이메일 입력 필드를 찾을 수 없습니다.');
      throw error;
    }

    await randomDelay(500, 1000);

    // 비밀번호 입력 필드 찾기 - 정확한 셀렉터 사용
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="비밀번호"]',
      'input[placeholder*="Password"]',
      '#password',
      '.password-input',
      'input[autocomplete="current-password"]',
      'input[autocomplete="password"]'
    ];

    try {
      // 정확한 비밀번호 필드만 선택 (이메일 필드와 혼동 방지)
      await page.waitForSelector(passwordSelectors.join(', '), { timeout: 5000 });

      // 비밀번호 필드가 정말 비밀번호 필드인지 확인
      const isPasswordField = await page.evaluate((selectors) => {
        const selectorList = selectors.split(', ');
        for (const selector of selectorList) {
          const element = document.querySelector(selector);
          if (element && element.type === 'password') {
            return true;
          }
        }
        return false;
      }, passwordSelectors.join(', '));

      if (!isPasswordField) {
        throw new Error('비밀번호 필드가 아닌 다른 필드가 선택되었습니다.');
      }

      await humanType(page, passwordSelectors.join(', '), password);
    } catch (error) {
      logger.error('❌ 비밀번호 입력 필드를 찾을 수 없습니다.');
      throw error;
    }

    await randomDelay(500, 1000);

    // 로그인 버튼 클릭 (업데이트된 셀렉터)
    const loginButtonSelectors = [
      'button[type="submit"]',
      '.login-button',
      '.btn-login',
      '.btn.btn-login',
      '.dh3-button',
      '.btn-secondary',
      'button:contains("로그인")',
      'button:contains("Login")',
      '.submit-button',
      '#login-button',
      '[data-testid="login-button"]'
    ];

    try {
      // 먼저 버튼이 활성화될 때까지 대기 (비밀번호 입력 후)
      await page.waitForFunction(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginButton = buttons.find(btn =>
          btn.offsetParent !== null &&
          !btn.disabled &&
          !btn.classList.contains('disabled') &&
          (btn.innerText.includes('로그인') || btn.innerText.includes('Login'))
        );
        return loginButton !== undefined;
      }, { timeout: 10000 });

      // 셀렉터로 클릭 시도
      await page.waitForSelector(loginButtonSelectors.join(', '), { timeout: 10000 });
      await page.click(loginButtonSelectors.join(', '));
    } catch (error) {
      logger.error('❌ 로그인 버튼을 찾을 수 없습니다. JavaScript로 직접 클릭 시도...');

      // 대체 방법: JavaScript로 직접 클릭 시도
      try {
        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const loginButton = buttons.find(btn =>
            btn.offsetParent !== null &&
            !btn.disabled &&
            !btn.classList.contains('disabled') &&
            (btn.innerText.includes('로그인') || btn.innerText.includes('Login'))
          );
          if (loginButton) {
            loginButton.click();
            return true;
          }
          return false;
        });

        if (clicked) {
          logger.info('✅ JavaScript로 로그인 버튼 클릭 성공');
        } else {
          logger.error('❌ JavaScript로도 로그인 버튼을 찾을 수 없습니다.');
          throw error;
        }
      } catch (jsError) {
        logger.error('❌ JavaScript 실행 중 에러:', jsError.message);
        throw error;
      }
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
          '.entity',
          '.lecture-item',
          '.course-item',
          '.curriculum-item',
          '.entity-title',
          '.title',
          '[class*="item"]',
          '.action-text'
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

        await page.waitForSelector(successSelectors.join(', '), { timeout: 10000 });
        logger.info('✅ 로그인 성공! (셀렉터 확인)');
        loginSuccess = true;
      } catch (error) {
        errorMessage += ` | 셀렉터 확인 실패: ${error.message}`;
      }
    }

    // 방법 3: URL 확인 (로그인 후 특정 페이지로 이동하는지)
    if (!loginSuccess) {
      const newUrl = page.url();
      if (!newUrl.includes('/login') && newUrl.includes('dreamhack.io')) {
        logger.info('✅ 로그인 성공! (URL 확인)');
        loginSuccess = true;
      } else {
        errorMessage += ` | URL 확인 실패: ${newUrl}`;
      }
    }

    // 방법 4: 페이지 텍스트 확인 (로그인 실패 메시지가 없는지)
    if (!loginSuccess) {
      const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
      const failureKeywords = ['잘못된', '틀렸', '오류', '실패', 'error', 'invalid', 'incorrect', 'wrong'];
      const hasFailure = failureKeywords.some(keyword => pageText.includes(keyword));

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

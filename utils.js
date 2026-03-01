const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CHROME_PATH, USER_DATA_DIR, PROFILE_NAME, DELAY } = require('./config');

puppeteer.use(StealthPlugin());

/**
 * 스텔스 브라우저 실행 (실제 크롬 프로필 연동)
 */
async function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    userDataDir: USER_DATA_DIR,
    args: [
      `--profile-directory=${PROFILE_NAME}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: null,
  });
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
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 사람처럼 위아래 무작위 스크롤
 */
async function randomScroll(page) {
  const scrolls = Math.floor(Math.random() * 6) + 5; // 5~10회
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
    await new Promise(r => setTimeout(r, delay));
  }
}

module.exports = {
  launchBrowser,
  randomDelay,
  randomScroll,
  humanType,
};

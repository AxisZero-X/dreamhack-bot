require('dotenv').config();
const { createCursor } = require('ghost-cursor');
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');
const aiProvider = require('./aiProvider');

const TARGET_QUIZ_URL = 'https://learn.dreamhack.io/quiz/64';

(async () => {
  console.log(`🎯 지정된 퀴즈 해결 시작: ${TARGET_QUIZ_URL}\n`);

  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);

  try {
    await ensureLoggedIn(page);
    await page.goto(TARGET_QUIZ_URL, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    // bot.js의 solveQuiz 함수를 가져오거나 유사하게 구현
    // 여기서는 bot.js의 로직을 직접 실행하기 위해 bot.js를 수정하여 특정 URL만 처리하게 하는 것이 안전함
    console.log('🚀 bot.js를 사용하여 퀴즈 풀이 로직 실행...');

  } catch (err) {
    console.error('❌ 에러 발생:', err.message);
  }
})();

const { ensureLoggedIn, launchBrowser, randomDelay } = require('./utils');
const logger = require('./logger');

async function testLogin() {
  console.log('테스트 시작...');
  
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  try {
    // 테스트 계정 정보
    const email = 'test@example.com';
    const password = 'testpassword';
    
    console.log('ensureLoggedIn 함수 호출...');
    await ensureLoggedIn(page, email, password);
    
    console.log('테스트 완료');
  } catch (error) {
    console.error('테스트 중 에러:', error.message);
  } finally {
    console.log('브라우저 종료...');
    await browser.close();
  }
}

// 로거 설정
logger.transports.forEach(transport => {
  transport.level = 'info';
});

testLogin();
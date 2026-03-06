/**
 * 실제 bot.js의 로그인 부분만 테스트하는 스크립트
 */
const { createCursor } = require('ghost-cursor');
const { launchBrowser, ensureLoggedIn, randomDelay } = require('./utils');
const logger = require('./logger');

async function testBotLogin() {
  console.log('🚀 bot.js 로그인 부분 테스트 시작...');
  console.log('━'.repeat(50));
  
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const cursor = createCursor(page);
  
  try {
    // bot.js에서 사용하는 방식으로 로그인 정보 입력 받기
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const email = await new Promise((resolve) => {
      rl.question('📧 드림핵 이메일을 입력하세요: ', (answer) => {
        resolve(answer.trim());
      });
    });
    
    const password = await new Promise((resolve) => {
      rl.question('🔐 비밀번호를 입력하세요: ', { mask: '*' }, (answer) => {
        resolve(answer.trim());
      });
    });
    
    rl.close();
    
    console.log(`\n✅ 로그인 정보 입력 완료 (이메일: ${email})`);
    console.log('🛡️  Anomaly Detection 우회 모드 활성화\n');
    
    // === 0단계: 로그인 확인 (bot.js와 동일) ===
    console.log('🔐 ensureLoggedIn 함수 호출 중...');
    await ensureLoggedIn(page, email, password);
    
    console.log('\n✅ 로그인 성공!');
    
    // 추가 확인
    const currentUrl = page.url();
    console.log(`🌐 현재 URL: ${currentUrl}`);
    
    const pageTitle = await page.title();
    console.log(`📄 페이지 제목: ${pageTitle}`);
    
    // 커리큘럼 페이지로 이동 테스트 (bot.js의 다음 단계)
    console.log('\n📚 커리큘럼 페이지 접속 테스트...');
    await page.goto('https://dreamhack.io/euser/curriculums/916', { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);
    
    const curriculumTitle = await page.title();
    console.log(`📄 커리큘럼 페이지 제목: ${curriculumTitle}`);
    
    // 페이지 내용 확인
    const hasCurriculum = await page.evaluate(() => {
      return document.body.innerText.includes('커리큘럼') || 
             document.querySelector('.entity, .lecture-item') !== null;
    });
    
    if (hasCurriculum) {
      console.log('✅ 커리큘럼 페이지 로드 성공');
    } else {
      console.log('⚠️ 커리큘럼 페이지 내용 확인 필요');
    }
    
    // 10초 대기 후 종료
    console.log('\n⏱️ 10초 후 브라우저 종료...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('\n❌ 테스트 중 에러 발생:', error.message);
    console.error('에러 상세:', error.stack);
    
    // 에러 발생 시 스크린샷 캡처
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `./logs/bot_login_test_error_${timestamp}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 에러 스크린샷 저장: ${screenshotPath}`);
    } catch (screenshotError) {
      console.error('⚠️ 스크린샷 캡처 실패:', screenshotError.message);
    }
    
  } finally {
    console.log('\n🔒 브라우저 종료 중...');
    await browser.close();
    console.log('🏁 테스트 종료');
  }
}

// 로거 설정
logger.transports.forEach(transport => {
  transport.level = 'info';
});

// 테스트 실행
testBotLogin().catch(error => {
  console.error('테스트 실행 중 치명적 에러:', error);
  process.exit(1);
});
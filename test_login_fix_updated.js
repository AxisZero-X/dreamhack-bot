const { ensureLoggedIn, launchBrowser } = require('./utils');
const logger = require('./logger');

async function testLoginFixUpdated() {
  console.log('🚀 업데이트된 로그인 수정 테스트 시작...');
  
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  try {
    // 테스트 계정 정보
    const email = process.env.DREAMHACK_EMAIL || 'test@example.com';
    const password = process.env.DREAMHACK_PASSWORD || 'testpassword';
    
    console.log(`📧 테스트 계정: ${email}`);
    console.log('🔐 ensureLoggedIn 함수 호출 중...');
    
    await ensureLoggedIn(page, email, password);
    
    console.log('✅ 테스트 완료 - 로그인 성공!');
    
    // 추가 확인
    const currentUrl = page.url();
    console.log(`🌐 현재 URL: ${currentUrl}`);
    
    const pageTitle = await page.title();
    console.log(`📄 페이지 제목: ${pageTitle}`);
    
    // 사용자 정보 확인
    const userInfo = await page.evaluate(() => {
      const userElements = document.querySelectorAll('.user-info, .avatar, .profile, [class*="user"]');
      return Array.from(userElements).map(el => el.innerText || el.alt || el.src).filter(Boolean);
    });
    
    if (userInfo.length > 0) {
      console.log(`👤 사용자 정보 발견: ${userInfo.slice(0, 3).join(', ')}`);
    }
    
    // 10초 대기 후 브라우저 종료
    console.log('⏱️ 10초 후 브라우저 종료...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('❌ 테스트 중 에러 발생:', error.message);
    console.error('에러 상세:', error.stack);
    
    // 에러 발생 시 스크린샷 캡처
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = `./logs/test_error_updated_${timestamp}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 에러 스크린샷 저장: ${screenshotPath}`);
    } catch (screenshotError) {
      console.error('⚠️ 스크린샷 캡처 실패:', screenshotError.message);
    }
    
    // 현재 페이지 HTML 저장
    try {
      const html = await page.content();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const htmlPath = `./logs/test_error_updated_${timestamp}.html`;
      require('fs').writeFileSync(htmlPath, html);
      console.log(`📄 HTML 저장: ${htmlPath}`);
    } catch (htmlError) {
      console.error('⚠️ HTML 저장 실패:', htmlError.message);
    }
    
  } finally {
    console.log('🔒 브라우저 종료 중...');
    await browser.close();
    console.log('🏁 테스트 종료');
  }
}

// 로거 설정
logger.transports.forEach(transport => {
  transport.level = 'info';
});

// 환경 변수 확인
if (!process.env.DREAMHACK_EMAIL || !process.env.DREAMHACK_PASSWORD) {
  console.warn('⚠️ 환경 변수 DREAMHACK_EMAIL 또는 DREAMHACK_PASSWORD가 설정되지 않았습니다.');
  console.warn('   기본 테스트 계정을 사용합니다. 실제 테스트를 위해 .env 파일을 설정하세요.');
  console.warn('   .env 파일 예시:');
  console.warn('   DREAMHACK_EMAIL=your_email@example.com');
  console.warn('   DREAMHACK_PASSWORD=your_password');
  console.warn('\n   또는 테스트 시 직접 입력하세요.');
}

// 테스트 실행
testLoginFixUpdated().catch(error => {
  console.error('테스트 실행 중 치명적 에러:', error);
  process.exit(1);
});
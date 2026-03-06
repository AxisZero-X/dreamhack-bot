const { ensureLoggedIn, launchBrowser } = require('./utils');
const logger = require('./logger');
const readline = require('readline');

async function testLoginInteractive() {
  console.log('🚀 인터랙티브 로그인 테스트 시작...');
  
  // 사용자 입력을 위한 인터페이스 생성
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // 계정 정보 입력 받기
  const email = await new Promise((resolve) => {
    rl.question('📧 드림핵 이메일을 입력하세요: ', (answer) => {
      resolve(answer.trim());
    });
  });
  
  const password = await new Promise((resolve) => {
    rl.question('🔐 비밀번호를 입력하세요 (입력이 가려집니다): ', { mask: '*' }, (answer) => {
      resolve(answer.trim());
    });
  });
  
  rl.close();
  
  console.log(`\n📧 입력된 이메일: ${email}`);
  console.log('🔐 비밀번호 입력 완료');
  console.log('🌐 브라우저 실행 중...');
  
  const browser = await launchBrowser();
  const page = await browser.newPage();
  
  try {
    console.log('🔐 ensureLoggedIn 함수 호출 중...');
    
    await ensureLoggedIn(page, email, password);
    
    console.log('✅ 로그인 성공!');
    
    // 추가 확인 정보 출력
    const currentUrl = page.url();
    console.log(`🌐 현재 URL: ${currentUrl}`);
    
    const pageTitle = await page.title();
    console.log(`📄 페이지 제목: ${pageTitle}`);
    
    // 사용자 정보 확인
    const userInfo = await page.evaluate(() => {
      const userElements = document.querySelectorAll('.user-info, .avatar, .profile, [class*="user"], .el-dropdown, header button');
      return Array.from(userElements).map(el => {
        if (el.tagName === 'IMG') return `이미지: ${el.src || el.alt}`;
        return el.innerText.trim() || el.getAttribute('aria-label') || el.className;
      }).filter(Boolean).slice(0, 5);
    });
    
    if (userInfo.length > 0) {
      console.log(`👤 발견된 사용자 요소: ${userInfo.join(', ')}`);
    }
    
    console.log('\n📊 로그인 상태 확인 완료!');
    console.log('⏱️ 10초 후 브라우저가 자동으로 종료됩니다...');
    console.log('   (수동으로 종료하려면 Ctrl+C를 누르세요)');
    
    // 10초 대기
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('\n❌ 로그인 실패!');
    console.error(`에러 메시지: ${error.message}`);
    
    if (error.message.includes('셀렉터 확인 실패')) {
      console.error('\n🔍 문제 분석:');
      console.error('   - 로그인은 성공했지만 사용자 메뉴 셀렉터를 찾지 못함');
      console.error('   - 드림핵 UI가 변경되었을 수 있음');
      console.error('   - URL 확인이나 텍스트 확인으로 로그인 성공을 판단할 수 있음');
    } else if (error.message.includes('이메일 입력 필드') || error.message.includes('비밀번호 입력 필드')) {
      console.error('\n🔍 문제 분석:');
      console.error('   - 로그인 페이지의 입력 필드 구조가 변경됨');
      console.error('   - 드림핵 로그인 페이지 업데이트 필요');
    } else if (error.message.includes('로그인 버튼')) {
      console.error('\n🔍 문제 분석:');
      console.error('   - 로그인 버튼 셀렉터를 찾지 못함');
      console.error('   - 버튼 텍스트나 클래스가 변경됨');
    }
    
    // 현재 페이지 정보 출력
    try {
      const currentUrl = page.url();
      console.log(`\n🌐 현재 URL: ${currentUrl}`);
      
      const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
      console.log(`\n📄 페이지 텍스트 (일부):\n${pageText}\n...`);
      
      // 실패 키워드 확인
      const failureKeywords = ['잘못된', '틀렸', '오류', '실패', 'error', 'invalid', 'incorrect'];
      const foundKeywords = failureKeywords.filter(keyword => 
        pageText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (foundKeywords.length > 0) {
        console.log(`🔍 발견된 실패 키워드: ${foundKeywords.join(', ')}`);
      }
      
    } catch (infoError) {
      console.error('⚠️ 페이지 정보 가져오기 실패:', infoError.message);
    }
    
    console.log('\n💡 해결 방법:');
    console.log('   1. 수동으로 드림핵 웹사이트 접속하여 로그인 테스트');
    console.log('   2. 개발자 도구(F12)로 로그인 후 UI 요소 확인');
    console.log('   3. 발견된 셀렉터를 utils.js에 추가');
    
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
testLoginInteractive().catch(error => {
  console.error('테스트 실행 중 치명적 에러:', error);
  process.exit(1);
});
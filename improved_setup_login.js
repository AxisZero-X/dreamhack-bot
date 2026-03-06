/**
 * 개선된 로그인 설정 스크립트
 * 실제 계정으로 로그인하여 세션을 저장합니다.
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

require('dotenv').config();

const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER_PROFILE = path.join(__dirname, '.chrome_profile_dreamhack');

console.log('🔑 드림핵 로그인 설정 (개선된 버전)');
console.log('━'.repeat(60));

// 프로필 디렉토리 생성
if (!fs.existsSync(USER_PROFILE)) {
  fs.mkdirSync(USER_PROFILE, { recursive: true });
  console.log(`📂 새 프로필 디렉토리 생성: ${USER_PROFILE}`);
} else {
  console.log(`📂 기존 프로필 디렉토리 사용: ${USER_PROFILE}`);
}

console.log('');
console.log('이 스크립트는 두 가지 방법으로 로그인을 도와줍니다:');
console.log('1. Chrome을 실행하여 수동으로 로그인 (권장)');
console.log('2. 환경 변수를 사용한 자동 로그인');
console.log('');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log('방법을 선택하세요:');
  console.log('1. Chrome 실행 후 수동 로그인 (Enter)');
  console.log('2. 환경 변수로 자동 로그인 시도');
  
  rl.question('선택 (1 또는 2): ', async (choice) => {
    if (choice.trim() === '2') {
      await autoLogin();
    } else {
      await manualLogin();
    }
    rl.close();
  });
}

async function manualLogin() {
  console.log('\n🖥️  Chrome을 실행합니다...');
  console.log('드림핵 로그인 페이지가 열립니다.');
  console.log('이메일과 비밀번호를 입력하여 로그인하세요.');
  console.log('로그인 완료 후 이 터미널로 돌아와 Enter를 누르세요.\n');
  
  // 기존 Chrome 종료
  try {
    execSync('pkill -f "Google Chrome" 2>/dev/null');
    console.log('✅ 기존 Chrome 프로세스 종료');
  } catch {}
  
  setTimeout(() => {
    const chrome = spawn(
      CHROME_PATH,
      [
        `--user-data-dir=${USER_PROFILE}`,
        '--profile-directory=Default',
        '--no-first-run',
        '--no-default-browser-check',
        '--start-maximized',
        'https://dreamhack.io/users/login',
      ],
      { stdio: 'ignore', detached: true },
    );
    chrome.unref();
    
    console.log('✅ Chrome 실행됨');
    console.log('🌐 URL: https://dreamhack.io/users/login');
    
    rl.question('\n로그인 완료 후 Enter 입력: ', () => {
      try {
        execSync('pkill -f "Google Chrome" 2>/dev/null');
        console.log('✅ Chrome 종료');
      } catch {}
      
      console.log('\n🎉 세션 저장 완료!');
      console.log(`📁 프로필 경로: ${USER_PROFILE}`);
      console.log('\n이제 다음 명령어로 봇을 실행하세요:');
      console.log('node bot.js');
      process.exit(0);
    });
  }, 2000);
}

async function autoLogin() {
  const email = process.env.DREAMHACK_EMAIL;
  const password = process.env.DREAMHACK_PASSWORD;
  
  if (!email || !password) {
    console.log('\n❌ 환경 변수가 설정되지 않았습니다.');
    console.log('.env 파일에 다음을 추가하세요:');
    console.log('DREAMHACK_EMAIL=your_email@example.com');
    console.log('DREAMHACK_PASSWORD=your_password');
    console.log('\n또는 방법 1을 선택하세요.');
    process.exit(1);
  }
  
  console.log(`\n📧 계정: ${email}`);
  console.log('🔐 자동 로그인 시도 중...');
  
  // Puppeteer로 자동 로그인 시도
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  puppeteer.use(StealthPlugin());
  
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false,
    userDataDir: USER_PROFILE,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--start-maximized',
    ],
  });
  
  const page = await browser.newPage();
  
  try {
    await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);
    
    // 이메일 입력
    await page.type('input[type="email"], #login-email, input[placeholder*="email"]', email);
    await page.waitForTimeout(1000);
    
    // 비밀번호 입력
    await page.type('input[type="password"], #login-password, input[placeholder*="password"]', password);
    await page.waitForTimeout(1000);
    
    // 로그인 버튼 클릭
    await page.evaluate(() => {
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
    
    console.log('✅ 로그인 버튼 클릭됨');
    await page.waitForTimeout(5000);
    
    // 로그인 성공 확인
    const currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
      console.log('✅ 로그인 성공!');
      console.log(`🌐 현재 URL: ${currentUrl}`);
    } else {
      console.log('⚠️ 로그인 상태 확인 필요');
    }
    
    console.log('\n⏱️ 5초 후 브라우저 종료 및 세션 저장...');
    await page.waitForTimeout(5000);
    
  } catch (error) {
    console.error('❌ 자동 로그인 실패:', error.message);
    console.log('\n수동 로그인을 시도해주세요.');
  } finally {
    await browser.close();
    console.log('\n🎉 세션 저장 완료!');
    console.log(`📁 프로필 경로: ${USER_PROFILE}`);
    console.log('\n이제 다음 명령어로 봇을 실행하세요:');
    console.log('node bot.js');
    process.exit(0);
  }
}

// 메인 실행
main().catch(error => {
  console.error('❌ 스크립트 실행 중 에러:', error);
  process.exit(1);
});
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CHROME_PATH } = require('./config');

puppeteer.use(StealthPlugin());

async function testLoginFlow() {
  const browser = await puppeteer.launch({ 
    headless: false,
    executablePath: CHROME_PATH
  });
  const page = await browser.newPage();
  
  try {
    console.log('1. 로그인 페이지 접속...');
    await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('2. 이메일 입력 필드 찾기...');
    const emailInput = await page.$('input[type="email"], input[name="email"], #email');
    if (!emailInput) {
      console.error('이메일 입력 필드를 찾을 수 없습니다.');
      return;
    }
    console.log('이메일 입력 필드 찾음');
    
    console.log('3. 이메일 입력...');
    await emailInput.click();
    await new Promise(resolve => setTimeout(resolve, 500));
    await emailInput.type('test@example.com', { delay: 50 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('4. Tab 키로 비밀번호 필드로 이동...');
    await page.keyboard.press('Tab');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('5. 비밀번호 입력 필드 찾기...');
    const passwordInput = await page.$('input[type="password"], input[name="password"], #password');
    if (!passwordInput) {
      console.error('비밀번호 입력 필드를 찾을 수 없습니다.');
      return;
    }
    console.log('비밀번호 입력 필드 찾음');
    
    console.log('6. 비밀번호 입력...');
    await passwordInput.type('testpassword', { delay: 50 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('7. 로그인 버튼 찾기...');
    const loginButtons = await page.$$('button');
    let loginButton = null;
    for (const btn of loginButtons) {
      const text = await page.evaluate(el => el.innerText || '', btn);
      if (text.trim() === 'Login') {
        loginButton = btn;
        break;
      }
    }
    
    if (!loginButton) {
      console.error('로그인 버튼을 찾을 수 없습니다.');
      return;
    }
    
    console.log('8. 로그인 버튼 클릭 시도...');
    try {
      await loginButton.click();
      console.log('로그인 버튼 클릭 성공');
    } catch (error) {
      console.error('로그인 버튼 클릭 실패:', error.message);
      console.log('대신 Enter 키 입력 시도...');
      await page.keyboard.press('Enter');
    }
    
    console.log('9. 로그인 결과 대기...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 현재 URL 확인
    const currentUrl = page.url();
    console.log('현재 URL:', currentUrl);
    
    // 로그인 성공 여부 확인
    const loggedIn = await page.evaluate(() => {
      const icon = document.querySelector('.user-icon');
      if (!icon) return false;
      const text = icon.innerText?.trim();
      return text.length > 0 && !text.includes('로그인');
    });
    
    if (loggedIn) {
      console.log('✅ 로그인 성공!');
    } else {
      console.log('❌ 로그인 실패 또는 계정 정보가 잘못됨');
    }
    
  } catch (error) {
    console.error('테스트 중 에러:', error);
  } finally {
    console.log('10. 브라우저 종료...');
    await browser.close();
  }
}

testLoginFlow();
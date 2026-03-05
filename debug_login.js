const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CHROME_PATH } = require('./config');

puppeteer.use(StealthPlugin());

async function debugLogin() {
  const browser = await puppeteer.launch({ 
    headless: false,
    executablePath: CHROME_PATH
  });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 페이지 HTML 구조 확인
    const html = await page.content();
    console.log('페이지 HTML 길이:', html.length);
    
    // 입력 필드 찾기
    const emailInputs = await page.$$('input[type="email"], input[name="email"], #email');
    console.log('이메일 입력 필드 개수:', emailInputs.length);
    
    const passwordInputs = await page.$$('input[type="password"], input[name="password"], #password');
    console.log('비밀번호 입력 필드 개수:', passwordInputs.length);
    
    const buttons = await page.$$('button, input[type="submit"]');
    console.log('버튼 개수:', buttons.length);
    
    // 각 버튼의 텍스트 확인
    for (let i = 0; i < buttons.length; i++) {
      const text = await page.evaluate(el => el.innerText || el.value || el.getAttribute('aria-label') || '', buttons[i]);
      console.log(`버튼 ${i}: "${text}"`);
    }
    
    // 스크린샷 저장
    await page.screenshot({ path: 'login_page.png', fullPage: true });
    console.log('스크린샷 저장됨: login_page.png');
    
  } catch (error) {
    console.error('에러:', error);
  } finally {
    await browser.close();
  }
}

debugLogin();
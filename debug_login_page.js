const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { CHROME_PATH } = require('./config');
const logger = require('./logger');

puppeteer.use(StealthPlugin());

async function debugLoginPage() {
  console.log('🔍 드림핵 로그인 페이지 디버깅 시작...');
  
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
      '--lang=ko',
    ],
  });
  
  const page = await browser.newPage();
  
  try {
    // 로그인 페이지로 이동
    console.log('🌐 https://dreamhack.io/users/login 로 이동 중...');
    await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
    
    // 5초 대기
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 페이지 정보 수집
    console.log('\n📊 페이지 정보:');
    console.log(`URL: ${page.url()}`);
    console.log(`Title: ${await page.title()}`);
    
    // 전체 HTML 구조 분석
    console.log('\n🔍 로그인 폼 요소 분석:');
    
    // 1. 모든 input 요소 찾기
    const inputs = await page.evaluate(() => {
      const allInputs = Array.from(document.querySelectorAll('input'));
      return allInputs.map(input => ({
        type: input.type,
        name: input.name,
        id: input.id,
        className: input.className,
        placeholder: input.placeholder,
        value: input.value,
        visible: input.offsetParent !== null
      }));
    });
    
    console.log('\n📝 Input 요소들:');
    inputs.forEach((input, i) => {
      console.log(`  [${i}] type="${input.type}", name="${input.name}", id="${input.id}", placeholder="${input.placeholder}", visible=${input.visible}`);
    });
    
    // 2. 모든 button 요소 찾기
    const buttons = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]'));
      return allButtons.map(btn => ({
        tagName: btn.tagName,
        type: btn.type || 'N/A',
        text: btn.innerText.trim(),
        className: btn.className,
        id: btn.id,
        visible: btn.offsetParent !== null,
        disabled: btn.disabled || btn.classList.contains('disabled')
      }));
    });
    
    console.log('\n🖱️ Button 요소들:');
    buttons.forEach((btn, i) => {
      console.log(`  [${i}] <${btn.tagName}> type="${btn.type}", text="${btn.text}", class="${btn.className}", visible=${btn.visible}, disabled=${btn.disabled}`);
    });
    
    // 3. 폼 요소 찾기
    const forms = await page.evaluate(() => {
      const allForms = Array.from(document.querySelectorAll('form'));
      return allForms.map(form => ({
        id: form.id || '',
        className: form.className || '',
        action: form.action || '',
        method: form.method || '',
        visible: form.offsetParent !== null
      }));
    });
    
    console.log('\n📋 Form 요소들:');
    forms.forEach((form, i) => {
      console.log(`  [${i}] id="${form.id}", class="${form.className}", action="${form.action}", method="${form.method}", visible=${form.visible}`);
    });
    
    // 4. 로그인 관련 텍스트 찾기
    const loginTexts = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const loginKeywords = ['로그인', 'Login', 'Sign in', '이메일', '비밀번호', 'email', 'password', 'submit', '제출'];
      
      return allElements
        .filter(el => {
          const text = el.innerText ? el.innerText.trim() : '';
          return text && loginKeywords.some(keyword => text.includes(keyword));
        })
        .map(el => ({
          tagName: el.tagName,
          text: el.innerText ? el.innerText.trim().substring(0, 100) : '',
          className: el.className || '',
          id: el.id || '',
          visible: el.offsetParent !== null
        }));
    });
    
    console.log('\n🔤 로그인 관련 텍스트 요소들:');
    loginTexts.forEach((el, i) => {
      console.log(`  [${i}] <${el.tagName}> "${el.text}", class="${el.className}", visible=${el.visible}`);
    });
    
    // 5. 현재 페이지의 모든 CSS 클래스 수집 (로그인 관련)
    const loginClasses = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const classes = new Set();
      
      allElements.forEach(el => {
        if (el.className) {
          el.className.split(' ').forEach(cls => {
            if (cls.includes('login') || cls.includes('Login') || 
                cls.includes('sign') || cls.includes('Sign') ||
                cls.includes('auth') || cls.includes('Auth') ||
                cls.includes('submit') || cls.includes('Submit') ||
                cls.includes('button') || cls.includes('Button')) {
              classes.add(cls);
            }
          });
        }
      });
      
      return Array.from(classes);
    });
    
    console.log('\n🎨 로그인 관련 CSS 클래스들:');
    loginClasses.forEach((cls, i) => {
      console.log(`  [${i}] .${cls}`);
    });
    
    // 6. 스크린샷 캡처
    console.log('\n📸 스크린샷 캡처 중...');
    await page.screenshot({ path: './logs/login_page_debug.png', fullPage: true });
    console.log('✅ 스크린샷 저장: ./logs/login_page_debug.png');
    
    // 7. HTML 저장
    console.log('\n💾 HTML 저장 중...');
    const html = await page.content();
    require('fs').writeFileSync('./logs/login_page_debug.html', html);
    console.log('✅ HTML 저장: ./logs/login_page_debug.html');
    
    // 8. 권장 셀렉터 제안
    console.log('\n🎯 권장 로그인 버튼 셀렉터:');
    
    const recommendedSelectors = [];
    
    // 버튼 텍스트 기반
    const loginButtons = buttons.filter(btn => 
      btn.visible && !btn.disabled && 
      (btn.text.includes('로그인') || btn.text.includes('Login') || btn.text.includes('Sign in'))
    );
    
    loginButtons.forEach(btn => {
      if (btn.id) {
        recommendedSelectors.push(`#${btn.id}`);
      }
      if (btn.className) {
        const classes = btn.className.split(' ').filter(c => c);
        classes.forEach(cls => {
          recommendedSelectors.push(`.${cls}`);
        });
      }
    });
    
    // 폼 내부의 submit 버튼
    const submitButtons = buttons.filter(btn => 
      btn.visible && !btn.disabled && btn.type === 'submit'
    );
    
    submitButtons.forEach(btn => {
      if (btn.id) {
        recommendedSelectors.push(`#${btn.id}`);
      }
      if (btn.className) {
        const classes = btn.className.split(' ').filter(c => c);
        classes.forEach(cls => {
          recommendedSelectors.push(`.${cls}`);
        });
      }
    });
    
    // 중복 제거
    const uniqueSelectors = [...new Set(recommendedSelectors)];
    
    console.log('추천 셀렉터 목록:');
    uniqueSelectors.forEach((selector, i) => {
      console.log(`  [${i}] ${selector}`);
    });
    
    // 현재 셀렉터와 비교
    console.log('\n🔍 현재 utils.js의 셀렉터와 비교:');
    const currentSelectors = [
      'button[type="submit"]',
      '.login-button',
      '.el-button--primary',
      'button:contains("로그인")',
      'button:contains("Login")',
      '.submit-button'
    ];
    
    for (const selector of currentSelectors) {
      const exists = await page.evaluate((sel) => {
        try {
          return document.querySelector(sel) !== null;
        } catch {
          return false;
        }
      }, selector);
      
      console.log(`  ${selector}: ${exists ? '✅ 존재함' : '❌ 존재하지 않음'}`);
    }
    
  } catch (error) {
    console.error('❌ 디버깅 중 에러:', error);
  } finally {
    console.log('\n🔒 브라우저를 30초 후에 종료합니다...');
    console.log('   (페이지를 직접 확인하려면 브라우저를 수동으로 닫아주세요)');
    
    // 30초 대기 후 브라우저 종료
    setTimeout(async () => {
      await browser.close();
      console.log('✅ 브라우저 종료됨');
      process.exit(0);
    }, 30000);
  }
}

// 로거 설정
logger.transports.forEach(transport => {
  transport.level = 'info';
});

debugLoginPage().catch(error => {
  console.error('치명적 에러:', error);
  process.exit(1);
});
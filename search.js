const { randomDelay } = require('./utils');

/**
 * 워게임 문제 제목으로 웹 검색을 통해 플래그 추출 시도
 * 구글 캡챠 이슈를 피하기 위해 네이버와 빙을 순차적으로 탐색합니다.
 * @param {object} page - Puppeteer Page 객체
 * @param {string} title - 워게임 문제 제목
 * @returns {string|null} 찾은 플래그 또는 null
 */
async function searchFlagForWargame(page, title) {
  console.log(`\n🕵️ [웹 검색] "${title}" 문제의 플래그를 인터넷에서 검색합니다...`);

  // 다양한 검색 쿼리 생성 (더 많은 결과를 얻기 위해)
  const searchQueries = [
    // 기본 쿼리: 정확한 제목 검색
    `"${title}" dreamhack writeup OR 롸이트업 OR 풀이 OR solution`,
    // 영어 제목이 있을 경우를 대비한 쿼리
    `dreamhack "${title}" DH{ OR flag`,
    // 더 넓은 범위의 검색
    `dreamhack wargame "${title}" solution`,
    // 한국어 블로그 중심 검색
    `드림핵 "${title}" 풀이 OR 해설`,
  ];

  // 검색할 사이트 목록 확장
  const siteFilters = [
    'site:tistory.com',
    'site:velog.io', 
    'site:github.io',
    'site:blog.naver.com',
    'site:brunch.co.kr',
    'site:medium.com',
    'site:dev.to',
    'site:hatenablog.com'
  ];

  let foundFlag = null;

  // 각 검색 엔진별로 시도
  const searchEngines = [
    { name: 'Google', url: 'https://www.google.com/search?q=', captchaCheck: '비정상적인 트래픽' },
    { name: 'Naver', url: 'https://search.naver.com/search.naver?query=', captchaCheck: null },
    { name: 'Bing', url: 'https://www.bing.com/search?q=', captchaCheck: null },
    { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', captchaCheck: null }
  ];

  // 각 검색 쿼리별로 시도
  for (const query of searchQueries) {
    if (foundFlag) break;
    
    // 사이트 필터와 쿼리 결합
    const siteQuery = siteFilters.join(' OR ');
    const fullQuery = `(${siteQuery}) (${query})`;
    
    console.log(`🔍 검색 쿼리: ${fullQuery.substring(0, 100)}...`);
    
    for (const engine of searchEngines) {
      if (foundFlag) break;
      
      console.log(`  🔎 ${engine.name}에서 검색 시도 중...`);
      try {
        await page.goto(engine.url + encodeURIComponent(fullQuery), { 
          waitUntil: 'domcontentloaded',
          timeout: 10000 
        });
        await randomDelay(1500, 2500);

        // 캡챠 체크
        if (engine.captchaCheck) {
          const isCaptcha = await page.evaluate((text) => document.body.innerText.includes(text), engine.captchaCheck);
          if (isCaptcha) {
            console.log(`  ⚠️ ${engine.name} 캡챠가 감지되었습니다. 다음 검색 엔진으로 전환합니다.`);
            continue;
          }
        }

        // 검색 결과 링크 추출 (엔진별 셀렉터)
        let links = [];
        if (engine.name === 'Google') {
          links = await page.$$eval('#search a', anchors =>
            anchors.map(a => a.href).filter(href => 
              href && 
              !href.includes('google.com') && 
              !href.includes('webcache.googleusercontent.com') &&
              (href.includes('tistory.com') || href.includes('velog.io') || href.includes('github.io') || 
               href.includes('blog.naver.com') || href.includes('brunch.co.kr') || href.includes('medium.com') ||
               href.includes('dev.to') || href.includes('hatenablog.com'))
            )
          );
        } else if (engine.name === 'Naver') {
          links = await page.$$eval('.title_link, a.api_txt_lines, a.name, .lnk_tit, .total_tit', anchors =>
            anchors.map(a => a.href).filter(href => {
              if (!href || href.includes('search.naver.com') || href.includes('nid.naver.com') || 
                  href.includes('shopping.naver.com') || href.includes('dict.naver.com') || 
                  href.includes('map.naver.com') || href.includes('terms.naver.com') || 
                  href.includes('academic.naver.com')) return false;
              return href.includes('tistory.com') || href.includes('velog.io') || href.includes('github.io') ||
                     href.includes('blog.naver.com') || href.includes('brunch.co.kr');
            })
          );
        } else if (engine.name === 'Bing') {
          links = await page.$$eval('h2 a, .b_algo h2 a, .b_title h2 a', anchors =>
            anchors.map(a => a.href).filter(href => 
              href && (href.includes('tistory.com') || href.includes('velog.io') || href.includes('github.io') ||
                      href.includes('blog.naver.com') || href.includes('brunch.co.kr') || href.includes('medium.com'))
            )
          );
        } else if (engine.name === 'DuckDuckGo') {
          links = await page.$$eval('.result__title a, .result-title a', anchors =>
            anchors.map(a => a.href).filter(href => 
              href && (href.includes('tistory.com') || href.includes('velog.io') || href.includes('github.io') ||
                      href.includes('blog.naver.com') || href.includes('brunch.co.kr') || href.includes('medium.com'))
            )
          );
        }

        const uniqueLinks = [...new Set(links)].slice(0, 10); // 상위 10개만 확인
        console.log(`  📑 ${engine.name}에서 ${uniqueLinks.length}개의 관련 포스트를 찾았습니다.`);

        if (uniqueLinks.length > 0) {
          foundFlag = await extractFlagFromLinks(page, uniqueLinks);
          if (foundFlag) {
            console.log(`  🎉 ${engine.name}에서 플래그를 찾았습니다!`);
            break;
          }
        }
      } catch (err) {
        console.log(`  ⚠️ ${engine.name} 검색 중 에러: ${err.message}`);
      }
    }
  }

  if (foundFlag) {
    console.log(`🎉 웹 검색으로 플래그를 찾았습니다: ${foundFlag}`);
  } else {
    console.log(`⚠️ 웹 검색으로 플래그를 찾지 못했습니다.`);
    
    // 추가적으로 GitHub에서 직접 검색 시도
    console.log(`🔍 GitHub에서 직접 검색 시도 중...`);
    try {
      const githubQuery = `dreamhack ${title} DH{`;
      await page.goto(`https://github.com/search?q=` + encodeURIComponent(githubQuery) + `&type=code`, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
      });
      await randomDelay(2000, 3000);
      
      // GitHub 코드 검색 결과에서 플래그 찾기
      const githubFlag = await page.evaluate(() => {
        const codeElements = document.querySelectorAll('.blob-code-inner');
        for (const el of codeElements) {
          const text = el.textContent;
          const match = text.match(/DH\{[^}]+\}/);
          if (match) {
            const flag = match[0];
            // 더미 플래그 필터링
            if (!flag.includes('...') && !flag.toLowerCase().includes('flag') && 
                !flag.includes('플래그') && flag.length > 8) {
              return flag;
            }
          }
        }
        return null;
      });
      
      if (githubFlag) {
        console.log(`🎉 GitHub 코드 검색에서 플래그를 찾았습니다: ${githubFlag}`);
        foundFlag = githubFlag;
      }
    } catch (err) {
      console.log(`⚠️ GitHub 검색 중 에러: ${err.message}`);
    }
  }

  return foundFlag;
}

/**
 * 주어진 링크 목록을 순회하며 플래그 형식을 추출
 */
async function extractFlagFromLinks(page, links) {
  for (let i = 0; i < Math.min(10, links.length); i++) {
    const url = links[i];
    console.log(`  👀 탐색 중 [${i + 1}/${Math.min(10, links.length)}]: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await randomDelay(800, 1500);

      // 페이지 텍스트와 HTML 모두에서 검색
      const pageData = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const htmlContent = document.body.innerHTML;
        
        // 다양한 플래그 패턴 검색
        const patterns = [
          /DH\{[^}]+\}/g,  // 기본 DH{...} 형식
          /FLAG\{[^}]+\}/gi, // FLAG{...} 형식
          /flag\{[^}]+\}/g,  // flag{...} 형식
          /dh\{[^}]+\}/g,    // dh{...} 형식 (소문자)
          /Dreamhack\{[^}]+\}/gi, // Dreamhack{...} 형식
        ];
        
        const allMatches = [];
        patterns.forEach(pattern => {
          const matches = bodyText.match(pattern) || [];
          allMatches.push(...matches);
        });
        
        // HTML에서도 추가 검색 (코드 블록 내에 있을 수 있음)
        const codeBlocks = document.querySelectorAll('pre, code, .hljs, .language-*');
        let codeText = '';
        codeBlocks.forEach(block => {
          codeText += block.textContent + '\n';
        });
        
        patterns.forEach(pattern => {
          const matches = codeText.match(pattern) || [];
          allMatches.push(...matches);
        });
        
        return {
          text: bodyText,
          html: htmlContent,
          matches: [...new Set(allMatches)] // 중복 제거
        };
      });

      // 더미 플래그나 플레이스홀더 제외
      const validMatches = pageData.matches.filter(m => {
        const flag = m;
        const lowerFlag = flag.toLowerCase();
        
        // 명확한 더미/예시 플래그 제외
        const dummyPatterns = [
          '...',
          'flag',
          '플래그',
          '어쩌구',
          '여기에',
          'example',
          '예시',
          'sample',
          'test',
          '더미',
          'dummy',
          'placeholder',
          'dh{}',
          'flag{}',
          'dreamhack{}'
        ];
        
        // 너무 짧은 플래그 제외 (최소 8자)
        if (flag.length < 8) return false;
        
        // 더미 패턴이 포함된 경우 제외
        if (dummyPatterns.some(pattern => lowerFlag.includes(pattern))) {
          return false;
        }
        
        // 연속된 동일 문자나 너무 단순한 패턴 제외
        if (/^(.)\1+$/.test(flag.replace(/[{}]/g, ''))) return false;
        
        return true;
      });

      if (validMatches.length > 0) {
        // 가장 긴 플래그 선택 (일반적으로 실제 플래그가 더 길다)
        const longestFlag = validMatches.reduce((a, b) => a.length > b.length ? a : b);
        console.log(`  ✅ 유효한 플래그 후보 ${validMatches.length}개 발견, 선택: ${longestFlag}`);
        return longestFlag;
      }
      
      // 플래그가 직접적으로 표시되지 않았을 경우, 페이지에서 힌트 찾기
      const hasWriteupKeywords = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        const keywords = [
          'writeup', '롸이트업', '풀이', '해설', 'solution', 'answer',
          '정답', '플래그', 'flag', 'dh{', 'dreamhack'
        ];
        return keywords.some(keyword => text.includes(keyword));
      });
      
      if (hasWriteupKeywords) {
        console.log(`  💡 워게임 관련 내용 발견 (플래그는 직접적으로 표시되지 않음)`);
      }
    } catch (e) {
      console.log(`  ❌ 페이지 로드 실패: ${e.message}`);
    }
  }
  return null;
}

module.exports = {
  searchFlagForWargame
};

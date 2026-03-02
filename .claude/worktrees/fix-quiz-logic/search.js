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

  // 검색할 블로그 플랫폼 필터 (이 플랫폼들에 롸이트업이 주로 올라옴)
  // 워게임 제목의 경우 특수문자가 포함될 수 있으므로 따옴표로 감쌈.
  const searchQuery = `site:tistory.com OR site:velog.io OR site:github.io dreamhack "${title}" ("DH{" OR "flag" OR "롸이트업" OR "writeup")`;

  let foundFlag = null;

  // 1. Google 검색 시도 (가장 정확도가 높음, 캡챠 걸리면 넘어감)
  console.log(`🔍 Google에서 검색 시도 중...`);
  try {
    await page.goto(`https://www.google.com/search?q=` + encodeURIComponent(searchQuery), { waitUntil: 'domcontentloaded' });
    await randomDelay(1000, 2000);

    const isCaptcha = await page.evaluate(() => document.body.innerText.includes('비정상적인 트래픽'));
    if (isCaptcha) {
      console.log('⚠️ Google 캡챠가 감지되었습니다. 다른 검색 엔진으로 전환합니다.');
    } else {
      const googleLinks = await page.$$eval('#search a', links =>
        links.map(a => a.href).filter(href => href && !href.includes('google.com') && (href.includes('tistory.com') || href.includes('velog.io') || href.includes('github.io')))
      );
      const uniqueGoogleLinks = [...new Set(googleLinks)];

      console.log(`📑 Google에서 ${uniqueGoogleLinks.length}개의 관련 포스트를 찾았습니다.`);
      foundFlag = await extractFlagFromLinks(page, uniqueGoogleLinks);
    }
  } catch (err) {
    console.log(`⚠️ Google 검색 중 에러: ${err.message}`);
  }

  // 2. 네이버 검색 시도 (Google 실패 시)
  if (!foundFlag) {
    console.log(`🔍 Naver에서 검색 시도 중...`);
    try {
      await page.goto(`https://search.naver.com/search.naver?query=` + encodeURIComponent(searchQuery), { waitUntil: 'domcontentloaded' });
      await randomDelay(1000, 2000);

      // Naver의 검색 결과 블로그 링크는 주로 '.title_link' 나 '.api_txt_lines.total_tit'에 있음
      const naverLinks = await page.$$eval('.title_link, a.api_txt_lines, a.name, .lnk_tit', links =>
        links.map(a => a.href).filter(href => {
          if (!href || href.includes('search.naver.com') || href.includes('nid.naver.com') || href.includes('shopping.naver.com') || href.includes('dict.naver.com') || href.includes('map.naver.com') || href.includes('terms.naver.com') || href.includes('academic.naver.com')) return false;
          return href.includes('tistory.com') || href.includes('velog.io') || href.includes('github.io');
        })
      );
      const uniqueNaverLinks = [...new Set(naverLinks)];

      console.log(`📑 Naver에서 ${uniqueNaverLinks.length}개의 관련 포스트를 찾았습니다.`);

      foundFlag = await extractFlagFromLinks(page, uniqueNaverLinks);
    } catch (err) {
      console.log(`⚠️ Naver 검색 중 에러: ${err.message}`);
    }
  }

  // 3. 빙 검색 시도 (네이버에서도 못 찾았을 경우)
  if (!foundFlag) {
    console.log(`🔍 Bing에서 검색 시도 중...`);
    try {
      await page.goto(`https://www.bing.com/search?q=` + encodeURIComponent(searchQuery), { waitUntil: 'domcontentloaded' });
      await randomDelay(1000, 2000);

      const bingLinks = await page.$$eval('h2 a', links =>
        links.map(a => a.href).filter(href => href.includes('tistory.com') || href.includes('velog.io') || href.includes('github.io'))
      );
      const uniqueBingLinks = [...new Set(bingLinks)];

      console.log(`📑 Bing에서 ${uniqueBingLinks.length}개의 관련 포스트를 찾았습니다.`);

      foundFlag = await extractFlagFromLinks(page, uniqueBingLinks);
    } catch (err) {
      console.log(`⚠️ Bing 검색 중 에러: ${err.message}`);
    }
  }

  if (foundFlag) {
    console.log(`🎉 웹 검색으로 플래그를 찾았습니다: ${foundFlag}`);
  } else {
    console.log(`⚠️ 웹 검색으로 플래그를 찾지 못했습니다.`);
  }

  return foundFlag;
}

/**
 * 주어진 링크 목록을 순회하며 플래그 형식을 추출
 */
async function extractFlagFromLinks(page, links) {
  for (let i = 0; i < Math.min(7, links.length); i++) {
    const url = links[i];
    console.log(`  👀 탐색 중: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
      await randomDelay(500, 1000);

      const pageText = await page.evaluate(() => document.body.innerText);

      // DH{ ... } 형식 찾기
      const matches = pageText.match(/DH\{[^}]+\}/g) || [];

      // 더미 플래그나 플레이스홀더 제외
      const validMatches = matches.filter(m =>
        m.length > 5 && // "DH{}" 형태 이상이면 가능성 있음 (최소 5자리로 완화)
        !m.includes('...') &&
        !m.toLowerCase().includes('flag') &&
        !m.includes('플래그') &&
        !m.includes('어쩌구') &&
        !m.includes('여기에')
      );

      if (validMatches.length > 0) {
        return validMatches[0]; // 첫 번째 유효한 플래그 반환
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

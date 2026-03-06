const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { randomDelay } = require('./utils');
const aiProvider = require('./aiProvider');
const logger = require('./logger');

// ─── 유틸 ──────────────────────────────────────────────────────────────────

/**
 * fetch를 동적으로 import (node-fetch v3은 ESM 전용)
 */
async function getFetch() {
  const { default: fetch } = await import('node-fetch');
  return fetch;
}

/**
 * 임시 디렉토리 확인/생성
 */
function ensureTempDir() {
  const dir = path.join('/tmp', 'dreamhack_files');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── 강의 슬라이드 수집 (텍스트 + 이미지) ────────────────────────────────

/**
 * [함께실습] 강의 페이지를 순회하며 슬라이드별 텍스트와 이미지 base64를 수집
 * @returns {{ texts: string[], imageBase64s: string[] }}
 */
async function collectLectureSlides(browser, togetherUrl) {
  const texts = [];
  const imageBase64s = [];

  const searchPage = await browser.newPage();
  try {
    await searchPage.goto(togetherUrl, { waitUntil: 'networkidle2' });
    await randomDelay(1500, 2500);

    let pageIndex = 0;
    const maxPages = 50;

    while (pageIndex < maxPages) {
      // 텍스트 수집
      const text = await searchPage.evaluate(() => document.body.innerText.trim());
      texts.push(text);

      // 이미지 수집: 슬라이드 내 img 태그 src 추출
      const imgUrls = await searchPage.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs
          .map((img) => img.src)
          .filter(
            (src) =>
              src &&
              !src.includes('data:image/gif') && // 1px gif 같은 트래킹 픽셀 제외
              !src.includes('favicon') &&
              src.length > 10,
          );
      });

      // 이미지를 base64로 변환 (최대 3장/슬라이드)
      const fetch = await getFetch();
      for (const imgUrl of imgUrls.slice(0, 3)) {
        try {
          let base64 = null;
          if (imgUrl.startsWith('data:')) {
            // 이미 data URL인 경우 base64 부분만 추출
            base64 = imgUrl.split(',')[1];
          } else {
            const resp = await fetch(imgUrl);
            if (resp.ok) {
              const ab = await resp.arrayBuffer();
              base64 = Buffer.from(ab).toString('base64');
            }
          }
          if (base64 && base64.length > 100) {
            imageBase64s.push(base64);
          }
        } catch (_) {
          // 이미지 로드 실패는 무시
        }
      }

      // 다음 슬라이드로 이동
      const hasNext = await searchPage.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const nextBtn = btns.find((b) => {
          const t = b.innerText.trim();
          return (t === '다음' || t === 'Next' || t.includes('다음')) && !b.disabled && b.offsetParent !== null;
        });
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (!hasNext) break;
      await randomDelay(700, 1200);
      pageIndex++;
    }
  } finally {
    await searchPage.close();
  }

  logger.info(`📚 강의 수집 완료: 슬라이드 ${texts.length}장, 이미지 ${imageBase64s.length}장`);
  return { texts, imageBase64s };
}

// ─── 챌린지 파일 다운로드 ────────────────────────────────────────────────

const TEXT_EXTENSIONS = ['.py', '.c', '.cpp', '.h', '.js', '.ts', '.java', '.go', '.rb', '.php', '.sh', '.txt', '.md', '.s', '.asm'];
const BINARY_EXTENSIONS = ['.elf', '.bin', '.exe', '.out'];
const ARCHIVE_EXTENSIONS = ['.zip', '.tar', '.gz', '.tgz', '.tar.gz', '.7z'];

/**
 * 워게임 챌린지 페이지에서 첨부파일을 다운로드하고 내용을 수집
 * @returns {string} 파일 내용 요약 문자열 (AI 프롬프트용)
 */
async function downloadChallengeFiles(page) {
  const tempDir = ensureTempDir();
  const fileContents = [];

  try {
    // 다운로드 링크 탐색
    const downloadLinks = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const results = [];
      for (const a of anchors) {
        const href = a.href;
        const text = a.innerText.trim();
        // 파일 다운로드 링크 판별
        if (
          /\.(py|c|cpp|h|js|ts|java|go|rb|php|sh|txt|md|s|asm|elf|bin|exe|out|zip|tar|gz|7z)(\?.*)?$/i.test(href) ||
          text.includes('다운로드') ||
          text.includes('Download') ||
          text.toLowerCase().includes('file') ||
          href.includes('/download') ||
          href.includes('/files/')
        ) {
          results.push({ href, text });
        }
      }
      return results;
    });

    if (downloadLinks.length === 0) {
      return '';
    }

    logger.info(`📁 챌린지 파일 ${downloadLinks.length}개 발견, 다운로드 중...`);
    const fetch = await getFetch();
    // 쿠키 가져오기 (인증 필요 시)
    const cookies = await page.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    for (const { href, text } of downloadLinks.slice(0, 5)) {
      try {
        const resp = await fetch(href, {
          headers: { Cookie: cookieHeader },
          redirect: 'follow',
        });
        if (!resp.ok) continue;

        const contentDisp = resp.headers.get('content-disposition') || '';
        let filename = contentDisp.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)?.[1]?.replace(/['"]/g, '');
        if (!filename) {
          const urlParts = href.split('/').pop().split('?')[0];
          filename = urlParts || `file_${Date.now()}`;
        }
        filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

        const ext = path.extname(filename).toLowerCase();
        const filePath = path.join(tempDir, filename);
        const ab = await resp.arrayBuffer();
        const buffer = Buffer.from(ab);
        fs.writeFileSync(filePath, buffer);
        logger.info(`⬇️  다운로드 완료: ${filename} (${buffer.length} bytes)`);

        // 파일 종류별 처리
        if (TEXT_EXTENSIONS.includes(ext)) {
          // 텍스트 파일: 직접 읽기
          const content = buffer.toString('utf8');
          fileContents.push(`\n\n=== 파일: ${filename} ===\n${content.substring(0, 4000)}`);
        } else if (BINARY_EXTENSIONS.includes(ext)) {
          // 바이너리: strings 명령으로 출력 가능 문자열 추출
          try {
            const strings = execSync(`strings "${filePath}" | head -100`, { timeout: 5000 }).toString();
            fileContents.push(`\n\n=== 파일(바이너리): ${filename} - strings 출력 ===\n${strings.substring(0, 3000)}`);
          } catch (_) {
            fileContents.push(`\n\n=== 파일(바이너리): ${filename} ===\n[바이너리 파일, strings 추출 실패]`);
          }
        } else if (ARCHIVE_EXTENSIONS.some((a) => filename.endsWith(a))) {
          // 압축 파일: 압축 해제 후 텍스트 파일 읽기
          const extractDir = path.join(tempDir, `extract_${Date.now()}`);
          fs.mkdirSync(extractDir, { recursive: true });
          try {
            if (filename.endsWith('.zip')) {
              execSync(`unzip -o "${filePath}" -d "${extractDir}"`, { timeout: 10000 });
            } else {
              execSync(`tar -xf "${filePath}" -C "${extractDir}"`, { timeout: 10000 });
            }
            // 압축 해제된 텍스트 파일 읽기
            const extracted = execSync(`find "${extractDir}" -type f`, { timeout: 5000 })
              .toString()
              .trim()
              .split('\n')
              .filter(Boolean);
            for (const ef of extracted.slice(0, 5)) {
              const eext = path.extname(ef).toLowerCase();
              if (TEXT_EXTENSIONS.includes(eext)) {
                const content = fs.readFileSync(ef, 'utf8');
                fileContents.push(`\n\n=== 압축 내 파일: ${path.basename(ef)} ===\n${content.substring(0, 3000)}`);
              } else if (BINARY_EXTENSIONS.includes(eext)) {
                try {
                  const strings = execSync(`strings "${ef}" | head -80`, { timeout: 5000 }).toString();
                  fileContents.push(`\n\n=== 압축 내 파일(바이너리): ${path.basename(ef)} ===\n${strings.substring(0, 2000)}`);
                } catch (_) { }
              }
            }
          } catch (err) {
            logger.warn(`⚠️ 압축 해제 실패 (${filename}): ${err.message}`);
          }
        }
      } catch (err) {
        logger.warn(`⚠️ 파일 다운로드 실패 (${href}): ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`⚠️ 챌린지 파일 탐색 중 오류: ${err.message}`);
  }

  return fileContents.join('\n');
}

// ─── 메인: 워게임 챌린지 풀이 ────────────────────────────────────────────

async function solveWargameChallenge(browser, page, url, togetherPracticeMap = {}) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    await randomDelay(2000, 4000);

    // 문제 제목 추출
    const title = await page.evaluate(() => {
      const h1s = Array.from(document.querySelectorAll('h1'));
      for (const h1 of h1s) {
        if (h1.innerText.trim().length > 0) return h1.innerText.trim();
      }
      return null;
    });

    if (!title) {
      logger.warn('⚠️ 워게임 문제 제목을 추출할 수 없습니다. 스킵합니다.');
      return;
    }

    logger.info(`🎮 워게임 [${title}] 도전을 시작합니다.`);

    // 이미 해결 여부 확인
    const isSolved = await page.evaluate(() => {
      return (
        document.body.innerText.includes('이미 해결한 문제입니다') ||
        document.querySelector('.solved-badge, .is-solved') !== null ||
        document.body.innerText.includes('Clear')
      );
    });

    if (isSolved) {
      logger.info(`✅ 이미 해결된 워게임 [${title}] 입니다. 다음으로 넘어갑니다.`);
      return;
    }

    const systemPrompt = '당신은 드림핵(Dreamhack) 워게임 보안 문제 풀이 전문 해커입니다. 플래그는 반드시 DH{...} 형식입니다.';
    let flag = null;

    // 문제 페이지 텍스트 (공통으로 사용)
    const problemText = await page.evaluate(() => document.body.innerText.trim().substring(0, 3000));

    // ─── 1단계: [함께실습] 강의 수집 ───────────────────────────────────
    const togetherUrl =
      togetherPracticeMap[title] ||
      Object.entries(togetherPracticeMap).find(([k]) => k.includes(title) || title.includes(k))?.[1];

    if (togetherUrl) {
      logger.info(`📖 [함께실습] 강의 전체 수집 중: ${togetherUrl}`);
      try {
        const { texts, imageBase64s } = await collectLectureSlides(browser, togetherUrl);
        const lectureText = texts.join('\n\n--- 슬라이드 구분 ---\n\n');

        // 텍스트에서 DH{} 직접 탐색
        const allMatches = [...lectureText.matchAll(/DH\{[^}]+\}/g)].map((m) => m[0]);
        const realFlags = allMatches.filter(
          (f) =>
            !f.match(/DH\{flag\d/i) &&
            !f.includes('...') &&
            !f.includes('어쩌구') &&
            !f.includes('여기') &&
            f.length > 8,
        );

        if (realFlags.length > 0) {
          flag = realFlags[realFlags.length - 1];
          logger.info(`🎯 [함께실습] 강의에서 플래그 직접 발견: ${flag}`);
        } else {
          // AI에게 분석 요청 (이미지 포함)
          logger.info(`🤖 AI에게 [함께실습] 강의 분석 요청 중... (이미지 ${imageBase64s.length}장 포함)`);
          try {
            const aiPrompt = `아래는 워게임 문제 "[${title}]"의 설명입니다:\n${problemText.substring(0, 1500)}\n\n아래는 이 문제와 연관된 [함께실습] 강의의 전체 내용입니다:\n${lectureText.substring(0, 6000)}\n\n위 내용과 첨부된 강의 슬라이드 이미지를 바탕으로 워게임 플래그를 찾아주세요.\n- DH{...} 형식의 플래그가 있으면 그것을 반환\n- 플래그가 없고 힌트(특정 값, 연산 결과 등)만 있다면, 그 힌트로부터 최종 플래그를 계산/추론\n- 이미지 속 터미널 출력, 코드, 플래그 문자열을 특히 주의 깊게 확인\n\n응답 형식: 플래그 문자열만 출력 (예: DH{some_flag_here}). 확신이 없으면 "모름"이라고만 출력.`;

            const aiAnswer = imageBase64s.length > 0
              ? await aiProvider.getCompletionWithVision(aiPrompt, systemPrompt, imageBase64s.slice(0, 10))
              : await aiProvider.getCompletion(aiPrompt, systemPrompt);

            logger.info(`🤖 AI 응답: ${aiAnswer ?? '(없음)'}`);

            if (aiAnswer) {
              const aiFlag = aiAnswer.match(/DH\{[^}]+\}/)?.[0];
              if (aiFlag) {
                flag = aiFlag;
                logger.info(`🎯 AI가 플래그를 추론/추출: ${flag}`);
              }
            }
          } catch (err) {
            logger.error(`⚠️ AI 강의 분석 실패: ${err.message}`);
          }
        }
      } catch (err) {
        logger.error(`⚠️ [함께실습] 강의 탐색 중 에러: ${err.message}`);
      }
    }

    // ─── 2단계: 챌린지 파일 다운로드 & 분석 ────────────────────────────
    if (!flag) {
      try {
        await page.bringToFront();
        const fileContent = await downloadChallengeFiles(page);

        if (fileContent) {
          logger.info(`🤖 AI에게 챌린지 파일 기반 분석 요청 중...`);
          const aiPrompt = `드림핵 워게임 문제 "[${title}]"입니다.\n\n문제 설명:\n${problemText}\n\n첨부 파일 내용:${fileContent}\n\n위 파일과 문제 설명을 분석하여 DH{...} 형식의 플래그를 찾아주세요.\n- 소스 코드 분석, 취약점 파악, 플래그 계산 등 모든 방법을 동원하세요.\n- 확신이 없으면 "모름"이라고만 출력.\n\n응답 형식: 플래그 문자열만 출력 (예: DH{some_flag_here})`;

          const aiAnswer = await aiProvider.getCompletion(aiPrompt, systemPrompt);
          logger.info(`🤖 AI 응답: ${aiAnswer ?? '(없음)'}`);

          if (aiAnswer) {
            const aiFlag = aiAnswer.match(/DH\{[^}]+\}/)?.[0];
            if (aiFlag) {
              flag = aiFlag;
              logger.info(`🎯 AI가 파일 분석으로 플래그 추출: ${flag}`);
            }
          }
        }
      } catch (err) {
        logger.error(`⚠️ 파일 분석 중 실패: ${err.message}`);
      }
    }

    // ─── 3단계: 최후 추론 (문제 설명만) ────────────────────────────────
    if (!flag) {
      try {
        logger.info(`🤖 AI에게 문제 설명 기반 최후 추론 요청 중...`);
        await page.bringToFront();
        const aiPrompt = `드림핵 워게임 문제 "[${title}]"입니다. 문제 설명:\n${problemText}\n\n이 문제의 DH{...} 형식 플래그를 추론해주세요. 확신이 없으면 "모름"이라고만 출력.`;

        const aiAnswer = await aiProvider.getCompletion(aiPrompt, systemPrompt);
        if (aiAnswer) {
          const aiFlag = aiAnswer.match(/DH\{[^}]+\}/)?.[0];
          if (aiFlag) {
            flag = aiFlag;
            logger.info(`🤖 AI 최후 추론 플래그: ${flag}`);
          } else {
            logger.warn(`🤖 AI 응답에 DH{...} 플래그 없음: ${aiAnswer.substring(0, 100)}`);
          }
        } else {
          logger.warn('⚠️ 모든 AI 프로바이더가 응답하지 않았습니다.');
        }
      } catch (err) {
        logger.error(`⚠️ AI 최후 추론 실패: ${err.message}`);
      }
    }

    // ─── 플래그 제출 ────────────────────────────────────────────────────
    await page.bringToFront();
    await randomDelay(1500, 3000);

    if (flag) {
      logger.info(`🔑 워게임 [${title}] 에 플래그 입력 시도: ${flag}`);

      const inputExists = await page.evaluate((f) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const targetInput =
          inputs.find(
            (i) =>
              i.placeholder.includes('플래그') ||
              i.placeholder.includes('DH{') ||
              i.placeholder.includes('flag') ||
              i.className.includes('flag'),
          ) || inputs[0];

        if (targetInput) {
          targetInput.value = f;
          targetInput.dispatchEvent(new Event('input', { bubbles: true }));
          targetInput.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        return false;
      }, flag);

      if (inputExists) {
        await randomDelay(500, 1000);

        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const submitBtn = btns.find(
            (b) => b.innerText.includes('제출') || b.innerText.includes('인증') || b.innerText.includes('Submit'),
          );
          if (submitBtn) submitBtn.click();
        });

        await randomDelay(2000, 4000);

        const result = await page.evaluate(() => {
          const text = document.body.innerText;
          const successKeywords = ['정답입니다', 'Correct', '축하합니다', '성공', '통과', '맞췄습니다'];
          const failureKeywords = ['아쉽게도 틀렸습니다', '틀렸', '오답', 'Incorrect', 'Wrong', '실패', 'Failed', '잘못된 정답입니다'];
          let isSuccess = false;
          let isFailure = false;

          for (const kw of successKeywords) if (text.includes(kw)) { isSuccess = true; break; }
          for (const kw of failureKeywords) if (text.includes(kw)) { isFailure = true; break; }

          const successEls = document.querySelectorAll('.is-success, .is-correct, .check-icon, .success-icon, .el-icon-success');
          const failureEls = document.querySelectorAll('.is-wrong, .is-incorrect, .is-error, .wrong-icon, .el-icon-error');
          if (successEls.length > 0) isSuccess = true;
          if (failureEls.length > 0) isFailure = true;

          const alertBox = document.querySelector('.el-message-box, .el-notification, .modal, .message-box');
          if (alertBox) {
            const modalText = alertBox.innerText || '';
            for (const kw of successKeywords) if (modalText.includes(kw)) { isSuccess = true; break; }
            for (const kw of failureKeywords) if (modalText.includes(kw)) { isFailure = true; break; }
            const alertBtn = alertBox.querySelector('.el-button--primary, .btn-primary, .confirm-btn, [class*="confirm"]');
            if (alertBtn) alertBtn.click();
          }

          if (isSuccess && !isFailure) return { success: true, message: '정답' };
          if (isFailure && !isSuccess) return { success: false, message: '오답' };
          if (isSuccess && isFailure) return { success: false, message: '오답 (충돌)' };
          return { success: false, message: '결과 불명확' };
        });

        if (result.success) {
          logger.info(`🎉 워게임 [${title}] 정답 처리됨!`);
        } else {
          logger.info(`❌ 워게임 [${title}] 플래그 제출 실패: ${result.message}. 넘어갑니다.`);
        }
      } else {
        logger.warn('⚠️ 플래그 입력 칸을 찾지 못했습니다.');
      }
    } else {
      logger.warn(`⚠️ 워게임 [${title}] 플래그를 찾지 못해 건너뜁니다.`);
    }
  } catch (err) {
    logger.error(`⚠️ 워게임 처리 중 에러: ${err.message}`);
  }
}

module.exports = {
  solveWargameChallenge,
};
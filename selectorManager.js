const logger = require('./logger');
const { errorHandler } = require('./errorHandler');

/**
 * 셀렉터 관리자 클래스
 * 동적 셀렉터 탐지, 업데이트, 대체 전략 제공
 */
class SelectorManager {
  constructor() {
    this.selectors = new Map();
    this.selectorHistory = new Map();
    this.selectorStats = new Map();
    this.alternativeSelectors = new Map();
    this.learningMode = false;
    
    // 기본 셀렉터 초기화
    this.initializeDefaultSelectors();
  }

  /**
   * 기본 셀렉터 초기화
   */
  initializeDefaultSelectors() {
    const defaultSelectors = {
      // 커리큘럼 페이지
      'lectureItem': '.entity',
      'incompleteIndicator': '.action-text:not(.completed)',
      'lectureLink': '.entity-body a',
      
      // 강의 페이지
      'completeBtn': 'button.btn.btn-primary',
      'popupHeader': '.popup-header',
      'slotWrapper': '.slot-wrapper',
      
      // 퀴즈 페이지
      'quizTitle': '.quiz-title',
      'quizStep': '.step',
      'quizStepCurrent': '.step.is-current',
      'quizStepAccessible': '.step.is-accessible',
      'quizStepCompleted': '.check-icon',
      'quizQuestion': '.quiz-question',
      'quizChoice': '.choice',
      'quizChoiceActive': '.choice.is-active',
      'quizSubmitBtn': '.btn.btn-primary',
      'quizSubmitDisabled': '.btn.btn-primary.disabled',
      'quizRetryBtn': '.btn.btn-primary'
    };

    const defaultAlternatives = {
      'lectureItem': ['.lecture-item', '.course-item', '.item', '[class*="entity"]'],
      'completeBtn': [
        'button:contains("진행하기")',
        'button:contains("다음 주제로")',
        '.next-button',
        '[class*="btn-primary"]',
        'button.el-button--primary'
      ],
      'quizChoice': [
        '.quiz-choice',
        '.choice-item',
        '.option',
        '.answer-option',
        '.el-radio',
        '.el-checkbox',
        'input[type="radio"] + label',
        'input[type="checkbox"] + label'
      ],
      'quizSubmitBtn': [
        'button:contains("확인")',
        'button:contains("제출")',
        'button:contains("Submit")',
        '.submit-button',
        '.el-button--primary'
      ]
    };

    // 기본 셀렉터 등록
    for (const [name, selector] of Object.entries(defaultSelectors)) {
      this.registerSelector(name, selector);
    }

    // 대체 셀렉터 등록
    for (const [name, alternatives] of Object.entries(defaultAlternatives)) {
      this.setAlternativeSelectors(name, alternatives);
    }
  }

  /**
   * 셀렉터 등록
   */
  registerSelector(name, selector, alternatives = []) {
    this.selectors.set(name, {
      selector,
      lastUsed: Date.now(),
      successCount: 0,
      failureCount: 0,
      lastSuccess: null,
      lastFailure: null
    });

    if (alternatives.length > 0) {
      this.setAlternativeSelectors(name, alternatives);
    }

    // 히스토리 초기화
    if (!this.selectorHistory.has(name)) {
      this.selectorHistory.set(name, []);
    }

    logger.debug(`🔧 셀렉터 등록: ${name} = "${selector}"`);
  }

  /**
   * 대체 셀렉터 설정
   */
  setAlternativeSelectors(name, alternatives) {
    this.alternativeSelectors.set(name, alternatives);
    logger.debug(`🔧 ${name} 대체 셀렉터 설정: ${alternatives.length}개`);
  }

  /**
   * 셀렉터 사용 성공 기록
   */
  recordSuccess(name) {
    const selectorInfo = this.selectors.get(name);
    if (selectorInfo) {
      selectorInfo.successCount++;
      selectorInfo.lastSuccess = Date.now();
      selectorInfo.lastUsed = Date.now();
      
      // 성공률 계산
      const total = selectorInfo.successCount + selectorInfo.failureCount;
      const successRate = total > 0 ? (selectorInfo.successCount / total) * 100 : 0;
      
      logger.debug(`✅ 셀렉터 성공: ${name} (성공률: ${successRate.toFixed(1)}%)`);
    }
  }

  /**
   * 셀렉터 사용 실패 기록
   */
  recordFailure(name, error = null) {
    const selectorInfo = this.selectors.get(name);
    if (selectorInfo) {
      selectorInfo.failureCount++;
      selectorInfo.lastFailure = Date.now();
      selectorInfo.lastUsed = Date.now();
      
      // 실패 시 대체 셀렉터 학습 모드 활성화
      if (this.learningMode && error) {
        this.learnFromFailure(name, error);
      }
      
      logger.warn(`❌ 셀렉터 실패: ${name}`, {
        error: error?.message,
        successCount: selectorInfo.successCount,
        failureCount: selectorInfo.failureCount
      });
    }
  }

  /**
   * 실패로부터 학습
   */
  learnFromFailure(name, error) {
    const errorMessage = error.message.toLowerCase();
    
    // 에러 메시지에서 힌트 추출
    if (errorMessage.includes('not found') || errorMessage.includes('timeout')) {
      logger.info(`🤖 학습 모드: ${name} 셀렉터 업데이트 필요 감지`);
      
      // 현재 페이지에서 유사한 요소 탐색 시도
      // (실제 구현에서는 page 객체가 필요함)
      this.scheduleSelectorUpdate(name);
    }
  }

  /**
   * 셀렉터 업데이트 스케줄링
   */
  scheduleSelectorUpdate(name) {
    // 이미 업데이트 예정인지 확인
    if (this.selectorStats.has(`${name}_update_scheduled`)) {
      return;
    }
    
    this.selectorStats.set(`${name}_update_scheduled`, true);
    
    // 5분 후 업데이트 시도
    setTimeout(() => {
      this.attemptSelectorUpdate(name);
      this.selectorStats.delete(`${name}_update_scheduled`);
    }, 5 * 60 * 1000);
  }

  /**
   * 셀렉터 업데이트 시도
   */
  async attemptSelectorUpdate(name) {
    logger.info(`🔄 ${name} 셀렉터 자동 업데이트 시도`);
    
    // 실제 구현에서는 현재 페이지에서 새로운 셀렉터 탐색
    // 여기서는 예시만 제공
    const newSelector = await this.discoverNewSelector(name);
    
    if (newSelector) {
      this.updateSelector(name, newSelector);
    }
  }

  /**
   * 새로운 셀렉터 탐색 (가상 구현)
   */
  async discoverNewSelector(name) {
    // 실제 구현에서는 Puppeteer 페이지 객체를 사용하여
    // 현재 페이지에서 유사한 요소 탐색
    // 예: data-testid, aria-label, 클래스 패턴 등
    
    logger.debug(`🔍 ${name} 새로운 셀렉터 탐색 중...`);
    
    // 탐색 로직 (실제로는 페이지 분석 필요)
    const discoveryStrategies = [
      // 1. data-testid 속성 탐색
      async (page) => {
        const elements = await page.$$('[data-testid]');
        for (const element of elements) {
          const testId = await page.evaluate(el => el.getAttribute('data-testid'), element);
          if (testId && testId.includes(name.toLowerCase())) {
            return `[data-testid="${testId}"]`;
          }
        }
        return null;
      },
      
      // 2. aria-label 속성 탐색
      async (page) => {
        const elements = await page.$$('[aria-label]');
        for (const element of elements) {
          const ariaLabel = await page.evaluate(el => el.getAttribute('aria-label'), element);
          if (ariaLabel && ariaLabel.toLowerCase().includes(name.toLowerCase())) {
            return `[aria-label="${ariaLabel}"]`;
          }
        }
        return null;
      },
      
      // 3. 클래스 패턴 탐색
      async (page) => {
        const classPatterns = [
          `.*${name}.*`,
          `.*${name.replace(/([A-Z])/g, '-$1').toLowerCase()}.*`,
          `.*${name.toLowerCase()}.*`
        ];
        
        for (const pattern of classPatterns) {
          const elements = await page.$$(`[class*="${pattern}"]`);
          if (elements.length > 0) {
            const className = await page.evaluate(el => el.className, elements[0]);
            const classList = className.split(' ').find(cls => cls.includes(name.toLowerCase()));
            if (classList) {
              return `.${classList}`;
            }
          }
        }
        return null;
      },
      
      // 4. 텍스트 내용 탐색
      async (page) => {
        const xpath = `//*[contains(text(), "${name}") or contains(@value, "${name}")]`;
        const elements = await page.$x(xpath);
        if (elements.length > 0) {
          // 부모 요소의 셀렉터 찾기
          const parentSelector = await page.evaluate(el => {
            let current = el;
            let selector = '';
            while (current && current !== document.body) {
              if (current.id) {
                selector = `#${current.id} > ${selector}`;
                break;
              }
              if (current.className) {
                const classes = current.className.split(' ').filter(c => c).join('.');
                selector = `.${classes} > ${selector}`;
              }
              current = current.parentElement;
            }
            return selector || null;
          }, elements[0]);
          
          return parentSelector;
        }
        return null;
      }
    ];
    
    // 실제 페이지 객체가 없으므로 null 반환
    return null;
  }

  /**
   * 셀렉터 업데이트
   */
  updateSelector(name, newSelector, alternatives = []) {
    const oldSelector = this.selectors.get(name);
    if (!oldSelector) {
      logger.warn(`⚠️ 업데이트할 셀렉터 없음: ${name}`);
      return false;
    }
    
    // 히스토리에 추가
    this.selectorHistory.get(name).push({
      timestamp: Date.now(),
      oldSelector: oldSelector.selector,
      newSelector,
      reason: 'manual_update'
    });
    
    // 셀렉터 업데이트
    oldSelector.selector = newSelector;
    oldSelector.lastUsed = Date.now();
    
    // 대체 셀렉터 업데이트
    if (alternatives.length > 0) {
      this.setAlternativeSelectors(name, alternatives);
    }
    
    logger.info(`🔧 셀렉터 업데이트: ${name} = "${newSelector}"`);
    return true;
  }

  /**
   * 셀렉터 가져오기 (에러 처리 포함)
   */
  async getSelector(name, page = null, options = {}) {
    const selectorInfo = this.selectors.get(name);
    if (!selectorInfo) {
      throw new Error(`알 수 없는 셀렉터: ${name}`);
    }
    
    const { timeout = 10000, retry = true } = options;
    
    // 페이지 객체가 있으면 셀렉터 검증
    if (page && retry) {
      return await this.getSelectorWithRetry(name, page, timeout);
    }
    
    return selectorInfo.selector;
  }

  /**
   * 재시도 포함 셀렉터 가져오기
   */
  async getSelectorWithRetry(name, page, timeout) {
    const selectorInfo = this.selectors.get(name);
    const alternatives = this.alternativeSelectors.get(name) || [];
    
    // 시도할 셀렉터 목록 (주 셀렉터 + 대체 셀렉터)
    const selectorCandidates = [selectorInfo.selector, ...alternatives];
    
    for (let i = 0; i < selectorCandidates.length; i++) {
      const selector = selectorCandidates[i];
      const isPrimary = i === 0;
      
      try {
        logger.debug(`🔍 셀렉터 시도: ${name} (${isPrimary ? '주' : '대체'} ${i}) = "${selector}"`);
        
        // 요소 찾기 시도
        const element = await page.waitForSelector(selector, { timeout: timeout / selectorCandidates.length });
        
        if (element) {
          // 성공 기록
          if (isPrimary) {
            this.recordSuccess(name);
          } else {
            // 대체 셀렉터 성공 시 주 셀렉터 업데이트 고려
            logger.info(`✅ 대체 셀렉터 성공: ${name} = "${selector}"`);
            this.considerSelectorUpdate(name, selector);
          }
          
          return selector;
        }
      } catch (error) {
        // 실패 기록 (주 셀렉터만)
        if (isPrimary) {
          this.recordFailure(name, error);
        }
        
        // 마지막 시도인지 확인
        if (i === selectorCandidates.length - 1) {
          throw new Error(`모든 셀렉터 실패: ${name}. 마지막 에러: ${error.message}`);
        }
        
        // 다음 셀렉터 시도
        continue;
      }
    }
    
    // 이 부분은 도달하지 않아야 함
    throw new Error(`셀렉터 찾기 실패: ${name}`);
  }

  /**
   * 셀렉터 업데이트 고려
   */
  considerSelectorUpdate(name, successfulSelector) {
    const selectorInfo = this.selectors.get(name);
    if (!selectorInfo) return;
    
    // 현재 셀렉터와 성공한 셀렉터가 다를 경우
    if (selectorInfo.selector !== successfulSelector) {
      // 실패율이 높으면 업데이트 고려
      const total = selectorInfo.successCount + selectorInfo.failureCount;
      const failureRate = total > 0 ? (selectorInfo.failureCount / total) * 100 : 0;
      
      if (failureRate > 50) { // 50% 이상 실패 시
        logger.info(`🔄 셀렉터 업데이트 고려: ${name} (실패율: ${failureRate.toFixed(1)}%)`);
        this.updateSelector(name, successfulSelector);
      }
    }
  }

  /**
   * 페이지에서 셀렉터 자동 탐색
   */
  async discoverSelectorsFromPage(page, context = 'unknown') {
    if (!page) {
      logger.warn('⚠️ 페이지 객체 없음: 셀렉터 탐색 불가');
      return {};
    }
    
    logger.info(`🔍 페이지에서 셀렉터 자동 탐색: ${context}`);
    
    const discoveredSelectors = {};
    
    try {
      // 1. 버튼 탐색
      const buttons = await page.$$('button');
      for (const button of buttons) {
        const text = await page.evaluate(el => el.innerText.trim(), button);
        if (text) {
          const normalizedText = text.toLowerCase().replace(/\s+/g, '');
          
          if (normalizedText.includes('진행하기') || normalizedText.includes('다음주제로')) {
            discoveredSelectors.completeBtn = await this.getElementSelector(page, button);
          } else if (normalizedText.includes('확인') || normalizedText.includes('제출')) {
            discoveredSelectors.quizSubmitBtn = await this.getElementSelector(page, button);
          } else if (normalizedText.includes('재도전') || normalizedText.includes('다시')) {
            discoveredSelectors.quizRetryBtn = await this.getElementSelector(page, button);
          }
        }
      }
      
      // 2. 선택지 탐색
      const choiceElements = await page.$$('.choice, .quiz-choice, .option, .answer-option');
      if (choiceElements.length > 0) {
        discoveredSelectors.quizChoice = await this.getElementSelector(page, choiceElements[0]);
      }
      
      // 3. 강의 항목 탐색
      const lectureItems = await page.$$('.entity, .lecture-item, .course-item');
      if (lectureItems.length > 0) {
        discoveredSelectors.lectureItem = await this.getElementSelector(page, lectureItems[0]);
      }
      
      logger.info(`✅ 셀렉터 탐색 완료: ${Object.keys(discoveredSelectors).length}개 발견`);
      
      // 발견된 셀렉터 등록
      for (const [name, selector] of Object.entries(discoveredSelectors)) {
        if (selector) {
          this.registerSelector(name, selector);
        }
      }
      
      return discoveredSelectors;
      
    } catch (error) {
      logger.error(`❌ 셀렉터 탐색 실패: ${error.message}`);
      return {};
    }
  }

  /**
   * 요소의 셀렉터 생성
   */
  async getElementSelector(page, element) {
    return await page.evaluate(el => {
      // ID가 있으면 ID 셀렉터 사용
      if (el.id) {
        return `#${el.id}`;
      }
      
      // 클래스가 있으면 클래스 셀렉터 사용
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ').filter(c => c
const logger = require('./logger');

/**
 * 재시도 관리자 클래스
 * 지수 백오프, 최대 재시도 횟수, 조건부 재시도 기능 제공
 */
class RetryManager {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000; // 기본 딜레이 (ms)
    this.maxDelay = options.maxDelay || 30000; // 최대 딜레이 (ms)
    this.backoffFactor = options.backoffFactor || 2; // 지수 백오프 계수
    this.jitter = options.jitter || 0.1; // 지터 (0-1 사이, 무작위성 추가)
    this.retryableErrors = options.retryableErrors || [
      'timeout', 'network', 'selector', 'element', 'navigation'
    ];
    this.nonRetryableErrors = options.nonRetryableErrors || [
      'authentication', 'validation', 'logic', 'unsupported'
    ];
    
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelay: 0
    };
  }

  /**
   * 에러 분류 함수
   * @param {Error} error - 발생한 에러
   * @returns {Object} 분류 결과
   */
  classifyError(error) {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name.toLowerCase();
    
    // 네트워크 관련 에러
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return { category: 'timeout', retryable: true };
    }
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return { category: 'network', retryable: true };
    }
    if (errorMessage.includes('net::')) {
      return { category: 'network', retryable: true };
    }
    
    // 셀렉터 관련 에러
    if (errorMessage.includes('selector') || errorMessage.includes('element') || 
        errorMessage.includes('waitforselector') || errorMessage.includes('waitforfunction')) {
      return { category: 'selector', retryable: true };
    }
    
    // 네비게이션 관련 에러
    if (errorMessage.includes('navigation') || errorMessage.includes('goto')) {
      return { category: 'navigation', retryable: true };
    }
    
    // 인증 관련 에러 (재시도 불가)
    if (errorMessage.includes('login') || errorMessage.includes('authentication') || 
        errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      return { category: 'authentication', retryable: false };
    }
    
    // 검증 에러 (재시도 불가)
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      return { category: 'validation', retryable: false };
    }
    
    // 로직 에러 (재시도 불가)
    if (errorMessage.includes('logic') || errorMessage.includes('not implemented')) {
      return { category: 'logic', retryable: false };
    }
    
    // 기본적으로 재시도 가능한 에러로 분류
    return { category: 'unknown', retryable: true };
  }

  /**
   * 지수 백오프 딜레이 계산
   * @param {number} attempt - 현재 시도 횟수 (1부터 시작)
   * @returns {number} 딜레이 시간 (ms)
   */
  calculateBackoffDelay(attempt) {
    // 지수 백오프 계산
    let delay = this.baseDelay * Math.pow(this.backoffFactor, attempt - 1);
    
    // 최대 딜레이 제한
    delay = Math.min(delay, this.maxDelay);
    
    // 지터 추가 (무작위성)
    const jitterAmount = delay * this.jitter;
    delay += (Math.random() * 2 - 1) * jitterAmount;
    
    // 최소 100ms 보장
    return Math.max(100, Math.round(delay));
  }

  /**
   * 비동기 작업 재시도 실행
   * @param {Function} operation - 실행할 비동기 함수
   * @param {Object} options - 재시도 옵션
   * @returns {Promise} 작업 결과
   */
  async executeWithRetry(operation, options = {}) {
    const operationName = options.name || 'unnamed-operation';
    const maxRetries = options.maxRetries || this.maxRetries;
    const shouldRetry = options.shouldRetry || this.defaultShouldRetry.bind(this);
    
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        this.stats.totalAttempts++;
        logger.debug(`🔄 [${operationName}] 시도 ${attempt}/${maxRetries + 1}`);
        
        const result = await operation();
        
        if (attempt > 1) {
          this.stats.successfulRetries++;
          logger.info(`✅ [${operationName}] ${attempt}번째 시도에서 성공`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        
        // 에러 분류
        const classification = this.classifyError(error);
        
        // 마지막 시도인지 확인
        const isLastAttempt = attempt === maxRetries + 1;
        
        // 재시도 가능 여부 확인
        const canRetry = !isLastAttempt && 
                        classification.retryable && 
                        shouldRetry(error, attempt, classification);
        
        if (canRetry) {
          // 재시도 딜레이 계산 및 대기
          const delay = this.calculateBackoffDelay(attempt);
          this.stats.totalDelay += delay;
          
          logger.warn(`⚠️ [${operationName}] ${classification.category} 에러 발생, ${delay}ms 후 재시도 (${attempt}/${maxRetries})`, {
            error: error.message,
            category: classification.category,
            delay: delay,
            attempt: attempt,
            maxRetries: maxRetries
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
          
        } else {
          // 재시도 불가능한 에러 또는 마지막 시도
          this.stats.failedRetries++;
          
          if (isLastAttempt) {
            logger.error(`❌ [${operationName}] 최대 재시도 횟수(${maxRetries}) 초과`, {
              error: error.message,
              category: classification.category,
              totalAttempts: attempt
            });
          } else {
            logger.error(`❌ [${operationName}] 재시도 불가능한 에러 발생`, {
              error: error.message,
              category: classification.category,
              retryable: classification.retryable
            });
          }
          
          throw error;
        }
      }
    }
    
    // 이 부분은 도달하지 않아야 하지만, 타입스크립트를 위해 추가
    throw lastError;
  }

  /**
   * 기본 재시도 조건 함수
   * @param {Error} error - 발생한 에러
   * @param {number} attempt - 현재 시도 횟수
   * @param {Object} classification - 에러 분류 결과
   * @returns {boolean} 재시도 여부
   */
  defaultShouldRetry(error, attempt, classification) {
    // 특정 에러 메시지 패턴은 재시도하지 않음
    const nonRetryablePatterns = [
      'invalid credentials',
      'user not found',
      'course completed',
      'already solved'
    ];
    
    const errorMessage = error.message.toLowerCase();
    if (nonRetryablePatterns.some(pattern => errorMessage.includes(pattern))) {
      return false;
    }
    
    return classification.retryable;
  }

  /**
   * 페이지 작업 재시도 (Puppeteer 특화)
   * @param {Object} page - Puppeteer 페이지 객체
   * @param {Function} pageOperation - 페이지 작업 함수
   * @param {Object} options - 옵션
   * @returns {Promise} 작업 결과
   */
  async executePageOperationWithRetry(page, pageOperation, options = {}) {
    const operationName = options.name || 'page-operation';
    const selector = options.selector;
    const timeout = options.timeout || 30000;
    
    return this.executeWithRetry(async () => {
      // 페이지가 닫혔는지 확인
      if (page.isClosed()) {
        throw new Error('Page is closed');
      }
      
      // 셀렉터가 지정된 경우 대기
      if (selector) {
        try {
          await page.waitForSelector(selector, { timeout: timeout / 2 });
        } catch (error) {
          throw new Error(`Selector not found: ${selector} - ${error.message}`);
        }
      }
      
      // 페이지 작업 실행
      return await pageOperation(page);
    }, {
      name: operationName,
      maxRetries: options.maxRetries,
      shouldRetry: (error, attempt) => {
        // 페이지 닫힘 에러는 재시도 불가
        if (error.message.includes('Page is closed')) {
          return false;
        }
        
        // 네트워크 에러는 재시도
        if (error.message.includes('net::') || error.message.includes('timeout')) {
          return true;
        }
        
        // 셀렉터 에러는 재시도 (사이트 업데이트 가능성)
        if (error.message.includes('Selector not found')) {
          return attempt <= 2; // 셀렉터 에러는 최대 2번만 재시도
        }
        
        return true;
      }
    });
  }

  /**
   * 통계 정보 반환
   * @returns {Object} 통계 정보
   */
  getStats() {
    return {
      ...this.stats,
      averageDelay: this.stats.totalAttempts > 0 ? 
        Math.round(this.stats.totalDelay / this.stats.totalAttempts) : 0,
      successRate: this.stats.totalAttempts > 0 ?
        ((this.stats.totalAttempts - this.stats.failedRetries) / this.stats.totalAttempts * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 통계 리셋
   */
  resetStats() {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      totalDelay: 0
    };
  }
}

// 싱글톤 인스턴스 생성
const retryManager = new RetryManager();

module.exports = {
  RetryManager,
  retryManager
};
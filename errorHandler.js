const logger = require('./logger');
const { retryManager } = require('./retryManager');

/**
 * 에러 핸들러 클래스
 * 통합된 에러 처리, 분류, 복구 전략 제공
 */
class ErrorHandler {
  constructor() {
    this.errorStats = {
      totalErrors: 0,
      byCategory: {},
      byOperation: {},
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
    
    this.recoveryStrategies = new Map();
    this.initializeRecoveryStrategies();
  }

  /**
   * 복구 전략 초기화
   */
  initializeRecoveryStrategies() {
    // 네트워크 에러 복구 전략
    this.recoveryStrategies.set('network', {
      name: '네트워크 복구',
      priority: 1,
      execute: async (context) => {
        const { page, browser } = context;
        
        logger.warn('🌐 네트워크 에러 복구 시도 중...');
        
        // 1. 페이지 새로고침
        try {
          await page.reload({ waitUntil: 'networkidle2', timeout: 10000 });
          logger.info('✅ 페이지 새로고침 성공');
          return { success: true, action: 'page_reload' };
        } catch (error) {
          logger.warn('⚠️ 페이지 새로고침 실패, 다음 전략 시도');
        }
        
        // 2. 새 탭 생성 및 이동
        try {
          const newPage = await browser.newPage();
          await newPage.goto(page.url(), { waitUntil: 'networkidle2', timeout: 15000 });
          
          // 기존 페이지 닫기
          await page.close();
          
          logger.info('✅ 새 탭 생성 및 이동 성공');
          return { success: true, action: 'new_tab', newPage };
        } catch (error) {
          logger.warn('⚠️ 새 탭 생성 실패');
        }
        
        return { success: false, action: 'none' };
      }
    });

    // 셀렉터 에러 복구 전략
    this.recoveryStrategies.set('selector', {
      name: '셀렉터 복구',
      priority: 2,
      execute: async (context) => {
        const { page, selector, alternativeSelectors = [] } = context;
        
        logger.warn('🔍 셀렉터 에러 복구 시도 중...');
        
        // 1. 대체 셀렉터 시도
        for (const altSelector of alternativeSelectors) {
          try {
            const element = await page.waitForSelector(altSelector, { timeout: 5000 });
            if (element) {
              logger.info(`✅ 대체 셀렉터 발견: ${altSelector}`);
              return { success: true, action: 'alternative_selector', selector: altSelector };
            }
          } catch (error) {
            // 계속 시도
          }
        }
        
        // 2. XPath로 시도
        if (selector) {
          try {
            // CSS 셀렉터를 XPath로 변환 시도 (간단한 변환)
            const xpath = this.cssToXPath(selector);
            const elements = await page.$x(xpath);
            if (elements.length > 0) {
              logger.info(`✅ XPath로 요소 발견: ${xpath}`);
              return { success: true, action: 'xpath', xpath };
            }
          } catch (error) {
            // XPath 변환 실패
          }
        }
        
        // 3. 텍스트 기반 검색
        try {
          const element = await this.findElementByText(page, selector);
          if (element) {
            logger.info('✅ 텍스트 기반 요소 발견');
            return { success: true, action: 'text_based' };
          }
        } catch (error) {
          // 텍스트 검색 실패
        }
        
        return { success: false, action: 'none' };
      }
    });

    // 인증 에러 복구 전략
    this.recoveryStrategies.set('authentication', {
      name: '인증 복구',
      priority: 3,
      execute: async (context) => {
        const { page, credentials } = context;
        
        logger.warn('🔐 인증 에러 복구 시도 중...');
        
        if (!credentials) {
          logger.error('❌ 복구 불가: 인증 정보 없음');
          return { success: false, action: 'no_credentials' };
        }
        
        try {
          // 로그인 페이지로 이동
          await page.goto('https://dreamhack.io/users/login', { waitUntil: 'networkidle2' });
          
          // 로그인 시도
          await page.type('input[type="email"]', credentials.email);
          await page.type('input[type="password"]', credentials.password);
          await page.click('button[type="submit"]');
          
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
          
          logger.info('✅ 재로그인 성공');
          return { success: true, action: 'relogin' };
        } catch (error) {
          logger.error(`❌ 재로그인 실패: ${error.message}`);
          return { success: false, action: 'relogin_failed' };
        }
      }
    });

    // 세션 복구 전략
    this.recoveryStrategies.set('session', {
      name: '세션 복구',
      priority: 4,
      execute: async (context) => {
        const { browser, sessionData } = context;
        
        logger.warn('🔄 세션 복구 시도 중...');
        
        try {
          // 새 브라우저 인스턴스 생성
          const newBrowser = await require('./utils').launchBrowser();
          const newPage = await newBrowser.newPage();
          
          // 세션 데이터 복원 (쿠키, 로컬 스토리지 등)
          if (sessionData && sessionData.cookies) {
            await newPage.setCookie(...sessionData.cookies);
          }
          
          logger.info('✅ 새 브라우저 세션 생성');
          return { success: true, action: 'new_browser_session', browser: newBrowser, page: newPage };
        } catch (error) {
          logger.error(`❌ 세션 복구 실패: ${error.message}`);
          return { success: false, action: 'session_recovery_failed' };
        }
      }
    });
  }

  /**
   * CSS 셀렉터를 XPath로 변환 (간단한 변환)
   */
  cssToXPath(cssSelector) {
    // 간단한 변환만 구현 (실제로는 더 복잡한 변환 필요)
    if (cssSelector.startsWith('.')) {
      return `//*[contains(@class, "${cssSelector.substring(1)}")]`;
    } else if (cssSelector.startsWith('#')) {
      return `//*[@id="${cssSelector.substring(1)}"]`;
    } else {
      return `//${cssSelector}`;
    }
  }

  /**
   * 텍스트 기반 요소 검색
   */
  async findElementByText(page, text) {
    try {
      const elements = await page.$x(`//*[contains(text(), "${text}")]`);
      return elements.length > 0 ? elements[0] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 에러 처리 및 복구 시도
   */
  async handleError(error, context = {}) {
    this.errorStats.totalErrors++;
    
    // 에러 분류
    const classification = retryManager.classifyError(error);
    const category = classification.category;
    
    // 통계 업데이트
    this.errorStats.byCategory[category] = (this.errorStats.byCategory[category] || 0) + 1;
    
    if (context.operation) {
      this.errorStats.byOperation[context.operation] = (this.errorStats.byOperation[context.operation] || 0) + 1;
    }
    
    // 에러 로깅
    this.logError(error, classification, context);
    
    // 복구 가능한 에러인지 확인
    if (this.canRecover(classification, context)) {
      this.errorStats.recoveryAttempts++;
      
      try {
        const recoveryResult = await this.attemptRecovery(classification, context);
        
        if (recoveryResult.success) {
          this.errorStats.successfulRecoveries++;
          logger.info(`✅ 에러 복구 성공: ${recoveryResult.action}`);
          return recoveryResult;
        } else {
          logger.warn(`⚠️ 에러 복구 실패: ${category}`);
        }
      } catch (recoveryError) {
        logger.error(`❌ 복구 시도 중 에러: ${recoveryError.message}`);
      }
    }
    
    // 복구 불가능한 에러 또는 복구 실패
    return {
      success: false,
      category,
      error,
      context,
      shouldRetry: classification.retryable
    };
  }

  /**
   * 복구 가능 여부 확인
   */
  canRecover(classification, context) {
    const category = classification.category;
    
    // 복구 전략이 있는지 확인
    if (!this.recoveryStrategies.has(category)) {
      return false;
    }
    
    // 컨텍스트 확인
    switch (category) {
      case 'network':
        return context.page && context.browser;
      case 'selector':
        return context.page;
      case 'authentication':
        return context.page && context.credentials;
      case 'session':
        return true; // 항상 세션 복구 시도
      default:
        return false;
    }
  }

  /**
   * 복구 시도
   */
  async attemptRecovery(classification, context) {
    const category = classification.category;
    const strategy = this.recoveryStrategies.get(category);
    
    if (!strategy) {
      return { success: false, action: 'no_strategy' };
    }
    
    logger.info(`🛠️ ${strategy.name} 실행 중...`);
    
    try {
      const result = await strategy.execute(context);
      return {
        success: result.success,
        action: result.action,
        data: result
      };
    } catch (error) {
      logger.error(`❌ 복구 전략 실행 실패: ${error.message}`);
      return { success: false, action: 'strategy_execution_failed', error };
    }
  }

  /**
   * 에러 로깅
   */
  logError(error, classification, context) {
    const logData = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      classification,
      context: {
        operation: context.operation,
        url: context.page ? context.page.url() : 'unknown',
        hasCredentials: !!context.credentials
      }
    };
    
    if (classification.retryable) {
      logger.warn(`⚠️ 재시도 가능 에러: ${classification.category}`, logData);
    } else {
      logger.error(`❌ 재시도 불가능 에러: ${classification.category}`, logData);
    }
  }

  /**
   * 통합 에러 처리 래퍼
   */
  async withErrorHandling(operation, context = {}) {
    const operationName = context.operation || 'unnamed-operation';
    
    try {
      return await operation();
    } catch (error) {
      const handleResult = await this.handleError(error, {
        ...context,
        operation: operationName
      });
      
      // 복구 성공 시 원래 작업 재시도
      if (handleResult.success && handleResult.data) {
        logger.info(`🔄 복구 후 원래 작업 재시도: ${operationName}`);
        
        // 복구 결과에 따라 컨텍스트 업데이트
        const updatedContext = { ...context };
        if (handleResult.data.newPage) {
          updatedContext.page = handleResult.data.newPage;
        }
        if (handleResult.data.browser) {
          updatedContext.browser = handleResult.data.browser;
        }
        
        // 재시도
        return await retryManager.executeWithRetry(
          () => operation(),
          { 
            name: `${operationName}-after-recovery`,
            maxRetries: 2 // 복구 후에는 적은 재시도
          }
        );
      }
      
      // 복구 실패 시 에러 전파
      throw error;
    }
  }

  /**
   * 페이지 작업 에러 처리 래퍼
   */
  async withPageErrorHandling(page, pageOperation, context = {}) {
    return this.withErrorHandling(
      () => retryManager.executePageOperationWithRetry(page, pageOperation, context),
      {
        ...context,
        page,
        operation: context.name || 'page-operation'
      }
    );
  }

  /**
   * 통계 정보 반환
   */
  getStats() {
    return {
      ...this.errorStats,
      recoveryRate: this.errorStats.recoveryAttempts > 0 ?
        ((this.errorStats.successfulRecoveries / this.errorStats.recoveryAttempts) * 100).toFixed(2) + '%' : '0%',
      errorRate: this.errorStats.totalErrors > 0 ?
        Object.entries(this.errorStats.byCategory).map(([category, count]) => ({
          category,
          count,
          percentage: ((count / this.errorStats.totalErrors) * 100).toFixed(2) + '%'
        })) : []
    };
  }

  /**
   * 통계 리셋
   */
  resetStats() {
    this.errorStats = {
      totalErrors: 0,
      byCategory: {},
      byOperation: {},
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
  }
}

// 싱글톤 인스턴스 생성
const errorHandler = new ErrorHandler();

module.exports = {
  ErrorHandler,
  errorHandler
};
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * 설정 관리자 클래스
 * 통합된 설정 관리, 검증, 백업 기능 제공
 */
class ConfigManager {
  constructor() {
    this.configPaths = {
      env: '.env',
      json: 'config.json',
      yaml: 'config.yaml',
      backup: 'config.backup.json'
    };
    
    this.defaultConfig = {
      // 브라우저 설정
      browser: {
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
          '--accept-lang=ko'
        ]
      },
      
      // 딜레이 설정 (밀리초)
      delays: {
        pageStay: { min: 30000, max: 180000 },
        betweenLectures: { min: 5000, max: 20000 },
        scrollPause: { min: 1000, max: 3000 },
        typeChar: { min: 50, max: 200 },
        quizRead: { min: 10000, max: 30000 },
        quizRetry: { min: 3000, max: 8000 }
      },
      
      // 재시도 설정
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffFactor: 2,
        jitter: 0.1
      },
      
      // AI 설정
      ai: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        maxTokens: 1024,
        temperature: 0.7,
        systemPrompt: '당신은 리버싱 및 x86-64, x86(32비트) 어셈블리 전문가입니다. 주어진 레지스터 상태와 메모리, 코드를 분석하여 정확한 결과값을 도출합니다.'
      },
      
      // 로깅 설정
      logging: {
        level: 'info',
        consoleLevel: 'info',
        fileLevel: 'info',
        structuredLogging: true
      },
      
      // 기능 토글
      features: {
        skipQuiz: false,
        enableWargameSolving: true,
        enableProgressTracking: true,
        enableErrorRecovery: true,
        enableSessionPersistence: true
      },
      
      // 셀렉터 설정 (동적 업데이트 가능)
      selectors: {
        // 커리큘럼 페이지
        lectureItem: '.entity',
        incompleteIndicator: '.action-text:not(.completed)',
        lectureLink: '.entity-body a',
        
        // 강의 페이지
        completeBtn: 'button.btn.btn-primary',
        popupHeader: '.popup-header',
        slotWrapper: '.slot-wrapper',
        
        // 퀴즈 페이지
        quizTitle: '.quiz-title',
        quizStep: '.step',
        quizStepCurrent: '.step.is-current',
        quizStepAccessible: '.step.is-accessible',
        quizStepCompleted: '.check-icon',
        quizQuestion: '.quiz-question',
        quizChoice: '.choice',
        quizChoiceActive: '.choice.is-active',
        quizSubmitBtn: '.btn.btn-primary',
        quizSubmitDisabled: '.btn.btn-primary.disabled',
        quizRetryBtn: '.btn.btn-primary'
      },
      
      // 대체 셀렉터 (주 셀렉터 실패 시 사용)
      alternativeSelectors: {
        lectureItem: ['.lecture-item', '.course-item', '.item'],
        completeBtn: ['button:contains("진행하기")', 'button:contains("다음 주제로")', '.next-button'],
        quizChoice: ['.quiz-choice', '.choice-item', '.option', '.answer-option']
      },
      
      // URL 설정
      urls: {
        login: 'https://dreamhack.io/users/login',
        curriculumBase: 'https://dreamhack.io/euser/curriculums/',
        examBase: 'https://learn.dreamhack.io/exam/'
      }
    };
    
    this.currentConfig = { ...this.defaultConfig };
    this.configHistory = [];
    this.maxHistorySize = 10;
  }

  /**
   * 설정 로드 (여러 소스에서 병합)
   */
  async load() {
    logger.info('⚙️ 설정 로드 중...');
    
    try {
      // 1. 기본 설정 로드
      this.currentConfig = { ...this.defaultConfig };
      
      // 2. JSON 설정 파일 로드
      await this.loadFromJson();
      
      // 3. 환경 변수 로드 및 병합
      await this.loadFromEnv();
      
      // 4. 설정 검증
      await this.validateConfig();
      
      // 5. 설정 백업 생성
      await this.createBackup();
      
      logger.info('✅ 설정 로드 완료');
      return this.currentConfig;
      
    } catch (error) {
      logger.error(`❌ 설정 로드 실패: ${error.message}`);
      
      // 백업에서 복구 시도
      try {
        await this.restoreFromBackup();
        logger.info('✅ 백업에서 설정 복구 완료');
        return this.currentConfig;
      } catch (backupError) {
        logger.error(`❌ 백업 복구 실패: ${backupError.message}`);
        throw new Error(`설정 로드 및 복구 실패: ${error.message}`);
      }
    }
  }

  /**
   * JSON 설정 파일 로드
   */
  async loadFromJson() {
    try {
      const configPath = this.configPaths.json;
      const data = await fs.readFile(configPath, 'utf8');
      const jsonConfig = JSON.parse(data);
      
      // 깊은 병합
      this.deepMerge(this.currentConfig, jsonConfig);
      logger.debug(`📁 JSON 설정 파일 로드: ${configPath}`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.debug('📁 JSON 설정 파일 없음, 기본 설정 사용');
      } else {
        logger.warn(`⚠️ JSON 설정 파일 파싱 실패: ${error.message}`);
      }
    }
  }

  /**
   * 환경 변수 로드
   */
  async loadFromEnv() {
    require('dotenv').config();
    
    const envMappings = {
      // 브라우저 설정
      'CHROME_PATH': 'browser.executablePath',
      'HEADLESS': 'browser.headless',
      
      // 딜레이 설정
      'TEST_MODE': '_testMode', // 특별 처리
      
      // AI 설정
      'DEEPSEEK_API_KEY': 'ai.apiKey',
      'AI_MODEL': 'ai.model',
      'AI_TEMPERATURE': 'ai.temperature',
      
      // 로깅 설정
      'LOG_LEVEL': 'logging.level',
      'CONSOLE_LOG_LEVEL': 'logging.consoleLevel',
      
      // 기능 설정
      'SKIP_QUIZ': 'features.skipQuiz',
      'ENABLE_WARGAME_SOLVING': 'features.enableWargameSolving',
      
      // URL 설정
      'CURRICULUM_URL': 'urls.curriculum',
      'EXAM_URL': 'urls.exam'
    };
    
    for (const [envKey, configPath] of Object.entries(envMappings)) {
      if (process.env[envKey] !== undefined) {
        this.setByPath(this.currentConfig, configPath, this.parseEnvValue(process.env[envKey]));
      }
    }
    
    // TEST_MODE 특별 처리
    if (process.env.TEST_MODE === '1') {
      this.currentConfig.delays.pageStay = { min: 500, max: 1000 };
      this.currentConfig.delays.betweenLectures = { min: 500, max: 1000 };
      this.currentConfig.delays.scrollPause = { min: 100, max: 300 };
      this.currentConfig.delays.quizRead = { min: 500, max: 1000 };
      this.currentConfig.delays.quizRetry = { min: 300, max: 500 };
    }
    
    logger.debug('🌍 환경 변수 설정 로드 완료');
  }

  /**
   * 환경 변수 값 파싱
   */
  parseEnvValue(value) {
    // 불리언 값
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // 숫자 값
    if (!isNaN(value) && value.trim() !== '') {
      return Number(value);
    }
    
    // 배열 값 (쉼표로 구분)
    if (value.includes(',')) {
      return value.split(',').map(item => item.trim());
    }
    
    // 문자열 값
    return value;
  }

  /**
   * 설정 검증
   */
  async validateConfig() {
    const errors = [];
    
    // 필수 설정 확인
    if (!this.currentConfig.ai?.apiKey && process.env.DEEPSEEK_API_KEY) {
      this.currentConfig.ai.apiKey = process.env.DEEPSEEK_API_KEY;
    }
    
    if (!this.currentConfig.ai?.apiKey) {
      errors.push('AI API 키가 설정되지 않았습니다. DEEPSEEK_API_KEY 환경 변수를 설정하세요.');
    }
    
    // 딜레이 범위 검증
    for (const [delayName, range] of Object.entries(this.currentConfig.delays)) {
      if (range.min > range.max) {
        errors.push(`딜레이 ${delayName}: 최소값(${range.min})이 최대값(${range.max})보다 큽니다.`);
      }
      if (range.min < 0 || range.max < 0) {
        errors.push(`딜레이 ${delayName}: 음수 값이 있습니다.`);
      }
    }
    
    // 재시도 설정 검증
    if (this.currentConfig.retry.maxRetries < 0) {
      errors.push('최대 재시도 횟수는 0 이상이어야 합니다.');
    }
    if (this.currentConfig.retry.baseDelay < 0) {
      errors.push('기본 딜레이는 0 이상이어야 합니다.');
    }
    
    // 셀렉터 검증 (기본값 확인)
    const requiredSelectors = ['lectureItem', 'lectureLink', 'completeBtn', 'quizChoice'];
    for (const selector of requiredSelectors) {
      if (!this.currentConfig.selectors[selector]) {
        errors.push(`필수 셀렉터가 없습니다: ${selector}`);
      }
    }
    
    if (errors.length > 0) {
      logger.warn('⚠️ 설정 검증 경고:', { errors });
      
      // 치명적이지 않은 경고는 계속 진행
      if (errors.some(e => e.includes('AI API 키'))) {
        throw new Error(`설정 검증 실패: ${errors.join(', ')}`);
      }
    }
    
    logger.debug('✅ 설정 검증 완료');
  }

  /**
   * 설정 저장
   */
  async save(config = null) {
    try {
      if (config) {
        this.currentConfig = config;
      }
      
      // 설정 히스토리에 추가
      this.addToHistory();
      
      // JSON 파일로 저장
      const configPath = this.configPaths.json;
      const configData = JSON.stringify(this.currentConfig, null, 2);
      await fs.writeFile(configPath, configData, 'utf8');
      
      // 환경 변수 파일 업데이트
      await this.updateEnvFile();
      
      logger.info(`💾 설정 저장 완료: ${configPath}`);
      return true;
      
    } catch (error) {
      logger.error(`❌ 설정 저장 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 환경 변수 파일 업데이트
   */
  async updateEnvFile() {
    try {
      const envPath = this.configPaths.env;
      let envContent = '';
      
      // 현재 환경 변수 읽기
      try {
        envContent = await fs.readFile(envPath, 'utf8');
      } catch (error) {
        // 파일이 없으면 새로 생성
        envContent = '# Dreamhack Bot Configuration\n\n';
      }
      
      // 주요 설정을 환경 변수로 추가/업데이트
      const envUpdates = {
        'SKIP_QUIZ': this.currentConfig.features.skipQuiz ? '1' : '0',
        'LOG_LEVEL': this.currentConfig.logging.level,
        'AI_MODEL': this.currentConfig.ai.model,
        'AI_TEMPERATURE': this.currentConfig.ai.temperature.toString()
      };
      
      // 환경 변수 업데이트
      for (const [key, value] of Object.entries(envUpdates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const newLine = `${key}=${value}`;
        
        if (regex.test(envContent)) {
          envContent = envContent.replace(regex, newLine);
        } else {
          envContent += `\n${newLine}`;
        }
      }
      
      await fs.writeFile(envPath, envContent, 'utf8');
      logger.debug(`🌍 환경 변수 파일 업데이트: ${envPath}`);
      
    } catch (error) {
      logger.warn(`⚠️ 환경 변수 파일 업데이트 실패: ${error.message}`);
    }
  }

  /**
   * 설정 백업 생성
   */
  async createBackup() {
    try {
      const backupPath = this.configPaths.backup;
      const backupData = JSON.stringify(this.currentConfig, null, 2);
      await fs.writeFile(backupPath, backupData, 'utf8');
      
      logger.debug(`💾 설정 백업 생성: ${backupPath}`);
      
    } catch (error) {
      logger.warn(`⚠️ 설정 백업 생성 실패: ${error.message}`);
    }
  }

  /**
   * 백업에서 복구
   */
  async restoreFromBackup() {
    try {
      const backupPath = this.configPaths.backup;
      const data = await fs.readFile(backupPath, 'utf8');
      const backupConfig = JSON.parse(data);
      
      this.currentConfig = backupConfig;
      logger.info(`🔄 백업에서 설정 복구: ${backupPath}`);
      
      return true;
      
    } catch (error) {
      logger.error(`❌ 백업 복구 실패: ${error.message}`);
      return false;
    }
  }

  /**
   * 설정 히스토리에 추가
   */
  addToHistory() {
    const timestamp = new Date().toISOString();
    this.configHistory.unshift({
      timestamp,
      config: JSON.parse(JSON.stringify(this.currentConfig))
    });
    
    // 히스토리 크기 제한
    if (this.configHistory.length > this.maxHistorySize) {
      this.configHistory.pop();
    }
  }

  /**
   * 설정 가져오기
   */
  get(key = null) {
    if (key === null) {
      return this.currentConfig;
    }
    
    return this.getByPath(this.currentConfig, key);
  }

  /**
   * 설정 업데이트
   */
  set(key, value) {
    const oldValue = this.getByPath(this.currentConfig, key);
    this.setByPath(this.currentConfig, key, value);
    
    logger.debug(`⚙️ 설정 업데이트: ${key} = ${JSON.stringify(value)}`);
    
    // 변경 사항 저장 (비동기)
    this.save().catch(error => {
      logger.error(`❌ 설정 자동 저장 실패: ${error.message}`);
    });
    
    return { oldValue, newValue: value };
  }

  /**
   * 셀렉터 업데이트 (동적 업데이트)
   */
  updateSelector(selectorName, newSelector, alternativeSelectors = []) {
    const oldSelector = this.currentConfig.selectors[selectorName];
    
    if (!oldSelector) {
      logger.warn(`⚠️ 알 수 없는 셀렉터: ${selectorName}`);
      return false;
    }
    
    // 주 셀렉터 업데이트
    this.currentConfig.selectors[selectorName] = newSelector;
    
    // 대체 셀렉터 업데이트
    if (alternativeSelectors.length > 0) {
      this.currentConfig.alternativeSelectors[selectorName] = alternativeSelectors;
    }
    
    logger.info(`🔧 셀렉터 업데이트: ${selectorName} = "${newSelector}"`);
    
    // 변경 사항 저장
    this.save().catch(error => {
      logger.error(`
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class AIProvider {
  constructor() {
    this.deepseek = null;
    this.isAvailable = false;

    // .env 파일에서 직접 API 키 읽기 (시스템 환경 변수 우회)
    const apiKey = this.readApiKeyFromEnvFile();
    
    if (apiKey) {
      const trimmedKey = apiKey.trim();
      if (trimmedKey && trimmedKey.startsWith('sk-') && trimmedKey.length > 10) {
        this.deepseek = new OpenAI({
          apiKey: trimmedKey,
          baseURL: 'https://api.deepseek.com'
        });
        console.log('✅ DeepSeek Provider Initialized (from .env file)');
        this.isAvailable = true;
      } else {
        console.warn('⚠️ DEEPSEEK_API_KEY 형식이 올바르지 않습니다. AI 기능을 사용할 수 없습니다.');
        this.isAvailable = false;
      }
    } else {
      console.warn('⚠️ DEEPSEEK_API_KEY not found in .env file');
      this.isAvailable = false;
    }
  }

  // .env 파일에서 직접 API 키 읽기
  readApiKeyFromEnvFile() {
    try {
      const envPath = path.join(__dirname, '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          if (line.trim().startsWith('DEEPSEEK_API_KEY=')) {
            let apiKey = line.split('=')[1].trim();
            // 따옴표 제거
            apiKey = apiKey.replace(/^['"]|['"]$/g, '');
            return apiKey;
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ .env 파일 읽기 오류:', err.message);
    }
    
    // .env 파일에서 찾지 못하면 기존 방식으로 fallback
    return process.env.DEEPSEEK_API_KEY;
  }

  async getCompletion(prompt, systemPrompt = "You are a helpful assistant.") {
    if (!this.deepseek || !this.isAvailable) {
      console.warn('⚠️ AI provider not available. Falling back to brute-force mode.');
      return null;
    }

    try {
      console.log('🤖 Attempting completion with DeepSeek...');
      const response = await this.deepseek.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1024,
        temperature: 0.7
      });
      return response.choices[0].message.content.trim();
    } catch (error) {
      // 401 인증 실패 또는 기타 API 에러 처리
      if (error.status === 401 || error.message.includes('Authentication Fails')) {
        console.error('❌ DeepSeek API 인증 실패: API 키가 유효하지 않습니다. 브루트포스 모드로 전환합니다.');
        console.error('💡 해결 방법: https://platform.deepseek.com/api_keys 에서 새 API 키를 발급받아 .env 파일에 DEEPSEEK_API_KEY로 설정하세요.');
        this.isAvailable = false; // 이후 호출에서도 AI 사용 안 함
      } else {
        console.error('❌ DeepSeek Error:', error.message);
      }
      return null; // AI 실패 시 null 반환하여 브루트포스로 폴백
    }
  }

  // AI 사용 가능 여부 확인
  isAIAvailable() {
    return this.isAvailable;
  }
}

module.exports = new AIProvider();

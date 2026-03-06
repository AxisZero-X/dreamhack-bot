const OpenAI = require('openai');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class AIProvider {
  constructor() {
    this.providers = []; // 우선순위 순서로 등록

    const env = this._readEnvFile();

    // 1순위: Groq (무료, 빠름)
    const groqKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
    if (groqKey && groqKey.trim().startsWith('gsk_')) {
      this.groq = new Groq({ apiKey: groqKey.trim() });
      this.providers.push('groq');
      console.log('✅ Groq Provider Initialized');
    }

    // 2순위: Gemini (무료 티어)
    const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey && geminiKey.trim().length > 10) {
      this.gemini = new GoogleGenerativeAI(geminiKey.trim());
      this.providers.push('gemini');
      console.log('✅ Gemini Provider Initialized');
    }

    // 3순위: DeepSeek (유료)
    const deepseekKey = env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
    if (deepseekKey && deepseekKey.trim().startsWith('sk-') && deepseekKey.trim().length > 10) {
      this.deepseek = new OpenAI({
        apiKey: deepseekKey.trim(),
        baseURL: 'https://api.deepseek.com',
      });
      this.providers.push('deepseek');
      console.log('✅ DeepSeek Provider Initialized');
    }

    this.isAvailable = this.providers.length > 0;
    if (!this.isAvailable) {
      console.warn('⚠️ 사용 가능한 AI 프로바이더가 없습니다. AI 기능을 사용할 수 없습니다.');
    } else {
      console.log(`🤖 AI 프로바이더 우선순위: ${this.providers.join(' → ')}`);
    }
  }

  _readEnvFile() {
    try {
      const envPath = path.join(__dirname, '.env');
      if (!fs.existsSync(envPath)) return {};
      const content = fs.readFileSync(envPath, 'utf8');
      const result = {};
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        val = val.replace(/^['"']|['"']$/g, '');
        result[key] = val;
      }
      return result;
    } catch (err) {
      console.warn('⚠️ .env 파일 읽기 오류:', err.message);
      return {};
    }
  }

  // Groq으로 완성 시도
  async _tryGroq(prompt, systemPrompt) {
    console.log('🤖 Attempting completion with Groq...');
    const response = await this.groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    });
    return response.choices[0].message.content.trim();
  }

  // Gemini로 완성 시도
  async _tryGemini(prompt, systemPrompt) {
    console.log('🤖 Attempting completion with Gemini...');
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(`${systemPrompt}\n\n${prompt}`);
    return result.response.text().trim();
  }

  // DeepSeek으로 완성 시도
  async _tryDeepSeek(prompt, systemPrompt) {
    console.log('🤖 Attempting completion with DeepSeek...');
    const response = await this.deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
      temperature: 0.2,
    });
    return response.choices[0].message.content.trim();
  }

  /**
   * 등록된 프로바이더를 순서대로 시도, 모두 실패하면 null 반환
   */
  async getCompletion(prompt, systemPrompt = '당신은 드림핵(Dreamhack) 워게임 보안 문제 풀이 전문가입니다.') {
    if (!this.isAvailable) {
      console.warn('⚠️ AI provider not available.');
      return null;
    }

    for (const provider of this.providers) {
      try {
        let result = null;
        if (provider === 'groq') result = await this._tryGroq(prompt, systemPrompt);
        else if (provider === 'gemini') result = await this._tryGemini(prompt, systemPrompt);
        else if (provider === 'deepseek') result = await this._tryDeepSeek(prompt, systemPrompt);

        if (result) {
          console.log(`✅ [${provider.toUpperCase()}] 응답 성공`);
          return result;
        }
      } catch (error) {
        const status = error.status || error.statusCode || (error.response && error.response.status);
        if (status === 402) {
          console.error(`❌ [${provider.toUpperCase()}] 잔액 부족 (402). 다음 프로바이더로 전환...`);
        } else if (status === 429) {
          console.warn(`⚠️ [${provider.toUpperCase()}] 요청 한도 초과 (429). 다음 프로바이더로 전환...`);
        } else if (status === 401) {
          console.error(`❌ [${provider.toUpperCase()}] 인증 실패 (401) - API 키를 확인하세요. 다음 프로바이더로 전환...`);
        } else if (status >= 500) {
          console.error(`⚠️ [${provider.toUpperCase()}] 서버 오류 (${status}). 다음 프로바이더로 전환...`);
        } else {
          console.error(`❌ [${provider.toUpperCase()}] 오류: ${error.message}`);
        }
        // 다음 프로바이더로 계속
      }
    }

    console.error('❌ 모든 AI 프로바이더 실패. null 반환.');
    return null;
  }

  /**
   * Vision AI 완성 — 이미지(base64 배열)를 포함한 프롬프트 전송
   * Gemini만 data: URL 방식의 inlineData를 지원함.
   * 429 시 exponential backoff 재시도 (최대 3회), 실패 시 텍스트 전용 fallback.
   */
  async getCompletionWithVision(prompt, systemPrompt = '당신은 드림핵(Dreamhack) 워게임 보안 문제 풀이 전문 해커입니다.', imageBase64Array = [], mimeType = 'image/png') {
    if (!imageBase64Array || imageBase64Array.length === 0) {
      return this.getCompletion(prompt, systemPrompt);
    }

    // Gemini Vision (inlineData 지원) — flash-lite: 30 RPM (flash보다 2배 높음)
    if (this.gemini) {
      const model = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
      const parts = [
        { text: `${systemPrompt}\n\n${prompt}` },
        ...imageBase64Array.map((b64) => ({ inlineData: { data: b64, mimeType } })),
      ];

      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`🖼️ Gemini Vision으로 이미지 ${imageBase64Array.length}장 분석 중... (시도 ${attempt}/${maxAttempts})`);
          const result = await model.generateContent(parts);
          const text = result.response.text().trim();
          console.log('✅ [GEMINI VISION] 응답 성공');
          return text;
        } catch (err) {
          const status = err.status || (err.response && err.response.status);
          if (status === 429 && attempt < maxAttempts) {
            const waitMs = attempt * 5000; // 5초, 10초 순차 증가
            console.warn(`⏳ [GEMINI VISION] 429 Rate limit. ${waitMs / 1000}초 후 재시도 (${attempt}/${maxAttempts})...`);
            await new Promise((r) => setTimeout(r, waitMs));
          } else {
            console.error(`❌ [GEMINI VISION] 오류 (${status ?? err.message}). 텍스트 전용으로 fallback...`);
            break;
          }
        }
      }
    }

    // fallback: 텍스트만으로 다른 프로바이더 시도
    console.warn('⚠️ Vision 분석 실패. 텍스트 전용으로 fallback.');
    return this.getCompletion(prompt, systemPrompt);
  }

  isAIAvailable() {
    return this.isAvailable;
  }
}

module.exports = new AIProvider();

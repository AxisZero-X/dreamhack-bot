const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

class AIProvider {
  constructor() {
    this.deepseek = null;
    this.anthropic = null;

    if (process.env.DEEPSEEK_API_KEY) {
      this.deepseek = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com'
      });
      console.log('✅ DeepSeek Provider Initialized');
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: process.env.ANTHROPIC_BASE_URL || undefined // Antigravity proxy support
      });
      console.log(`✅ Antigravity (Anthropic) Provider Initialized${process.env.ANTHROPIC_BASE_URL ? ' with custom base URL: ' + process.env.ANTHROPIC_BASE_URL : ''}`);
    }
  }

  async getCompletion(prompt, systemPrompt = "You are a helpful assistant.") {
    // 1. Try DeepSeek (OpenAI Compatible)
    if (this.deepseek) {
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
        console.error('❌ DeepSeek Error:', error.message);
        if (!this.anthropic) throw error;
      }
    }

    // 2. Fallback to Antigravity (Anthropic)
    if (this.anthropic && process.env.ENABLE_ANTHROPIC === 'true') {
      try {
        console.log('🤖 Attempting completion with Antigravity (Anthropic)...');
        const response = await this.anthropic.messages.create({
          model: process.env.ANTHROPIC_MODEL || 'claude-3-sonnet-20240229',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }]
        });
        return response.content[0].text.trim();
      } catch (error) {
        console.error('❌ Antigravity Error:', error.message);
        throw error;
      }
    }

    throw new Error('No AI Providers configured or enabled. Please set DEEPSEEK_API_KEY or set ENABLE_ANTHROPIC=true with ANTHROPIC_API_KEY.');
  }
}

module.exports = new AIProvider();

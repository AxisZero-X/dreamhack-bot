const OpenAI = require('openai');
require('dotenv').config();

class AIProvider {
  constructor() {
    this.deepseek = null;

    if (process.env.DEEPSEEK_API_KEY) {
      this.deepseek = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com'
      });
      console.log('✅ DeepSeek Provider Initialized');
    } else {
      console.warn('⚠️ DEEPSEEK_API_KEY not found in environment variables');
    }
  }

  async getCompletion(prompt, systemPrompt = "You are a helpful assistant.") {
    if (!this.deepseek) {
      throw new Error('DeepSeek provider not initialized. Please set DEEPSEEK_API_KEY in environment variables.');
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
      console.error('❌ DeepSeek Error:', error.message);
      throw new Error(`AI completion failed: ${error.message}`);
    }
  }
}

module.exports = new AIProvider();

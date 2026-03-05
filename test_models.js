const aiProvider = require('./aiProvider');
require('dotenv').config();

async function testAI() {
  console.log('🧪 Testing AI Providers via aiProvider.js...');

  try {
    const response = await aiProvider.getCompletion('Hello, respond with only the word "SUCCESS" if you can hear me.', 'You are a test assistant.');
    console.log(`📡 Response: ${response}`);

    if (response.includes('SUCCESS')) {
      console.log('✅ AI Provider test PASSED!');
    } else {
      console.log('⚠️ AI Provider responded, but not with the expected word.');
    }
  } catch (err) {
    console.error(`❌ AI Provider test FAILED: ${err.message}`);
    console.log('\n💡 Tip: Check your DEEPSEEK_API_KEY or ANTHROPIC_API_KEY in .env');
    console.log('💡 Tip: If using Antigravity, ensure ANTHROPIC_BASE_URL is set correctly.');
  }
}

testAI();

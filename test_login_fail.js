const { launchBrowser, ensureLoggedIn } = require('./utils');
const logger = require('./logger');

const EMAIL = 'wrong_email@example.com';
const PASSWORD = 'wrong_password';

(async () => {
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();

        logger.info('Starting login test (SHOULD FAIL)...');
        await ensureLoggedIn(page, EMAIL, PASSWORD);

        logger.error('CRITICAL BUG: Login incorrectly reported success!');
        process.exit(1);
    } catch (e) {
        logger.info('SUCCESS: Login correctly threw an exception for invalid credentials:', e.message);
        process.exit(0);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();

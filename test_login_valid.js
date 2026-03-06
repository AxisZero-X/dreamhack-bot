const { launchBrowser, ensureLoggedIn } = require('./utils');
const logger = require('./logger');

const EMAIL = 'josephk145@gmail.com';
const PASSWORD = 'Dshxm1@#$';

(async () => {
    let browser;
    try {
        browser = await launchBrowser();
        const page = await browser.newPage();

        logger.info('Starting valid login regression test...');
        await ensureLoggedIn(page, EMAIL, PASSWORD);

        logger.info('SUCCESS: Valid login still works!');
    } catch (e) {
        logger.error('FAILURE: Valid login failed!', e);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
})();

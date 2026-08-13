// Smoke test: logs in as the seeded Super Admin demo account and verifies
// the dashboard renders. Run with `npm run login-test`.
//
// Env vars:
//   BASE_URL   - app URL to test (default: http://localhost:3000)

const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = 'admin@gudep.local';
const PASSWORD = 'admin';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let exitCode = 0;

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('button[onclick="doLogin()"]');

    // Successful login hides #login-screen and reveals #app-layout.
    await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 10000 });

    const userName = await page.textContent('#user-name');
    if (!userName || !userName.trim()) {
      throw new Error('Login appeared to succeed but #user-name is empty');
    }

    console.log(`OK: logged in as "${userName.trim()}" and dashboard loaded.`);
  } catch (err) {
    console.error('FAILED:', err.message);
    exitCode = 1;
  } finally {
    await browser.close();
    process.exit(exitCode);
  }
})();

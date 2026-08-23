import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

let browserPath;
try {
  browserPath = execSync('npx playwright install chromium --dry-run 2>/dev/null || true').toString();
} catch {}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

await page.goto('http://localhost:3000/aura', { waitUntil: 'networkidle', timeout: 20000 });
await page.screenshot({ path: '/tmp/aura-loggedout.png', fullPage: true });

console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
await browser.close();

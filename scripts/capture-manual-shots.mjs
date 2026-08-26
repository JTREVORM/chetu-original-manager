/**
 * Captures the screenshots used by the user manual, at both desktop and phone
 * sizes, from a running dev server with the demo data loaded.
 *
 *   npm run dev            (in another terminal)
 *   node scripts/seed-demo.mjs
 *   node scripts/capture-manual-shots.mjs [http://localhost:8080]
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'docs', 'manual', 'shots');
mkdirSync(OUT, { recursive: true });

const BASE = process.argv[2] || 'http://localhost:8080';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ADMIN = { id: 'dadhaza@gmail.com', pw: 'Admin@123' };
const OFFICER = { id: 'marjorie.nakabugo@chetumf.co.ug', pw: 'Chetu@2026' };
const AUDITOR = { id: 'grace.atim@chetumf.co.ug', pw: 'Chetu@2026' };

/** Pages to capture: [file stem, path, text that proves it rendered, press Search?] */
const PAGES = [
  ['dashboard',        '/',                        'Good',                 false],
  ['groups-approval',  '/groups/waiting-approval', 'Waiting for Approval', false],
  ['group-list',       '/client-groups',           'Group',                true],
  ['member-list',      '/member-list',             'Member List',          true],
  ['member-admission', '/member-admission',        'Member Admission',     false],
  ['loan-products',    '/loan-products',           'Loan Products',        false],
  ['loan-application', '/loan-applications',       'Loan Application',     true],
  ['loan-approval',    '/loan-waiting-approval',   'Waiting for Approval', true],
  ['loan-disburse',    '/loan-waiting-disburse',   'Waiting for Disburse', true],
  ['loan-rejected',    '/loan-rejected',           'Loan Rejected',        true],
  ['collections',      '/group-collection',        'Group Wise Collection',true],
  ['bad-loans',        '/bad-loans',               'Bad Loans List',       true],
  ['reports-index',    '/reports',                 'Reports',              false],
  ['report-par',       '/reports/par',             'Portfolio at Risk',    true],
  ['report-fees',      '/reports/fee-collection',  'Fee Collection',       true],
  ['transfers-member', '/transfers/member',        'Member Branch Transfer', true],
  ['users',            '/users',                   'User Management',      false],
  ['branches',         '/branches',                'Branch Network',       false],
  ['settings',         '/settings',                'System Settings',      false],
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const signIn = async (page, who) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('input').length >= 2, { timeout: 90000 });
  const inputs = await page.$$('input');
  await inputs[0].type(who.id, { delay: 8 });
  await inputs[1].type(who.pw, { delay: 8 });
  await page.evaluate(() => Array.from(document.querySelectorAll('button'))
    .find((b) => /sign in/i.test(b.innerText))?.click());
  await page.waitForFunction(() => !location.pathname.startsWith('/login'), { timeout: 90000 });
  await wait(6000);
};

const capture = async (label, viewport, who, pages, suffix) => {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await signIn(page, who);
  for (const [stem, path, proof, search] of pages) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 60000, polling: 400 }, proof);
    } catch {
      console.log(`    ! "${proof}" never appeared on ${path}`);
    }
    await wait(1800);
    if (search) {
      await page.evaluate(() => Array.from(document.querySelectorAll('button'))
        .find((b) => /^\s*Search\s*$/.test(b.innerText))?.click());
      await wait(1800);
    }
    await page.screenshot({ path: `${OUT}/${stem}-${suffix}.png`, fullPage: false });
  }
  console.log(`  ${label}: ${pages.length} shots`);
  await page.close();
};

console.log('capturing…');
await capture('desktop / administrator', { width: 1440, height: 950, deviceScaleFactor: 2 }, ADMIN, PAGES, 'desktop');
await capture('mobile / administrator', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ADMIN, PAGES, 'mobile');

// Role-specific views, to show what each person actually sees.
await capture('desktop / loan officer', { width: 1440, height: 950, deviceScaleFactor: 2 }, OFFICER,
  [['dashboard-officer', '/', 'Good', false], ['member-list-officer', '/member-list', 'Member List', true]], 'desktop');
await capture('mobile / loan officer', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, OFFICER,
  [['dashboard-officer', '/', 'Good', false]], 'mobile');
await capture('desktop / auditor', { width: 1440, height: 950, deviceScaleFactor: 2 }, AUDITOR,
  [['dashboard-auditor', '/', 'Good', false]], 'desktop');

// The sidebar and the notification drawer, opened rather than navigated to.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await signIn(page, ADMIN);
  await page.goto(`${BASE}/member-list`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Member List'), { timeout: 60000, polling: 400 }).catch(() => {});
  await wait(2000);
  await page.evaluate(() => Array.from(document.querySelectorAll('button'))
    .find((b) => b.querySelector('svg.lucide-menu'))?.click());
  await wait(1200);
  await page.evaluate(() => Array.from(document.querySelectorAll('button'))
    .find((b) => /^Members$/.test(b.innerText.trim()))?.click());
  await wait(900);
  await page.screenshot({ path: `${OUT}/sidebar-mobile.png` });

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Good/.test(document.body.innerText), { timeout: 60000, polling: 400 }).catch(() => {});
  await wait(2000);
  await page.evaluate(() => Array.from(document.querySelectorAll('button'))
    .find((b) => /notification/i.test(b.getAttribute('aria-label') || ''))?.click());
  await wait(1400);
  await page.screenshot({ path: `${OUT}/notifications-mobile.png` });
  console.log('  chrome: sidebar + notifications');
  await page.close();
}

// The login screen, signed out.
{
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  await desktop.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await desktop.waitForFunction(() => document.querySelectorAll('input').length >= 2, { timeout: 90000 });
  await wait(1200);
  await desktop.screenshot({ path: `${OUT}/login-desktop.png` });
  // Resizing alone re-renders the app; reload and wait for the form again so
  // the shot is not taken mid-hydration.
  await desktop.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await desktop.reload({ waitUntil: 'domcontentloaded' });
  await desktop.waitForFunction(() => document.querySelectorAll('input').length >= 2, { timeout: 90000 });
  await wait(1500);
  await desktop.screenshot({ path: `${OUT}/login-mobile.png` });
  console.log('  login: 2 shots');
  await desktop.close();
}

await browser.close();
console.log(`done → ${OUT}`);

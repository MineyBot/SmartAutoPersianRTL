/* ============================================================================
 * tools/shots.js — گرفتن اسکرین‌شات‌های README (قبل/بعد + پاپ‌آپ + تنظیمات)
 * اجرا: node tools/shots.js
 * خروجی: docs/*.png
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome'
];
const BROWSER = process.env.CHROME_PATH || CANDIDATES.find((p) => fs.existsSync(p));
const PROFILE = path.join(process.env.LOCALAPPDATA || '/tmp', 'Temp', 'pwm-shots-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const name = req.url === '/' ? 'demo.html' : req.url.slice(1).split('?')[0];
      const p = path.join(dir, name);
      if (name === 'favicon.ico' || !fs.existsSync(p)) { res.writeHead(204); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

(async function main() {
  if (!BROWSER) { console.error('مرورگر Chromium پیدا نشد.'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const { srv, port } = await serve(path.join(ROOT, 'test'));
  const URL_BASE = 'http://127.0.0.1:' + port + '/';

  /* --- ۱. «قبل»: بدون افزونه --- */
  const plain = await puppeteer.launch({
    executablePath: BROWSER,
    headless: false,
    protocolTimeout: 25000,
    args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
           '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
           '--disable-backgrounding-occluded-windows',
           '--disable-features=MsSleepingTabs,SleepingTabs,CalculateNativeWinOcclusion'],
    userDataDir: PROFILE + '-plain'
  });
  let pg = await plain.newPage();
 await pg.setViewport({ width: 700, height: 900, deviceScaleFactor: 2 });
 await pg.goto(URL_BASE, { waitUntil: 'load' });
 await sleep(700);
 const box = await pg.evaluate(() => {
   const r = document.querySelector('.wrap').getBoundingClientRect();
   return { x: 0, y: 0, width: Math.ceil(r.width + 44), height: Math.ceil(r.height + 44) };
 });
 await pg.screenshot({ path: path.join(OUT, 'before.png'), clip: box });
 console.log('✓ docs/before.png');
 await plain.close();

  /* --- ۲. «بعد» + پاپ‌آپ + تنظیمات: با افزونه --- */
  const ext = await puppeteer.launch({
    executablePath: BROWSER,
    headless: false,
    protocolTimeout: 25000,
    args: [
      '--disable-extensions-except=' + ROOT,
      '--load-extension=' + ROOT,
      '--disable-features=DisableLoadExtensionCommandLineSwitch,MsSleepingTabs,SleepingTabs,CalculateNativeWinOcclusion',
      '--enable-unsafe-extension-debugging',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars'
    ],
    userDataDir: PROFILE + '-ext'
  });

  let sw = null;
  for (let i = 0; i < 60 && !sw; i++) {
    sw = (await ext.targets()).find((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'));
    if (!sw) await sleep(250);
  }
  if (!sw) { console.error('افزونه بارگذاری نشد'); await ext.close(); srv.close(); process.exit(1); }
  const id = new URL(sw.url()).host;

  pg = await ext.newPage();
  await pg.setViewport({ width: 700, height: 900, deviceScaleFactor: 2 });
  await pg.goto(URL_BASE, { waitUntil: 'load' });
  await pg.waitForFunction(() => document.querySelectorAll('[data-pwm-dir]').length > 3, { timeout: 12000 }).catch(() => {});
  await sleep(1200);
  const box2 = await pg.evaluate(() => {
    const r = document.querySelector('.wrap').getBoundingClientRect();
    return { x: 0, y: 0, width: Math.ceil(r.width + 44), height: Math.ceil(r.height + 44) };
  });
  await pg.screenshot({ path: path.join(OUT, 'after.png'), clip: box2 });
  console.log('✓ docs/after.png');

  const pop = await ext.newPage();
  await pop.setViewport({ width: 360, height: 760, deviceScaleFactor: 2 });
  await pop.goto('chrome-extension://' + id + '/src/popup/popup.html', { waitUntil: 'load' });
  await pop.waitForSelector('#master', { timeout: 10000 });
  await sleep(900);
  const pbox = await pop.evaluate(() => {
    const r = document.body.getBoundingClientRect();
    return { x: 0, y: 0, width: Math.ceil(r.width), height: Math.ceil(r.height) };
  });
  await pop.screenshot({ path: path.join(OUT, 'popup.png'), clip: pbox });
  console.log('✓ docs/popup.png');

  const opt = await ext.newPage();
  await opt.setViewport({ width: 940, height: 1200, deviceScaleFactor: 2 });
  await opt.goto('chrome-extension://' + id + '/src/options/options.html', { waitUntil: 'load' });
  await opt.waitForSelector('#enabled', { timeout: 10000 });
  await sleep(1100);
  await opt.screenshot({ path: path.join(OUT, 'options.png'), fullPage: false });
  console.log('✓ docs/options.png');

  await opt.evaluate(() => document.querySelector('#tabs button[data-tab="lab"]').click());
  await sleep(900);
  await opt.screenshot({ path: path.join(OUT, 'lab.png'), fullPage: false });
  console.log('✓ docs/lab.png');

  /* ویرایشگر سلکتور دلخواه: با محتوای نمونه پر می‌شود تا تصویر چیزی برای دیدن
   * داشته باشد. نکته: clip در puppeteer مختصات *سند* را می‌خواهد نه viewport،
   * پس باید scrollY را اضافه کنیم؛ وگرنه کارت بالاتر از صفحه بریده می‌شود. */
  await opt.evaluate(() => document.querySelector('#tabs button[data-tab="sites"]').click());
  await sleep(500);
  await opt.setViewport({ width: 940, height: 1500, deviceScaleFactor: 2 });
  await opt.evaluate(() => {
    document.getElementById('sel-host-new').value = 'example.com';
    const a = document.getElementById('sel-anchors');
    const g = document.getElementById('sel-guards');
    a.value = '.message-body\narticle .content';
    g.value = '.sidebar\n.chart-container';
    a.dispatchEvent(new Event('input', { bubbles: true }));
    g.dispatchEvent(new Event('input', { bubbles: true }));
    window.scrollTo(0, 0);
  });
  await sleep(800);
  const selBox = await opt.evaluate(() => {
    const c = document.getElementById('sel-host').closest('.card');
    const r = c.getBoundingClientRect();
    return {
      x: Math.max(0, r.left + window.scrollX - 14),
      y: Math.max(0, r.top + window.scrollY - 14),
      width: r.width + 28,
      height: r.height + 28
    };
  });
  await opt.screenshot({ path: path.join(OUT, 'selectors.png'), clip: selBox, captureBeyondViewport: true });
  console.log('✓ docs/selectors.png');

  await ext.close();
  srv.close();
  await sleep(400);
  for (const d of [PROFILE + '-plain', PROFILE + '-ext']) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nتمام. ' + fs.readdirSync(OUT).length + ' تصویر در docs/');
})().catch((e) => { console.error('CRASH', e && e.message); process.exit(2); });

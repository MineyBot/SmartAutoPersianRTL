/* ============================================================================
 * test/browser.js — بارگذاری واقعی افزونه در مرورگر و بررسی رفتار روی صفحه
 * اجرا:  node test/browser.js
 * نیازمند: puppeteer-core + یک مرورگر Chromium (Edge یا Chrome)
 *
 * نکته‌ی محیطی: پنجره‌ی آزمون فوکوس ندارد، بنابراین puppeteer.click() (که به
 * IntersectionObserver وابسته است) هرگز برنمی‌گردد. به‌جایش کلیک را در خود صفحه
 * فراخوانی می‌کنیم. همچنین evaluate روی سرویس‌ورکر MV3 در این حالت پاسخ نمی‌دهد،
 * پس سلامت سرویس‌ورکر را با رفت‌وبرگشت پیام (که آزمون واقعی‌تری هم هست) می‌سنجیم.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
/* Chrome ≥ ۱۳۷ سوئیچ --load-extension را حذف کرده و در نسخه‌ی ۱۵۰ کاملاً بی‌اثر
 * است؛ پس Edge (همان موتور Chromium) پیش‌فرض آزمون است. CHROME_PATH را می‌توانید
 * برای تحمیل مرورگر دیگری تنظیم کنید. */
const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
];
const CHROME = process.env.CHROME_PATH || CANDIDATES.find((p) => fs.existsSync(p));

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; failures.push(name + (extra ? ' → ' + extra : '')); console.log('  \u2717 ' + name + (extra ? '  [' + extra + ']' : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }
function section(t) { console.log('\n\u2500\u2500 ' + t); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const file = req.url === '/' || req.url.startsWith('/?') ? 'fixture.html' : req.url.slice(1).split('?')[0];
      if (file === 'favicon.ico') { res.writeHead(204); res.end(); return; } // وگرنه ۴۰۴ در کنسول ثبت می‌شود
      const p = path.join(__dirname, file);
      if (!fs.existsSync(p)) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
      res.end(fs.readFileSync(p));
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/* هر اجرا پروفایل تازه‌ی خود را می‌سازد: پروفایل بازمانده باعث می‌شود Edge نشست
 * قبلی را بازگردانی کند و تبِ آزمون در میانه‌ی کار جدا (detached) شود. */
const PROFILE = path.join(process.env.LOCALAPPDATA || '/tmp', 'Temp', 'pwm-test-profile-' + Date.now());

const tap = (pg, sel) => pg.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) throw new Error('no element ' + s);
  el.click();
  return true;
}, sel);

const setRange = (pg, sel, val) => pg.evaluate(([s, v]) => {
  const r = document.querySelector(s);
  r.value = v;
  r.dispatchEvent(new Event('input', { bubbles: true }));
  r.dispatchEvent(new Event('change', { bubbles: true }));
}, [sel, val]);

(async function main() {
  console.log('\n\u2554\u2550\u2550 Persian Web Mixer · Browser Test \u2550\u2550');
  if (!CHROME) { console.error('مرورگر Chromium پیدا نشد. CHROME_PATH را تنظیم کنید.'); process.exit(2); }
  console.log('  مرورگر: ' + CHROME);

  const { srv, port } = await serve();
  const URL_BASE = 'http://127.0.0.1:' + port + '/';

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false, // افزونه‌ی MV3 در حالت headless بارگذاری نمی‌شود
    protocolTimeout: 25000,
    args: [
      '--disable-extensions-except=' + ROOT,
      '--load-extension=' + ROOT,
      '--disable-features=DisableLoadExtensionCommandLineSwitch,MsSleepingTabs,SleepingTabs,CalculateNativeWinOcclusion',
      '--enable-unsafe-extension-debugging',
      // بدون این‌ها Edge/Chrome تب بی‌فوکوس را می‌خواباند و آزمون بی‌دلیل می‌شکند
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1200,900'
    ],
    userDataDir: PROFILE
  });

  const cleanupProfile = () => {
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  };

  try {
    /* ---------------------------------------------------------- راه‌اندازی */
    section('راه‌اندازی افزونه');
    let sw = null;
    for (let i = 0; i < 60 && !sw; i++) {
      sw = (await browser.targets()).find((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'));
      if (!sw) await sleep(250);
    }
    ok('سرویس‌ورکر افزونه اجرا شد', !!sw, sw ? 'یافت شد' : 'یافت نشد');
    if (!sw) throw new Error('افزونه بارگذاری نشد');
    const extId = new URL(sw.url()).host;
    console.log('    شناسه افزونه: ' + extId);

    /* ------------------------------------------------------- صفحه‌ی آزمون */
    section('اعمال روی صفحه‌ی واقعی');
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });

    await page.goto(URL_BASE, { waitUntil: 'load' });
    /* Content Script در دنیای ایزوله اجرا می‌شود، پس window صفحه نشانی از آن ندارد؛
     * منتظر اثر واقعی آن روی DOM می‌مانیم. */
    await page.waitForFunction(() => document.querySelectorAll('[data-pwm-dir]').length > 3, { timeout: 12000 }).catch(() => {});
    await sleep(1200); // مهلت استریم پویا

    const dirOf = (sel) => page.$eval(sel, (el) => el.getAttribute('data-pwm-dir')).catch(() => 'MISSING');
    const cssOf = (sel, prop) => page.$eval(sel, (el, p) => getComputedStyle(el)[p], prop).catch(() => 'MISSING');

    eq('پیام فارسی کاربر ⇒ rtl', await dirOf('#fa-user'), 'rtl');
    eq('پاسخ فارسی دستیار ⇒ rtl', await dirOf('#fa-assist'), 'rtl');
    eq('سرتیتر فارسی ⇒ rtl', await dirOf('#fa-h3'), 'rtl');
    eq('آیتم لیست فارسی ⇒ rtl', await dirOf('#fa-li1'), 'rtl');
    eq('نقل‌قول فارسی ⇒ rtl', await dirOf('#fa-quote'), 'rtl');
    eq('سرستون فارسی ⇒ rtl', await dirOf('#fa-th'), 'rtl');
    eq('پاراگراف انگلیسی دست‌نخورده', await dirOf('#en-para'), null);
    eq('پاراگراف عمدتاً انگلیسی دست‌نخورده', await dirOf('#mixed-en'), null);
    eq('پاراگراف فقط-رقم دست‌نخورده', await dirOf('#digits-only'), null);
    eq('پاراگراف فقط-ایموجی دست‌نخورده', await dirOf('#emoji-only'), null);
    eq('بلوک کد دست‌نخورده', await dirOf('#code-block'), null);
    eq('فرمول katex دست‌نخورده', await dirOf('#math-el'), null);
    eq('بلوک hljs دست‌نخورده', await dirOf('#hljs-el'), null);
    eq('دکمه فقط جهت می‌گیرد (rtl-ui)', await dirOf('#btn'), 'rtl-ui');

    /* -------------------------------------------------- آینه‌سازی چیدمان RTL */
    section('آینه‌سازی چیدمان (لیست، نقل‌قول، جدول)');
    const quote = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById('fa-quote'));
      return { left: cs.borderLeftWidth, right: cs.borderRightWidth, padStart: cs.paddingRight };
    });
    ok('خط کنار نقل‌قول به سمت راست منتقل شد', quote.right !== '0px' && quote.left === '0px', JSON.stringify(quote));

    const li = await page.evaluate(() => {
      const el = document.getElementById('fa-li1');
      const ul = el.parentElement;
      const cs = getComputedStyle(ul);
      const b = el.getBoundingClientRect();
      const marker = ul.getBoundingClientRect();
      return { padRight: cs.paddingRight, padLeft: cs.paddingLeft, gap: Math.round(marker.right - b.right) };
    });
    ok('لیست فارسی تودرتویی راست دارد (بالت نمی‌چسبد)', parseFloat(li.padRight) > 8, JSON.stringify(li));

    const tbl = await page.evaluate(() => {
      const t = document.querySelector('table');
      const cells = t.querySelectorAll('tr:first-child th');
      const first = cells[0].getBoundingClientRect();
      const last = cells[cells.length - 1].getBoundingClientRect();
      return { dir: getComputedStyle(t).direction, firstIsRight: first.left > last.left };
    });
    eq('جدول جهت rtl گرفت', tbl.dir, 'rtl');
    ok('ستون اول جدول به سمت راست رفت (آینه شد)', tbl.firstIsRight === true, JSON.stringify(tbl));

    /* ------------------------------------------- استایل واقعی و تراز بصری */
    section('استایل محاسبه‌شده + تراز بصری');
    eq('جهت پاراگراف فارسی rtl است', await cssOf('#fa-assist', 'direction'), 'rtl');
    eq('جهت بلوک کد ltr مانده', await cssOf('#code-block', 'direction'), 'ltr');
    eq('جهت پاراگراف انگلیسی ltr مانده', await cssOf('#en-para', 'direction'), 'ltr');

    // تراز واقعی متن را با اندازه‌گیری موقعیت خط اول می‌سنجیم (text-align:start)
    const gapFa = await page.evaluate(() => {
      const el = document.getElementById('fa-assist');
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = el.getBoundingClientRect(), t = r.getBoundingClientRect();
      return { left: Math.round(t.left - b.left), right: Math.round(b.right - t.right) };
    });
    ok('متن فارسی واقعاً به راست چسبیده', gapFa.right <= 2 && gapFa.left > 20, JSON.stringify(gapFa));

    const gapEn = await page.evaluate(() => {
      const el = document.getElementById('en-para');
      const r = document.createRange();
      r.selectNodeContents(el);
      const b = el.getBoundingClientRect(), t = r.getBoundingClientRect();
      return { left: Math.round(t.left - b.left), right: Math.round(b.right - t.right) };
    });
    ok('متن انگلیسی همچنان به چپ چسبیده', gapEn.left <= 2, JSON.stringify(gapEn));

    const btnAlign = await cssOf('#btn', 'textAlign');
    ok('تراز مرکزی دکمه حفظ شد', btnAlign === 'center', btnAlign);

    const fontFam = await cssOf('#fa-assist', 'fontFamily');
    ok('فونت وزیرمتن اعمال شد', /PWMFont/.test(fontFam), fontFam);
    ok('فونت بلوک کد عوض نشد', !/PWMFont/.test(await cssOf('#code-block', 'fontFamily')));

    section('بارگذاری فونت با FontFace API (بدون دست‌کاری CSP)');
    const faces = await page.evaluate(() => {
      const out = [];
      document.fonts.forEach((f) => out.push(f.family + ':' + f.status));
      return out;
    });
    ok('PWMFont با وضعیت loaded در document.fonts', faces.indexOf('PWMFont:loaded') >= 0, faces.join(' | '));
    const fontMetric = await page.evaluate(() => {
      const c = document.createElement('canvas').getContext('2d');
      c.font = '32px PWMFont';
      const a = c.measureText('سلام دنیا').width;
      c.font = '32px Tahoma';
      const b = c.measureText('سلام دنیا').width;
      return { pwm: Math.round(a), tahoma: Math.round(b) };
    });
    ok('فونت واقعاً رندر می‌شود (عرض متفاوت از Tahoma)', fontMetric.pwm > 0 && fontMetric.pwm !== fontMetric.tahoma, JSON.stringify(fontMetric));

    /* ------------------------------------------------------------ ورودی‌ها */
    section('فیلدهای ورودی');
    eq('textarea علامت خودکار دارد', await page.$eval('#ta', (e) => e.getAttribute('data-pwm-auto')), '1');
    eq('input متنی علامت دارد', await page.$eval('#inp-text', (e) => e.getAttribute('data-pwm-auto')), '1');
    eq('input[range] علامت ندارد', await page.$eval('#inp-range', (e) => e.getAttribute('data-pwm-auto')), null);
    eq('input[checkbox] علامت ندارد', await page.$eval('#inp-checkbox', (e) => e.getAttribute('data-pwm-auto')), null);
    eq('contenteditable علامت دارد', await page.$eval('#ce', (e) => e.getAttribute('data-pwm-auto')), '1');
    eq('unicode-bidi ورودی plaintext است', await cssOf('#ta', 'unicodeBidi'), 'plaintext');
    eq('dir=auto روی ورودی ست شد', await page.$eval('#ta', (e) => e.getAttribute('dir')), 'auto');

    // تایپ واقعی با صفحه‌کلید و سنجش تراز caret/متن
    await page.evaluate(() => document.getElementById('ta').focus());
    await page.keyboard.type('سلام این یک آزمون تایپ فارسی است', { delay: 8 });
    await sleep(200);
    const typed = await page.$eval('#ta', (el) => el.value);
    ok('متن فارسی در textarea تایپ شد', typed.indexOf('سلام') === 0, typed.slice(0, 20));
    const taGap = await page.evaluate(() => {
      const ta = document.getElementById('ta');
      const m = document.createElement('div');
      const cs = getComputedStyle(ta);
      m.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + cs.font;
      m.textContent = ta.value;
      document.body.appendChild(m);
      const w = m.getBoundingClientRect().width;
      m.remove();
      return { textW: Math.round(w), boxW: Math.round(ta.clientWidth), bidi: cs.unicodeBidi, align: cs.textAlign };
    });
    eq('plaintext پس از تایپ باقی است', taGap.bidi, 'plaintext');
    ok('تراز ورودی start است (جهت را مرورگر می‌دهد)', taGap.align === 'start' || taGap.align === 'right', taGap.align);

    // انگلیسی در همان فیلد: باید LTR بماند
    await page.evaluate(() => { const t = document.getElementById('ta'); t.value = ''; t.focus(); });
    await page.keyboard.type('Hello this is english', { delay: 5 });
    await sleep(150);
    ok('همان فیلد برای متن انگلیسی هم درست کار می‌کند', (await page.$eval('#ta', (e) => e.value)).startsWith('Hello'));

    /* ------------------------------------------------------- محتوای پویا */
    section('محتوای پویا (شبیه استریم چت‌بات)');
    eq('پاراگراف استریم‌شده ⇒ rtl', await dirOf('#streamed'), 'rtl');
    eq('پاراگرافی که متنش فارسی شد ⇒ rtl', await dirOf('#grow'), 'rtl');

    const late = await page.evaluate(async () => {
      const p = document.createElement('p');
      p.id = 'late';
      p.textContent = 'این پاراگراف همین الآن ساخته شد و باید سریع راست‌چین شود.';
      document.querySelectorAll('.markdown')[1].appendChild(p);
      const t0 = performance.now();
      for (let i = 0; i < 60; i++) {
        if (p.getAttribute('data-pwm-dir') === 'rtl') return Math.round(performance.now() - t0);
        await new Promise((r) => setTimeout(r, 25));
      }
      return -1;
    });
    ok('واکنش به گره‌ی تازه زیر ۴۰۰ میلی‌ثانیه', late >= 0 && late < 400, late + 'ms');

    /* -------------------------------------------------------- Shadow DOM */
    section('Shadow DOM');
    const sOpen = await page.evaluate(() => {
      const r = document.getElementById('shadow-open').shadowRoot;
      if (!r) return null;
      return {
        fa: r.getElementById('s-fa').getAttribute('data-pwm-dir'),
        en: r.getElementById('s-en').getAttribute('data-pwm-dir'),
        dir: getComputedStyle(r.getElementById('s-fa')).direction,
        font: /PWMFont/.test(getComputedStyle(r.getElementById('s-fa')).fontFamily)
      };
    });
    eq('فارسی در shadow باز ⇒ rtl', sOpen && sOpen.fa, 'rtl');
    eq('انگلیسی در shadow باز دست‌نخورده', sOpen && sOpen.en, null);
    eq('استایل در shadow باز اعمال شد', sOpen && sOpen.dir, 'rtl');
    ok('فونت درون shadow هم اعمال شد', sOpen && sOpen.font === true);

    const sClosed = await page.evaluate(() => {
      const host = document.getElementById('shadow-closed');
      const r = host.shadowRoot || window.__closedRef;
      if (!r) return { forcedOpen: false };
      const el = r.getElementById('c-fa');
      return { forcedOpen: !!host.shadowRoot, fa: el.getAttribute('data-pwm-dir'), dir: getComputedStyle(el).direction };
    });
    ok('shadow بسته به‌زور باز شد (هوک MAIN world)', sClosed.forcedOpen === true, JSON.stringify(sClosed));
    eq('فارسی در shadow بسته ⇒ rtl', sClosed.fa, 'rtl');
    eq('استایل در shadow بسته اعمال شد', sClosed.dir, 'rtl');

    const sNested = await page.evaluate(() => {
      const r = document.getElementById('shadow-nested').shadowRoot;
      const inner = r && r.getElementById('mid') && r.getElementById('mid').shadowRoot;
      if (!inner) return null;
      const el = inner.getElementById('n-fa');
      return { fa: el.getAttribute('data-pwm-dir'), dir: getComputedStyle(el).direction };
    });
    eq('فارسی در shadow تودرتو ⇒ rtl', sNested && sNested.fa, 'rtl');
    eq('استایل در shadow تودرتو اعمال شد', sNested && sNested.dir, 'rtl');

    /* ------------------------------------------------ سرویس‌ورکر و پیام‌ها */
    section('سرویس‌ورکر و مسیر پیام‌رسانی');
    const opt = await browser.newPage();
    const optErrs = [];
    opt.on('pageerror', (e) => optErrs.push(String(e.message)));
    await opt.goto('chrome-extension://' + extId + '/src/options/options.html', { waitUntil: 'load' });
    await opt.waitForSelector('#enabled', { timeout: 10000 });
    ok('صفحه‌ی تنظیمات باز شد', true);

    const swReply = await opt.evaluate(() => new Promise((res) => {
      chrome.runtime.sendMessage({ type: 'pwm:inject-existing' }, (r) => res(r || { err: String(chrome.runtime.lastError && chrome.runtime.lastError.message) }));
    }));
    ok('سرویس‌ورکر پیام را پاسخ داد', swReply && swReply.ok === true, JSON.stringify(swReply));
    ok('تزریق به تب‌های باز کار کرد', swReply && typeof swReply.injected === 'number', JSON.stringify(swReply));

    /* وضعیت موتور از راه پیام واقعی افزونه خوانده می‌شود (نه از window صفحه،
     * چون Content Script در دنیای ایزوله اجرا می‌شود و window صفحه آن را نمی‌بیند) */
    const askState = () => opt.evaluate(() => new Promise((res) => {
      chrome.tabs.query({ url: 'http://127.0.0.1/*' }, (tabs) => {
        const t = tabs && tabs[0];
        if (!t) return res({ err: 'no tab' });
        chrome.tabs.sendMessage(t.id, { type: 'pwm:get-state' }, (r) => res(r || { err: String(chrome.runtime.lastError && chrome.runtime.lastError.message) }));
      });
    }));

    section('گزارش موتور (از راه پیام افزونه)');
    const rep = await askState();
    ok('موتور فعال است', rep && rep.active === true, JSON.stringify(rep && (rep.reason || rep.err)));
    ok('پروفایل عمومی وب تشخیص داده شد', rep && rep.profile && rep.profile.id === 'generic', rep && rep.profile && rep.profile.id);
    ok('چند ریشه ثبت شده (سند + سایه‌ها)', rep && rep.report && rep.report.roots >= 4, rep && rep.report && String(rep.report.roots));
    ok('بلوک‌های علامت‌خورده > ۸', rep && rep.report && rep.report.live > 8, rep && rep.report && String(rep.report.live));
    ok('فونت درون‌ساخته بارگذاری شده', rep && rep.fontKey === 'builtin:vazirmatn', rep && rep.fontKey);
    console.log('    ' + JSON.stringify(rep && rep.report));

    section('خاموش/روشن سراسری، زنده');
    const tg1 = await opt.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'pwm:toggle-global' }, (r) => res(r))));
    ok('toggle-global پاسخ داد', tg1 && tg1.ok === true, JSON.stringify(tg1));
    await sleep(700);
    const offMarks = await page.evaluate(() => document.querySelectorAll('[data-pwm-dir],[data-pwm-auto]').length);
    eq('پس از خاموشی سراسری همه‌ی نشانه‌ها پاک شد', offMarks, 0);
    eq('جهت به حالت اصلی برگشت', await cssOf('#fa-assist', 'direction'), 'ltr');
    const offShadow = await page.evaluate(() => {
      const r = document.getElementById('shadow-open').shadowRoot;
      return r ? r.querySelectorAll('[data-pwm-dir]').length : -1;
    });
    eq('نشانه‌های داخل Shadow هم پاک شد', offShadow, 0);
    await opt.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: 'pwm:toggle-global' }, (r) => res(r))));
    await sleep(900);
    eq('پس از روشن‌شدن دوباره rtl شد', await dirOf('#fa-assist'), 'rtl');

    /* --------------------------------------------------- تنظیمات زنده */
    section('تنظیمات زنده از صفحه‌ی تنظیمات');
    await tap(opt, '#mode input[value="force"]');
    await sleep(900);
    eq('حالت سخت‌گیر: پاراگراف مخلوط هم rtl شد', await dirOf('#mixed-en'), 'rtl');
    await tap(opt, '#mode input[value="smart"]');
    await sleep(900);
    eq('بازگشت به هوشمند: پاراگراف مخلوط آزاد شد', await dirOf('#mixed-en'), null);

    await tap(opt, '#tabs button[data-tab="general"]');
    await setRange(opt, '#threshold', 90);
    await sleep(900);
    eq('آستانه‌ی ۹۰٪: پاراگراف با کلمه‌ی انگلیسی هم آزاد می‌شود', await dirOf('#fa-assist'), null);
    eq('متن تماماً فارسی همچنان rtl می‌ماند', await dirOf('#fa-user'), 'rtl');
    await setRange(opt, '#threshold', 30);
    await sleep(900);
    eq('بازگشت آستانه ⇒ دوباره rtl', await dirOf('#fa-assist'), 'rtl');

    await tap(opt, '#tabs button[data-tab="typo"]');
    await setRange(opt, '#lh', 20);
    await sleep(900);
    const lhRatio = await page.$eval('#fa-assist', (el) => {
      const cs = getComputedStyle(el);
      return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
    });
    ok('ارتفاع خط ۲٫۰ اعمال شد', Math.abs(lhRatio - 2) < 0.15, String(lhRatio));
    await setRange(opt, '#lh', 0);
    await sleep(700);

    await tap(opt, '#tabs button[data-tab="general"]');
    await tap(opt, '#font-grid .font-card[data-kind="system"]');
    await sleep(900);
    ok('فونت سیستم ⇒ PWMFont برداشته شد', !/PWMFont/.test(await cssOf('#fa-assist', 'fontFamily')));
    await tap(opt, '#font-grid .font-card[data-kind="builtin"]');
    await sleep(1100);
    ok('بازگشت به فونت درون‌ساخته', /PWMFont/.test(await cssOf('#fa-assist', 'fontFamily')));

    section('خاموشی به‌ازای سایت');
    await tap(opt, '#tabs button[data-tab="sites"]');
    await opt.evaluate(() => { document.getElementById('site-input').value = '127.0.0.1'; });
    await tap(opt, '#site-add-off');
    await sleep(1000);
    eq('سایت خاموش‌شده هیچ نشانه‌ای ندارد', await page.evaluate(() => document.querySelectorAll('[data-pwm-dir]').length), 0);
    const listed = await opt.evaluate(() => document.querySelectorAll('#site-list .site-row').length);
    ok('قاعده در فهرست سایت‌ها ثبت شد', listed === 1, String(listed));
    await tap(opt, '#site-list [data-del]');
    await sleep(1000);
    eq('پس از حذف قاعده، سایت دوباره فعال شد', await dirOf('#fa-assist'), 'rtl');

    section('سلکتور دلخواه — از رابط کاربر تا صفحه');
    /* آزمون سرتاسری: چیزی که کاربر در textarea می‌نویسد باید از storage عبور
     * کند، به content script برسد و رفتار موتور را روی همان صفحه عوض کند. */
    eq('پیش‌فرض: بلوک درونی علامت خورده', await dirOf('#cs-inner'), 'rtl');
    eq('پیش‌فرض: ظرف بیرونی علامت نخورده', await dirOf('#cs-wrap'), null);
    eq('پیش‌فرض: پاراگراف محافظ‌شدنی فعلاً rtl است', await dirOf('#cs-guard'), 'rtl');

    await tap(opt, '#tabs button[data-tab="sites"]');
    await sleep(200);
    await opt.evaluate(() => {
      document.getElementById('sel-host-new').value = '127.0.0.1';
      const a = document.getElementById('sel-anchors');
      const g = document.getElementById('sel-guards');
      a.value = '.cs-wrap';
      g.value = '.cs-no';
      a.dispatchEvent(new Event('input', { bubbles: true }));
      g.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const okReport = await opt.evaluate(() => {
      const r = document.getElementById('sel-report');
      return { hidden: r.hidden, cls: r.className, text: r.textContent.trim().slice(0, 40) };
    });
    ok('بازخورد زنده می‌گوید سلکتورها معتبرند', !okReport.hidden && /ok/.test(okReport.cls), JSON.stringify(okReport));

    await tap(opt, '#sel-save');
    await sleep(1200);

    eq('لنگر دلخواه: ظرف بیرونی علامت خورد', await dirOf('#cs-wrap'), 'rtl');
    eq('لنگر دلخواه: بلوک درونی رها شد', await dirOf('#cs-inner'), null);
    eq('محافظ دلخواه: پاراگراف کنار گذاشته شد', await dirOf('#cs-guard'), null);
    eq('بقیه‌ی صفحه دست‌نخورده ماند', await dirOf('#fa-assist'), 'rtl');

    /* سلکتور نامعتبر باید در رابط کاربر علامت‌گذاری و در ذخیره‌سازی حذف شود */
    await opt.evaluate(() => {
      const a = document.getElementById('sel-anchors');
      a.value = '.cs-wrap\n.evil{color:red}\n<script>';
      a.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const badReport = await opt.evaluate(() => {
      const r = document.getElementById('sel-report');
      return { hidden: r.hidden, cls: r.className, text: r.textContent };
    });
    ok('بازخورد زنده سلکتور نامعتبر را گزارش می‌کند', !badReport.hidden && /bad/.test(badReport.cls), JSON.stringify(badReport).slice(0, 120));
    ok('و تعداد نامعتبرها را می‌شمارد', /۲/.test(badReport.text), badReport.text.slice(0, 60));

    await tap(opt, '#sel-save');
    await sleep(1000);
    const savedSel = await opt.evaluate(() => PWM.Settings.load().then((s) => {
      const site = (s.sites || {})['127.0.0.1'] || {};
      return { anchors: site.anchors || [], guards: site.guards || [] };
    }));
    eq('فقط سلکتور معتبر ذخیره شد', JSON.stringify(savedSel.anchors), JSON.stringify(['.cs-wrap']));

    /* شمارشگر «آزمودن روی تب فعال» */
    const testOut = await (async () => {
      await tap(opt, '#sel-test');
      await sleep(1400);
      return opt.evaluate(() => {
        const o = document.getElementById('sel-test-out');
        return { hidden: o.hidden, text: o.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) };
      });
    })();
    ok('آزمودن سلکتور روی تب فعال نتیجه می‌دهد', !testOut.hidden && /127\.0\.0\.1/.test(testOut.text), JSON.stringify(testOut));
    ok('و تعداد موارد پیداشده را نشان می‌دهد', /مورد/.test(testOut.text), testOut.text);

    /* پاک‌کردن سلکتورها باید صفحه را به حالت پیش‌فرض برگرداند */
    await opt.evaluate(() => {
      document.getElementById('sel-anchors').value = '';
      document.getElementById('sel-guards').value = '';
    });
    await tap(opt, '#sel-save');
    await sleep(1200);
    eq('پس از پاک‌کردن، ظرف بیرونی رها شد', await dirOf('#cs-wrap'), null);
    eq('و بلوک درونی برگشت', await dirOf('#cs-inner'), 'rtl');
    eq('و پاراگراف محافظ‌شده هم برگشت', await dirOf('#cs-guard'), 'rtl');

    section('همگام‌سازی تنظیمات');
    /* تنظیمات باید در storage.sync بنشیند و فونت آپلودی در storage.local بماند */
    await tap(opt, '#tabs button[data-tab="general"]');
    await sleep(250);
    const syncOn = await opt.evaluate(() => document.getElementById('sync-enabled').checked);
    ok('همگام‌سازی به‌طور پیش‌فرض روشن است', syncOn === true, String(syncOn));

    const areas = await opt.evaluate(() => new Promise((res) => {
      chrome.storage.sync.get(['pwm'], (s) => {
        chrome.storage.local.get(['pwm', 'pwmLocal'], (l) => {
          res({
            syncHasSettings: !!(s.pwm && s.pwm.version),
            syncHasFont: !!(s.pwm && s.pwm.font && s.pwm.font.customData),
            localHasHeavyKey: Object.prototype.hasOwnProperty.call(l, 'pwmLocal'),
            syncMode: s.pwm ? s.pwm.mode : null
          });
        });
      });
    }));
    ok('تنظیمات در storage.sync نوشته شده', areas.syncHasSettings, JSON.stringify(areas));
    ok('فونت آپلودی در sync نیست', !areas.syncHasFont, JSON.stringify(areas));
    ok('کلید محلی جدا ساخته شده', areas.localHasHeavyKey, JSON.stringify(areas));

    /* تغییری که در sync نوشته شود باید بی‌واسطه به صفحه برسد — همان مسیری که
     * روی یک دستگاه دیگر طی می‌شود. */
    await opt.evaluate(() => new Promise((res) => {
      chrome.storage.sync.get(['pwm'], (r) => {
        const next = Object.assign({}, r.pwm, { mode: 'force' });
        chrome.storage.sync.set({ pwm: next }, res);
      });
    }));
    await sleep(1400);
    const optMode = await opt.evaluate(() => document.querySelector('#mode input:checked').value);
    eq('نوشتن در sync رابط کاربر را به‌روز می‌کند', optMode, 'force');
    /* حالت force یعنی «هر متنی که حرف فارسی دارد» — پس پاراگراف مخلوط را
     * می‌گیرد، نه پاراگراف تماماً انگلیسی. */
    eq('و صفحه هم با حالت تازه رفتار می‌کند', await dirOf('#mixed-en'), 'rtl');

    /* برگرداندن به حالت هوشمند تا آزمون‌های بعدی تحت تأثیر نمانند */
    await opt.evaluate(() => new Promise((res) => {
      chrome.storage.sync.get(['pwm'], (r) => {
        chrome.storage.sync.set({ pwm: Object.assign({}, r.pwm, { mode: 'smart' }) }, res);
      });
    }));
    await sleep(1200);
    eq('بازگشت به حالت هوشمند', await dirOf('#mixed-en'), null);

    section('پاپ‌آپ');
    const pop = await browser.newPage();
    const popErrs = [];
    pop.on('pageerror', (e) => popErrs.push(String(e.message)));
    await pop.goto('chrome-extension://' + extId + '/src/popup/popup.html', { waitUntil: 'load' });
    await pop.waitForSelector('#master', { timeout: 10000 });
    await sleep(500);
    const popState = await pop.evaluate(() => ({
      master: document.getElementById('master').checked,
      chips: document.querySelectorAll('#font-chips .chip').length,
      modes: document.querySelectorAll('#mode button').length,
      selected: document.querySelector('#mode button[aria-selected="true"]').dataset.mode,
      width: document.body.getBoundingClientRect().width
    }));
    ok('پاپ‌آپ رندر شد و کلید اصلی روشن است', popState.master === true, JSON.stringify(popState));
    ok('چیپ‌های فونت ساخته شدند', popState.chips >= 5, String(popState.chips));
    eq('سه حالت تشخیص موجود است', popState.modes, 3);
    eq('حالت انتخاب‌شده درست نشان داده می‌شود', popState.selected, 'smart');
    ok('عرض پاپ‌آپ معقول است', popState.width > 250 && popState.width < 420, String(popState.width));
    eq('پاپ‌آپ بدون خطای جاوااسکریپت', popErrs.length, 0, popErrs.join(' | '));
    eq('صفحه‌ی تنظیمات بدون خطای جاوااسکریپت', optErrs.length, 0, optErrs.join(' | '));

    /* --------------------------------------------- زبانه‌های صفحه‌ی تنظیمات */
    section('زبانه‌های صفحه‌ی تنظیمات');
    /* صفحه را تازه بارگذاری می‌کنیم: در اجرای طولانی، Edge تبِ بی‌فوکوس تنظیمات
     * را دور می‌اندازد و ارزیابی بعدی با «Execution context was destroyed»
     * می‌شکند. این بخش هم به وضعیت قبلی نیازی ندارد. */
    await opt.goto('chrome-extension://' + extId + '/src/options/options.html', { waitUntil: 'load' });
    await opt.waitForSelector('#tabs button', { timeout: 10000 });
    await sleep(400);

    /* [hidden] در استایل‌شیت پیش‌فرض مرورگر فقط display:none است و هر قاعده‌ی
     * نویسنده (مثل .pane{display:flex}) آن را می‌شکند؛ نتیجه این می‌شود که همه‌ی
     * زبانه‌ها زیر هم رندر می‌شوند و کلیک روی تب‌ها هیچ اثری ندارد. */
    const panes = () => opt.evaluate(() => Array.from(document.querySelectorAll('.pane'))
      .map((p) => ({ id: p.dataset.pane, shown: getComputedStyle(p).display !== 'none' })));

    await tap(opt, '#tabs button[data-tab="general"]');
    await sleep(300);
    let vis = await panes();
    eq('در آغاز فقط یک زبانه دیده می‌شود', vis.filter((p) => p.shown).length, 1);
    eq('و آن زبانه‌ی عمومی است', vis.find((p) => p.shown).id, 'general');

    for (const tab of ['typo', 'sites', 'adv', 'lab', 'about']) {
      await tap(opt, '#tabs button[data-tab="' + tab + '"]');
      await sleep(280);
      vis = await panes();
      const shown = vis.filter((p) => p.shown);
      ok('زبانه‌ی ' + tab + ' تنها زبانه‌ی نمایان است',
        shown.length === 1 && shown[0].id === tab,
        JSON.stringify(shown.map((s) => s.id)));
    }

    // عناصری که با [hidden] پنهان می‌شوند نباید با display نویسنده برگردند
    const hiddenLeak = await opt.evaluate(() => Array.from(document.querySelectorAll('[hidden]'))
      .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id || e.tagName));
    eq('هیچ عنصر [hidden] نمایان نمانده', hiddenLeak.length, 0, hiddenLeak.join(','));

    const popHiddenLeak = await pop.evaluate(() => Array.from(document.querySelectorAll('[hidden]'))
      .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id || e.tagName));
    eq('در پاپ‌آپ هم [hidden] واقعاً پنهان است', popHiddenLeak.length, 0, popHiddenLeak.join(','));

    section('بهداشت کنسول صفحه');
    const realErrors = pageErrors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/i.test(e));
    eq('هیچ خطای جاوااسکریپتی در صفحه رخ نداد', realErrors.length, 0, realErrors.slice(0, 3).join(' | '));
    if (realErrors.length) realErrors.slice(0, 5).forEach((e) => console.log('    ! ' + e.slice(0, 200)));

    /* -------------------------------------------------------------- کارایی */
    section('کارایی روی صفحه‌ی سنگین');
    const big = await browser.newPage();
    await big.goto(URL_BASE, { waitUntil: 'load' });
    await sleep(900);
    await big.evaluate(() => {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 2000; i++) {
        const p = document.createElement('p');
        p.className = 'bulk';
        p.textContent = i % 2
          ? 'پاراگراف شماره ' + i + ' با متن فارسی برای سنجش کارایی موتور.'
          : 'Paragraph ' + i + ' in English for throughput measurement here.';
        frag.appendChild(p);
      }
      document.body.appendChild(frag);
    });
    const t0 = Date.now();
    await big.waitForFunction(() => document.querySelectorAll('p.bulk[data-pwm-dir="rtl"]').length >= 1000, { timeout: 20000 }).catch(() => {});
    const dt = Date.now() - t0;
    const bulk = await big.evaluate(() => document.querySelectorAll('p.bulk[data-pwm-dir="rtl"]').length);
    const wrong = await big.evaluate(() => document.querySelectorAll('p.bulk[data-pwm-dir="rtl"]').length - Array.from(document.querySelectorAll('p.bulk[data-pwm-dir="rtl"]')).filter((p) => /[\u0600-\u06FF]/.test(p.textContent)).length);
    ok('۱۰۰۰ پاراگراف فارسی از ۲۰۰۰ نشانه‌گذاری شد', bulk === 1000, 'marked=' + bulk);
    eq('هیچ پاراگراف انگلیسی اشتباه علامت نخورد', wrong, 0);
    ok('پردازش زیر ۸ ثانیه انجام شد', dt < 8000, dt + 'ms');
    console.log('    زمان: ' + dt + 'ms برای ' + bulk + ' بلوک');

    /* شمارش فریم: requestAnimationFrame در تبِ پنهان/بی‌فوکوس throttle یا کاملاً
     * متوقف می‌شود و آن‌وقت این Promise هرگز resolve نمی‌شود و کل اجرا با
     * «Runtime.callFunctionOn timed out» می‌افتد. پس اول تب را جلو می‌آوریم و
     * یک مهلت سخت هم می‌گذاریم تا در بدترین حالت صفر برگردد نه اینکه معلق بماند. */
    await big.bringToFront().catch(() => {});
    const frames = await big.evaluate(() => new Promise((res) => {
      let n = 0;
      const t = performance.now();
      const hardStop = setTimeout(() => res(n), 2500);
      const loop = () => {
        n++;
        if (performance.now() - t < 1000) requestAnimationFrame(loop);
        else {
          clearTimeout(hardStop);
          res(n);
        }
      };
      requestAnimationFrame(loop);
    }));
    ok('صفحه پس از پردازش روان مانده', frames > 20, frames + ' فریم در ثانیه');
  } finally {
    await browser.close().catch(() => {});
    srv.close();
    await sleep(400);
    cleanupProfile();
  }

  console.log('\n' + '\u2550'.repeat(46));
  console.log('  \u2713 ' + pass + ' passed    \u2717 ' + fail + ' failed');
  if (fail) { console.log('\n  ناکام‌ها:'); failures.forEach((f) => console.log('   • ' + f)); }
  console.log('\u2550'.repeat(46) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('\nCRASH:', e && e.message); process.exit(2); });

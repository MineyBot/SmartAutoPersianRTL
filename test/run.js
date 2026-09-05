/* ============================================================================
 * test/run.js — اجرای واقعی موتور روی یک DOM شبیه‌سازی‌شده (jsdom)
 * اجرا:  node test/run.js
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  \u2713 ' + name);
  } else {
    fail++;
    failures.push(name + (extra ? ' → ' + extra : ''));
    console.log('  \u2717 ' + name + (extra ? '  [' + extra + ']' : ''));
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, 'got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected));
}

function section(t) {
  console.log('\n\u2500\u2500 ' + t);
}

/* ========================================================================
 * ۱. تست‌های خالص: bidi / settings / sites  (بدون DOM)
 * ======================================================================*/
function loadPure() {
  const sandbox = { self: {}, console };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  for (const f of ['src/core/bidi.js', 'src/core/sites.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.PWM;
}

function testBidi(PWM) {
  section('bidi — تشخیص جهت');
  const B = PWM.Bidi;
  const smart = { mode: 'smart', threshold: 0.3 };

  eq('متن تماماً فارسی ⇒ rtl', B.analyze('سلام دنیا این یک آزمون است', smart).dir, 'rtl');
  eq('متن تماماً انگلیسی ⇒ ltr', B.analyze('Hello world this is a test', smart).dir, 'ltr');
  eq('فارسی با یک کلمه انگلیسی ⇒ rtl', B.analyze('برای نصب npm install را بزنید', smart).dir, 'rtl');
  eq('انگلیسی با یک کلمه فارسی ⇒ ltr', B.analyze('The word سلام means hello in Persian language', smart).dir, 'ltr');
  eq('فقط ارقام لاتین ⇒ null', B.analyze('12345 67.89 %', smart).dir, null);
  eq('فقط ارقام فارسی ⇒ null (ارقام خنثی‌اند)', B.analyze('۱۲۳۴۵ ۶۷۸۹', smart).dir, null);
  eq('فقط نقطه‌گذاری ⇒ null', B.analyze('... --- !!! ??? «» ()', smart).dir, null);
  eq('فقط ایموجی ⇒ null', B.analyze('🎉🚀✨', smart).dir, null);
  eq('رشته‌ی خالی ⇒ null', B.analyze('', smart).dir, null);
  eq('عبری ⇒ rtl', B.analyze('שלום עולם', smart).dir, 'rtl');
  eq('چینی ⇒ ltr', B.analyze('你好世界这是一个测试', smart).dir, 'ltr');

  eq('حالت force: یک حرف فارسی کافی است', B.analyze('The word سلام here', { mode: 'force' }).dir, 'rtl');
  eq('حالت auto: اولین حرف انگلیسی ⇒ ltr', B.analyze('The کلمه سلام و متن فارسی بیشتر', { mode: 'auto' }).dir, 'ltr');
  eq('حالت auto: اولین حرف فارسی ⇒ rtl', B.analyze('کلمه The word here now', { mode: 'auto' }).dir, 'rtl');

  const mixed = B.analyze('سلام hello', smart);
  ok('شمارش دقیق حروف مخلوط', mixed.rtl === 4 && mixed.ltr === 5, 'rtl=' + mixed.rtl + ' ltr=' + mixed.ltr);

  eq('ZWNJ خنثی است', B.analyze('\u200c\u200c\u200c', smart).dir, null);
  ok('hasRtl سریع کار می‌کند', B.hasRtl('abc د') === true && B.hasRtl('abc 123') === false);
  ok('isBlank فاصله‌ها را می‌شناسد', B.isBlank('  \n\t\u200b') === true && B.isBlank(' a ') === false);

  const th9 = { mode: 'smart', threshold: 0.9 };
  eq('آستانه‌ی بالا ⇒ متن مخلوط ltr می‌شود', B.analyze('سلام hello world friend', th9).dir, 'ltr');

  // نویسه‌های فراپلن (Yezidi) — بررسی مدیریت surrogate pair
  eq('surrogate pair عربی-ریاضی ⇒ rtl', B.analyze('\u{1EE00}\u{1EE01}\u{1EE02}', smart).dir, 'rtl');
}

function testSites(PWM) {
  section('sites — تطبیق دامنه');
  const S = PWM.Sites;
  eq('نرمال‌سازی www و پورت', S.normalizeHost('WWW.ChatGPT.com:443'), 'chatgpt.com');
  eq('chatgpt شناخته می‌شود', S.resolve('chatgpt.com').id, 'chatgpt');
  eq('زیردامنه هم تطبیق می‌یابد', S.resolve('sub.chat.deepseek.com').id, 'deepseek');
  eq('aistudio پروفایل دارد', S.resolve('aistudio.google.com').id, 'aistudio');
  eq('دامنه‌ی ناشناس ⇒ generic', S.resolve('example.org').id, 'generic');
  ok('پروفایل ناشناس هم لنگر عمومی دارد', S.resolve('example.org').anchors.length > 5);
  ok('gemini نیاز به pierce دارد', S.resolve('gemini.google.com').pierce === true);
  ok('لنگرهای سایت پیش از لنگرهای عمومی می‌آیند', S.resolve('claude.ai').anchors[0] === '[data-testid="user-message"]');
  ok('نگهبان‌های عمومی به همه اضافه می‌شوند', S.resolve('chatgpt.com').guards.indexOf('.katex') >= 0);
  eq('تعداد پروفایل‌ها', S.PROFILES.length, 27);
  const ids = new Set(S.PROFILES.map((p) => p.id));
  eq('شناسه‌های پروفایل یکتا هستند', ids.size, S.PROFILES.length);
}

/* ========================================================================
 * ۲. تست‌های DOM: engine روی صفحه‌ی ساختگی
 * ======================================================================*/
function makeDom(html) {
  const dom = new JSDOM(html, { url: 'https://chatgpt.com/c/test', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;

  // shim های لازم برای jsdom
  if (!w.requestIdleCallback) {
    w.requestIdleCallback = (cb) => w.setTimeout(() => cb({ timeRemaining: () => 50, didTimeout: false }), 0);
  }
  if (!w.CSSStyleSheet.prototype.replaceSync) {
    w.CSSStyleSheet.prototype.replaceSync = function () {};
  }
  w.chrome = {
    runtime: {
      getURL: (p) => 'chrome-extension://test/' + p,
      lastError: null,
      sendMessage: () => {},
      onMessage: { addListener: () => {} },
      getManifest: () => ({ version: '4.0.0' })
    },
    storage: {
      local: {
        _d: {},
        get(keys, cb) {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            if (k in this._d) out[k] = this._d[k];
          });
          cb(out);
        },
        set(obj, cb) {
          Object.assign(this._d, obj);
          if (cb) cb();
        },
        remove(keys, cb) {
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete this._d[k]);
          if (cb) cb();
        }
      },
      onChanged: { addListener: () => {}, removeListener: () => {} }
    }
  };

  for (const f of ['src/core/bidi.js', 'src/core/sites.js', 'src/core/settings.js', 'src/core/css.js', 'src/content/engine.js']) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    w.eval(code);
  }
  return dom;
}

const PAGE = `<!DOCTYPE html><html><head></head><body>
<div id="chat">
  <div data-message-author-role="user"><div class="markdown"><p id="fa1">سلام، لطفاً یک تابع مرتب‌سازی بنویس.</p></div></div>
  <div data-message-author-role="assistant"><div class="markdown">
    <p id="fa2">حتماً! این نمونه‌ی <span id="inl">quick sort</span> است:</p>
    <pre id="code"><code>def sort(a):\n  return sorted(a)</code></pre>
    <p id="en1">This paragraph is entirely written in English and should stay LTR.</p>
    <ul><li id="fa3">مرحله‌ی اول: انتخاب محور</li><li id="fa4">مرحله‌ی دوم: تقسیم آرایه</li></ul>
    <blockquote id="fa5">نکته‌ی مهم: پیچیدگی زمانی میانگین آن n log n است.</blockquote>
    <table><tr><th id="fa6">ردیف</th><th id="en2">Complexity</th></tr></table>
    <span class="katex" id="math">x^2 + بتا</span>
    <div class="hljs" id="hl">متن داخل کد نباید تغییر کند</div>
  </div></div>
</div>
<textarea id="ta" placeholder="بنویسید…"></textarea>
<input id="inp" type="text" />
<input id="rng" type="range" />
<div id="ce" contenteditable="true">متن قابل ویرایش</div>
<div id="host"></div>
<p id="digits">۱۲۳۴۵</p>
<p id="empty">   </p>
</body></html>`;

async function tick(w, ms) {
  return new Promise((r) => w.setTimeout(r, ms));
}

async function testEngine() {
  section('engine — نشانه‌گذاری DOM');
  const dom = makeDom(PAGE);
  const w = dom.window;
  const PWM = w.PWM;
  const cfg = PWM.Settings.sanitize({ adv: { debounce: 0, budgetMs: 100 } });
  const profile = PWM.Sites.resolve('chatgpt.com');

  const eng = new PWM.Engine();
  eng.start(cfg, profile);
  await tick(w, 120);

  const D = (id) => {
    const el = w.document.getElementById(id);
    return el ? el.getAttribute('data-pwm-dir') : 'MISSING';
  };

  eq('پاراگراف فارسی کاربر ⇒ rtl', D('fa1'), 'rtl');
  eq('پاراگراف فارسی پاسخ ⇒ rtl', D('fa2'), 'rtl');
  eq('آیتم لیست فارسی ⇒ rtl', D('fa3'), 'rtl');
  eq('نقل‌قول فارسی ⇒ rtl', D('fa5'), 'rtl');
  eq('سرستون فارسی ⇒ rtl', D('fa6'), 'rtl');
  eq('پاراگراف انگلیسی دست‌نخورده', D('en1'), null);
  eq('سرستون انگلیسی دست‌نخورده', D('en2'), null);
  eq('بلوک <pre> دست‌نخورده', D('code'), null);
  eq('فرمول katex دست‌نخورده', D('math'), null);
  eq('بلوک hljs دست‌نخورده', D('hl'), null);
  eq('پاراگراف فقط-رقم دست‌نخورده', D('digits'), null);
  eq('پاراگراف خالی دست‌نخورده', D('empty'), null);

  eq('textarea علامت خودکار می‌گیرد', w.document.getElementById('ta').getAttribute('data-pwm-auto'), '1');
  eq('input متنی علامت می‌گیرد', w.document.getElementById('inp').getAttribute('data-pwm-auto'), '1');
  eq('input[type=range] علامت نمی‌گیرد', w.document.getElementById('rng').getAttribute('data-pwm-auto'), null);
  eq('contenteditable علامت می‌گیرد', w.document.getElementById('ce').getAttribute('data-pwm-auto'), '1');
  eq('dir=auto روی ورودی ست می‌شود', w.document.getElementById('ta').getAttribute('dir'), 'auto');

  /* --- محتوای پویا (شبیه استریم چت‌بات) --- */
  section('engine — محتوای پویا');
  const md = w.document.querySelectorAll('.markdown')[1];
  const fresh = w.document.createElement('p');
  fresh.id = 'stream';
  fresh.textContent = 'این پاراگراف بعد از شروع موتور اضافه شد.';
  md.appendChild(fresh);
  await tick(w, 120);
  eq('پاراگراف تازه‌افزوده ⇒ rtl', D('stream'), 'rtl');

  const grow = w.document.createElement('p');
  grow.id = 'grow';
  grow.textContent = 'Loading';
  md.appendChild(grow);
  await tick(w, 80);
  eq('پاراگراف انگلیسی تازه دست‌نخورده', D('grow'), null);
  grow.textContent = 'اکنون متن فارسی شد و باید راست‌چین شود.';
  await tick(w, 120);
  eq('تغییر متن به فارسی ⇒ rtl', D('grow'), 'rtl');

  /* --- Shadow DOM --- */
  section('engine — Shadow DOM');
  const host = w.document.getElementById('host');
  const sr = host.attachShadow({ mode: 'open' });
  sr.innerHTML = '<p id="sfa">متن فارسی داخل شدو دام</p><p id="sen">Shadow english text here</p>';
  host.dispatchEvent(new w.CustomEvent('pwm:shadow', { bubbles: true, composed: true }));
  await tick(w, 150);
  eq('پاراگراف فارسی در Shadow ⇒ rtl', sr.getElementById('sfa').getAttribute('data-pwm-dir'), 'rtl');
  eq('پاراگراف انگلیسی در Shadow دست‌نخورده', sr.getElementById('sen').getAttribute('data-pwm-dir'), null);
  ok('ریشه‌ی سایه ثبت شد', eng.report().roots >= 2, 'roots=' + eng.report().roots);

  /* --- گزارش --- */
  const rep = eng.report();
  ok('گزارش موتور معتبر است', rep.running === true && rep.live > 5, JSON.stringify(rep));

  /* --- توقف و پاک‌سازی --- */
  section('engine — پاک‌سازی کامل');
  eng.stop();
  const leftovers = w.document.querySelectorAll('[data-pwm-dir],[data-pwm-auto]').length;
  eq('هیچ نشانه‌ای در سند نمی‌ماند', leftovers, 0);
  const shadowLeft = sr.querySelectorAll('[data-pwm-dir]').length;
  eq('هیچ نشانه‌ای در Shadow نمی‌ماند', shadowLeft, 0);
  eq('موتور خاموش است', eng.report().running, false);

  return dom;
}

/* ========================================================================
 * ۳. تست settings و css
 * ======================================================================*/
async function testSettings() {
  section('settings — اعتبارسنجی و مهاجرت');
  const dom = makeDom('<body></body>');
  const w = dom.window;
  const St = w.PWM.Settings;

  const s = St.sanitize({});
  eq('پیش‌فرض: فعال', s.enabled, true);
  eq('پیش‌فرض: حالت هوشمند', s.mode, 'smart');
  eq('نسخه‌ی طرح', s.version, 4);

  eq('حالت نامعتبر اصلاح می‌شود', St.sanitize({ mode: 'hack' }).mode, 'smart');
  eq('آستانه‌ی خارج از بازه محدود می‌شود', St.sanitize({ threshold: 99 }).threshold, 1);
  eq('آستانه‌ی منفی محدود می‌شود', St.sanitize({ threshold: -5 }).threshold, 0.05);
  eq('اندازه‌ی فونت محدود می‌شود', St.sanitize({ font: { scale: 500 } }).font.scale, 160);
  eq('debounce محدود می‌شود', St.sanitize({ adv: { debounce: 99999 } }).adv.debounce, 1000);
  eq('فونت دلخواه بی‌اعتبار پاک می‌شود', St.sanitize({ font: { source: 'custom', customData: 'javascript:evil' } }).font.customData, '');
  eq('و منبع به builtin برمی‌گردد', St.sanitize({ font: { source: 'custom', customData: 'nope' } }).font.source, 'builtin');
  ok('data:URL معتبر پذیرفته می‌شود', St.sanitize({ font: { source: 'custom', customData: 'data:font/woff2;base64,AAA' } }).font.source === 'custom');

  const mig = St.migrate({ rtlEnabled: false, customFontBase64: 'data:font/woff2;base64,ZZZ', customFontName: 'MyFont.woff2' });
  eq('مهاجرت v3: کلید اصلی', mig.enabled, false);
  eq('مهاجرت v3: نام فونت', mig.font.customName, 'MyFont.woff2');
  eq('مهاجرت v3: منبع custom', mig.font.source, 'custom');

  section('settings — تنظیمات مؤثر هر دامنه');
  const base = St.sanitize({ scope: 'all' });
  eq('سایت شناخته‌شده فعال است', St.effective(base, 'chatgpt.com').active, true);
  eq('سایت ناشناس هم با scope=all فعال است', St.effective(base, 'random.org').active, true);

  const known = St.sanitize({ scope: 'known' });
  eq('scope=known: ناشناس خاموش', St.effective(known, 'random.org').active, false);
  eq('scope=known: شناخته‌شده روشن', St.effective(known, 'github.com').active, true);

  const aiOnly = St.sanitize({ scope: 'ai' });
  eq('scope=ai: github خاموش', St.effective(aiOnly, 'github.com').active, false);
  eq('scope=ai: claude روشن', St.effective(aiOnly, 'claude.ai').active, true);
  eq('بازنویسی سایت بر scope اولویت دارد', St.effective(St.sanitize({ scope: 'ai', sites: { 'github.com': { enabled: true } } }), 'github.com').active, true);
  eq('خاموشی دستی سایت اعمال می‌شود', St.effective(St.sanitize({ sites: { 'chatgpt.com': { enabled: false } } }), 'chatgpt.com').active, false);
  eq('کلید اصلی بر همه اولویت دارد', St.effective(St.sanitize({ enabled: false, sites: { 'chatgpt.com': { enabled: true } } }), 'chatgpt.com').active, false);
  eq('بازنویسی حالت هر سایت', St.effective(St.sanitize({ mode: 'smart', sites: { 'x.com': { mode: 'force' } } }), 'x.com').cfg.mode, 'force');

  section('css — تولید استایل');
  const Css = w.PWM.Css;
  const css = Css.build(St.sanitize({}), w.PWM.Sites.resolve('chatgpt.com'));
  ok('CSS شامل قاعده‌ی rtl است', css.indexOf('[data-pwm-dir="rtl"]') >= 0);
  ok('CSS از text-align:start استفاده می‌کند', css.indexOf('text-align:start') >= 0);
  ok('CSS کد را چپ‌چین می‌کند', /pre[\s\S]*direction:ltr/.test(css));
  ok('CSS ورودی‌ها را plaintext می‌کند', css.indexOf('unicode-bidi:plaintext') >= 0);
  ok('CSS آیکون‌ها را از فونت مستثنا می‌کند', css.indexOf('font-family:revert') >= 0);
  ok('بدون debug هیچ outline ندارد', css.indexOf('outline:1px dashed') === -1);
  ok('با debug کادر رنگی دارد', Css.build(St.sanitize({ adv: { debug: true } }), w.PWM.Sites.resolve('chatgpt.com')).indexOf('outline:1px dashed') >= 0);
  ok('حالت justify اعمال می‌شود', Css.build(St.sanitize({ typo: { justify: true } }), w.PWM.Sites.resolve('a.com')).indexOf('text-align:justify') >= 0);
  eq('فونت سیستم بدون family سفارشی', Css.fontStack(St.sanitize({ font: { source: 'system' } })).indexOf('PWMFont'), -1);
  ok('ارقام فارسی فونت FD را انتخاب می‌کند', Css.resolveBuiltin(St.sanitize({ font: { digits: 'farsi', builtin: 'vazirmatn' } })).id === 'vazirmatn-fd');
  ok('CSS معتبر است (تعادل آکولادها)', (css.match(/{/g) || []).length === (css.match(/}/g) || []).length);
}

/* ========================================================================
 * ۴. یکپارچگی پروژه: manifest، فایل‌ها، فونت‌ها، آیکن‌ها
 * ======================================================================*/
function testProject() {
  section('project — یکپارچگی بسته');
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  eq('manifest v3', mf.manifest_version, 3);
  ok('نسخه ۴ است', /^4\./.test(mf.version), mf.version);
  ok('مجوز declarativeNetRequest حذف شده', (mf.permissions || []).indexOf('declarativeNetRequest') === -1);

  const files = [];
  (mf.content_scripts || []).forEach((cs) => {
    (cs.js || []).forEach((f) => files.push(f));
    (cs.css || []).forEach((f) => files.push(f));
  });
  files.push(mf.background.service_worker, mf.action.default_popup, mf.options_ui.page);
  Object.values(mf.icons).forEach((p) => files.push(p));

  let missing = files.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  eq('همه‌ی فایل‌های manifest موجودند', missing.length, 0, missing.join(','));
  if (missing.length) console.log('    گمشده: ' + missing.join(', '));

  const fontFiles = fs
    .readFileSync(path.join(ROOT, 'src/core/settings.js'), 'utf8')
    .match(/file: '([^']+)'/g)
    .map((m) => m.replace(/file: '|'/g, ''));
  const badFonts = fontFiles.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  eq('همه‌ی فونت‌های تعریف‌شده موجودند', badFonts.length, 0, badFonts.join(','));

  for (const f of fontFiles) {
    const buf = fs.readFileSync(path.join(ROOT, f));
    ok('فونت معتبر woff2: ' + path.basename(f), buf.slice(0, 4).toString('ascii') === 'wOF2');
  }

  for (const s of [16, 32, 48, 128]) {
    const p = path.join(ROOT, 'icons/icon' + s + '.png');
    const off = path.join(ROOT, 'icons/icon' + s + '-off.png');
    ok('آیکن ' + s + ' موجود و PNG', fs.existsSync(p) && fs.readFileSync(p).slice(1, 4).toString('ascii') === 'PNG');
    ok('آیکن خاموش ' + s + ' موجود', fs.existsSync(off));
  }

  for (const loc of ['fa', 'en']) {
    const p = path.join(ROOT, '_locales/' + loc + '/messages.json');
    ok('ترجمه‌ی ' + loc + ' معتبر است', fs.existsSync(p) && !!JSON.parse(fs.readFileSync(p, 'utf8')).extName);
  }

  // هیچ فایل قدیمی نسخه‌ی ۳ در ریشه نماند
  ['content.js', 'popup.js', 'background.js', 'main-world.js', 'content.css', 'popup.css', 'popup.html'].forEach((f) => {
    ok('فایل قدیمی حذف شده: ' + f, !fs.existsSync(path.join(ROOT, f)));
  });

  // سلکتورهای پروفایل‌ها باید در مرورگر معتبر باشند
  section('project — اعتبار سلکتورهای CSS');
  const dom2 = new JSDOM('<body></body>');
  const doc = dom2.window.document;
  const PWMp = loadPure();
  let badSel = [];
  PWMp.Sites.PROFILES.forEach((p) => {
    (p.anchors || []).concat(p.guards || [], p.inputs || []).forEach((sel) => {
      const s = sel.slice(-1) === '-' ? '[class*="x"]' : sel;
      try {
        doc.querySelector(s);
      } catch (e) {
        badSel.push(p.id + ':' + sel);
      }
    });
  });
  eq('همه‌ی سلکتورهای پروفایل‌ها معتبرند', badSel.length, 0, badSel.join(','));
}

/* ========================================================================
 * ۵. کارایی: صفحه‌ی بزرگ
 * ======================================================================*/
async function testPerf() {
  section('perf — صفحه‌ی بزرگ');
  let body = '<body><div id="big">';
  for (let i = 0; i < 1500; i++) {
    body += i % 3 === 0
      ? '<p>پاراگراف شماره ' + i + ' با متن فارسی برای سنجش کارایی موتور راست‌چین‌ساز.</p>'
      : '<p>Paragraph number ' + i + ' written in English to measure engine throughput.</p>';
  }
  body += '</div></body>';

  const dom = makeDom(body);
  const w = dom.window;
  const PWM = w.PWM;
  const cfg = PWM.Settings.sanitize({ adv: { debounce: 0, budgetMs: 1000 } });
  const eng = new PWM.Engine();
  const t0 = Date.now();
  eng.start(cfg, PWM.Sites.resolve('example.com'));
  await tick(w, 400);
  const dt = Date.now() - t0;
  const marked = w.document.querySelectorAll('[data-pwm-dir="rtl"]').length;
  ok('۵۰۰ پاراگراف فارسی نشانه‌گذاری شد', marked === 500, 'marked=' + marked);
  ok('۱۵۰۰ پاراگراف زیر ۲ ثانیه پردازش شد', dt < 2000, dt + 'ms');
  console.log('    زمان کل: ' + dt + 'ms — بلوک‌های علامت‌خورده: ' + marked);
  eng.stop();
}

/* ========================================================================
 * اجرا
 * ======================================================================*/
(async function main() {
  console.log('\n\u2554\u2550\u2550 Persian Web Mixer · Test Suite \u2550\u2550');
  const PWM = loadPure();
  testBidi(PWM);
  testSites(PWM);
  await testEngine();
  await testSettings();
  testProject();
  await testPerf();

  console.log('\n' + '\u2550'.repeat(46));
  console.log('  \u2713 ' + pass + ' passed    \u2717 ' + fail + ' failed');
  if (fail) {
    console.log('\n  ناکام‌ها:');
    failures.forEach((f) => console.log('   • ' + f));
  }
  console.log('\u2550'.repeat(46) + '\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\nCRASH:', e);
  process.exit(2);
});

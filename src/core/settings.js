/* ============================================================================
 * PWM · core/settings.js
 * لایه‌ی تنظیمات: طرح پیش‌فرض، اعتبارسنجی، ذخیره/بازیابی و «تنظیمات مؤثر»
 * برای یک دامنه‌ی مشخص (ترکیب تنظیمات سراسری + بازنویسی‌های همان سایت).
 * در Content Script، Popup، Options و Service Worker استفاده می‌شود.
 * ==========================================================================*/
(function (root) {
  'use strict';
  var PWM = (root.PWM = root.PWM || {});

  var SCHEMA_VERSION = 5;
  var STORE_KEY = 'pwm';
  var LOCAL_KEY = 'pwmLocal'; // فقط چیزهایی که در sync جا نمی‌شوند (فونت آپلودی)

  /* فونت‌های همراه افزونه (آفلاین، بدون درخواست شبکه) */
  var BUILTIN_FONTS = [
    { id: 'vazirmatn', label: 'وزیرمتن', file: 'fonts/Vazirmatn-Variable.woff2', variable: true, digits: 'latin' },
    { id: 'vazirmatn-fd', label: 'وزیرمتن (ارقام فارسی)', file: 'fonts/Vazirmatn-FD-Regular.woff2', variable: false, digits: 'farsi' },
    { id: 'vazirmatn-nl', label: 'وزیرمتن (فقط فارسی)', file: 'fonts/Vazirmatn-NL-Variable.woff2', variable: true, digits: 'latin' },
    { id: 'vazirmatn-rd', label: 'وزیرمتن نقطه‌گرد', file: 'fonts/Vazirmatn-RD-Variable.woff2', variable: true, digits: 'latin' }
  ];

  var FALLBACK_STACK =
    '"Vazirmatn", "IRANSans", "Sahel", "Shabnam", "Segoe UI", Tahoma, system-ui, -apple-system, sans-serif';

  var DEFAULTS = {
    version: SCHEMA_VERSION,

    /* ---- کلیدهای اصلی ---- */
    enabled: true, // کلید اصلی افزونه
    scope: 'all', // 'all' همه‌ی سایت‌ها | 'known' فقط سایت‌های شناخته‌شده | 'ai' فقط چت‌بات‌ها
    mode: 'smart', // 'smart' نسبت‌محور | 'auto' اولین‌حرف | 'force' هر متن فارسی
    threshold: 0.3, // آستانه‌ی حالت smart (۰ تا ۱)
    inputs: true, // راست‌چین‌سازی فیلدهای ورودی و ادیتورها
    placeholders: true, // راست‌چین‌سازی متن راهنمای فیلدها
    liveTyping: true, // تشخیص لحظه‌ای هنگام تایپ

    /* ---- فونت ---- */
    font: {
      enabled: true,
      source: 'builtin', // 'builtin' | 'custom' | 'system'
      builtin: 'vazirmatn',
      customName: '',
      customData: '', // data:URL فونت آپلودی
      customFamily: 'PWMCustomFont',
      scale: 100, // ۸۰ تا ۱۴۰ درصد
      applyToLatin: false, // فونت فارسی روی متن لاتین هم اعمال شود؟
      digits: 'auto' // 'auto' | 'farsi' | 'latin' (via font-feature/локale)
    },

    /* ---- تایپوگرافی ---- */
    typo: {
      lineHeight: 0, // ۰ = دست‌نزن، در غیر این‌صورت ضریب (مثلاً ۱٫۸)
      justify: false, // هم‌ترازی دوطرفه‌ی پاراگراف‌ها
      letterSpacing: 0, // px
      wordSpacing: 0, // px
      paragraphGap: 0, // px فاصله‌ی افزوده بین پاراگراف‌ها
      fixListIndent: true, // اصلاح تودرتویی لیست‌ها در حالت راست‌چین
      fixQuotes: true, // اصلاح خط کنارِ نقل‌قول
      fixTables: true, // راست‌چین‌سازی جداول
      keepCodeLtr: true, // کد و فرمول همیشه چپ‌چین
      isolateInline: true // جداسازی دوجهته‌ی قطعات لاتین درون متن فارسی
    },

    /* ---- پیشرفته ---- */
    adv: {
      pierceShadow: true, // نفوذ در Shadow DOM
      openClosedShadow: true, // بازکردن Shadow های closed در main world
      mirrorLayout: false, // آینه‌کردن چیدمان (خطرناک، پیش‌فرض خاموش)
      debounce: 60, // میلی‌ثانیه؛ فشرده‌سازی رویدادهای Mutation
      budgetMs: 8, // سقف زمان هر برش پردازش (تقسیم کار در فریم‌ها)
      maxDepth: 24, // حداکثر عمق پیمایش از هر گره‌ی تغییر‌یافته
      debug: false, // گزارش در کنسول
      badge: true // نمایش وضعیت روی آیکن افزونه
    },

    /* ---- بازنویسی به‌ازای سایت ----
     * 'example.com': { enabled: false }
     *              | { mode: 'force', font: {...} }
     *              | { anchors: ['.msg'], guards: ['.chart'] }   ← سلکتور دلخواه
     */
    sites: {},

    /* ---- همگام‌سازی ----
     * تنظیمات (~۷۰۰ بایت) در storage.sync ذخیره می‌شود، پس روی همه‌ی دستگاه‌هایی
     * که با یک حساب وارد شده‌اند خودش می‌آید. فونت آپلودی همیشه محلی می‌ماند:
     * حدود ۱۴۵ کیلوبایت است و سهمیه‌ی sync برای هر آیتم ۸ کیلوبایت.
     */
    syncEnabled: true,

    /* ---- آمار سبک ---- */
    stats: { applied: 0, lastHost: '', lastAt: 0 }
  };

  /* کلیدهایی که هرگز sync نمی‌شوند (حجم‌شان از سهمیه بیشتر است) */
  var LOCAL_ONLY = [['font', 'customData'], ['font', 'customName']];

  /* ------------------------------------------------------------------ utils */
  function isObj(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function deepMerge(base, patch) {
    var out = Array.isArray(base) ? base.slice() : isObj(base) ? {} : base;
    if (isObj(base)) for (var k in base) out[k] = base[k];
    if (!isObj(patch)) return out;
    for (var p in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, p)) continue;
      var v = patch[p];
      out[p] = isObj(v) && isObj(out[p]) ? deepMerge(out[p], v) : v;
    }
    return out;
  }

  function clamp(v, lo, hi, dflt) {
    v = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(v)) return dflt;
    return Math.min(hi, Math.max(lo, v));
  }

  function oneOf(v, list, dflt) {
    return list.indexOf(v) >= 0 ? v : dflt;
  }

  /* --------------------------------------------------- سلکتورهای دلخواه سایت
   * کاربر می‌تواند برای هر دامنه سلکتور اضافه کند: «این را لنگر بگیر» یا «به این
   * دست نزن». چون این رشته‌ها مستقیم در CSS و querySelector می‌روند، باید
   * سخت‌گیرانه اعتبارسنجی شوند، وگرنه یک `}` سادهٔ اشتباهی کل استایل‌شیت را
   * می‌شکند و یک سلکتور نامعتبر هر `matches()` را throw می‌کند.
   * -------------------------------------------------------------------------*/
  var MAX_SELECTORS = 20;
  var MAX_SELECTOR_LEN = 160;

  /** آیا این رشته یک سلکتور CSS بی‌خطر و معتبر است؟ */
  function isSafeSelector(sel) {
    if (typeof sel !== 'string') return false;
    var s = sel.trim();
    if (!s || s.length > MAX_SELECTOR_LEN) return false;
    /* نویسه‌هایی که می‌توانند از سلکتور بیرون بزنند و به قاعده/اسکریپت تبدیل شوند.
     * توجه: `>` مجاز است — ترکیب‌کننده‌ی فرزند در CSS است. فقط `<` خطر دارد. */
    if (/[{}<;@\\]/.test(s)) return false;
    if (/\/\*|\*\//.test(s)) return false;
    // سلکتورهایی که کل صفحه را می‌گیرند بی‌معنا و خطرناک‌اند
    if (s === '*' || s === 'html' || s === 'body' || s === ':root') return false;
    // اعتبار نهایی را به خود مرورگر می‌سپاریم
    if (typeof document !== 'undefined' && document.createDocumentFragment) {
      try {
        document.createDocumentFragment().querySelector(s);
      } catch (e) {
        return false;
      }
    }
    return true;
  }

  /** پاک‌سازی یک فهرست سلکتور: حذف نامعتبرها، یکتاسازی، محدودکردن تعداد */
  function sanitizeSelectorList(list) {
    if (typeof list === 'string') {
      list = list.split(/[\n,]+/);
    }
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < MAX_SELECTORS; i++) {
      var s = String(list[i] == null ? '' : list[i]).trim();
      if (!s || out.indexOf(s) >= 0) continue;
      if (isSafeSelector(s)) out.push(s);
    }
    return out;
  }

  /** بازنویسی یک سایت را پاک‌سازی می‌کند (فقط کلیدهای مجاز باقی می‌مانند) */
  function sanitizeSiteOverride(ov) {
    if (!isObj(ov)) return null;
    var out = {};
    if (typeof ov.enabled === 'boolean') out.enabled = ov.enabled;
    if (ov.mode !== undefined) out.mode = oneOf(ov.mode, ['smart', 'auto', 'force'], 'smart');
    if (ov.threshold !== undefined) out.threshold = clamp(ov.threshold, 0.05, 1, 0.3);
    if (isObj(ov.font)) {
      var f = {};
      if (typeof ov.font.enabled === 'boolean') f.enabled = ov.font.enabled;
      if (ov.font.scale !== undefined) f.scale = clamp(ov.font.scale, 70, 160, 100);
      if (ov.font.builtin !== undefined) {
        f.builtin = oneOf(ov.font.builtin, BUILTIN_FONTS.map(function (x) { return x.id; }), 'vazirmatn');
      }
      if (Object.keys(f).length) out.font = f;
    }
    if (isObj(ov.typo)) {
      var t = {};
      if (ov.typo.lineHeight !== undefined) t.lineHeight = clamp(ov.typo.lineHeight, 0, 3, 0);
      if (typeof ov.typo.justify === 'boolean') t.justify = ov.typo.justify;
      if (Object.keys(t).length) out.typo = t;
    }
    var an = sanitizeSelectorList(ov.anchors);
    if (an.length) out.anchors = an;
    var gu = sanitizeSelectorList(ov.guards);
    if (gu.length) out.guards = gu;
    return Object.keys(out).length ? out : null;
  }

  /** پاک‌سازی/محدودسازی مقادیر ورودی تا یک تنظیمِ معیوب کل صفحه را خراب نکند */
  function sanitize(s) {
    s = deepMerge(DEFAULTS, isObj(s) ? s : {});
    s.version = SCHEMA_VERSION;
    s.enabled = !!s.enabled;
    s.scope = oneOf(s.scope, ['all', 'known', 'ai'], 'all');
    s.mode = oneOf(s.mode, ['smart', 'auto', 'force'], 'smart');
    s.threshold = clamp(s.threshold, 0.05, 1, 0.3);
    s.inputs = !!s.inputs;
    s.placeholders = !!s.placeholders;
    s.liveTyping = !!s.liveTyping;

    s.font.enabled = !!s.font.enabled;
    s.font.source = oneOf(s.font.source, ['builtin', 'custom', 'system'], 'builtin');
    s.font.builtin = oneOf(
      s.font.builtin,
      BUILTIN_FONTS.map(function (f) {
        return f.id;
      }),
      'vazirmatn'
    );
    s.font.scale = clamp(s.font.scale, 70, 160, 100);
    s.font.applyToLatin = !!s.font.applyToLatin;
    s.font.digits = oneOf(s.font.digits, ['auto', 'farsi', 'latin'], 'auto');
    if (typeof s.font.customData !== 'string' || s.font.customData.indexOf('data:') !== 0) {
      s.font.customData = '';
      if (s.font.source === 'custom') s.font.source = 'builtin';
    }

    s.typo.lineHeight = clamp(s.typo.lineHeight, 0, 3, 0);
    s.typo.justify = !!s.typo.justify;
    s.typo.letterSpacing = clamp(s.typo.letterSpacing, -1, 3, 0);
    s.typo.wordSpacing = clamp(s.typo.wordSpacing, -2, 8, 0);
    s.typo.paragraphGap = clamp(s.typo.paragraphGap, 0, 32, 0);
    s.typo.fixListIndent = !!s.typo.fixListIndent;
    s.typo.fixQuotes = !!s.typo.fixQuotes;
    s.typo.fixTables = !!s.typo.fixTables;
    s.typo.keepCodeLtr = !!s.typo.keepCodeLtr;
    s.typo.isolateInline = !!s.typo.isolateInline;

    s.adv.pierceShadow = !!s.adv.pierceShadow;
    s.adv.openClosedShadow = !!s.adv.openClosedShadow;
    s.adv.mirrorLayout = !!s.adv.mirrorLayout;
    s.adv.debounce = clamp(s.adv.debounce, 0, 1000, 60);
    s.adv.budgetMs = clamp(s.adv.budgetMs, 2, 50, 8);
    s.adv.maxDepth = clamp(s.adv.maxDepth, 4, 100, 24);
    s.adv.debug = !!s.adv.debug;
    s.adv.badge = !!s.adv.badge;

    s.syncEnabled = !!s.syncEnabled;

    /* بازنویسی هر سایت جدا پاک‌سازی می‌شود؛ کلیدهای ناشناس و سلکتورهای نامعتبر
     * حذف می‌شوند تا یک ورودی معیوب نتواند استایل کل صفحه را بشکند. */
    if (!isObj(s.sites)) {
      s.sites = {};
    } else {
      var clean = {};
      for (var host in s.sites) {
        if (!Object.prototype.hasOwnProperty.call(s.sites, host)) continue;
        var h = String(host).toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
        if (!h || h.length > 120) continue;
        var ov = sanitizeSiteOverride(s.sites[host]);
        if (ov) clean[h] = ov;
      }
      s.sites = clean;
    }
    return s;
  }

  /* ------------------------------------------------------- migration (v3→v4) */
  function migrate(raw) {
    // تنظیمات نسخه‌ی ۳ به‌صورت کلیدهای تخت در storage.local بودند
    var out = {};
    if (raw && typeof raw.rtlEnabled === 'boolean') out.enabled = raw.rtlEnabled;
    if (raw && (raw.customFontBase64 || raw.fontEnabled !== undefined)) {
      out.font = {
        enabled: raw.fontEnabled !== false,
        source: raw.customFontBase64 ? 'custom' : 'builtin',
        customData: raw.customFontBase64 || '',
        customName: raw.customFontName || ''
      };
    }
    return out;
  }

  /* ============================================================== storage
   * تنظیمات در دو جا نگه داشته می‌شوند:
   *   storage.sync  — همه‌ی تنظیمات جز فونت آپلودی (~۷۰۰ بایت، همگام میان دستگاه‌ها)
   *   storage.local — فونت آپلودی (~۱۴۵ کیلوبایت؛ سهمیه‌ی هر آیتم sync ۸ کیلوبایت است)
   * خواندن همیشه هر دو را می‌گیرد و روی هم می‌گذارد. اگر همگام‌سازی خاموش باشد
   * یا در دسترس نباشد (مثلاً کاربر وارد حساب نشده)، مسیر محلی پشتیبان است.
   * ==========================================================================*/

  function area(name) {
    try {
      var a = chrome.storage[name];
      return a && typeof a.get === 'function' ? a : null;
    } catch (e) {
      return null;
    }
  }

  function areaGet(a, keys) {
    return new Promise(function (resolve) {
      if (!a) return resolve({});
      try {
        a.get(keys, function (res) {
          void chrome.runtime.lastError; // sync بدون ورود به حساب خطا می‌دهد
          resolve(res || {});
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  function areaSet(a, payload) {
    return new Promise(function (resolve, reject) {
      if (!a) return reject(new Error('storage area unavailable'));
      try {
        a.set(payload, function () {
          var err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve(true);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /** بخش‌های حجیم را از شیء جدا می‌کند: {sync, local} */
  function split(s) {
    var syncPart = JSON.parse(JSON.stringify(s));
    var localPart = {};
    for (var i = 0; i < LOCAL_ONLY.length; i++) {
      var pathArr = LOCAL_ONLY[i];
      var srcObj = syncPart;
      var dstObj = localPart;
      for (var k = 0; k < pathArr.length - 1; k++) {
        if (!isObj(srcObj[pathArr[k]])) {
          srcObj = null;
          break;
        }
        srcObj = srcObj[pathArr[k]];
        dstObj[pathArr[k]] = dstObj[pathArr[k]] || {};
        dstObj = dstObj[pathArr[k]];
      }
      if (!srcObj) continue;
      var leaf = pathArr[pathArr.length - 1];
      if (srcObj[leaf] !== undefined && srcObj[leaf] !== '') dstObj[leaf] = srcObj[leaf];
      delete srcObj[leaf];
    }
    return { sync: syncPart, local: localPart };
  }

  function load() {
    var sync = area('sync');
    var local = area('local');
    return Promise.all([
      areaGet(sync, [STORE_KEY]),
      areaGet(local, [STORE_KEY, LOCAL_KEY, 'rtlEnabled', 'fontEnabled', 'customFontBase64', 'customFontName'])
    ]).then(function (res) {
      var fromSync = res[0][STORE_KEY] || null;
      var fromLocal = res[1][STORE_KEY] || null;
      var heavy = res[1][LOCAL_KEY] || null;

      /* اولویت: تنظیمات همگام (اگر باشد) روی تنظیمات محلی. تنظیمات محلی برای
       * ارتقا از نسخه‌ی ۴ لازم است، جایی که همه‌چیز در local بود. */
      var base = fromSync || fromLocal;
      if (!base && (res[1].rtlEnabled !== undefined || res[1].customFontBase64)) {
        base = migrate(res[1]); // ارتقا از نسخه‌ی ۳
      }
      var merged = deepMerge(base || {}, heavy || {});
      if (fromSync && fromLocal && !heavy) {
        // نسخه‌ی ۴ فونت را داخل خود تنظیمات محلی داشت
        if (fromLocal.font && fromLocal.font.customData) {
          merged = deepMerge(merged, { font: { customData: fromLocal.font.customData, customName: fromLocal.font.customName } });
        }
      }
      return sanitize(merged);
    });
  }

  function save(next) {
    var clean = sanitize(next);
    var parts = split(clean);
    var sync = area('sync');
    var local = area('local');

    var writes = [];
    var localPayload = {};
    localPayload[LOCAL_KEY] = parts.local;

    if (clean.syncEnabled && sync) {
      var syncPayload = {};
      syncPayload[STORE_KEY] = parts.sync;
      writes.push(
        areaSet(sync, syncPayload).catch(function (err) {
          /* سهمیه پر شده یا کاربر وارد حساب نشده: بی‌صدا به مسیر محلی برمی‌گردیم
           * تا تنظیمات کاربر گم نشود. */
          localPayload[STORE_KEY] = parts.sync;
          return null;
        })
      );
    } else {
      localPayload[STORE_KEY] = parts.sync;
    }

    return Promise.all(writes)
      .then(function () {
        return areaSet(local, localPayload);
      })
      .then(function () {
        return clean;
      });
  }

  /** آیا همگام‌سازی واقعاً در این مرورگر کار می‌کند؟ */
  function syncAvailable() {
    var sync = area('sync');
    if (!sync) return Promise.resolve(false);
    return new Promise(function (resolve) {
      try {
        sync.set({ pwmSyncProbe: 1 }, function () {
          var err = chrome.runtime.lastError;
          if (err) return resolve(false);
          try {
            sync.remove('pwmSyncProbe', function () {
              void chrome.runtime.lastError;
              resolve(true);
            });
          } catch (e) {
            resolve(true);
          }
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  /** ادغام یک تغییر جزئی در تنظیمات ذخیره‌شده */
  function patch(delta) {
    return load().then(function (cur) {
      return save(deepMerge(cur, delta));
    });
  }

  /** بازنویسی تنظیمات یک دامنه */
  function patchSite(host, delta) {
    var h = PWM.Sites ? PWM.Sites.normalizeHost(host) : String(host || '').toLowerCase();
    if (!h) return Promise.resolve(null);
    var d = { sites: {} };
    d.sites[h] = delta;
    return patch(d);
  }

  function onChange(cb) {
    var handler = function (changes, changedArea) {
      // هر دو ناحیه مهم‌اند: sync برای تنظیمات، local برای فونت آپلودی
      if (changedArea !== 'local' && changedArea !== 'sync') return;
      if (!changes[STORE_KEY] && !changes[LOCAL_KEY]) return;
      // به‌جای استفاده از newValue، دوباره کامل می‌خوانیم تا دو ناحیه روی هم بیفتند
      load().then(cb);
    };
    chrome.storage.onChanged.addListener(handler);
    return function () {
      chrome.storage.onChanged.removeListener(handler);
    };
  }

  /* ------------------------------------------------------ effective config */
  /**
   * ترکیب تنظیمات سراسری با بازنویسی سایت و تصمیم «فعال یا نه».
   * @returns {{active:boolean, reason:string, cfg:Object, profile:Object, siteOverride:Object|null}}
   */
  function effective(settings, host) {
    var s = sanitize(settings);
    var profile = PWM.Sites ? PWM.Sites.resolve(host) : { id: 'generic', kind: 'web', known: false, anchors: [], guards: [], inputs: [] };
    var h = PWM.Sites ? PWM.Sites.normalizeHost(host) : String(host || '').toLowerCase();
    var override = (s.sites && (s.sites[h] || null)) || null;
    var cfg = override ? sanitize(deepMerge(s, override)) : s;

    /* سلکتورهای دلخواه کاربر روی پروفایل سایت سوار می‌شوند.
     * lockedGuards اول می‌آید: یک guard باید بتواند چیزی را که anchor گرفته پس
     * بگیرد، پس ترتیب مهم است و موتور guard را مقدم می‌شمارد. */
    if (override && (override.anchors || override.guards)) {
      profile = deepMerge(profile, {});
      if (override.anchors && override.anchors.length) {
        profile.anchors = override.anchors.concat(profile.anchors || []);
        profile.customAnchors = override.anchors.slice();
      }
      if (override.guards && override.guards.length) {
        profile.guards = override.guards.concat(profile.guards || []);
        profile.customGuards = override.guards.slice();
      }
    }

    var active = true;
    var reason = 'ok';
    if (!s.enabled) {
      active = false;
      reason = 'global-off';
    } else if (override && override.enabled === false) {
      active = false;
      reason = 'site-off';
    } else if (override && override.enabled === true) {
      active = true;
      reason = 'site-on';
    } else if (s.scope === 'ai' && profile.kind !== 'ai') {
      active = false;
      reason = 'scope-ai';
    } else if (s.scope === 'known' && !profile.known) {
      active = false;
      reason = 'scope-known';
    }

    return { active: active, reason: reason, cfg: cfg, profile: profile, siteOverride: override, host: h };
  }

  PWM.Settings = {
    KEY: STORE_KEY,
    LOCAL_KEY: LOCAL_KEY,
    VERSION: SCHEMA_VERSION,
    DEFAULTS: DEFAULTS,
    BUILTIN_FONTS: BUILTIN_FONTS,
    FALLBACK_STACK: FALLBACK_STACK,
    MAX_SELECTORS: MAX_SELECTORS,
    MAX_SELECTOR_LEN: MAX_SELECTOR_LEN,
    sanitize: sanitize,
    deepMerge: deepMerge,
    migrate: migrate,
    isSafeSelector: isSafeSelector,
    sanitizeSelectorList: sanitizeSelectorList,
    sanitizeSiteOverride: sanitizeSiteOverride,
    load: load,
    save: save,
    patch: patch,
    patchSite: patchSite,
    onChange: onChange,
    effective: effective,
    syncAvailable: syncAvailable
  };
})(typeof self !== 'undefined' ? self : globalThis);

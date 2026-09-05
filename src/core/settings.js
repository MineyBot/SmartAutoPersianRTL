/* ============================================================================
 * PWM · core/settings.js
 * لایه‌ی تنظیمات: طرح پیش‌فرض، اعتبارسنجی، ذخیره/بازیابی و «تنظیمات مؤثر»
 * برای یک دامنه‌ی مشخص (ترکیب تنظیمات سراسری + بازنویسی‌های همان سایت).
 * در Content Script، Popup، Options و Service Worker استفاده می‌شود.
 * ==========================================================================*/
(function (root) {
  'use strict';
  var PWM = (root.PWM = root.PWM || {});

  var SCHEMA_VERSION = 4;
  var STORE_KEY = 'pwm';

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

    /* ---- بازنویسی به‌ازای سایت ---- */
    // 'example.com': { enabled: false } | { mode: 'force', font: {...} }
    sites: {},

    /* ---- آمار سبک ---- */
    stats: { applied: 0, lastHost: '', lastAt: 0 }
  };

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

    if (!isObj(s.sites)) s.sites = {};
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

  /* --------------------------------------------------------------- storage */
  function load() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(
          [STORE_KEY, 'rtlEnabled', 'fontEnabled', 'customFontBase64', 'customFontName'],
          function (res) {
            res = res || {};
            var stored = res[STORE_KEY];
            if (!stored && (res.rtlEnabled !== undefined || res.customFontBase64)) {
              stored = migrate(res);
            }
            resolve(sanitize(stored));
          }
        );
      } catch (e) {
        resolve(sanitize(null));
      }
    });
  }

  function save(next) {
    var clean = sanitize(next);
    return new Promise(function (resolve, reject) {
      try {
        var payload = {};
        payload[STORE_KEY] = clean;
        chrome.storage.local.set(payload, function () {
          var err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve(clean);
        });
      } catch (e) {
        reject(e);
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
    var handler = function (changes, area) {
      if (area !== 'local' || !changes[STORE_KEY]) return;
      cb(sanitize(changes[STORE_KEY].newValue));
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
    VERSION: SCHEMA_VERSION,
    DEFAULTS: DEFAULTS,
    BUILTIN_FONTS: BUILTIN_FONTS,
    FALLBACK_STACK: FALLBACK_STACK,
    sanitize: sanitize,
    deepMerge: deepMerge,
    migrate: migrate,
    load: load,
    save: save,
    patch: patch,
    patchSite: patchSite,
    onChange: onChange,
    effective: effective
  };
})(typeof self !== 'undefined' ? self : globalThis);

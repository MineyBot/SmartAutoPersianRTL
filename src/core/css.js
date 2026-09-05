/* ============================================================================
 * PWM · core/css.js
 * ساخت و تزریق استایل. سه ایده‌ی کلیدی که این نسخه را از نسخه‌ی قبل جدا می‌کند:
 *
 *  ۱) نشانه‌گذاری با attribute (data-pwm-dir) به‌جای class؛ هیچ برخوردی با
 *     کلاس‌های خود سایت پیش نمی‌آید و پاک‌سازی کامل تضمین می‌شود.
 *  ۲) استفاده از text-align:start به‌جای right و direction:inherit برای فرزندان؛
 *     در نتیجه «جزیره»های لاتین درون متن فارسی به‌درستی چپ‌چین می‌مانند.
 *  ۳) فیلدهای ورودی با unicode-bidi:plaintext مدیریت می‌شوند؛ یعنی مرورگر خودش
 *     خط‌به‌خط جهت را تشخیص می‌دهد و نیازی به JS در هر کلید فشرده‌شده نیست.
 * ==========================================================================*/
(function (root) {
  'use strict';
  var PWM = (root.PWM = root.PWM || {});

  var ATTR = 'data-pwm-dir'; // roles: rtl | ltr
  var ATTR_INPUT = 'data-pwm-auto'; // "1" برای فیلدهای ورودی
  var FAMILY = 'PWMFont';
  var SHEET_ID = 'pwm-sheet';

  /* عناصری که فقط جهت/ترازشان دنبال والد باشد (نه دست‌کاری مستقیم) */
  var FLOW = [
    'p', 'div', 'span', 'li', 'dd', 'dt', 'td', 'th', 'caption', 'figcaption', 'summary',
    'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'strong', 'em', 'b', 'i',
    'u', 's', 'small', 'mark', 'a', 'section', 'article', 'header', 'footer', 'main', 'aside'
  ];

  /* عناصری که هرگز نباید ترازشان عوض شود (کنترل‌های رابط کاربری) */
  var UI_SKIP = [
    'button', '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="switch"]',
    '[role="checkbox"]', '[role="radio"]', '[role="slider"]', '[role="progressbar"]',
    '[style*="text-align"]', '[align]', 'svg', 'svg *', 'canvas', 'video', 'audio', 'img',
    'input[type="range"]', 'input[type="color"]', 'input[type="checkbox"]', 'input[type="radio"]'
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[\\"<>{}]/g, '');
  }

  function list(arr) {
    return arr.join(', ');
  }

  /** ساخت یک سلکتور :not(...) از فهرست نگهبان‌ها (فقط سلکتورهای معتبر) */
  function guardNot(guards) {
    var safe = [];
    for (var i = 0; i < guards.length; i++) {
      var g = String(guards[i] || '').trim();
      if (!g || /[{}]/.test(g)) continue;
      if (g.slice(-1) === '-') g = '[class*="' + g.slice(0, -1) + '"]'; // '.language-' → wildcard
      safe.push(g);
    }
    return safe.length ? ':not(' + safe.join('):not(') + ')' : '';
  }

  /** انتخاب فایل فونت درون‌ساخته بر اساس تنظیمات (ارقام فارسی/لاتین) */
  function resolveBuiltin(cfg) {
    var id = cfg.font.builtin || 'vazirmatn';
    if (cfg.font.digits === 'farsi') {
      if (id === 'vazirmatn' || id === 'vazirmatn-nl') id = 'vazirmatn-fd';
    } else if (cfg.font.digits === 'latin' && id === 'vazirmatn-fd') {
      id = 'vazirmatn';
    }
    var all = (PWM.Settings && PWM.Settings.BUILTIN_FONTS) || [];
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return all[0] || { id: 'vazirmatn', file: 'fonts/Vazirmatn-Variable.woff2' };
  }

  /** پشته‌ی فونت مؤثر */
  function fontStack(cfg) {
    var fallback = (PWM.Settings && PWM.Settings.FALLBACK_STACK) || 'Tahoma, sans-serif';
    if (!cfg.font.enabled) return '';
    if (cfg.font.source === 'system') return fallback;
    return '"' + FAMILY + '", ' + fallback;
  }

  /* ------------------------------------------------------------------ CSS */
  /**
   * تولید متن CSS. خروجی هم برای document و هم برای هر Shadow Root یکی است؛
   * چون نشانه‌گذاری روی خود عناصر است و به :host وابسته نیستیم.
   */
  function build(cfg, profile) {
    var guards = guardNot((profile && profile.guards) || []);
    var uiSkip = ':not(' + UI_SKIP.join('):not(') + ')';
    var flow = FLOW.map(function (t) {
      return t;
    });
    var stack = fontStack(cfg);
    var t = cfg.typo;
    var out = [];

    /* --- متغیرها --- */
    out.push(
      ':root, :host {' +
        (stack ? '--pwm-font:' + stack + ';' : '') +
        '--pwm-scale:' + cfg.font.scale / 100 + ';' +
        '}'
    );

    /* --- ۱. بلوک راست‌چین --- */
    out.push(
      '[' + ATTR + '="rtl"]{' +
        'direction:rtl !important;' +
        'text-align:start !important;' +
        (t.isolateInline ? 'unicode-bidi:isolate;' : '') +
        '}'
    );

    /* --- ۱ب. کنترل رابط کاربری راست‌چین: فقط جهت، بدون دست‌زدن به تراز --- */
    out.push(
      '[' + ATTR + '="rtl-ui"]{' +
        'direction:rtl !important;' +
        (t.isolateInline ? 'unicode-bidi:isolate;' : '') +
        '}'
    );

    /* --- ۲. بلوک چپ‌چین (جزیره‌ی لاتین درون متن فارسی) --- */
    out.push(
      '[' + ATTR + '="ltr"]{' +
        'direction:ltr !important;' +
        'text-align:start !important;' +
        (t.isolateInline ? 'unicode-bidi:isolate;' : '') +
        '}'
    );

    /* --- ۳. فرزندان: فقط جهت را از والد بگیرند، تراز را start کنند --- */
    var kids = [];
    for (var i = 0; i < flow.length; i++) {
      kids.push('[' + ATTR + '="rtl"] ' + flow[i] + guards + uiSkip);
    }
    out.push(list(kids) + '{direction:inherit !important;text-align:start !important;}');

    /* --- ۴. کد، فرمول و نگهبان‌ها: همیشه چپ‌چین و دست‌نخورده --- */
    if (t.keepCodeLtr) {
      var codeSel = [
        '[' + ATTR + '="rtl"] pre',
        '[' + ATTR + '="rtl"] code',
        '[' + ATTR + '="rtl"] kbd',
        '[' + ATTR + '="rtl"] samp',
        '[' + ATTR + '="rtl"] var',
        '[' + ATTR + '="rtl"] .katex',
        '[' + ATTR + '="rtl"] .katex-display',
        '[' + ATTR + '="rtl"] mjx-container',
        '[' + ATTR + '="rtl"] math',
        '[' + ATTR + '="rtl"] .MathJax',
        '[' + ATTR + '="rtl"] .cm-editor',
        '[' + ATTR + '="rtl"] .monaco-editor',
        '[' + ATTR + '="rtl"] .CodeMirror',
        '[' + ATTR + '="rtl"] .hljs',
        '[' + ATTR + '="rtl"] .shiki',
        '[' + ATTR + '="rtl"] [class*="code-block"]',
        '[' + ATTR + '="rtl"] [data-code-block]'
      ];
      out.push(
        list(codeSel) +
          '{direction:ltr !important;text-align:left !important;unicode-bidi:isolate !important;font-family:inherit;}'
      );
      out.push(
        '[' + ATTR + '="rtl"] pre{overflow-x:auto;}' +
          '[' + ATTR + '="rtl"] pre code{display:block;}'
      );
    }

    /* --- ۵. فونت --- */
    if (stack) {
      var fontSel = [
        '[' + ATTR + '="rtl"]',
        '[' + ATTR + '="rtl-ui"]',
        '[' + ATTR + '="rtl"] ' + ':where(' + flow.join(',') + ')' + guards,
        '[' + ATTR_INPUT + '="1"]'
      ];
      if (cfg.font.applyToLatin) fontSel.push('[' + ATTR + '="ltr"]');
      out.push(
        list(fontSel) +
          '{font-family:var(--pwm-font) !important;' +
          'font-feature-settings:"ss01" 0;' +
          '-webkit-font-smoothing:antialiased;}'
      );
      /* آیکون‌های فونتی هرگز نباید فونت عوض کنند (وگرنه مربع می‌شوند) */
      out.push(
        list([
          '[' + ATTR + '="rtl"] [class*="material-icons"]',
          '[' + ATTR + '="rtl"] [class*="material-symbols"]',
          '[' + ATTR + '="rtl"] [class*="icon"]:empty',
          '[' + ATTR + '="rtl"] .fa',
          '[' + ATTR + '="rtl"] .fas',
          '[' + ATTR + '="rtl"] .far',
          '[' + ATTR + '="rtl"] .fab',
          '[' + ATTR + '="rtl"] .bi',
          '[' + ATTR + '="rtl"] mat-icon',
          '[' + ATTR + '="rtl"] [data-icon]',
          '[' + ATTR + '="rtl"] i:empty',
          '[' + ATTR + '="rtl"] span:empty'
        ]) + '{font-family:revert !important;}'
      );
      if (cfg.font.scale !== 100) {
        out.push(
          '[' + ATTR + '="rtl"]{font-size:calc(1em * var(--pwm-scale)) !important;}'
        );
      }
    }

    /* --- ۶. تایپوگرافی --- */
    var typoDecl = '';
    if (t.lineHeight > 0) typoDecl += 'line-height:' + t.lineHeight + ' !important;';
    if (t.letterSpacing) typoDecl += 'letter-spacing:' + t.letterSpacing + 'px !important;';
    if (t.wordSpacing) typoDecl += 'word-spacing:' + t.wordSpacing + 'px !important;';
    if (t.justify) typoDecl += 'text-align:justify !important;text-justify:inter-word;';
    if (typoDecl) {
      out.push(
        list([
          '[' + ATTR + '="rtl"]',
          '[' + ATTR + '="rtl"] :where(p,li,dd,dt,blockquote,td,th)' + guards
        ]) + '{' + typoDecl + '}'
      );
    }
    if (t.paragraphGap) {
      out.push('[' + ATTR + '="rtl"] p{margin-block-end:' + t.paragraphGap + 'px !important;}');
    }

    /* --- ۷. لیست‌ها، نقل‌قول‌ها، جداول ---
     * سه شکل سلکتور لازم است، چون موتور ممکن است خودِ همین عنصر را علامت بزند
     * (بلوک نقل‌قول)، یا فرزندش را (هر <li> جدا علامت می‌خورد، نه <ul>)، یا
     * والدی بالاتر را. :has() هر سه حالت را می‌پوشاند (Chrome ۱۰۵+). */
    if (t.fixListIndent) {
      // حالت الف: <ul> درون بلوکی که خودش راست‌چین شده ⇒ جهت را ارث می‌برد
      out.push(
        list([
          '[' + ATTR + '="rtl"] :where(ul,ol)',
          'ul[' + ATTR + '="rtl"]',
          'ol[' + ATTR + '="rtl"]'
        ]) +
          '{padding-inline-start:1.8em !important;' +
          'padding-inline-end:0 !important;' +
          'margin-inline-start:0 !important;' +
          'list-style-position:outside !important;}'
      );
      /* حالت ب: فقط <li> ها علامت خورده‌اند و خود <ul> چپ‌چین مانده. اینجا
       * padding-inline-start به «چپ» ترجمه می‌شود و بالت راست‌چین جای خالی
       * ندارد و بریده می‌شود. پس تودرتویی را روی هر دو سو می‌گذاریم تا نشانگر
       * در هر جهتی فضا داشته باشد — و برای آیتم‌های لاتین همان لیست هم نشکند. */
      out.push(
        ':where(ul,ol):has(> [' + ATTR + '="rtl"])' +
          '{padding-right:2.2em !important;list-style-position:outside !important;}'
      );
    }
    if (t.fixQuotes) {
      out.push(
        list([
          '[' + ATTR + '="rtl"] blockquote',
          'blockquote[' + ATTR + '="rtl"]',
          'blockquote:has(> [' + ATTR + '="rtl"])'
        ]) +
          '{border-inline-start:3px solid currentColor !important;' +
          'border-inline-end:0 !important;' +
          'padding-inline-start:.9em !important;' +
          'padding-inline-end:0 !important;' +
          'margin-inline:0 !important;opacity:1;}'
      );
    }
    if (t.fixTables) {
      out.push(
        list([
          '[' + ATTR + '="rtl"] table',
          'table[' + ATTR + '="rtl"]',
          'table:has([' + ATTR + '="rtl"])'
        ]) + '{direction:rtl !important;}'
      );
      /* در جدول آینه‌شده همه‌ی سلول‌ها باید از لبه‌ی «شروع» بخوانند — از جمله
       * سلول‌های تماماً لاتین. وگرنه ستون فارسی راست‌چین و ستون عددی چپ‌چین
       * می‌شود و جدول ناهمگون به‌نظر می‌رسد. */
      out.push(
        list([
          '[' + ATTR + '="rtl"] :where(th,td)',
          ':where(th,td)[' + ATTR + '="rtl"]',
          'table:has([' + ATTR + '="rtl"]) :where(th,td)'
        ]) + '{text-align:start !important;}'
      );
    }

    /* --- ۸. فیلدهای ورودی: تشخیص خودکار جهت به‌دست مرورگر --- */
    if (cfg.inputs) {
      out.push(
        '[' + ATTR_INPUT + '="1"]{' +
          'unicode-bidi:plaintext !important;' +
          'text-align:start !important;' +
          '}'
      );
      if (cfg.placeholders) {
        out.push('[' + ATTR_INPUT + '="1"]::placeholder{unicode-bidi:plaintext;text-align:start;}');
      }
    }

    /* --- ۹. آینه‌سازی چیدمان (اختیاری و پیش‌فرض خاموش) --- */
    if (cfg.adv.mirrorLayout) {
      out.push(
        '[' + ATTR + '="rtl"] :where(p,li,div,td,th){' +
          'margin-inline-start:revert;margin-inline-end:revert;}'
      );
    }

    /* --- ۱۰. برچسب اشکال‌زدایی --- */
    if (cfg.adv.debug) {
      out.push('[' + ATTR + '="rtl"]{outline:1px dashed rgba(99,102,241,.55) !important;}');
      out.push('[' + ATTR + '="ltr"]{outline:1px dashed rgba(16,185,129,.45) !important;}');
      out.push('[' + ATTR_INPUT + '="1"]{outline:1px dotted rgba(245,158,11,.6) !important;}');
    }

    return out.join('\n');
  }

  /** CSS مربوط به @font-face (تنها به‌عنوان مسیر پشتیبان؛ مسیر اصلی FontFace API است) */
  function fontFaceCss(cfg, url) {
    if (!cfg.font.enabled || !url) return '';
    var b = resolveBuiltin(cfg);
    return (
      '@font-face{font-family:"' + FAMILY + '";' +
      'src:url("' + esc(url) + '") format("woff2");' +
      (b.variable ? 'font-weight:100 900;' : 'font-weight:400;') +
      'font-style:normal;font-display:swap;}'
    );
  }

  /* ------------------------------------------------------------- injection */
  var sheetCache = null; // CSSStyleSheet قابل‌اشتراک بین document و shadow roots
  var lastCss = '';

  function supportsConstructable() {
    try {
      return typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype;
    } catch (e) {
      return false;
    }
  }

  function getSheet(css) {
    if (!supportsConstructable()) return null;
    if (!sheetCache) sheetCache = new CSSStyleSheet();
    if (css !== lastCss) {
      try {
        sheetCache.replaceSync(css);
        lastCss = css;
      } catch (e) {
        return null;
      }
    }
    return sheetCache;
  }

  /** اتصال استایل به یک ریشه (Document یا ShadowRoot) */
  function attach(rootNode, css) {
    if (!rootNode) return false;
    var sheet = getSheet(css);
    if (sheet && 'adoptedStyleSheets' in rootNode) {
      try {
        var cur = rootNode.adoptedStyleSheets || [];
        if (cur.indexOf(sheet) === -1) rootNode.adoptedStyleSheets = cur.concat(sheet);
        return true;
      } catch (e) {
        /* بعضی مرورگرها لیست فقط‌خواندنی می‌دهند → مسیر <style> */
      }
    }
    // مسیر پشتیبان: تگ <style>
    try {
      var host = rootNode.nodeType === 9 ? rootNode.head || rootNode.documentElement : rootNode;
      if (!host) return false;
      var el = rootNode.querySelector ? rootNode.querySelector('#' + SHEET_ID) : null;
      if (!el) {
        var doc = rootNode.nodeType === 9 ? rootNode : rootNode.ownerDocument || document;
        el = doc.createElement('style');
        el.id = SHEET_ID;
        host.appendChild(el);
      }
      if (el.textContent !== css) el.textContent = css;
      return true;
    } catch (e) {
      return false;
    }
  }

  function detach(rootNode) {
    if (!rootNode) return;
    try {
      if ('adoptedStyleSheets' in rootNode && sheetCache) {
        var cur = rootNode.adoptedStyleSheets || [];
        var idx = cur.indexOf(sheetCache);
        if (idx >= 0) {
          var next = cur.slice();
          next.splice(idx, 1);
          rootNode.adoptedStyleSheets = next;
        }
      }
      var el = rootNode.querySelector ? rootNode.querySelector('#' + SHEET_ID) : null;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (e) {
      /* بی‌اهمیت */
    }
  }

  PWM.Css = {
    ATTR: ATTR,
    ATTR_INPUT: ATTR_INPUT,
    FAMILY: FAMILY,
    SHEET_ID: SHEET_ID,
    build: build,
    fontFaceCss: fontFaceCss,
    fontStack: fontStack,
    resolveBuiltin: resolveBuiltin,
    attach: attach,
    detach: detach,
    invalidate: function () {
      lastCss = '';
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);

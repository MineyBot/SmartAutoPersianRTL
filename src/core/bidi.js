/* ============================================================================
 * PWM · core/bidi.js
 * تشخیص جهت متن بر پایه شمارش نویسه‌های «قوی» (Strong Directional Characters)
 * این فایل کاملاً خالص (pure) است: هیچ وابستگی‌ای به DOM یا chrome.* ندارد
 * تا هم در Content Script، هم در Popup و هم در تست‌های Node قابل استفاده باشد.
 * ==========================================================================*/
(function (root) {
  'use strict';
  var PWM = (root.PWM = root.PWM || {});

  /* ---------------------------------------------------------------------------
   * ۱. رده‌بندی نویسه‌ها
   * فقط «حروف» شمرده می‌شوند. ارقام (لاتین/عربی/فارسی)، نقطه‌گذاری، ایموجی،
   * فاصله‌ها و نویسه‌های قالب‌بندی مانند ZWNJ خنثی محسوب می‌شوند؛ چون طبق
   * الگوریتم دوجهته یونیکد این‌ها جهت جمله را تعیین نمی‌کنند.
   * ------------------------------------------------------------------------*/

  /** نویسه‌ی راست‌به‌چپ قوی (عربی، فارسی، عبری، ثانا، سریانی، نکو، ...) */
  function isRtlCp(c) {
    return (
      (c >= 0x0620 && c <= 0x064a) || // Arabic letters + tatweel
      (c >= 0x066e && c <= 0x06d5) || // Arabic extras (ٮ..ە) — ارقام ۰۶۶۰..۰۶۶۹ بیرون می‌مانند
      (c >= 0x06e5 && c <= 0x06e6) ||
      (c >= 0x06ee && c <= 0x06ef) ||
      (c >= 0x06fa && c <= 0x06ff) || // بدون ۰۶F۰..۰۶F۹ (ارقام فارسی)
      (c >= 0x0750 && c <= 0x077f) || // Arabic Supplement
      (c >= 0x0870 && c <= 0x088e) || // Arabic Extended-B
      (c >= 0x08a0 && c <= 0x08c9) || // Arabic Extended-A
      (c >= 0x05d0 && c <= 0x05f4) || // Hebrew
      (c >= 0x0780 && c <= 0x07a5) || // Thaana
      (c >= 0x0700 && c <= 0x074f) || // Syriac
      (c >= 0x07c0 && c <= 0x07ea) || // NKo
      (c >= 0x0800 && c <= 0x0815) || // Samaritan
      (c >= 0x0840 && c <= 0x0858) || // Mandaic
      (c >= 0x0860 && c <= 0x086a) || // Syriac Supplement
      (c >= 0xfb1d && c <= 0xfb4f) || // Hebrew presentation forms
      (c >= 0xfb50 && c <= 0xfdc7) || // Arabic presentation forms-A
      (c >= 0xfe70 && c <= 0xfefc) || // Arabic presentation forms-B
      (c >= 0x10e80 && c <= 0x10ea9) || // Yezidi
      (c >= 0x1ee00 && c <= 0x1eebb) // Arabic Mathematical Alphabetic Symbols
    );
  }

  /** نویسه‌ی چپ‌به‌راست قوی (لاتین، یونانی، سیریلیک، دواناگری، CJK، ...) */
  function isLtrCp(c) {
    return (
      (c >= 0x0041 && c <= 0x005a) ||
      (c >= 0x0061 && c <= 0x007a) ||
      (c >= 0x00c0 && c <= 0x024f) || // Latin-1 sup + Extended A/B
      (c >= 0x0370 && c <= 0x03ff) || // Greek
      (c >= 0x0400 && c <= 0x052f) || // Cyrillic
      (c >= 0x0900 && c <= 0x0dff) || // Indic
      (c >= 0x0e00 && c <= 0x0e7f) || // Thai
      (c >= 0x10a0 && c <= 0x10ff) || // Georgian
      (c >= 0x1100 && c <= 0x11ff) || // Hangul Jamo
      (c >= 0x1e00 && c <= 0x1eff) || // Latin Extended Additional
      (c >= 0x2c60 && c <= 0x2c7f) ||
      (c >= 0x3040 && c <= 0x30ff) || // Kana
      (c >= 0x3400 && c <= 0x4dbf) ||
      (c >= 0x4e00 && c <= 0x9fff) || // CJK
      (c >= 0xa720 && c <= 0xa7ff) ||
      (c >= 0xac00 && c <= 0xd7af) // Hangul syllables
    );
  }

  /* تست سریع «آیا اصلاً حرف RTL دارد؟» — برای خروج زودهنگام قبل از شمارش کامل */
  var RTL_PROBE =
    /[\u0620-\u064A\u066E-\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FF\u0750-\u077F\u0870-\u088E\u08A0-\u08C9\u05D0-\u05F4\u0780-\u07A5\u0700-\u074F\u07C0-\u07EA\uFB1D-\uFB4F\uFB50-\uFDC7\uFE70-\uFEFC]/;

  var WS_ONLY = /^[\s\u200B-\u200F\u202A-\u202E\u2066-\u2069]*$/;

  /* ---------------------------------------------------------------------------
   * ۲. شمارش و تحلیل
   * ------------------------------------------------------------------------*/

  /**
   * شمارش نویسه‌های قوی در یک رشته.
   * @returns {{rtl:number, ltr:number, first:('rtl'|'ltr'|null), len:number}}
   */
  function count(text) {
    var rtl = 0,
      ltr = 0,
      first = null,
      i = 0,
      n = text.length;
    while (i < n) {
      var c = text.charCodeAt(i);
      // مدیریت جفت‌های جانشین (Surrogate Pairs) برای پلن‌های بالای یونیکد
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < n) {
        var c2 = text.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          c = (c - 0xd800) * 0x400 + c2 - 0xdc00 + 0x10000;
          i++;
        }
      }
      i++;
      if (c < 0x0041) continue; // فاصله، ارقام و نقطه‌گذاری ASCII
      if (isRtlCp(c)) {
        rtl++;
        if (!first) first = 'rtl';
      } else if (isLtrCp(c)) {
        ltr++;
        if (!first) first = 'ltr';
      }
    }
    return { rtl: rtl, ltr: ltr, first: first, len: text.length };
  }

  /** آیا رشته حرف راست‌به‌چپ دارد؟ (سریع، بدون شمارش) */
  function hasRtl(text) {
    return !!text && RTL_PROBE.test(text);
  }

  /** آیا رشته فقط فاصله/نویسه‌های نامرئی است؟ */
  function isBlank(text) {
    return !text || WS_ONLY.test(text);
  }

  /**
   * تصمیم‌گیری جهت برای یک بلوک متنی.
   * @param {{rtl:number,ltr:number,first:string|null}} c نتیجه‌ی count
   * @param {{mode?:string, threshold?:number}} opt
   *        mode: 'smart' نسبت‌محور | 'auto' اولین‌حرف‌محور | 'force' هر RTL ⇒ راست‌چین
   * @returns {'rtl'|'ltr'|null} null یعنی «دست نزن»
   */
  function decide(c, opt) {
    opt = opt || {};
    var mode = opt.mode || 'smart';
    var th = typeof opt.threshold === 'number' ? opt.threshold : 0.3;
    if (!c || (!c.rtl && !c.ltr)) return null;
    if (!c.rtl) return 'ltr';
    if (mode === 'force') return 'rtl';
    if (mode === 'auto') return c.first || 'rtl';
    var ratio = c.rtl / (c.rtl + c.ltr);
    return ratio >= th ? 'rtl' : 'ltr';
  }

  /** میان‌بر: تحلیل کامل یک رشته */
  function analyze(text, opt) {
    var c = count(text || '');
    var total = c.rtl + c.ltr;
    return {
      dir: decide(c, opt),
      rtl: c.rtl,
      ltr: c.ltr,
      first: c.first,
      ratio: total ? c.rtl / total : 0
    };
  }

  PWM.Bidi = {
    count: count,
    decide: decide,
    analyze: analyze,
    hasRtl: hasRtl,
    isBlank: isBlank,
    isRtlCp: isRtlCp,
    isLtrCp: isLtrCp
  };
})(typeof self !== 'undefined' ? self : globalThis);

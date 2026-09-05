/* ============================================================================
 * PWM · content/boot.js
 * راه‌اندازی: خواندن تنظیمات، بارگذاری فونت به‌صورت دودویی (بدون نیاز به CSP)،
 * روشن/خاموش کردن موتور و پاسخ به پیام‌های پاپ‌آپ و کلیدهای میان‌بر.
 * ==========================================================================*/
(function (root) {
  'use strict';
  var PWM = root.PWM;
  if (!PWM || !PWM.Engine) return;
  if (root.__pwmBooted) return;
  root.__pwmBooted = true;

  var Settings = PWM.Settings;
  var Sites = PWM.Sites;
  var Css = PWM.Css;

  var engine = null;
  var current = null; // آخرین تنظیمات سراسری
  var eff = null; // تنظیمات مؤثر برای این دامنه
  var fontKey = ''; // امضای فونتی که بارگذاری شده
  var loadedFaces = [];

  function log() {
    if (current && current.adv && current.adv.debug) {
      var a = Array.prototype.slice.call(arguments);
      a.unshift('%c[PWM]', 'color:#818cf8;font-weight:700');
      console.log.apply(console, a);
    }
  }

  /* ------------------------------------------------------- محیط قابل‌پردازش؟ */
  function supported() {
    var ct = (document.contentType || 'text/html').toLowerCase();
    if (ct.indexOf('html') === -1 && ct.indexOf('xml') === -1) return false;
    var proto = location.protocol;
    if (proto === 'chrome-extension:' || proto === 'devtools:' || proto === 'chrome:') return false;
    return true;
  }

  /* ------------------------------------------------------------ font loader
   * نکته‌ی مهم معماری: فونت به‌صورت ArrayBuffer به FontFace داده می‌شود، نه URL.
   * در نتیجه سیاست امنیتی صفحه (CSP · font-src) هیچ نقشی ندارد و برخلاف نسخه‌ی
   * پیشین، نیازی به حذف هدر CSP سایت (کاری پرخطر) نیست.
   * فونت‌های اضافه‌شده به document.fonts در همه‌ی Shadow Root ها هم معتبرند.
   * ----------------------------------------------------------------------- */
  function dataUrlToBuffer(url) {
    var comma = url.indexOf(',');
    if (comma < 0) return null;
    var meta = url.slice(0, comma);
    var body = url.slice(comma + 1);
    try {
      if (meta.indexOf(';base64') >= 0) {
        var bin = atob(body);
        var len = bin.length;
        var buf = new Uint8Array(len);
        for (var i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
        return buf.buffer;
      }
      return new TextEncoder().encode(decodeURIComponent(body)).buffer;
    } catch (e) {
      return null;
    }
  }

  function unloadFonts() {
    for (var i = 0; i < loadedFaces.length; i++) {
      try {
        document.fonts.delete(loadedFaces[i]);
      } catch (e) {}
    }
    loadedFaces = [];
  }

  function fontSignature(cfg) {
    if (!cfg.font.enabled || cfg.font.source === 'system') return 'none';
    if (cfg.font.source === 'custom') return 'custom:' + (cfg.font.customName || '') + ':' + cfg.font.customData.length;
    return 'builtin:' + Css.resolveBuiltin(cfg).id;
  }

  function ensureFont(cfg) {
    var key = fontSignature(cfg);
    if (key === fontKey) return Promise.resolve(false);
    fontKey = key;
    unloadFonts();
    if (key === 'none') return Promise.resolve(true);

    var srcPromise;
    if (cfg.font.source === 'custom') {
      var buf = dataUrlToBuffer(cfg.font.customData);
      srcPromise = buf ? Promise.resolve(buf) : Promise.reject(new Error('bad custom font data'));
    } else {
      var meta = Css.resolveBuiltin(cfg);
      srcPromise = fetch(chrome.runtime.getURL(meta.file)).then(function (r) {
        if (!r.ok) throw new Error('font http ' + r.status);
        return r.arrayBuffer();
      });
    }

    return srcPromise
      .then(function (buffer) {
        var face = new FontFace(Css.FAMILY, buffer, { weight: '100 900', display: 'swap' });
        return face.load();
      })
      .then(function (face) {
        document.fonts.add(face);
        loadedFaces.push(face);
        log('font loaded', key);
        return true;
      })
      .catch(function (err) {
        log('font failed', err && err.message);
        fontKey = 'failed';
        return false;
      });
  }

  /* --------------------------------------------------------------- lifecycle */
  function domReady() {
    if (document.body) return Promise.resolve();
    return new Promise(function (resolve) {
      var fire = function () {
        if (document.body) {
          document.removeEventListener('DOMContentLoaded', fire, true);
          resolve();
        }
      };
      document.addEventListener('DOMContentLoaded', fire, true);
      // برخی صفحات body را دیرتر و با اسکریپت می‌سازند
      var mo = new MutationObserver(function () {
        if (document.body) {
          mo.disconnect();
          resolve();
        }
      });
      try {
        mo.observe(document.documentElement, { childList: true });
      } catch (e) {
        setTimeout(resolve, 200);
      }
    });
  }

  function apply(settings, opts) {
    current = settings;
    eff = Settings.effective(settings, location.hostname);
    log('apply', eff.reason, eff.profile.id, 'active=' + eff.active);

    if (!eff.active) {
      if (engine) {
        engine.stop();
        engine = null;
      }
      unloadFonts();
      fontKey = '';
      pushState();
      return Promise.resolve();
    }

    return ensureFont(eff.cfg).then(function () {
      return domReady().then(function () {
        if (!engine) {
          engine = new PWM.Engine();
          engine.start(eff.cfg, eff.profile);
        } else {
          engine.update(eff.cfg, eff.profile);
        }
        if (opts && opts.rescan) engine.requestFull();
        pushState();
      });
    });
  }

  /* ------------------------------------------------------------- messaging */
  function state() {
    return {
      host: location.hostname,
      href: location.href,
      active: !!(eff && eff.active),
      reason: eff ? eff.reason : 'init',
      profile: eff ? { id: eff.profile.id, label: eff.profile.label, kind: eff.profile.kind, known: eff.profile.known } : null,
      report: engine ? engine.report() : null,
      fontKey: fontKey
    };
  }

  function pushState() {
    try {
      chrome.runtime.sendMessage({ type: 'pwm:state', state: state() }, function () {
        void chrome.runtime.lastError; // پاپ‌آپ ممکن است بسته باشد
      });
    } catch (e) {}
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'pwm:get-state':
        reply(state());
        return true;
      case 'pwm:rescan':
        if (engine) engine.requestFull();
        reply({ ok: true, report: engine ? engine.report() : null });
        return true;
      case 'pwm:reapply':
        Settings.load().then(function (s) {
          apply(s, { rescan: true }).then(function () {
            reply({ ok: true, state: state() });
          });
        });
        return true;
      case 'pwm:ping':
        reply({ ok: true, v: 4 });
        return true;
      default:
        return;
    }
  });

  /* ------------------------------------------------------------------- init */
  if (!supported()) return;

  Settings.load().then(function (s) {
    apply(s);
    Settings.onChange(function (next) {
      apply(next, { rescan: true });
    });
  });

  /* در برخی SPA ها تغییر مسیر باعث بازسازی کامل درخت می‌شود */
  var lastHref = location.href;
  setInterval(function () {
    if (location.href !== lastHref) {
      lastHref = location.href;
      if (engine) engine.requestFull();
    }
  }, 1200);

  root.__pwm = {
    state: state,
    engine: function () {
      return engine;
    },
    rescan: function () {
      if (engine) engine.requestFull();
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);

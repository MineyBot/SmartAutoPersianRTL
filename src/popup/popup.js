/* ============================================================================
 * PWM · popup/popup.js
 * ==========================================================================*/
(function () {
  'use strict';
  var PWM = window.PWM;
  var Settings = PWM.Settings;
  var Sites = PWM.Sites;

  var $ = function (id) {
    return document.getElementById(id);
  };

  var el = {
    master: $('master'),
    site: $('site'),
    siteLabel: $('site-label'),
    siteState: $('site-state'),
    alert: $('alert'),
    mode: $('mode'),
    modeHint: $('mode-hint'),
    thRow: $('threshold-row'),
    th: $('threshold'),
    thOut: $('threshold-out'),
    fontOn: $('font-on'),
    chips: $('font-chips'),
    fontFile: $('font-file'),
    fontClear: $('font-clear'),
    scale: $('scale'),
    scaleOut: $('scale-out'),
    preview: $('preview'),
    tInputs: $('t-inputs'),
    tJustify: $('t-justify'),
    tCode: $('t-code'),
    tShadow: $('t-shadow'),
    lh: $('lh'),
    lhOut: $('lh-out'),
    stats: $('stats'),
    rescan: $('rescan'),
    options: $('options')
  };

  var S = null; // تنظیمات سراسری
  var tab = null;
  var host = '';
  var eff = null;
  var busy = false;

  var MODE_HINT = {
    smart: 'نسبت حروف فارسی به کل',
    auto: 'جهت از اولین حرف جمله',
    force: 'هر متن دارای فارسی'
  };

  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  function fa(n) {
    return String(n).replace(/\d/g, function (d) {
      return FA_DIGITS[+d];
    });
  }

  /* ------------------------------------------------------------------ i/o */
  function send(msg) {
    return new Promise(function (res) {
      try {
        chrome.runtime.sendMessage(msg, function (r) {
          void chrome.runtime.lastError;
          res(r || null);
        });
      } catch (e) {
        res(null);
      }
    });
  }

  function tell(msg) {
    return new Promise(function (res) {
      if (!tab || tab.id == null) return res(null);
      try {
        chrome.tabs.sendMessage(tab.id, msg, function (r) {
          void chrome.runtime.lastError;
          res(r || null);
        });
      } catch (e) {
        res(null);
      }
    });
  }

  function commit(delta) {
    if (busy) return Promise.resolve();
    busy = true;
    return Settings.patch(delta)
      .then(function (next) {
        S = next;
        render();
      })
      .catch(function (err) {
        warn('ذخیره نشد: ' + (err && err.message ? err.message : 'خطای نامشخص'));
      })
      .then(function () {
        busy = false;
      });
  }

  function warn(text) {
    if (!text) {
      el.alert.hidden = true;
      el.alert.textContent = '';
      return;
    }
    el.alert.hidden = false;
    el.alert.textContent = text;
  }

  /* --------------------------------------------------------------- render */
  function render() {
    if (!S) return;
    eff = Settings.effective(S, host);
    var cfg = eff.cfg;

    document.body.classList.toggle('off', !S.enabled);
    el.master.checked = S.enabled;

    el.siteLabel.textContent = host || 'صفحه‌ی داخلی';
    el.site.checked = eff.active;
    el.site.disabled = !S.enabled || !host;

    var why = {
      ok: eff.profile.known ? 'پروفایل ' + eff.profile.label : 'پروفایل عمومی وب',
      'site-on': 'دستی روشن شده',
      'site-off': 'دستی خاموش شده',
      'global-off': 'کلید اصلی خاموش است',
      'scope-ai': 'محدود به چت‌بات‌های هوش مصنوعی',
      'scope-known': 'محدود به سایت‌های شناخته‌شده',
      init: 'در حال بررسی…'
    };
    el.siteState.textContent = why[eff.reason] || eff.reason;

    // حالت‌ها
    var btns = el.mode.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-selected', btns[i].dataset.mode === cfg.mode ? 'true' : 'false');
    }
    el.modeHint.textContent = MODE_HINT[cfg.mode] || '';
    el.thRow.style.display = cfg.mode === 'smart' ? 'flex' : 'none';
    el.th.value = Math.round(cfg.threshold * 100);
    el.thOut.textContent = fa(Math.round(cfg.threshold * 100)) + '٪';

    // فونت
    el.fontOn.checked = cfg.font.enabled;
    el.scale.value = cfg.font.scale;
    el.scaleOut.textContent = fa(cfg.font.scale) + '٪';
    el.fontClear.hidden = !cfg.font.customData;
    renderChips(cfg);
    applyPreview(cfg);

    // تایپوگرافی
    el.tInputs.checked = cfg.inputs;
    el.tJustify.checked = cfg.typo.justify;
    el.tCode.checked = cfg.typo.keepCodeLtr;
    el.tShadow.checked = cfg.adv.pierceShadow;
    el.lh.value = cfg.typo.lineHeight ? Math.round(cfg.typo.lineHeight * 10) : 0;
    el.lhOut.textContent = cfg.typo.lineHeight ? fa(cfg.typo.lineHeight.toFixed(1)) : 'پیش‌فرض';
  }

  function renderChips(cfg) {
    var items = Settings.BUILTIN_FONTS.slice();
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var on = cfg.font.source === 'builtin' && cfg.font.builtin === items[i].id;
      html +=
        '<button class="chip" data-kind="builtin" data-id="' + items[i].id + '" aria-pressed="' + on + '">' +
        items[i].label +
        '</button>';
    }
    if (cfg.font.customData) {
      var onC = cfg.font.source === 'custom';
      html +=
        '<button class="chip" data-kind="custom" aria-pressed="' + onC + '" title="' +
        (cfg.font.customName || '') + '">' +
        (cfg.font.customName ? cfg.font.customName.replace(/\.[^.]+$/, '').slice(0, 18) : 'فونت من') +
        '</button>';
    }
    html +=
      '<button class="chip" data-kind="system" aria-pressed="' + (cfg.font.source === 'system') + '">فونت سیستم</button>';
    el.chips.innerHTML = html;
  }

  var previewFaces = [];
  function applyPreview(cfg) {
    el.preview.style.fontSize = 11.5 * (cfg.font.scale / 100) + 'px';
    if (!cfg.font.enabled) {
      el.preview.style.fontFamily = 'system-ui, Tahoma, sans-serif';
      return;
    }
    if (cfg.font.source === 'system') {
      el.preview.style.fontFamily = Settings.FALLBACK_STACK;
      return;
    }
    var family = 'PWMPreview' + Date.now();
    var src;
    if (cfg.font.source === 'custom' && cfg.font.customData) {
      src = 'url("' + cfg.font.customData + '")';
    } else {
      var meta = null;
      for (var i = 0; i < Settings.BUILTIN_FONTS.length; i++) {
        if (Settings.BUILTIN_FONTS[i].id === cfg.font.builtin) meta = Settings.BUILTIN_FONTS[i];
      }
      if (!meta) meta = Settings.BUILTIN_FONTS[0];
      src = 'url("' + chrome.runtime.getURL(meta.file) + '")';
    }
    try {
      var face = new FontFace(family, src, { weight: '100 900' });
      face
        .load()
        .then(function (f) {
          document.fonts.add(f);
          previewFaces.push(f);
          el.preview.style.fontFamily = '"' + family + '", Tahoma, sans-serif';
        })
        .catch(function () {
          el.preview.style.fontFamily = Settings.FALLBACK_STACK;
        });
    } catch (e) {
      el.preview.style.fontFamily = Settings.FALLBACK_STACK;
    }
  }

  function renderStats(report) {
    if (!report) {
      el.stats.textContent = host ? 'در این صفحه فعال نیست' : '';
      return;
    }
    el.stats.textContent =
      fa(report.live) + ' بلوک · ' + fa(report.roots) + ' ریشه · ' + fa(report.ms) + ' م‌ث';
  }

  /* --------------------------------------------------------------- events */
  el.master.addEventListener('change', function () {
    commit({ enabled: el.master.checked });
  });

  el.site.addEventListener('change', function () {
    if (!host) return;
    var want = el.site.checked;
    var d = { sites: {} };
    d.sites[Sites.normalizeHost(host)] = { enabled: want };
    commit(d);
  });

  el.mode.addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-mode]');
    if (!b) return;
    commit({ mode: b.dataset.mode });
  });

  el.th.addEventListener('input', function () {
    el.thOut.textContent = fa(el.th.value) + '٪';
  });
  el.th.addEventListener('change', function () {
    commit({ threshold: +el.th.value / 100 });
  });

  el.fontOn.addEventListener('change', function () {
    commit({ font: { enabled: el.fontOn.checked } });
  });

  el.chips.addEventListener('click', function (ev) {
    var c = ev.target.closest('.chip');
    if (!c) return;
    var kind = c.dataset.kind;
    if (kind === 'builtin') commit({ font: { enabled: true, source: 'builtin', builtin: c.dataset.id } });
    else if (kind === 'custom') commit({ font: { enabled: true, source: 'custom' } });
    else commit({ font: { enabled: true, source: 'system' } });
  });

  el.scale.addEventListener('input', function () {
    el.scaleOut.textContent = fa(el.scale.value) + '٪';
    el.preview.style.fontSize = 11.5 * (+el.scale.value / 100) + 'px';
  });
  el.scale.addEventListener('change', function () {
    commit({ font: { scale: +el.scale.value } });
  });

  el.fontFile.addEventListener('change', function () {
    var f = el.fontFile.files && el.fontFile.files[0];
    if (!f) return;
    warn('');
    // سقف ~۴ مگابایت؛ storage.local محدودیت دارد و data:URL حجم را ۳۳٪ بیشتر می‌کند
    if (f.size > 4 * 1024 * 1024) {
      warn('حجم فونت بیش از ۴ مگابایت است. نسخه‌ی woff2 را انتخاب کنید.');
      el.fontFile.value = '';
      return;
    }
    var rd = new FileReader();
    rd.onload = function (e) {
      commit({
        font: { enabled: true, source: 'custom', customData: String(e.target.result), customName: f.name }
      });
      el.fontFile.value = '';
    };
    rd.onerror = function () {
      warn('خواندن فایل فونت ناموفق بود.');
    };
    rd.readAsDataURL(f);
  });

  el.fontClear.addEventListener('click', function () {
    commit({ font: { source: 'builtin', customData: '', customName: '' } });
  });

  el.tInputs.addEventListener('change', function () {
    commit({ inputs: el.tInputs.checked });
  });
  el.tJustify.addEventListener('change', function () {
    commit({ typo: { justify: el.tJustify.checked } });
  });
  el.tCode.addEventListener('change', function () {
    commit({ typo: { keepCodeLtr: el.tCode.checked } });
  });
  el.tShadow.addEventListener('change', function () {
    commit({ adv: { pierceShadow: el.tShadow.checked } });
  });

  el.lh.addEventListener('input', function () {
    var v = +el.lh.value;
    el.lhOut.textContent = v ? fa((v / 10).toFixed(1)) : 'پیش‌فرض';
  });
  el.lh.addEventListener('change', function () {
    commit({ typo: { lineHeight: +el.lh.value / 10 } });
  });

  el.rescan.addEventListener('click', function () {
    tell({ type: 'pwm:rescan' }).then(function (r) {
      if (r && r.report) renderStats(r.report);
      else warn('این صفحه قابل پردازش نیست (صفحه‌ی داخلی مرورگر یا فروشگاه افزونه).');
    });
  });

  el.options.addEventListener('click', function () {
    send({ type: 'pwm:open-options' });
    window.close();
  });

  /* ----------------------------------------------------------------- init */
  function init() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      tab = tabs && tabs[0] ? tabs[0] : null;
      try {
        var u = new URL(tab && tab.url ? tab.url : 'about:blank');
        host = u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:' ? u.hostname : '';
      } catch (e) {
        host = '';
      }
      Settings.load().then(function (s) {
        S = s;
        render();
        tell({ type: 'pwm:get-state' }).then(function (st) {
          if (st) renderStats(st.report);
          else if (host) el.stats.textContent = 'اسکریپت در این تب اجرا نشده — صفحه را دوباره بارگذاری کنید';
        });
      });
    });
    Settings.onChange(function (next) {
      S = next;
      render();
    });
  }

  init();
})();

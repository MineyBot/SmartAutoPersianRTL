/* ============================================================================
 * PWM · options/options.js
 * ==========================================================================*/
(function () {
  'use strict';
  var PWM = window.PWM;
  var Settings = PWM.Settings;
  var Sites = PWM.Sites;
  var Bidi = PWM.Bidi;

  var $ = function (s) {
    return document.querySelector(s);
  };
  var $$ = function (s) {
    return Array.prototype.slice.call(document.querySelectorAll(s));
  };

  var S = null;
  var writing = false;

  var FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  function fa(n) {
    return String(n).replace(/\d/g, function (d) {
      return FA[+d];
    });
  }

  function toast(msg, bad) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (bad ? ' bad' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      t.hidden = true;
    }, 2400);
  }

  function commit(delta, quiet) {
    if (writing) return Promise.resolve();
    writing = true;
    return Settings.patch(delta)
      .then(function (next) {
        S = next;
        render();
        if (!quiet) toast('ذخیره شد');
      })
      .catch(function (e) {
        toast('ذخیره نشد: ' + (e && e.message ? e.message : '؟'), true);
      })
      .then(function () {
        writing = false;
      });
  }

  /* ------------------------------------------------------------------ tabs */
  $('#tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-tab]');
    if (!b) return;
    $$('#tabs button').forEach(function (x) {
      x.setAttribute('aria-selected', x === b ? 'true' : 'false');
    });
    $$('.pane').forEach(function (p) {
      p.hidden = p.dataset.pane !== b.dataset.tab;
    });
    if (b.dataset.tab === 'lab') runLab();
    location.hash = b.dataset.tab;
  });

  /* ---------------------------------------------------------------- render */
  function render() {
    if (!S) return;

    $('#enabled').checked = S.enabled;
    $('#sync-enabled').checked = S.syncEnabled;
    var sc = document.querySelector('#scope input[value="' + S.scope + '"]');
    if (sc) sc.checked = true;
    var md = document.querySelector('#mode input[value="' + S.mode + '"]');
    if (md) md.checked = true;

    setRange('#threshold', Math.round(S.threshold * 100), function (v) {
      return fa(v) + '٪';
    });

    $('#font-enabled').checked = S.font.enabled;
    setRange('#font-scale', S.font.scale, function (v) {
      return fa(v) + '٪';
    });
    $('#digits').value = S.font.digits;
    $('#font-latin').checked = S.font.applyToLatin;
    $('#font-name').hidden = !S.font.customName;
    $('#font-name').textContent = S.font.customName || '';
    $('#font-clear').hidden = !S.font.customData;
    renderFontCards();
    applyPreview();

    setRange('#lh', S.typo.lineHeight ? Math.round(S.typo.lineHeight * 10) : 0, function (v) {
      return +v ? fa((v / 10).toFixed(1)) : 'پیش‌فرض';
    });
    setRange('#ls', Math.round(S.typo.letterSpacing * 10), function (v) {
      return fa((v / 10).toFixed(1));
    });
    setRange('#ws', Math.round(S.typo.wordSpacing * 10), function (v) {
      return fa((v / 10).toFixed(1));
    });
    setRange('#pg', S.typo.paragraphGap, fa);

    $('#justify').checked = S.typo.justify;
    $('#fixList').checked = S.typo.fixListIndent;
    $('#fixQuote').checked = S.typo.fixQuotes;
    $('#fixTable').checked = S.typo.fixTables;
    $('#keepCode').checked = S.typo.keepCodeLtr;
    $('#isolate').checked = S.typo.isolateInline;

    $('#inputs').checked = S.inputs;
    $('#placeholders').checked = S.placeholders;
    $('#liveTyping').checked = S.liveTyping;

    $('#pierce').checked = S.adv.pierceShadow;
    $('#openClosed').checked = S.adv.openClosedShadow;
    $('#badge').checked = S.adv.badge;
    $('#debug').checked = S.adv.debug;
    $('#mirror').checked = S.adv.mirrorLayout;
    setRange('#debounce', S.adv.debounce, fa);
    setRange('#budget', S.adv.budgetMs, fa);

    renderSites();
    renderSelectorEditor();
    renderSyncState();
    runLab();
  }

  function setRange(sel, val, fmt) {
    var r = $(sel);
    if (!r) return;
    r.value = val;
    var out = $(sel + '-out');
    if (out) out.textContent = fmt ? fmt(val) : String(val);
  }

  function renderFontCards() {
    var wrap = $('#font-grid');
    var html = '';
    Settings.BUILTIN_FONTS.forEach(function (f) {
      var on = S.font.source === 'builtin' && S.font.builtin === f.id;
      html +=
        '<button class="font-card" data-kind="builtin" data-id="' + f.id + '" aria-pressed="' + on + '">' +
        '<b>' + f.label + '</b><small>آبجد هوز ۱۲۳۴</small></button>';
    });
    if (S.font.customData) {
      html +=
        '<button class="font-card" data-kind="custom" aria-pressed="' + (S.font.source === 'custom') + '">' +
        '<b>فونت دلخواه</b><small>' + (S.font.customName || '').slice(0, 24) + '</small></button>';
    }
    html +=
      '<button class="font-card" data-kind="system" aria-pressed="' + (S.font.source === 'system') + '">' +
      '<b>فونت سیستم</b><small>بدون بارگذاری فونت</small></button>';
    wrap.innerHTML = html;
  }

  var previewFamily = '';
  function applyPreview() {
    var p = $('#font-preview');
    var lab = $('#lab-preview');
    var stack;
    if (!S.font.enabled) stack = 'system-ui, Tahoma, sans-serif';
    else if (S.font.source === 'system') stack = Settings.FALLBACK_STACK;
    else stack = '';

    var size = 15 * (S.font.scale / 100);
    [p, lab, $('#try-input'), $('#lab-text')].forEach(function (n) {
      if (n) n.style.fontSize = size + 'px';
    });

    if (stack) {
      [p, lab].forEach(function (n) {
        if (n) n.style.fontFamily = stack;
      });
      return;
    }

    var family = 'PWMOptPreview' + Date.now();
    var src;
    if (S.font.source === 'custom' && S.font.customData) src = 'url("' + S.font.customData + '")';
    else {
      var meta = Settings.BUILTIN_FONTS.filter(function (f) {
        return f.id === S.font.builtin;
      })[0] || Settings.BUILTIN_FONTS[0];
      src = 'url("' + chrome.runtime.getURL(meta.file) + '")';
    }
    try {
      var face = new FontFace(family, src, { weight: '100 900' });
      face.load().then(function (f) {
        document.fonts.add(f);
        previewFamily = family;
        [p, lab].forEach(function (n) {
          if (n) n.style.fontFamily = '"' + family + '", Tahoma, sans-serif';
        });
        $$('.font-card small').forEach(function (n) {
          n.style.fontFamily = '"' + family + '", Tahoma, sans-serif';
        });
      });
    } catch (e) {}
  }

  function renderSites() {
    var wrap = $('#site-list');
    var keys = Object.keys(S.sites || {});
    if (!keys.length) {
      wrap.innerHTML = '<div class="empty">هنوز هیچ سایتی تنظیم اختصاصی ندارد.</div>';
    } else {
      keys.sort();
      wrap.innerHTML = keys
        .map(function (h) {
          var ov = S.sites[h] || {};
          var on = ov.enabled !== false;
          var prof = Sites.forHost(h);
          return (
            '<div class="site-row"><span class="host">' + h + '</span><span class="tags">' +
            (prof ? '<span class="tag">' + prof.label + '</span>' : '') +
            '<span class="tag ' + (on ? 'on' : 'off') + '">' + (on ? 'روشن' : 'خاموش') + '</span>' +
            '<button class="btn sm" data-flip="' + h + '">تغییر</button>' +
            '<button class="btn danger sm" data-del="' + h + '">حذف</button>' +
            '</span></div>'
          );
        })
        .join('');
    }

    var pl = $('#profile-list');
    if (!pl.dataset.done) {
      pl.innerHTML = Sites.PROFILES.map(function (p) {
        return (
          '<div class="profile"><span>' + p.label + '</span>' +
          '<span class="kind ' + p.kind + '">' + (p.kind === 'ai' ? 'چت‌بات' : 'وب') + '</span></div>'
        );
      }).join('');
      pl.dataset.done = '1';
    }
  }

  /* ------------------------------------------------------------------- lab */
  var SAMPLES = [
    'سلام دنیا! این یک متن کاملاً فارسی است.',
    'برای نصب دستور npm install را در ترمینال بزنید.',
    'The library React is very popular among developers.',
    'قیمت 1250 دلار است و در تاریخ 2026-09-05 اعلام شد.',
    'مقاله‌ی «Attention Is All You Need» پایه‌ی معماری ترنسفورمر است.',
    'GitHub Actions CI/CD pipeline برای دیپلوی خودکار پروژه تنظیم شد.'
  ];

  function runLab() {
    var txt = $('#lab-text').value || '';
    var a = Bidi.analyze(txt, { mode: S ? S.mode : 'smart', threshold: S ? S.threshold : 0.3 });
    var dirLabel = a.dir === 'rtl' ? 'راست‌چین' : a.dir === 'ltr' ? 'چپ‌چین' : 'دست‌نخورده';
    $('#lab-out').innerHTML =
      '<div><span>تصمیم</span><b class="' + (a.dir || '') + '">' + dirLabel + '</b></div>' +
      '<div><span>حروف فارسی/RTL</span><b>' + fa(a.rtl) + '</b></div>' +
      '<div><span>حروف لاتین/LTR</span><b>' + fa(a.ltr) + '</b></div>' +
      '<div><span>نسبت</span><b>' + fa(Math.round(a.ratio * 100)) + '٪</b></div>' +
      '<div><span>اولین حرف قوی</span><b>' + (a.first === 'rtl' ? 'فارسی' : a.first === 'ltr' ? 'لاتین' : '—') + '</b></div>';
    var pv = $('#lab-preview');
    pv.textContent = txt;
    pv.style.direction = a.dir === 'rtl' ? 'rtl' : a.dir === 'ltr' ? 'ltr' : 'inherit';
    pv.style.textAlign = 'start';
    pv.style.unicodeBidi = 'isolate';
  }

  $('#samples').innerHTML = SAMPLES.map(function (s, i) {
    return '<button class="sample" data-i="' + i + '">' + s + '</button>';
  }).join('');

  $('#samples').addEventListener('click', function (ev) {
    var b = ev.target.closest('.sample');
    if (!b) return;
    $('#lab-text').value = SAMPLES[+b.dataset.i];
    runLab();
  });

  $('#lab-text').addEventListener('input', runLab);

  /* ---------------------------------------------------------------- events */
  $('#enabled').addEventListener('change', function () {
    commit({ enabled: this.checked });
  });

  $('#scope').addEventListener('change', function (ev) {
    if (ev.target.name === 'scope') commit({ scope: ev.target.value });
  });

  $('#mode').addEventListener('change', function (ev) {
    if (ev.target.name === 'mode') commit({ mode: ev.target.value });
  });

  bindRange('#threshold', function (v) {
    return { threshold: v / 100 };
  }, function (v) {
    return fa(v) + '٪';
  });

  $('#font-enabled').addEventListener('change', function () {
    commit({ font: { enabled: this.checked } });
  });

  $('#font-grid').addEventListener('click', function (ev) {
    var c = ev.target.closest('.font-card');
    if (!c) return;
    var k = c.dataset.kind;
    if (k === 'builtin') commit({ font: { enabled: true, source: 'builtin', builtin: c.dataset.id } });
    else if (k === 'custom') commit({ font: { enabled: true, source: 'custom' } });
    else commit({ font: { enabled: true, source: 'system' } });
  });

  bindRange('#font-scale', function (v) {
    return { font: { scale: v } };
  }, function (v) {
    return fa(v) + '٪';
  });

  $('#digits').addEventListener('change', function () {
    commit({ font: { digits: this.value } });
  });

  $('#font-latin').addEventListener('change', function () {
    commit({ font: { applyToLatin: this.checked } });
  });

  $('#font-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) {
      toast('حجم فونت بیش از ۴ مگابایت است؛ نسخه‌ی woff2 را انتخاب کنید.', true);
      this.value = '';
      return;
    }
    var rd = new FileReader();
    var self = this;
    rd.onload = function (e) {
      commit({ font: { enabled: true, source: 'custom', customData: String(e.target.result), customName: f.name } });
      self.value = '';
    };
    rd.onerror = function () {
      toast('خواندن فایل ناموفق بود.', true);
    };
    rd.readAsDataURL(f);
  });

  $('#font-clear').addEventListener('click', function () {
    commit({ font: { source: 'builtin', customData: '', customName: '' } });
  });

  bindRange('#lh', function (v) {
    return { typo: { lineHeight: v / 10 } };
  }, function (v) {
    return +v ? fa((v / 10).toFixed(1)) : 'پیش‌فرض';
  });
  bindRange('#ls', function (v) {
    return { typo: { letterSpacing: v / 10 } };
  }, function (v) {
    return fa((v / 10).toFixed(1));
  });
  bindRange('#ws', function (v) {
    return { typo: { wordSpacing: v / 10 } };
  }, function (v) {
    return fa((v / 10).toFixed(1));
  });
  bindRange('#pg', function (v) {
    return { typo: { paragraphGap: v } };
  }, fa);

  [
    ['#justify', 'typo.justify'],
    ['#fixList', 'typo.fixListIndent'],
    ['#fixQuote', 'typo.fixQuotes'],
    ['#fixTable', 'typo.fixTables'],
    ['#keepCode', 'typo.keepCodeLtr'],
    ['#isolate', 'typo.isolateInline'],
    ['#inputs', 'inputs'],
    ['#placeholders', 'placeholders'],
    ['#liveTyping', 'liveTyping'],
    ['#pierce', 'adv.pierceShadow'],
    ['#openClosed', 'adv.openClosedShadow'],
    ['#badge', 'adv.badge'],
    ['#debug', 'adv.debug'],
    ['#mirror', 'adv.mirrorLayout'],
    ['#sync-enabled', 'syncEnabled']
  ].forEach(function (pair) {
    var node = $(pair[0]);
    if (!node) return;
    node.addEventListener('change', function () {
      commit(pathDelta(pair[1], this.checked));
    });
  });

  bindRange('#debounce', function (v) {
    return { adv: { debounce: v } };
  }, fa);
  bindRange('#budget', function (v) {
    return { adv: { budgetMs: v } };
  }, fa);

  function pathDelta(path, val) {
    var parts = path.split('.');
    var out = {};
    var cur = out;
    for (var i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
    return out;
  }

  function bindRange(sel, deltaFn, fmt) {
    var r = $(sel);
    if (!r) return;
    var out = $(sel + '-out');
    r.addEventListener('input', function () {
      if (out) out.textContent = fmt ? fmt(+r.value) : r.value;
    });
    r.addEventListener('change', function () {
      commit(deltaFn(+r.value), true);
    });
  }

  /* ------------------------------------------------- custom selector editor */

  /** دامنه‌ی انتخاب‌شده در ویرایشگر سلکتور */
  function selHost() {
    var typed = ($('#sel-host-new').value || '').trim();
    if (typed) {
      return Sites.normalizeHost(typed.replace(/^https?:\/\//, '').split('/')[0]);
    }
    return $('#sel-host').value || '';
  }

  function renderSelectorEditor() {
    var sel = $('#sel-host');
    if (!sel) return;
    var prev = sel.value;

    /* گزینه‌ها: هر دامنه‌ای که تنظیم اختصاصی دارد + پروفایل‌های آماده */
    var hosts = Object.keys(S.sites || {});
    Sites.PROFILES.forEach(function (p) {
      (p.hosts || []).forEach(function (h) {
        if (hosts.indexOf(h) < 0) hosts.push(h);
      });
    });
    hosts.sort();

    sel.innerHTML =
      '<option value="">— دامنه را انتخاب کنید —</option>' +
      hosts
        .map(function (h) {
          var ov = (S.sites || {})[h];
          var n = ov ? (ov.anchors || []).length + (ov.guards || []).length : 0;
          return '<option value="' + h + '">' + h + (n ? ' (' + fa(n) + ' سلکتور)' : '') + '</option>';
        })
        .join('');
    if (prev && hosts.indexOf(prev) >= 0) sel.value = prev;

    fillSelectorFields();
  }

  function fillSelectorFields() {
    var h = $('#sel-host').value;
    var ov = (S.sites || {})[h] || {};
    $('#sel-anchors').value = (ov.anchors || []).join('\n');
    $('#sel-guards').value = (ov.guards || []).join('\n');
    $('#sel-report').hidden = true;
    $('#sel-test-out').hidden = true;
  }

  /** بازخورد زنده: کدام خط‌ها معتبرند و کدام رد شدند */
  function reportSelectors() {
    var box = $('#sel-report');
    var lines = []
      .concat(($('#sel-anchors').value || '').split('\n').map(function (s) { return ['لنگر', s]; }))
      .concat(($('#sel-guards').value || '').split('\n').map(function (s) { return ['محافظ', s]; }))
      .filter(function (p) {
        return p[1].trim();
      });
    if (!lines.length) {
      box.hidden = true;
      return;
    }
    var bad = lines.filter(function (p) {
      return !Settings.isSafeSelector(p[1]);
    });
    if (!bad.length) {
      box.className = 'sel-report ok';
      box.textContent = 'همه‌ی ' + fa(lines.length) + ' سلکتور معتبرند.';
    } else {
      box.className = 'sel-report bad';
      box.innerHTML =
        '<b>' + fa(bad.length) + ' سلکتور نامعتبر و نادیده گرفته می‌شود:</b><ul>' +
        bad
          .map(function (p) {
            return '<li>' + p[0] + ': <code dir="ltr">' + esc(p[1].trim().slice(0, 60)) + '</code></li>';
          })
          .join('') +
        '</ul>';
    }
    box.hidden = false;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  $('#sel-host').addEventListener('change', function () {
    $('#sel-host-new').value = '';
    fillSelectorFields();
  });
  $('#sel-anchors').addEventListener('input', reportSelectors);
  $('#sel-guards').addEventListener('input', reportSelectors);

  $('#sel-save').addEventListener('click', function () {
    var h = selHost();
    if (!h || h.indexOf('.') < 0) {
      toast('اول یک دامنه‌ی معتبر انتخاب یا وارد کنید.', true);
      return;
    }
    var anchors = Settings.sanitizeSelectorList($('#sel-anchors').value);
    var guards = Settings.sanitizeSelectorList($('#sel-guards').value);

    /* برای پاک‌کردن سلکتورها باید صریح آرایه‌ی خالی نوشته شود، چون deepMerge
     * کلید غایب را دست‌نخورده رد می‌کند. */
    var next = Settings.deepMerge(S, {});
    next.sites = next.sites || {};
    var cur = next.sites[h] || {};
    cur.anchors = anchors;
    cur.guards = guards;
    if (cur.enabled === undefined && !anchors.length && !guards.length) delete next.sites[h];
    else next.sites[h] = cur;

    writing = true;
    Settings.save(next)
      .then(function (n) {
        S = n;
        render();
        $('#sel-host').value = h;
        fillSelectorFields();
        var saved = ((n.sites[h] || {}).anchors || []).length + ((n.sites[h] || {}).guards || []).length;
        toast(saved ? fa(saved) + ' سلکتور برای ' + h + ' ذخیره شد' : 'سلکتورهای ' + h + ' پاک شد');
      })
      .then(function () {
        writing = false;
      });
  });

  $('#sel-clear').addEventListener('click', function () {
    $('#sel-anchors').value = '';
    $('#sel-guards').value = '';
    reportSelectors();
  });

  /** سلکتورها را روی یک تب واقعی می‌شمارد تا کاربر قبل از ذخیره بداند چیزی می‌گیرند یا نه */
  $('#sel-test').addEventListener('click', function () {
    var anchors = Settings.sanitizeSelectorList($('#sel-anchors').value);
    var guards = Settings.sanitizeSelectorList($('#sel-guards').value);
    if (!anchors.length && !guards.length) {
      toast('چیزی برای آزمودن نیست.', true);
      return;
    }
    var out = $('#sel-test-out');
    out.hidden = false;
    out.className = 'sel-test-out';
    out.textContent = 'در حال شمارش…';

    var want = selHost();

    /* صفحه‌ی تنظیمات خودش تبِ فعال است، پس جست‌وجوی {active:true} فقط همین صفحه
     * را برمی‌گرداند و هیچ‌وقت جواب نمی‌دهد. همه‌ی تب‌ها را می‌گیریم، اول تبی را
     * ترجیح می‌دهیم که دامنه‌اش با دامنه‌ی انتخاب‌شده یکی است، بعد تازه‌ترین تب. */
    chrome.tabs.query({}, function (tabs) {
      var cands = (tabs || []).filter(function (t) {
        return t && t.id && /^https?:/.test(t.url || '');
      });
      if (!cands.length) {
        out.className = 'sel-test-out bad';
        out.textContent = 'هیچ تبی با یک صفحه‌ی وب معمولی باز نیست. سایت را در تبی دیگر باز کنید و دوباره بزنید.';
        return;
      }
      var hostOf = function (t) {
        try {
          return Sites.normalizeHost(new URL(t.url).hostname);
        } catch (e) {
          return '';
        }
      };
      var matching = want ? cands.filter(function (t) { return hostOf(t) === want; }) : [];
      var pool = matching.length ? matching : cands;
      pool.sort(function (a, b) {
        return (b.lastAccessed || 0) - (a.lastAccessed || 0);
      });
      var tab = pool[0];

      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id, allFrames: false },
          args: [anchors, guards],
          func: function (an, gu) {
            function count(list) {
              return list.map(function (s) {
                var n = 0;
                try {
                  n = document.querySelectorAll(s).length;
                } catch (e) {
                  n = -1;
                }
                return { sel: s, n: n };
              });
            }
            return { host: location.hostname, anchors: count(an), guards: count(gu) };
          }
        },
        function (res) {
          var err = chrome.runtime.lastError;
          if (err || !res || !res[0]) {
            out.className = 'sel-test-out bad';
            out.textContent = 'اجرا در این تب ممکن نبود' + (err ? ': ' + err.message : '.');
            return;
          }
          var r = res[0].result;
          var rows = function (arr) {
            return arr
              .map(function (x) {
                var badge =
                  x.n < 0 ? '<b class="bad">نامعتبر</b>'
                  : x.n === 0 ? '<b class="warn">۰ مورد</b>'
                  : '<b class="ok">' + fa(x.n) + ' مورد</b>';
                return '<div><code dir="ltr">' + esc(x.sel) + '</code>' + badge + '</div>';
              })
              .join('');
          };
          var mismatch = want && Sites.normalizeHost(r.host) !== want;
          out.className = 'sel-test-out';
          out.innerHTML =
            '<div class="t-head">روی <code dir="ltr">' + esc(r.host) + '</code>' +
            (mismatch ? ' <b class="warn">(دامنه‌ی انتخاب‌شده باز نیست)</b>' : '') +
            '</div>' +
            (r.anchors.length ? '<div class="t-group"><span>لنگرها</span>' + rows(r.anchors) + '</div>' : '') +
            (r.guards.length ? '<div class="t-group"><span>محافظ‌ها</span>' + rows(r.guards) + '</div>' : '');
        }
      );
    });
  });

  /* ------------------------------------------------------------ sync status */
  function renderSyncState() {
    var box = $('#sync-state');
    if (!box) return;
    if (!S.syncEnabled) {
      box.className = 'sync-state off';
      box.textContent = 'همگام‌سازی خاموش است — تنظیمات فقط روی این دستگاه ذخیره می‌شود.';
      return;
    }
    Settings.syncAvailable().then(function (ok) {
      if (ok) {
        box.className = 'sync-state on';
        box.textContent = 'همگام‌سازی فعال است. تنظیمات روی دستگاه‌های دیگرِ همین حساب هم اعمال می‌شود.';
      } else {
        box.className = 'sync-state warn';
        box.textContent =
          'همگام‌سازی روشن است ولی مرورگر آن را در دسترس قرار نمی‌دهد (احتمالاً وارد حساب نشده‌اید). ' +
          'تنظیمات فعلاً محلی ذخیره می‌شود و به‌محض ورود به حساب همگام می‌شود.';
      }
    });
  }

  /* ------------------------------------------------------------ site rules */
  function addSite(on) {
    var v = ($('#site-input').value || '').trim();
    if (!v) return;
    var h = Sites.normalizeHost(v.replace(/^https?:\/\//, '').split('/')[0]);
    if (!h || h.indexOf('.') < 0) {
      toast('نام دامنه معتبر نیست.', true);
      return;
    }
    var d = { sites: {} };
    d.sites[h] = { enabled: on };
    commit(d);
    $('#site-input').value = '';
  }

  $('#site-add-on').addEventListener('click', function () {
    addSite(true);
  });
  $('#site-add-off').addEventListener('click', function () {
    addSite(false);
  });
  $('#site-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addSite(true);
  });

  $('#site-list').addEventListener('click', function (ev) {
    var flip = ev.target.closest('[data-flip]');
    var del = ev.target.closest('[data-del]');
    if (flip) {
      var h = flip.dataset.flip;
      var cur = (S.sites[h] || {}).enabled !== false;
      var d = { sites: {} };
      d.sites[h] = { enabled: !cur };
      commit(d);
    } else if (del) {
      var next = Settings.deepMerge(S, {});
      delete next.sites[del.dataset.del];
      writing = true;
      Settings.save(next)
        .then(function (n) {
          S = n;
          render();
          toast('حذف شد');
        })
        .then(function () {
          writing = false;
        });
    }
  });

  /* --------------------------------------------------------------- tooling */
  $('#export').addEventListener('click', function () {
    var clone = JSON.parse(JSON.stringify(S));
    if (clone.font) clone.font.customData = clone.font.customData ? '[omitted]' : '';
    var blob = new Blob([JSON.stringify(clone, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'persian-web-mixer-settings.json';
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
    toast('فایل تنظیمات ساخته شد (فونت دلخواه شامل نمی‌شود)');
  });

  $('#import-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var rd = new FileReader();
    var self = this;
    rd.onload = function (e) {
      try {
        var obj = JSON.parse(String(e.target.result));
        if (obj.font && obj.font.customData === '[omitted]') delete obj.font.customData;
        writing = true;
        Settings.save(Settings.deepMerge(S, obj))
          .then(function (n) {
            S = n;
            render();
            toast('تنظیمات درون‌ریزی شد');
          })
          .catch(function (err) {
            toast('خطا: ' + err.message, true);
          })
          .then(function () {
            writing = false;
          });
      } catch (err) {
        toast('فایل JSON معتبر نیست.', true);
      }
      self.value = '';
    };
    rd.readAsText(f);
  });

  $('#reset').addEventListener('click', function () {
    if (!confirm('همه‌ی تنظیمات به حالت پیش‌فرض بازگردانده شود؟ فونت دلخواه هم حذف می‌شود.')) return;
    writing = true;
    Settings.save(Settings.DEFAULTS)
      .then(function (n) {
        S = n;
        render();
        toast('بازگردانی شد');
      })
      .then(function () {
        writing = false;
      });
  });

  $('#inject').addEventListener('click', function () {
    var out = $('#inject-out');
    out.textContent = 'در حال تزریق…';
    chrome.runtime.sendMessage({ type: 'pwm:inject-existing' }, function (r) {
      void chrome.runtime.lastError;
      out.textContent = r && r.ok ? fa(r.injected || 0) + ' تب فعال شد' : 'ناموفق';
    });
  });

  /* ------------------------------------------------------------------ init */
  var mv = chrome.runtime.getManifest();
  $('#ver').textContent = mv.version;

  Settings.load().then(function (s) {
    S = s;
    render();
    var h = (location.hash || '').replace('#', '');
    if (h) {
      var b = document.querySelector('#tabs button[data-tab="' + h + '"]');
      if (b) b.click();
    }
  });

  Settings.onChange(function (next) {
    if (writing) return;
    S = next;
    render();
  });
})();

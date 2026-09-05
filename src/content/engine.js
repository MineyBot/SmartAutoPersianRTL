/* ============================================================================
 * PWM · content/engine.js
 * موتور اصلی: پیمایش تدریجی DOM، تشخیص بلوک متن فارسی، نشانه‌گذاری با attribute
 * و مدیریت Shadow DOM. طراحی بر سه اصل استوار است:
 *
 *  ۱) هیچ‌گاه کل صفحه دوباره پیمایش نمی‌شود؛ فقط زیردرخت گره‌های تغییر‌یافته.
 *  ۲) کار در برش‌های زمانی کوتاه (time-sliced) انجام می‌شود تا فریم‌ها نیفتند.
 *  ۳) خواندن و نوشتن DOM از هم جدا است (اول تحلیل، بعد نوشتن دسته‌ای).
 * ==========================================================================*/
(function (root) {
  'use strict';
  var PWM = (root.PWM = root.PWM || {});
  var Bidi = PWM.Bidi;
  var Css = PWM.Css;

  var ATTR = Css.ATTR;
  var ATTR_INPUT = Css.ATTR_INPUT;

  /* عناصری که به‌طور قطع بلوکی‌اند (برای پرهیز از getComputedStyle) */
  var BLOCK_TAGS = {
    P: 1, DIV: 1, LI: 1, DD: 1, DT: 1, TD: 1, TH: 1, CAPTION: 1, FIGCAPTION: 1,
    BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, SECTION: 1, ARTICLE: 1,
    HEADER: 1, FOOTER: 1, MAIN: 1, ASIDE: 1, NAV: 1, FORM: 1, FIELDSET: 1, DETAILS: 1,
    SUMMARY: 1, PRE: 1, UL: 1, OL: 1, DL: 1, TABLE: 1, TBODY: 1, THEAD: 1, TR: 1,
    ADDRESS: 1, HGROUP: 1, OUTPUT: 1, LABEL: 0
  };

  /* تگ‌هایی که هرگز به‌عنوان لنگر انتخاب نمی‌شوند */
  var NEVER_ANCHOR = {
    HTML: 1, HEAD: 1, SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, META: 1, LINK: 1,
    TITLE: 1, SVG: 1, PATH: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, IFRAME: 1, OBJECT: 1,
    EMBED: 1, MAP: 1, AREA: 1, SOURCE: 1, TRACK: 1, BR: 1, HR: 1, IMG: 1, PICTURE: 1,
    SELECT: 1, OPTION: 1, OPTGROUP: 1, PROGRESS: 1, METER: 1, MATH: 1
  };

  /* کنترل‌های رابط کاربری: جهت متن‌شان اصلاح می‌شود اما تراز و چیدمان دست‌نخورده
   * می‌ماند. بدون این تفکیک، یک دکمه‌ی فارسی تراز مرکزی خود را از دست می‌دهد. */
  var UI_TAGS = { BUTTON: 1, SUMMARY: 1, LEGEND: 1 };
  var UI_ROLES = {
    button: 1, tab: 1, menuitem: 1, menuitemcheckbox: 1, menuitemradio: 1, option: 1,
    switch: 1, checkbox: 1, radio: 1, slider: 1, progressbar: 1, link: 1, treeitem: 1
  };

  var EDITABLE_HOSTS = /(^|\s)(cm-editor|CodeMirror|monaco-editor|ace_editor|ProseMirror-focused)(\s|$)/;

  function now() {
    return root.performance && performance.now ? performance.now() : Date.now();
  }

  /* ========================================================================
   * کلاس Engine
   * ======================================================================*/
  function Engine() {
    this.cfg = null;
    this.profile = null;
    this.doc = document;
    this.running = false;

    this.guardSel = '';
    this.anchorSel = '';
    this.inputSel = '';
    this.css = '';

    this.roots = new Set(); // Document + همه‌ی ShadowRoot های شناخته‌شده
    this.observers = new Map(); // root → MutationObserver
    this.marked = new Set(); // عناصری که ما نشانه‌گذاری کرده‌ایم
    this.state = new WeakMap(); // element → { sig, dir }
    this.inputs = new WeakSet();

    this.pending = new Set(); // گره‌های در انتظار پردازش
    this.fullPass = false;
    this.scheduled = 0;
    this.timer = 0;
    this.stats = { marked: 0, passes: 0, ms: 0, roots: 0 };

    this._onMut = this._onMut.bind(this);
    this._flush = this._flush.bind(this);
    this._onShadow = this._onShadow.bind(this);
    this._onFocusIn = this._onFocusIn.bind(this);
    this._onInput = this._onInput.bind(this);
  }

  /* ------------------------------------------------------------ lifecycle */

  Engine.prototype.start = function (cfg, profile) {
    this.cfg = cfg;
    this.profile = profile;
    this.guardSel = (profile.guards || [])
      .map(function (g) {
        return g.slice(-1) === '-' ? '[class*="' + g.slice(0, -1) + '"]' : g;
      })
      .filter(function (g) {
        return g && !/[{}]/.test(g);
      })
      .join(',');
    this.anchorSel = (profile.anchors || []).join(',');
    this.inputSel =
      'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="email"],' +
      'input[type="url"], input[type="tel"], input[type="password"], [contenteditable="true"],' +
      '[contenteditable=""], [role="textbox"]';

    this.css = Css.build(cfg, profile);
    this.running = true;

    this.registerRoot(this.doc);
    this._collectShadowHosts(this.doc);

    root.addEventListener('pwm:shadow', this._onShadow, true);
    if (cfg.inputs) {
      this.doc.addEventListener('focusin', this._onFocusIn, true);
      if (cfg.liveTyping) this.doc.addEventListener('input', this._onInput, true);
    }

    this.requestFull();
    return this;
  };

  Engine.prototype.stop = function () {
    this.running = false;
    var self = this;
    this.observers.forEach(function (o) {
      try {
        o.disconnect();
      } catch (e) {}
    });
    this.observers.clear();
    root.removeEventListener('pwm:shadow', this._onShadow, true);
    this.doc.removeEventListener('focusin', this._onFocusIn, true);
    this.doc.removeEventListener('input', this._onInput, true);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
    this.scheduled = 0;
    this.pending.clear();

    /* پاک‌سازی کامل نشانه‌ها */
    this.marked.forEach(function (el) {
      try {
        el.removeAttribute(ATTR);
      } catch (e) {}
    });
    this.marked.clear();
    this.roots.forEach(function (r) {
      try {
        r.querySelectorAll('[' + ATTR + '],[' + ATTR_INPUT + ']').forEach(function (el) {
          el.removeAttribute(ATTR);
          el.removeAttribute(ATTR_INPUT);
        });
      } catch (e) {}
      Css.detach(r);
    });
    this.state = new WeakMap();
    this.inputs = new WeakSet();
    self.stats.marked = 0;
    return this;
  };

  /** پاک‌کردن همه‌ی نشانه‌ها (نه توقف موتور) — برای اعمال تنظیمات تازه */
  Engine.prototype._clearMarks = function () {
    this.marked.forEach(function (el) {
      try {
        el.removeAttribute(ATTR);
      } catch (e) {}
    });
    this.marked.clear();
    this.roots.forEach(function (r) {
      try {
        var list = r.querySelectorAll('[' + ATTR + ']');
        for (var i = 0; i < list.length; i++) list[i].removeAttribute(ATTR);
      } catch (e) {}
    });
    this.state = new WeakMap();
  };

  /** اعمال تنظیمات جدید بدون بارگذاری مجدد صفحه */
  Engine.prototype.update = function (cfg, profile) {
    this.cfg = cfg;
    if (profile) this.profile = profile;
    Css.invalidate();
    this.css = Css.build(this.cfg, this.profile);
    var self = this;
    this.roots.forEach(function (r) {
      Css.attach(r, self.css);
    });
    /* تصمیم‌های پیشین با تنظیم تازه بی‌اعتبارند؛ همه را پاک می‌کنیم تا بلوک‌هایی
     * که دیگر واجد شرط نیستند نشانه‌ی کهنه نگه ندارند. */
    this._clearMarks();
    this.requestFull();
    return this;
  };

  /* ---------------------------------------------------------------- roots */

  Engine.prototype.registerRoot = function (r) {
    if (!r || this.roots.has(r)) return false;
    this.roots.add(r);
    this.stats.roots = this.roots.size;
    Css.attach(r, this.css);
    this._observe(r);
    this.pending.add(r);
    this._schedule();
    return true;
  };

  Engine.prototype._observe = function (r) {
    if (this.observers.has(r)) return;
    var target = r.nodeType === 9 ? r.documentElement || r : r;
    if (!target) return;
    var mo = new MutationObserver(this._onMut);
    try {
      mo.observe(target, { childList: true, subtree: true, characterData: true });
      this.observers.set(r, mo);
    } catch (e) {}
  };

  Engine.prototype._onShadow = function (ev) {
    if (!this.running || !this.cfg.adv.pierceShadow) return;
    var host = ev && ev.target;
    if (!host || !host.shadowRoot) return;
    this.registerRoot(host.shadowRoot);
  };

  /** یافتن Shadow Host های موجود (برای صفحاتی که پیش از اجرای ما رندر شده‌اند) */
  Engine.prototype._collectShadowHosts = function (r) {
    if (!this.cfg.adv.pierceShadow) return;
    var all;
    try {
      all = r.querySelectorAll('*');
    } catch (e) {
      return;
    }
    for (var i = 0; i < all.length; i++) {
      var sr = all[i].shadowRoot;
      if (sr) {
        this.registerRoot(sr);
        this._collectShadowHosts(sr);
      }
    }
  };

  /* ----------------------------------------------------------- scheduling */

  Engine.prototype.requestFull = function () {
    this.fullPass = true;
    this._schedule();
  };

  Engine.prototype._onMut = function (records) {
    if (!this.running) return;
    var n = records.length;
    for (var i = 0; i < n; i++) {
      var m = records[i];
      if (m.type === 'characterData') {
        var p = m.target.parentElement;
        if (p) this.pending.add(p);
        continue;
      }
      var added = m.addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType === 1) {
          if (node.id === Css.SHEET_ID) continue; // استایل خودمان
          this.pending.add(node);
        } else if (node.nodeType === 3 && m.target) {
          this.pending.add(m.target);
        }
      }
      if (!added.length && m.removedNodes && m.removedNodes.length) {
        // حذف گره‌ها ممکن است بلوک را از فارسی خالی کند
        if (m.target && m.target.nodeType === 1) this.pending.add(m.target);
      }
    }
    if (this.pending.size) this._schedule();
  };

  Engine.prototype._schedule = function () {
    if (this.scheduled || !this.running) return;
    this.scheduled = 1;
    var self = this;
    var wait = this.cfg.adv.debounce;
    /* عمداً از requestIdleCallback و requestAnimationFrame استفاده نمی‌کنیم:
     * هر دو در تب پنهان، پنجره‌ی پوشیده یا پنجره‌ی بدون فوکوس متوقف می‌شوند و
     * پردازش را برای همیشه معلق می‌گذارند. تقسیم کار به برش‌های budgetMs
     * (با yield به حلقه‌ی رویداد بین برش‌ها) خودش از افتادن فریم جلوگیری می‌کند. */
    this.timer = setTimeout(function () {
      self.timer = 0;
      self._flush();
    }, wait > 0 ? wait : 0);
  };

  Engine.prototype._flush = function (deadline) {
    this.scheduled = 0;
    if (!this.running) return;
    var t0 = now();
    var budget = this.cfg.adv.budgetMs;
    var hasDeadline = deadline && typeof deadline.timeRemaining === 'function';

    var jobs = [];
    if (this.fullPass) {
      this.fullPass = false;
      var self = this;
      this.roots.forEach(function (r) {
        jobs.push(r);
      });
      this.pending.clear();
    } else {
      this.pending.forEach(function (n) {
        jobs.push(n);
      });
      this.pending.clear();
    }

    var i = 0;
    for (; i < jobs.length; i++) {
      this._process(jobs[i]);
      var over = hasDeadline ? deadline.timeRemaining() <= 1 : now() - t0 > budget;
      if (over && i + 1 < jobs.length) {
        for (var k = i + 1; k < jobs.length; k++) this.pending.add(jobs[k]);
        break;
      }
    }

    this.stats.passes++;
    this.stats.ms += now() - t0;
    if (this.pending.size) this._schedule();
  };

  /* ------------------------------------------------------------ processing */

  Engine.prototype._isGuard = function (el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return true;
    if (this.cfg.typo.keepCodeLtr && (tag === 'PRE' || tag === 'CODE' || tag === 'KBD' || tag === 'SAMP')) return true;
    if (!this.guardSel) return false;
    try {
      return el.matches(this.guardSel);
    } catch (e) {
      return false;
    }
  };

  /** آیا این عنصر یک کنترل رابط کاربری است؟ (دکمه، تب، سوئیچ، …) */
  Engine.prototype._isUi = function (el) {
    if (!el || el.nodeType !== 1) return false;
    if (UI_TAGS[el.tagName]) return true;
    var role = el.getAttribute && el.getAttribute('role');
    return !!(role && UI_ROLES[role]);
  };

  Engine.prototype._insideGuard = function (el) {
    var hops = 0;
    var node = el;
    while (node && node.nodeType === 1 && hops++ < 40) {
      if (this._isGuard(node)) return true;
      if (node.className && typeof node.className === 'string' && EDITABLE_HOSTS.test(node.className)) return true;
      node = node.parentElement || (node.parentNode && node.parentNode.host) || null;
    }
    return false;
  };

  Engine.prototype._isBlock = function (el) {
    var tag = el.tagName;
    if (BLOCK_TAGS[tag]) return true;
    if (BLOCK_TAGS[tag] === 0) return false;
    try {
      var d = getComputedStyle(el).display;
      return d !== 'inline' && d !== 'contents' && d !== 'none';
    } catch (e) {
      return false;
    }
  };

  /** یافتن نزدیک‌ترین لنگر معتبر برای یک گره‌ی متنی (با حافظه‌ی موقت هر پویش) */
  Engine.prototype._anchorFor = function (textNode, cache) {
    var start = textNode.parentElement;
    if (!start) return null;
    if (cache && cache.has(start)) return cache.get(start);

    var el = start;
    var best = null;
    var hops = 0;
    var maxHops = 14;
    var found = null;

    while (el && el.nodeType === 1 && hops++ < maxHops) {
      var tag = el.tagName;
      if (NEVER_ANCHOR[tag]) break;
      if (this._isGuard(el)) break;
      if (tag === 'BODY') break;

      if (this.anchorSel) {
        try {
          if (el.matches(this.anchorSel)) {
            found = el;
            break;
          }
        } catch (e) {}
      }
      if (!best && this._isBlock(el)) best = el;

      var next = el.parentElement;
      if (!next && el.parentNode && el.parentNode.nodeType === 11 && el.parentNode.host) {
        next = el.parentNode.host; // عبور از مرز Shadow
      }
      el = next;
    }

    var result = found || best;
    if (cache) cache.set(start, result);
    return result;
  };

  /**
   * پردازش یک زیردرخت: پیمایش، تحلیل و نشانه‌گذاری دسته‌ای.
   * @param {Node} node ریشه‌ی پیمایش (Document | ShadowRoot | Element)
   */
  Engine.prototype._process = function (node) {
    if (!node) return;
    if (node.nodeType === 1 && !node.isConnected) return;

    var startEl = node.nodeType === 9 ? node.body || node.documentElement : node;
    if (!startEl) return;

    if (node.nodeType === 1 && this._insideGuard(node)) return;

    var doc = startEl.ownerDocument || this.doc;
    var self = this;

    /* پیش‌بررسی ارزان: اگر در کل این زیردرخت هیچ حرف راست‌به‌چپی نیست، مرحله‌ی
     * تحلیل متن رد می‌شود. برای body/html این میان‌بر را نمی‌زنیم، چون ساختن
     * textContent کل صفحه خودش گران‌تر از پیمایش است. */
    var scanText = true;
    if (startEl.nodeType === 1 && startEl.tagName !== 'BODY' && startEl.tagName !== 'HTML') {
      var tc = startEl.textContent;
      scanText = !!tc && Bidi.hasRtl(tc);
      if (!scanText) {
        // متن فارسی حذف شده؟ نشانه‌های کهنه را برمی‌داریم
        if (startEl.getAttribute(ATTR)) {
          startEl.removeAttribute(ATTR);
          this.marked.delete(startEl);
          this.state.delete(startEl);
        }
        var stale = startEl.querySelectorAll('[' + ATTR + ']');
        for (var z = 0; z < stale.length; z++) {
          stale[z].removeAttribute(ATTR);
          this.marked.delete(stale[z]);
          this.state.delete(stale[z]);
        }
      }
    }

    // ---- مرحله‌ی خواندن ----
    var aggs = new Map(); // anchor → {rtl, ltr, first, any}
    var anchorCache = new Map(); // parentElement → anchor (در همین پویش)
    var inputEls = [];
    var shadowHosts = [];

    var tw;
    try {
      tw = doc.createTreeWalker(startEl, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (n.nodeType === 3) return NodeFilter.FILTER_ACCEPT;
          if (self._isGuard(n)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
    } catch (e) {
      return;
    }

    // خود startEl هم باید بررسی شود (TreeWalker از فرزندان شروع می‌کند)
    if (startEl.nodeType === 1) {
      if (startEl.shadowRoot) shadowHosts.push(startEl);
      if (this.cfg.inputs && this._isInputish(startEl)) inputEls.push(startEl);
    }

    var cur;
    var seen = 0;
    while ((cur = tw.nextNode())) {
      if (++seen > 60000) break; // سپر ایمنی روی صفحات غول‌آسا
      if (cur.nodeType === 1) {
        if (cur.shadowRoot) shadowHosts.push(cur);
        if (this.cfg.inputs && this._isInputish(cur)) inputEls.push(cur);
        continue;
      }
      if (!scanText) continue;
      var text = cur.nodeValue;
      if (!text || text.length < 2) continue;
      /* هر دو سوی متن شمرده می‌شود — از جمله قطعه‌های تماماً لاتین درون همان
       * بلوک — وگرنه نسبت به‌سمت فارسی می‌لنگد و آستانه بی‌معنا می‌شود. */
      var c = Bidi.count(text);
      if (!c.rtl && !c.ltr) continue;
      var anchor = this._anchorFor(cur, anchorCache);
      if (!anchor) continue;
      var agg = aggs.get(anchor);
      if (!agg) {
        agg = { rtl: 0, ltr: 0, first: null, any: false };
        aggs.set(anchor, agg);
      }
      agg.rtl += c.rtl;
      agg.ltr += c.ltr;
      if (!agg.first) agg.first = c.first;
      if (c.rtl) agg.any = true;
    }

    // ---- مرحله‌ی نوشتن ----
    var opt = { mode: this.cfg.mode, threshold: this.cfg.threshold };
    aggs.forEach(function (agg, anchor) {
      if (!agg.any) return; // بلوک بدون هیچ حرف فارسی: کاری نداریم
      var dir = Bidi.decide(agg, opt);
      if (dir !== 'rtl') {
        // ممکن است پیش‌تر فارسی بوده و حالا با افزودن متن لاتین اکثریت عوض شده
        if (anchor.getAttribute(ATTR)) {
          anchor.removeAttribute(ATTR);
          self.marked.delete(anchor);
          self.state.delete(anchor);
        }
        return;
      }
      // کنترل‌های رابط کاربری فقط جهت می‌گیرند، نه تراز
      var role = self._isUi(anchor) ? 'rtl-ui' : 'rtl';
      var sig = agg.rtl * 31 + agg.ltr;
      var st = self.state.get(anchor);
      if (st && st.dir === role && st.sig === sig) return;
      self.state.set(anchor, { dir: role, sig: sig });
      if (anchor.getAttribute(ATTR) !== role) {
        anchor.setAttribute(ATTR, role);
        self.marked.add(anchor);
        self.stats.marked++;
      }
      if (role === 'rtl' && self.cfg.typo.isolateInline) self._markLtrIslands(anchor);
    });

    for (var q = 0; q < inputEls.length; q++) this._markInput(inputEls[q]);

    if (this.cfg.adv.pierceShadow) {
      for (var s = 0; s < shadowHosts.length; s++) {
        var sr = shadowHosts[s].shadowRoot;
        if (sr) this.registerRoot(sr);
      }
    }
  };

  /** جزیره‌های لاتین: بلوک‌های تماماً لاتین درون یک بلوک فارسی چپ‌چین می‌شوند */
  Engine.prototype._markLtrIslands = function (anchor) {
    var kids;
    try {
      kids = anchor.querySelectorAll(':scope > p, :scope > li, :scope > div, :scope > td, :scope > blockquote');
    } catch (e) {
      return;
    }
    for (var i = 0; i < kids.length && i < 80; i++) {
      var k = kids[i];
      if (this._isGuard(k)) continue;
      var txt = k.textContent;
      if (!txt || txt.length < 8 || txt.length > 4000) continue;
      if (Bidi.hasRtl(txt)) {
        if (k.getAttribute(ATTR) === 'ltr') {
          k.removeAttribute(ATTR);
          this.marked.delete(k);
        }
        continue;
      }
      var c = Bidi.count(txt);
      if (c.ltr >= 6 && k.getAttribute(ATTR) !== 'ltr') {
        k.setAttribute(ATTR, 'ltr');
        this.marked.add(k);
      }
    }
  };

  /* ---------------------------------------------------------------- inputs */

  Engine.prototype._isInputish = function (el) {
    var tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      return t === 'text' || t === 'search' || t === 'email' || t === 'url' || t === 'tel' || t === 'password';
    }
    var ce = el.getAttribute && el.getAttribute('contenteditable');
    if (ce === 'true' || ce === '') return true;
    if (el.getAttribute && el.getAttribute('role') === 'textbox') return true;
    return false;
  };

  /**
   * فیلدهای ورودی با unicode-bidi:plaintext مدیریت می‌شوند؛ یعنی مرورگر
   * برای هر خط، جهت را از اولین حرف قوی همان خط می‌گیرد. این کار هزینه‌ی
   * JS در هر ضربه‌ی کلید را صفر می‌کند و برای متن مخلوط دقیق‌تر است.
   */
  Engine.prototype._markInput = function (el) {
    if (this.inputs.has(el)) return;
    if (this._insideGuard(el)) return;
    this.inputs.add(el);
    try {
      el.setAttribute(ATTR_INPUT, '1');
      // dir=auto مکمل plaintext است و برای placeholder و caret کمک می‌کند
      var d = el.getAttribute('dir');
      if (!d) el.setAttribute('dir', 'auto');
    } catch (e) {}
  };

  Engine.prototype._onFocusIn = function (ev) {
    if (!this.running || !this.cfg.inputs) return;
    var t = ev.target;
    if (t && t.nodeType === 1 && this._isInputish(t)) this._markInput(t);
  };

  Engine.prototype._onInput = function (ev) {
    if (!this.running || !this.cfg.inputs) return;
    var t = ev.target;
    if (!t || t.nodeType !== 1) return;
    if (this._isInputish(t)) {
      this._markInput(t);
      return;
    }
    var host = t.closest ? t.closest('[contenteditable="true"],[role="textbox"]') : null;
    if (host) this._markInput(host);
  };

  /* ----------------------------------------------------------------- info */

  Engine.prototype.report = function () {
    return {
      running: this.running,
      marked: this.stats.marked,
      live: this.marked.size,
      roots: this.roots.size,
      passes: this.stats.passes,
      ms: Math.round(this.stats.ms),
      profile: this.profile ? this.profile.id : null
    };
  };

  PWM.Engine = Engine;
})(typeof self !== 'undefined' ? self : globalThis);

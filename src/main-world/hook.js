/* ============================================================================
 * PWM · main-world/hook.js
 * در «دنیای اصلی» صفحه (MAIN world) اجرا می‌شود، پیش از اسکریپت‌های سایت.
 * دو کار انجام می‌دهد:
 *   ۱) Shadow Root های closed را باز می‌کند تا Content Script بتواند آن‌ها را
 *      استایل بدهد (Angular Material، YouTube، Reddit و … از closed استفاده
 *      می‌کنند و بدون این کار متن درونشان هرگز راست‌چین نمی‌شود).
 *   ۲) هر Shadow Root تازه‌ساخته را با یک رویداد سبک به موتور اطلاع می‌دهد،
 *      تا نیازی به پیمایش دوره‌ای کل صفحه برای یافتن Shadow Host ها نباشد.
 *
 * نکته: چون در MAIN world هستیم، به chrome.* دسترسی نداریم؛ تنها راه ارتباط،
 * رویداد DOM است. برای رعایت حریم صفحه هیچ داده‌ای از محتوا خوانده نمی‌شود.
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.__pwmHooked) return;
  window.__pwmHooked = true;

  var EVT = 'pwm:shadow';
  var proto = Element.prototype;
  var native = proto.attachShadow;
  if (typeof native !== 'function') return;

  function notify(host) {
    try {
      host.dispatchEvent(new CustomEvent(EVT, { bubbles: true, composed: true }));
    } catch (e) {
      /* بی‌اهمیت */
    }
  }

  try {
    proto.attachShadow = function (init) {
      var opts = init || {};
      var forced = false;
      if (opts.mode === 'closed') {
        // یک کپی می‌سازیم تا شیء تنظیمات خودِ سایت دست‌نخورده بماند
        opts = { mode: 'open' };
        for (var k in init) if (k !== 'mode') opts[k] = init[k];
        forced = true;
      }
      var sr = native.call(this, opts);
      if (forced) {
        // مراجع مستقیم سایت به shadowRoot را نمی‌شکنیم؛ فقط دسترسی می‌دهیم
        try {
          Object.defineProperty(this, '__pwmForcedOpen', { value: true, configurable: true });
        } catch (e) {}
      }
      notify(this);
      return sr;
    };
    // امضای تابع را طبیعی نگه می‌داریم تا کدهای حساس به toString نشکنند
    try {
      Object.defineProperty(proto.attachShadow, 'name', { value: 'attachShadow' });
      proto.attachShadow.toString = function () {
        return 'function attachShadow() { [native code] }';
      };
    } catch (e) {}
  } catch (e) {
    /* اگر سایت prototype را قفل کرده باشد، بی‌صدا رد می‌شویم */
  }

  /* Shadow Root هایی که پیش از این هوک ساخته شده‌اند (نادر، اما ممکن) */
  try {
    var walk = function (r, depth) {
      if (depth > 6) return;
      var all = r.querySelectorAll('*');
      for (var i = 0; i < all.length && i < 4000; i++) {
        if (all[i].shadowRoot) {
          notify(all[i]);
          walk(all[i].shadowRoot, depth + 1);
        }
      }
    };
    if (document.documentElement) walk(document, 0);
  } catch (e) {}
})();

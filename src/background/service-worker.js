/* ============================================================================
 * PWM · background/service-worker.js  (ES module)
 * وظایف: نگه‌داشتن وضعیت آیکن هر تب، منوی راست‌کلیک، کلیدهای میان‌بر،
 * تزریق به تب‌های بازِ موجود پس از نصب/به‌روزرسانی، و انتقال پیام‌ها.
 *
 * توجه: در این نسخه هیچ قاعده‌ی declarativeNetRequest و هیچ دست‌کاری در هدر
 * امنیتی سایت‌ها (CSP) وجود ندارد؛ فونت به‌صورت ArrayBuffer با FontFace API
 * بارگذاری می‌شود و بنابراین نیازی به تضعیف امنیت صفحه نیست.
 * ==========================================================================*/
import '../core/bidi.js';
import '../core/sites.js';
import '../core/settings.js';

const PWM = self.PWM;
const { Settings, Sites } = PWM;

const CONTENT_FILES = [
  'src/core/bidi.js',
  'src/core/sites.js',
  'src/core/settings.js',
  'src/core/css.js',
  'src/content/engine.js',
  'src/content/boot.js'
];
const CONTENT_CSS = ['src/content/base.css'];
const MAIN_FILES = ['src/main-world/hook.js'];

/* ------------------------------------------------------------------ helpers */

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') return null;
    return u.hostname;
  } catch (e) {
    return null;
  }
}

async function stateFor(url) {
  const host = hostOf(url);
  if (!host) return null;
  const s = await Settings.load();
  return Settings.effective(s, host);
}

async function paintBadge(tabId, url) {
  const eff = await stateFor(url);
  try {
    if (!eff) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    const s = await Settings.load();
    if (!s.adv.badge) {
      await chrome.action.setBadgeText({ tabId, text: '' });
    } else {
      await chrome.action.setBadgeText({ tabId, text: eff.active ? 'ON' : '' });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: eff.active ? '#6366f1' : '#475569' });
    }
    const suffix = eff.active ? '' : '-off';
    await chrome.action.setIcon({
      tabId,
      path: {
        16: `icons/icon16${suffix}.png`,
        32: `icons/icon32${suffix}.png`,
        48: `icons/icon48${suffix}.png`,
        128: `icons/icon128${suffix}.png`
      }
    });
    const label = eff.profile.known ? eff.profile.label : eff.host;
    await chrome.action.setTitle({
      tabId,
      title: `Persian Web Mixer — ${label} · ${eff.active ? 'فعال' : 'خاموش'}`
    });
  } catch (e) {
    /* تب ممکن است بسته شده باشد */
  }
}

async function paintActive() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.id != null) await paintBadge(tab.id, tab.url || '');
  } catch (e) {}
}

function tell(tabId, msg) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (res) => {
        void chrome.runtime.lastError;
        resolve(res || null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

/* --------------------------------------------------------------- injection */

/** تزریق دستی به تب‌هایی که پیش از نصب/به‌روزرسانی باز بوده‌اند */
async function injectExistingTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  } catch (e) {
    return;
  }
  let ok = 0;
  for (const tab of tabs) {
    if (tab.id == null) continue;
    const alive = await tell(tab.id, { type: 'pwm:ping' });
    if (alive && alive.ok) continue;
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id, allFrames: true }, files: CONTENT_CSS });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: MAIN_FILES,
        world: 'MAIN'
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: CONTENT_FILES
      });
      ok++;
    } catch (e) {
      /* صفحاتی مثل chrome:// یا فروشگاه وب قابل تزریق نیستند */
    }
  }
  return ok;
}

/* ------------------------------------------------------------ context menu */

const MENUS = [
  { id: 'pwm-toggle-site', title: 'روشن/خاموش برای این سایت' },
  { id: 'pwm-rescan', title: 'پویش دوباره‌ی این صفحه' },
  { id: 'pwm-sep', type: 'separator' },
  { id: 'pwm-mode-smart', title: 'حالت هوشمند (نسبت‌محور)', type: 'radio', group: 'mode' },
  { id: 'pwm-mode-auto', title: 'حالت خودکار (اولین حرف)', type: 'radio', group: 'mode' },
  { id: 'pwm-mode-force', title: 'حالت سخت‌گیر (هر متن فارسی)', type: 'radio', group: 'mode' },
  { id: 'pwm-sep2', type: 'separator' },
  { id: 'pwm-options', title: 'تنظیمات پیشرفته…' }
];

async function buildMenus() {
  try {
    await chrome.contextMenus.removeAll();
    const s = await Settings.load();
    for (const m of MENUS) {
      const item = {
        id: m.id,
        contexts: ['page', 'selection', 'editable', 'action'],
        title: m.title,
        type: m.type === 'separator' ? 'separator' : m.type === 'radio' ? 'radio' : 'normal'
      };
      if (m.type === 'separator') delete item.title;
      if (m.type === 'radio') item.checked = s.mode === m.id.replace('pwm-mode-', '');
      chrome.contextMenus.create(item, () => void chrome.runtime.lastError);
    }
  } catch (e) {}
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const host = tab ? hostOf(tab.url || '') : null;
  switch (info.menuItemId) {
    case 'pwm-toggle-site':
      if (host) await toggleSite(host);
      break;
    case 'pwm-rescan':
      if (tab && tab.id != null) await tell(tab.id, { type: 'pwm:rescan' });
      break;
    case 'pwm-mode-smart':
    case 'pwm-mode-auto':
    case 'pwm-mode-force':
      await Settings.patch({ mode: String(info.menuItemId).replace('pwm-mode-', '') });
      break;
    case 'pwm-options':
      chrome.runtime.openOptionsPage();
      break;
    default:
      break;
  }
});

/* -------------------------------------------------------------- operations */

async function toggleSite(host) {
  const s = await Settings.load();
  const eff = Settings.effective(s, host);
  const h = Sites.normalizeHost(host);
  const ov = (s.sites && s.sites[h]) || null;
  // اگر بازنویسی صریح داریم، برعکسش می‌کنیم؛ وگرنه عکس وضعیت فعلی را می‌نویسیم
  const next = ov && typeof ov.enabled === 'boolean' ? !ov.enabled : !eff.active;
  await Settings.patchSite(h, { enabled: next });
  return next;
}

async function toggleGlobal() {
  const s = await Settings.load();
  await Settings.save(Object.assign({}, s, { enabled: !s.enabled }));
  return !s.enabled;
}

/* ------------------------------------------------------------------ events */

chrome.runtime.onInstalled.addListener(async (details) => {
  const s = await Settings.load();
  await Settings.save(s); // نرمال‌سازی و مهاجرت از نسخه‌ی ۳
  await buildMenus();
  await injectExistingTabs();
  await paintActive();
  if (details.reason === 'install') {
    try {
      chrome.runtime.openOptionsPage();
    } catch (e) {}
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await buildMenus();
  await paintActive();
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'loading' || info.url) paintBadge(tabId, tab.url || info.url || '');
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await paintBadge(tabId, tab.url || '');
  } catch (e) {}
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[Settings.KEY]) return;
  paintActive();
  buildMenus();
});

chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const host = tab ? hostOf(tab.url || '') : null;
  if (cmd === 'toggle-site' && host) await toggleSite(host);
  else if (cmd === 'toggle-global') await toggleGlobal();
  else if (cmd === 'rescan' && tab && tab.id != null) await tell(tab.id, { type: 'pwm:rescan' });
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg.type !== 'string') return;
  switch (msg.type) {
    case 'pwm:state':
      if (sender.tab && sender.tab.id != null && sender.frameId === 0) {
        paintBadge(sender.tab.id, sender.tab.url || '');
      }
      return;
    case 'pwm:toggle-site':
      toggleSite(msg.host).then((v) => reply({ ok: true, enabled: v }));
      return true;
    case 'pwm:toggle-global':
      toggleGlobal().then((v) => reply({ ok: true, enabled: v }));
      return true;
    case 'pwm:inject-existing':
      injectExistingTabs().then((n) => reply({ ok: true, injected: n }));
      return true;
    case 'pwm:open-options':
      chrome.runtime.openOptionsPage();
      reply({ ok: true });
      return true;
    default:
      return;
  }
});

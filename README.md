<div align="center">

<img src="icons/icon128.png" width="76" alt="">

# Persian Web Mixer

### Smart RTL for Persian and Arabic text — everywhere on the web

Detects Persian/Arabic text on any page and right-aligns **only that text**.<br>
Your code blocks, math, icons, buttons and the site's own layout stay exactly as they were.

[![Manifest V3](https://img.shields.io/badge/manifest-V3-6366f1?style=flat-square)](manifest.json)
[![Tests](https://img.shields.io/badge/tests-169_unit_+_120_browser-22c55e?style=flat-square)](test/)
[![Network requests](https://img.shields.io/badge/network_requests-zero-0ea5e9?style=flat-square)](#privacy-and-permissions)
[![Size](https://img.shields.io/badge/download-452_KB-a855f7?style=flat-square)](../../releases/latest)
[![License](https://img.shields.io/badge/license-MIT-64748b?style=flat-square)](LICENSE)

[**Install**](#install) · [Why it's different](#the-problem-with-most-rtl-extensions) · [Features](#features) · [Privacy](#privacy-and-permissions) · [How it works](#how-it-works) · [فارسی](README.fa.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/hero-dark.png">
  <img src="docs/hero.png" width="900" alt="The same Persian chat page shown twice. Left, without the extension: paragraphs are flush left, sentence-final punctuation is stranded at the start of each line, and the ordered-list numbers sit detached from their items. Right, with Persian Web Mixer: the paragraphs are flush right, punctuation resolves at the correct end, and the list numbers sit against their items — while the Python code block stays left-to-right and byte-identical in both.">
</picture>

</div>

---

## Install

Takes about a minute. No build step, no dependencies, no sign-in — it's plain JavaScript and the fonts are bundled.

**1. Get the files.** Either download and unzip [the latest release](../../releases/latest), or clone:

```bash
git clone https://github.com/MineyBot/SmartAutoPersianRTL.git
```

Put the folder somewhere permanent — `Documents`, not `Downloads`. Chromium loads an unpacked extension **by path**, so moving or deleting the folder later uninstalls it.

**2. Open the extensions page.** Type `chrome://extensions` in the address bar — or `edge://extensions`, `brave://extensions`, `opera://extensions`. Links don't work here; you have to type it.

**3. Turn on Developer mode** (top-right toggle).

**4. Click "Load unpacked"** and pick the folder that has `manifest.json` **directly inside it**. This is the one step people get wrong: if your unzipper created a wrapper folder, open it first and select the inner one. Chromium will say *"Manifest file is missing or unreadable"* if you're one level too high.

That's it. The settings page opens by itself after a few seconds.

### Check it worked — 60 seconds

1. Open any Persian page — [fa.wikipedia.org](https://fa.wikipedia.org) is a good one. Paragraphs should sit flush right.
2. Click the toolbar icon. The popup should name the current site and show a live block count — `۴۸ بلوک · ۱ ریشه · ۱۲ م‌ث` (blocks · roots · milliseconds).
3. Open a page with code in it, e.g. a Persian question on Stack Overflow. **The code stays left-to-right.** That's the whole point of the extension — if code flipped, something's wrong, so please [file an issue](../../issues).

Worth doing once: right-click the toolbar icon → **Pin**, so the switch is always one click away.

> **The extension's own UI is in Persian.** Only the name and store description are translated; the popup and Settings page are Persian-only regardless of your browser language. Everything is labelled and grouped, but if you don't read Persian this README is your map.

### Two optional extras

**Local files.** To make it work on `file:///…` pages, open `chrome://extensions`, click **Details** on Persian Web Mixer, and turn on **Allow access to file URLs**. Off by default — Chromium's choice, not ours. (Verified working once granted.)

**Shortcuts.** `Alt`+`Shift`+`R` toggles the current site, `Alt`+`Shift`+`E` is the master switch, `Alt`+`Shift`+`P` rescans. Remap at `chrome://extensions/shortcuts`.

### Staying up to date

```bash
git pull
```

Then hit the ⟳ **reload** button on the extension's card. Your settings survive — mode, threshold, per-site rules and custom selectors are all preserved across a reload (tested, not assumed). If you installed from a zip, replace the folder's contents and reload the same way.

### If something's off

| Symptom | Cause and fix |
|---|---|
| *"Manifest file is missing or unreadable"* | You selected a parent folder. Pick the one containing `manifest.json`. |
| Nothing happens on a page that was already open | Content scripts only attach on load. Reload the tab, or use Settings → Advanced → **Inject into open tabs**. |
| That button says "0 tabs activated" | Not a failure — it means every open tab was already running the extension, and it skips those. |
| Popup shows "internal page" | You're on `chrome://`, the Web Store, or a PDF viewer. No extension can touch those; switch to a normal page. |
| Extension vanished after a restart | The folder moved, got renamed, or was deleted. Unpacked extensions are path-bound — put it back or load it again. |
| A site right-aligns the wrong thing | Turn on Settings → Advanced → **Debug mode**; every block the engine touched gets a coloured outline. Then either fix it yourself with [custom selectors](#custom-selectors) or open an issue with that screenshot. |

> Chrome, Edge, Brave, Opera, Vivaldi — any Chromium **111 or newer**. Not Firefox: its extension API differs enough that this would need a separate port.

---

## The problem with most RTL extensions

The common approach is one rule: *if the text contains a Persian letter, right-align it.* One rule, four bugs you'll hit in your first minute:

| Input | The naive rule does | What should happen |
|---|---|---|
| `The word سلام means hello in Persian` | flips the whole paragraph | leave it — it's an English sentence |
| `۱۲۳۴۵` | right-aligns it | digits are **neutral**; don't touch |
| `def sort(a):  # مرتب‌سازی` | mirrors your code | code is always left-to-right |
| A button labelled `ذخیره` | label jumps to one edge | fix the direction, keep the alignment |

Persian Web Mixer counts **strong directional characters** the way the Unicode bidi algorithm does. Digits (Latin, Arabic-Indic and Persian), punctuation, emoji and ZWNJ are neutral — they don't get a vote. Then it decides per block, not per page.

### Three detection modes

| Mode | Rule | Best for |
|---|---|---|
| **Smart** — default | Persian letters ÷ all letters ≥ threshold (30%) | mixed Persian/English content: chats, docs, code review |
| **Auto** | direction of the first strong letter | standard Unicode behaviour |
| **Strict** | any Persian letter means RTL | fully-Persian sites, when you want zero misses |

The threshold is a slider. And if you're ever unsure why a paragraph was or wasn't flipped, the **Lab** tab shows the engine's actual decision — letter counts, ratio, first strong character — for any text you paste:

<div align="center"><img src="docs/lab.png" width="720" alt="The Lab tab in Settings: a textarea with Persian input, and readouts showing the engine's decision, Persian letter count, Latin letter count, ratio, and which direction the first strong letter had."></div>

---

## Features

### 27 site profiles

Generic RTL extensions grab whatever element happens to contain the text — often a `<span>` three levels too deep, so half a sentence flips and the other half doesn't. This one knows what a message bubble actually is on each site, and which regions to never touch.

**AI chats** — ChatGPT · Claude · Gemini · Google AI Studio · DeepSeek · Grok · Perplexity · Microsoft Copilot · Le Chat · NotebookLM · Poe · Kimi · Qwen · Z.ai · OpenRouter

**Everywhere else** — GitHub · GitLab · Wikipedia · Stack Overflow · Reddit · YouTube · X · Discord · Telegram Web · WhatsApp Web · Notion · Medium / Dev.to / Substack / Virgool

Sites without a profile fall back to a generic one that still works — the extension isn't limited to this list. Adding a profile is ~8 lines of config; see [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-site-profile).

### Shadow DOM, including closed roots

Angular Material, YouTube and Reddit render inside Shadow DOM, and some of it is `mode: 'closed'` — completely invisible to a normal content script, which is why Persian text inside those components never gets fixed. A hook in the page's main world at `document_start` opens them and announces new roots by event, so there's no polling loop burning CPU.

### Inputs that behave

Text fields get `unicode-bidi: plaintext` and `dir="auto"`, which hands the decision to the browser **per line**. Type Persian, get RTL. Start the next line in English, get LTR. No JavaScript runs on your keystrokes.

### Typography you control

Line height, letter/word/paragraph spacing, justification, list indent, blockquote side, table mirroring. Four bundled [Vazirmatn](https://github.com/rastikerdar/vazirmatn) variants (variable, Persian digits, Persian-only, round-dots), your own font by upload, and 70–160% sizing.

<div align="center">
<img src="docs/popup.png" width="272" alt="The extension popup: master switch, per-site switch, three detection modes, threshold slider, font chips, size slider, typography toggles, and a live Persian preview."> &nbsp;&nbsp; <img src="docs/options.png" width="530" alt="The Settings page, General tab: activity scope, the three detection modes with descriptions, threshold slider, and the font section showing four bundled Vazirmatn variants.">
</div>

### Per-site control

Switch any domain on or off on its own, or give it a different mode and font. Three scopes decide the default: every site, known sites only, or AI chatbots only.

<a id="custom-selectors"></a>

### Custom selectors — teach it any site

The 27 profiles cover the sites people use most, but the web is bigger than any list. Settings → Sites lets you add your own selectors per domain:

| Field | Meaning |
|---|---|
| **Anchors** | treat these elements as text blocks — use it when a site wraps messages in a `<div>` the generic list doesn't reach |
| **Guards** | never touch these — use it for charts, custom code viewers, icon fonts |

Turn on Debug mode first and the engine outlines what it selected, so you can read the class off the page and paste it in. Guards win over anchors, invalid selectors are rejected before they're saved (with a live report telling you which line failed), and **Test on active tab** counts how many elements each selector actually matches before you commit. Changes apply to open pages immediately — no reload.

<div align="center"><img src="docs/selectors.png" width="620" alt="The custom selector editor: a domain picker, an anchors textarea holding .message-body and article .content, a guards textarea holding .sidebar and .chart-container, a green line confirming all 4 selectors are valid, and buttons to save, test on the active tab, or clear."></div>

### Settings that follow you

Settings live in `storage.sync`, so anything you configure on one machine shows up on every other browser signed into the same account. An uploaded font stays local — it's around 145 KB and the per-item sync quota is 8 KB. If sync isn't available (not signed in, quota full), it silently falls back to local storage instead of losing your settings, and the Settings page tells you which state you're in.

### Shortcuts and quick access

| Shortcut | Action |
|---|---|
| <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>R</kbd> | toggle the current site |
| <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>E</kbd> | master switch |
| <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>P</kbd> | rescan the page |

Remap at `chrome://extensions/shortcuts`. There's a right-click menu too, and the toolbar icon greys out wherever the extension is off.

---

## Privacy and permissions

- **Zero network requests.** Fonts ship inside the extension; nothing is fetched at runtime, ever.
- **Nothing leaves your browser.** No telemetry, no analytics, no page content read out or logged.
- **Your site's security is untouched.** No `declarativeNetRequest`, no header rewriting. (Details in [design decision 3](#fonts).)
- The only thing stored is your own settings — in `storage.sync` so they follow your browser account, with an uploaded font kept in `storage.local` because it exceeds the sync quota. Either way, it stays inside your browser.

| Permission | Why |
|---|---|
| `storage` | save your settings |
| `scripting` | activate tabs that were already open when you installed or updated |
| `contextMenus` | the right-click menu |
| `<all_urls>` | read text on whichever page you're currently on |

---

## How it works

```
src/core/            pure logic — no chrome.*, no DOM at load time
  bidi.js            direction detection by strong-character counting
  sites.js           27 site profiles: anchors, guards, input selectors
  settings.js        schema, validation, v3→v5 migration, per-domain config
  css.js             stylesheet generation + Constructable Stylesheet injection
src/content/
  engine.js          incremental DOM walk, marking, Shadow DOM management
  boot.js            startup, font loading, messaging
src/main-world/      attachShadow hook (MAIN world, document_start)
src/background/      service worker: badge, context menu, commands, injection
src/popup/           popup UI
src/options/         settings page — 6 tabs + the detection Lab
```

The `core/` files are deliberately dependency-free, so the same code runs in the content script, the popup, the settings page, the service worker **and** under Node in the test suite. That's why the detection logic can be tested without a browser at all.

### Four design decisions worth explaining

#### 1. Marking with a data attribute, not a CSS class

The engine sets `data-pwm-dir="rtl"` on a block. A class name would collide with the site's own classes and survive incomplete cleanup; an attribute sweep (`querySelectorAll('[data-pwm-dir]')`) guarantees the page returns to *exactly* its original state the moment you switch off.

#### 2. `text-align: start`, not `text-align: right`

With `start` plus `direction: inherit` on descendants, a Latin island inside a Persian paragraph aligns correctly on its own. Logical properties (`padding-inline-start`, `border-inline-start`) then mirror lists and blockquotes for free, in both directions.

<a id="fonts"></a>

#### 3. Fonts through `FontFace` + `ArrayBuffer`, not `@font-face { src: url() }`

The font is read as bytes and handed to `document.fonts`, which makes the page's `font-src` policy irrelevant. Extensions that inject a font by URL usually can't load it on strict sites, so they **strip the site's `Content-Security-Policy` header** to make it work — silently weakening the security of every page you visit. This extension never touches a response header, and the `declarativeNetRequest` permission is gone from the manifest entirely.

Bonus: a font added to `document.fonts` is visible inside every Shadow Root, so no per-root injection is needed.

#### 4. Incremental, time-sliced processing

Only the subtree of changed nodes is queued. Work runs in `budgetMs` slices that yield to the event loop between batches, and DOM reads are separated from writes to avoid layout thrashing. Scheduling deliberately avoids `requestIdleCallback` and `requestAnimationFrame`: both stall in hidden tabs, occluded windows and unfocused windows, which would leave processing frozen indefinitely.

**Measured:** 2,000 paragraphs marked in ~550 ms, page still at full frame rate.

---

## Development

```bash
npm install           # jsdom + puppeteer-core, dev only

npm test              # 169 unit tests — logic + jsdom, no browser needed
npm run test:browser  # 120 integration tests — loads the real extension
npm run pack          # → dist/persian-web-mixer-v4.1.0.zip
node tools/shots.js   # regenerate docs/*.png
```

**`test/run.js`** covers direction detection, domain matching, settings validation and clamping, CSS generation, DOM marking, Shadow DOM, complete cleanup, and bundle integrity — that every bundled font is valid WOFF2, every icon valid PNG, and every profile selector actually compiles.

**`test/browser.js`** loads the extension for real and verifies behaviour rather than implementation: visual alignment measured from a `Range` bounding box, font rendering measured by canvas text width, real keyboard input, streamed content, Shadow DOM (open, closed and nested), service-worker message round-trips, live settings changes, layout mirroring, tab switching, and throughput on 2,000 paragraphs.

> **Chrome ≥ 137 started removing `--load-extension`, and by Chrome 150 the switch is inert** — Puppeteer cannot load an unpacked extension in Chrome at all any more. The browser suite therefore runs on **Edge** by default (same Chromium engine). Override with `CHROME_PATH`.

CI runs the unit suite on every push. The browser suite needs a real window, so it stays local.

---

## Known limitations

Being straight about what this doesn't do:

- **Text direction only, not layout mirroring.** Avatars, sidebars and toolbars stay where the site put them. Mirroring a site's whole layout breaks more than it fixes, so it's off by default (there's an experimental toggle in Settings → Advanced).
- **Canvas and `<video>` text is out of reach.** Anything drawn rather than laid out — Google Docs' canvas renderer, subtitles burned into video — isn't styleable by any extension.
- **A page that already sets `dir="rtl"` correctly needs nothing**, and the extension will leave it alone. That's intended, not a miss.
- **Tabs open before install need one nudge.** Settings → Advanced → *Inject into open tabs*, or just reload them.

---

## Contributing

Bug reports with a URL and a screenshot are the most useful thing you can send. If a site flips the wrong element, turn on **Debug mode** (Settings → Advanced) — every block the engine touched gets a coloured outline, which usually identifies the culprit in one look.

Adding a site profile, running the tests, and the handful of patterns that will get a PR rejected are all in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Credits

Bundled font: [Vazirmatn](https://github.com/rastikerdar/vazirmatn) by Saber Rastikerdar, under the SIL Open Font License 1.1.

Extension code: MIT — see [LICENSE](LICENSE). Full history in [CHANGELOG.md](CHANGELOG.md).

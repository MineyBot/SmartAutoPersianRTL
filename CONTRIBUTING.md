# Contributing

## Setup

```bash
git clone <your-fork>
cd RTL-PersianWebMixer-Extension
npm install          # jsdom + puppeteer-core (dev only; the extension itself has no deps)
```

Load the folder as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked). There's no build step — edit a file, hit reload on the extensions page.

## Tests must pass before a PR

```bash
npm test              # 169 unit tests — fast, no browser
npm run test:browser  # 120 integration tests — loads the real extension
```

The browser suite runs on **Edge** by default because Chrome ≥ 137 removed `--load-extension`. Override with `CHROME_PATH=/path/to/browser`.

If you add behavior, add a test. `test/run.js` for logic, `test/browser.js` for anything that needs real layout or real `chrome.*` APIs. Both files use a tiny homegrown harness (`ok`/`eq`/`section`) — no framework.

## Adding a site profile

Site profiles live in `src/core/sites.js`. A profile answers two questions: *what is a message block here* and *what must never be touched*.

```js
{
  id: 'example',                  // unique, lowercase
  label: 'Example',               // shown in Settings
  kind: 'ai',                     // 'ai' for chatbots, 'web' for everything else
  hosts: ['example.com'],         // matched with subdomain support
  pierce: true,                   // only if the site uses Shadow DOM
  anchors: ['[data-message]', 'p', 'li'],   // block boundaries, most specific first
  guards: ['pre', '.code-block'],           // never restyle these
  inputs: ['textarea', 'div[contenteditable="true"]']
}
```

Generic anchors and guards are appended automatically, so list only what's specific to the site. Every selector is validated by `test/run.js` — an invalid one fails the suite.

To find the right anchor: open the site, turn on **Debug mode** in Settings → Advanced. Marked blocks get a colored outline, so you can see immediately whether the extension grabbed the whole message or one inner span.

## Code style

- Plain ES5-compatible JavaScript in `src/core` and `src/content` (they load as classic scripts in several contexts). The service worker is a module and can use modern syntax.
- 2-space indent, single quotes, semicolons.
- **Comments explain *why*, not *what*.** Persian comments are welcome and common in this codebase — they carry the reasoning behind a non-obvious choice. Match the density of the file you're editing.
- Commit messages: `type(scope): one lowercase sentence describing what a user would notice` — e.g. `fix(engine): a list marker no longer clips at the right edge`.

## Things that will get a PR rejected

- **Stripping or modifying a site's response headers**, especially `Content-Security-Policy`. The v3 extension did this and removing it was the point of v4.
- Using `requestIdleCallback` or `requestAnimationFrame` for scheduling in a content script — both freeze in hidden tabs, which silently breaks the extension.
- Marking with a CSS class instead of the `data-pwm-dir` attribute.
- `text-align: right` where `text-align: start` works.
- Any network request at runtime.

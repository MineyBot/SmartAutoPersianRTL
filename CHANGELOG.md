# Changelog

## 4.1.0

### Added

- **Custom selectors per domain.** Settings → Sites now takes your own anchor and guard selectors for any site, so the extension is no longer limited to its 27 built-in profiles. Selectors are validated before they're saved (braces, `@`-rules, comments, `<`, and syntactically invalid patterns are rejected, capped at 20 per list, 160 chars each), guards take precedence over anchors, and **Test on active tab** counts real matches on a live page before you commit. Changes apply to already-open tabs without a reload.
- **Settings sync across devices.** Settings moved to `storage.sync`, so they follow your browser account. An uploaded font (~145 KB) stays in `storage.local` because the per-item sync quota is 8 KB, and the two are recombined on read. If sync is unavailable — not signed in, quota exceeded — writes fall back to local storage silently rather than failing, and the Settings page reports which state you're in.

### Fixed

- **`Engine.update()` didn't rebuild its selector strings.** Anchor and guard selectors were only compiled in `start()`, so saving a custom selector had no effect on an open page until reload. The compile step is now shared by both paths.
- Invalid anchor selectors are filtered in the engine as well as at save time, so a malformed pattern reaching the engine by any route can't break `matches()` for the whole page.

## 4.0.0

Full rewrite. The old version was 988 lines; this one is ~3,900 in `src/`.

### Fixed

- **Direction detection was wrong in four ways.** v3's rule was "any Persian letter ⇒ RTL". Now the engine counts strong directional characters per Unicode's bidi algorithm, so:
  - An English paragraph containing one Persian word stays LTR.
  - Persian digits alone (`۱۲۳۴۵`) are neutral, not RTL.
  - Punctuation, emoji and ZWNJ are neutral.
  - Three modes (smart/auto/strict) plus an adjustable threshold replace the single rule.
- **The extension stripped `Content-Security-Policy` headers** on Google AI Studio to inject its font. Fonts now load as `ArrayBuffer` through `FontFace`, which is unaffected by `font-src`, so no header is touched and `declarativeNetRequest` was removed from the manifest.
- **Every DOM mutation triggered a full `document.body` walk.** On a streaming chatbot that meant hundreds of full traversals per minute. Processing is now incremental: only the changed subtree is queued, split into `budgetMs` slices.
- **Button and control labels lost their alignment.** UI controls now get a separate `rtl-ui` role: direction is corrected, alignment is left alone.
- **Marking used a CSS class** (`.rtl-processed`), which collided with site styles and left residue after toggling off. Now `data-pwm-dir`, swept clean on disable.
- Nested Latin blocks inside a Persian block are detected and kept LTR.
- Lists, blockquotes and tables mirror correctly, including the case where only the `<li>` elements are marked and the `<ul>` itself is not.

### Added

- 27 site profiles with per-site anchors and guards: ChatGPT, Claude, Gemini, Google AI Studio, DeepSeek, Grok, Perplexity, Copilot, Le Chat, NotebookLM, Poe, Kimi, Qwen, Z.ai, OpenRouter, GitHub, GitLab, Wikipedia, Stack Overflow, Reddit, YouTube, X, Discord, Telegram Web, WhatsApp Web, Notion, Medium/Dev.to/Virgool.
- Settings page: 6 tabs, per-domain rules, JSON import/export, and a **Lab** tab that shows the engine's decision and letter counts for any text.
- Shadow DOM support including `closed` roots, opened by a `MAIN`-world `attachShadow` hook that reports new roots by event instead of polling.
- Inputs handled with `unicode-bidi: plaintext` + `dir="auto"` — zero JavaScript per keystroke.
- 4 bundled Vazirmatn variants (variable, Persian digits, Persian-only, round-dots), custom font upload, 70–160% sizing.
- Typography controls: line height, letter/word/paragraph spacing, justification.
- Keyboard shortcuts, right-click menu, and a toolbar badge that greys out when disabled.
- Debug mode that outlines every block the engine touched.
- Two locales (`fa`, `en`) via `_locales`.
- 169 unit tests and 120 browser integration tests; `tools/pack.js` builds a release zip, `tools/shots.js` regenerates the README screenshots.

### Changed

- Minimum Chrome version is 111 (for `:has()` and Constructable Stylesheets in Shadow Roots).
- Settings moved from three flat `storage.local` keys to a versioned schema under one key, with automatic migration from v3.

## 3.2

Last version of the original implementation.

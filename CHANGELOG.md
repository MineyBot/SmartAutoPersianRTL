# Changelog

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
- 122 unit tests and 97 browser integration tests; `tools/pack.js` builds a release zip, `tools/shots.js` regenerates the README screenshots.

### Changed

- Minimum Chrome version is 111 (for `:has()` and Constructable Stylesheets in Shadow Roots).
- Settings moved from three flat `storage.local` keys to a versioned schema under one key, with automatic migration from v3.

## 3.2

Last version of the original implementation.

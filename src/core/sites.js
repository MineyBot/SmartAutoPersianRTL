/* ============================================================================
 * PWM · core/sites.js
 * پروفایل‌های اختصاصی سایت‌ها + منطق تطبیق دامنه.
 * هر پروفایل می‌تواند سلکتورهای «لنگر» (anchors) بدهد تا موتور، بلوک درست را
 * راست‌چین کند و نه یک <span> بی‌ربط را؛ همچنین سلکتورهای «محافظت‌شده» (guards)
 * برای بخش‌هایی که هرگز نباید دست‌کاری شوند (کد، فرمول، آیکون، نمودار).
 * ==========================================================================*/
(function (root) {
  'use strict';
  var PWM = (root.PWM = root.PWM || {});

  /* لنگرهای عمومی: در همه‌ی سایت‌ها به‌عنوان «مرز بلوک پیام» پذیرفته می‌شوند */
  var GENERIC_ANCHORS = [
    '[data-message-author-role]',
    '[data-message-id]',
    '[data-testid^="conversation-turn"]',
    '.markdown',
    '.prose',
    'article',
    'blockquote',
    'li',
    'td',
    'th',
    'dd',
    'dt',
    'figcaption',
    'summary',
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6'
  ];

  /* محافظت عمومی: هر جا این‌ها باشند، جهت و فونت دست‌نخورده می‌ماند */
  var GENERIC_GUARDS = [
    'pre',
    'code',
    'kbd',
    'samp',
    'var',
    'math',
    'svg',
    'canvas',
    'video',
    'audio',
    'iframe',
    'object',
    'embed',
    'select',
    'option',
    'optgroup',
    'progress',
    'meter',
    '.katex',
    '.katex-display',
    '.katex-html',
    '.MathJax',
    'mjx-container',
    '.math',
    '.math-inline',
    '.math-block',
    '.hljs',
    '.shiki',
    '.cm-editor',
    '.CodeMirror',
    '.monaco-editor',
    '.ace_editor',
    '.token',
    '.mermaid',
    '.highlight',
    '.language-',
    '[data-code-block]',
    '[data-lang]',
    '[class*="code-block"]',
    '[class*="syntax"]',
    '[class*="material-icons"]',
    '[class*="material-symbols"]',
    '[class*="icon-"]',
    '.fa',
    '.fas',
    '.far',
    '.fab',
    '.bi',
    '.lucide',
    'mat-icon',
    '[data-icon]',
    '[aria-hidden="true"][class*="icon"]'
  ];

  /**
   * پروفایل‌های سایت.
   * kind: 'ai' برای چت‌بات‌ها (لنگر = حباب پیام) و 'web' برای سایت‌های معمولی.
   * pierce: نیاز به نفوذ در Shadow DOM.
   * csp: نیاز به حذف هدر CSP برای تزریق فونت درون Shadow.
   */
  var PROFILES = [
    {
      id: 'chatgpt',
      label: 'ChatGPT',
      kind: 'ai',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      anchors: [
        '[data-message-author-role]',
        '[data-testid^="conversation-turn"]',
        '.markdown',
        'p',
        'li',
        'td',
        'th',
        'h1',
        'h2',
        'h3',
        'blockquote'
      ],
      guards: ['[data-testid="code-block"]', '.katex', 'pre'],
      inputs: ['#prompt-textarea', 'div[contenteditable="true"]', 'textarea']
    },
    {
      id: 'claude',
      label: 'Claude',
      kind: 'ai',
      hosts: ['claude.ai'],
      anchors: [
        '[data-testid="user-message"]',
        '.font-claude-message',
        '.font-claude-response',
        '[data-is-streaming]',
        '.prose',
        'p',
        'li',
        'td',
        'th',
        'h1',
        'h2',
        'h3',
        'blockquote'
      ],
      guards: ['pre', '.code-block__code', '[data-testid="artifact-panel"]'],
      inputs: ['div[contenteditable="true"]', '.ProseMirror']
    },
    {
      id: 'gemini',
      label: 'Gemini',
      kind: 'ai',
      hosts: ['gemini.google.com', 'bard.google.com'],
      pierce: true,
      anchors: [
        'message-content',
        'model-response',
        'user-query',
        '.markdown',
        '.query-text',
        'p',
        'li',
        'td',
        'th',
        'h1',
        'h2',
        'h3'
      ],
      guards: ['code-block', 'pre', 'ms-code-block'],
      inputs: ['.ql-editor', 'div[contenteditable="true"]', 'rich-textarea']
    },
    {
      id: 'aistudio',
      label: 'Google AI Studio',
      kind: 'ai',
      hosts: ['aistudio.google.com', 'makersuite.google.com'],
      pierce: true,
      csp: true,
      anchors: [
        'ms-chat-turn',
        'ms-text-chunk',
        'ms-cmark-node',
        'ms-prompt-chunk',
        '.turn-content',
        '.very-large-text-container',
        'p',
        'li',
        'td',
        'th',
        'h1',
        'h2',
        'h3'
      ],
      guards: ['ms-code-block', 'pre', 'code', '.cm-editor'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      kind: 'ai',
      hosts: ['chat.deepseek.com', 'deepseek.com'],
      anchors: ['.ds-markdown', '._4f9bf79', '.fbb737a4', 'p', 'li', 'td', 'th', 'h1', 'h2', 'h3'],
      guards: ['.md-code-block', 'pre'],
      inputs: ['#chat-input', 'textarea']
    },
    {
      id: 'grok',
      label: 'Grok',
      kind: 'ai',
      hosts: ['grok.com', 'x.ai'],
      anchors: ['.message-bubble', '.response-content-markdown', '.prose', 'p', 'li', 'td', 'th'],
      guards: ['pre', '.code-block'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'perplexity',
      label: 'Perplexity',
      kind: 'ai',
      hosts: ['perplexity.ai', 'www.perplexity.ai'],
      anchors: ['.prose', '[data-testid="answer"]', 'p', 'li', 'td', 'th', 'h1', 'h2', 'h3'],
      guards: ['pre', '.code-block'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'copilot',
      label: 'Microsoft Copilot',
      kind: 'ai',
      hosts: ['copilot.microsoft.com', 'bing.com'],
      pierce: true,
      anchors: ['cib-message', '.ac-textBlock', '.prose', 'p', 'li', 'td', 'th'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'mistral',
      label: 'Le Chat',
      kind: 'ai',
      hosts: ['chat.mistral.ai'],
      anchors: ['.prose', 'p', 'li', 'td', 'th', 'h1', 'h2', 'h3'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'notebooklm',
      label: 'NotebookLM',
      kind: 'ai',
      hosts: ['notebooklm.google.com', 'notebooklm.google'],
      pierce: true,
      anchors: ['.message-text-content', 'labs-tailwind-structural-element-view', '.chat-message', 'p', 'li', 'td'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'poe',
      label: 'Poe',
      kind: 'ai',
      hosts: ['poe.com'],
      anchors: ['[class*="Message_"]', '[class*="Markdown_"]', 'p', 'li', 'td', 'th'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'kimi',
      label: 'Kimi',
      kind: 'ai',
      hosts: ['kimi.com', 'kimi.moonshot.cn'],
      anchors: ['.markdown', '.segment-content', 'p', 'li', 'td', 'th'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'qwen',
      label: 'Qwen',
      kind: 'ai',
      hosts: ['chat.qwen.ai', 'tongyi.aliyun.com'],
      anchors: ['.markdown-body', '.prose', 'p', 'li', 'td', 'th'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'zai',
      label: 'Z.ai / GLM',
      kind: 'ai',
      hosts: ['chat.z.ai', 'chatglm.cn'],
      anchors: ['.markdown-body', '.prose', 'p', 'li', 'td', 'th'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      kind: 'ai',
      hosts: ['openrouter.ai'],
      anchors: ['.prose', 'p', 'li', 'td', 'th'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'github',
      label: 'GitHub',
      kind: 'web',
      hosts: ['github.com', 'gist.github.com'],
      anchors: ['.markdown-body', '.comment-body', '.js-comment-body', 'p', 'li', 'td', 'th', 'blockquote'],
      guards: ['.highlight', '.blob-code', 'pre', '.CodeMirror', '.cm-editor', '.react-code-view'],
      inputs: ['textarea']
    },
    {
      id: 'telegram',
      label: 'Telegram Web',
      kind: 'web',
      hosts: ['web.telegram.org'],
      anchors: ['.message', '.text-content', '.reply-markup', 'p', 'li'],
      guards: ['pre', 'code'],
      inputs: ['.input-message-input', 'div[contenteditable="true"]']
    },
    {
      id: 'wikipedia',
      label: 'Wikipedia',
      kind: 'web',
      hosts: ['wikipedia.org', 'fa.wikipedia.org', 'wikimedia.org'],
      anchors: ['.mw-parser-output > p', '#mw-content-text p', 'li', 'td', 'th', 'blockquote', 'h1', 'h2', 'h3'],
      guards: ['pre', 'code', '.mwe-math-element', '.mw-editfont-monospace'],
      inputs: ['textarea']
    },
    {
      id: 'stackoverflow',
      label: 'Stack Overflow',
      kind: 'web',
      hosts: ['stackoverflow.com', 'stackexchange.com', 'superuser.com', 'serverfault.com'],
      anchors: ['.s-prose', '.post-text', '.comment-copy', 'p', 'li', 'td', 'th'],
      guards: ['pre', 'code', '.s-code-block'],
      inputs: ['textarea']
    },
    {
      id: 'reddit',
      label: 'Reddit',
      kind: 'web',
      hosts: ['reddit.com', 'www.reddit.com'],
      pierce: true,
      anchors: ['[data-post-click-location="text-body"]', '.md', 'shreddit-comment', 'p', 'li'],
      guards: ['pre', 'code'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'youtube',
      label: 'YouTube',
      kind: 'web',
      hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com'],
      pierce: true,
      anchors: [
        '#content-text',
        'yt-attributed-string',
        '#video-title',
        '#description-inline-expander',
        'ytd-comment-view-model',
        'p',
        'li'
      ],
      guards: ['pre', 'code', '#movie_player'],
      inputs: ['#contenteditable-root', 'div[contenteditable="true"]']
    },
    {
      id: 'x',
      label: 'X / Twitter',
      kind: 'web',
      hosts: ['x.com', 'twitter.com'],
      anchors: ['[data-testid="tweetText"]', '[data-testid="UserDescription"]', 'article', 'p', 'li'],
      guards: ['pre', 'code'],
      inputs: ['[data-testid^="tweetTextarea"]', 'div[contenteditable="true"]']
    },
    {
      id: 'discord',
      label: 'Discord',
      kind: 'web',
      hosts: ['discord.com'],
      anchors: ['[id^="message-content-"]', '[class*="markup_"]', 'p', 'li'],
      guards: ['pre', 'code', '[class*="hljs"]'],
      inputs: ['[data-slate-editor="true"]', 'div[contenteditable="true"]']
    },
    {
      id: 'notion',
      label: 'Notion',
      kind: 'web',
      hosts: ['notion.so', 'www.notion.so'],
      anchors: ['.notion-text-block', '.notranslate', '[data-block-id]', 'p', 'li', 'td'],
      guards: ['.notion-code-block', 'pre', 'code'],
      inputs: ['div[contenteditable="true"]']
    },
    {
      id: 'medium',
      label: 'Medium / Blogs',
      kind: 'web',
      hosts: ['medium.com', 'dev.to', 'hashnode.com', 'substack.com', 'virgool.io'],
      anchors: ['article', '.postArticle-content', '.crayons-article__main', 'p', 'li', 'blockquote', 'h1', 'h2', 'h3'],
      guards: ['pre', 'code', '.highlight'],
      inputs: ['textarea', 'div[contenteditable="true"]']
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp Web',
      kind: 'web',
      hosts: ['web.whatsapp.com'],
      anchors: ['.selectable-text', '[data-pre-plain-text]', '.message-in', '.message-out', 'p', 'li'],
      guards: ['pre', 'code'],
      inputs: ['[contenteditable="true"]', '[data-lexical-editor="true"]']
    },
    {
      id: 'gitlab',
      label: 'GitLab',
      kind: 'web',
      hosts: ['gitlab.com'],
      anchors: ['.md', '.note-text', '.description', 'p', 'li', 'td', 'th', 'blockquote'],
      guards: ['pre', 'code', '.highlight', '.blob-content', '.cm-editor'],
      inputs: ['textarea']
    }
  ];

  /* نمایه‌ی سریع hostname → پروفایل */
  var HOST_INDEX = Object.create(null);
  for (var i = 0; i < PROFILES.length; i++) {
    var hs = PROFILES[i].hosts || [];
    for (var j = 0; j < hs.length; j++) HOST_INDEX[hs[j]] = PROFILES[i];
  }

  /** نرمال‌سازی hostname: حذف www. و پورت */
  function normalizeHost(host) {
    if (!host) return '';
    host = String(host).toLowerCase().replace(/:\d+$/, '');
    return host.replace(/^www\./, '');
  }

  /** یافتن پروفایل برای یک hostname (با پشتیبانی از زیردامنه‌ها) */
  function forHost(host) {
    var h = normalizeHost(host);
    if (!h) return null;
    if (HOST_INDEX[h]) return HOST_INDEX[h];
    var parts = h.split('.');
    for (var k = 1; k < parts.length - 1; k++) {
      var suffix = parts.slice(k).join('.');
      if (HOST_INDEX[suffix]) return HOST_INDEX[suffix];
    }
    return null;
  }

  /** پروفایل مؤثر (پروفایل سایت یا پروفایل پیش‌فرض «وب») */
  function resolve(host) {
    var p = forHost(host);
    if (p) {
      return {
        id: p.id,
        label: p.label,
        kind: p.kind,
        known: true,
        pierce: !!p.pierce,
        csp: !!p.csp,
        anchors: (p.anchors || []).concat(GENERIC_ANCHORS),
        guards: (p.guards || []).concat(GENERIC_GUARDS),
        inputs: (p.inputs || []).concat(['textarea', 'input', 'div[contenteditable="true"]'])
      };
    }
    return {
      id: 'generic',
      label: host || 'وب',
      kind: 'web',
      known: false,
      pierce: false,
      csp: false,
      anchors: GENERIC_ANCHORS.slice(),
      guards: GENERIC_GUARDS.slice(),
      inputs: ['textarea', 'input', 'div[contenteditable="true"]']
    };
  }

  /** آیا هدر CSP این دامنه باید حذف شود؟ (برای تزریق فونت در Shadow DOM) */
  function needsCsp(host) {
    var p = forHost(host);
    return !!(p && p.csp);
  }

  /** فهرست دامنه‌هایی که پروفایل csp دارند (برای declarativeNetRequest) */
  function cspHosts() {
    var out = [];
    for (var i = 0; i < PROFILES.length; i++) {
      if (PROFILES[i].csp) out = out.concat(PROFILES[i].hosts || []);
    }
    return out;
  }

  PWM.Sites = {
    PROFILES: PROFILES,
    GENERIC_ANCHORS: GENERIC_ANCHORS,
    GENERIC_GUARDS: GENERIC_GUARDS,
    normalizeHost: normalizeHost,
    forHost: forHost,
    resolve: resolve,
    needsCsp: needsCsp,
    cspHosts: cspHosts
  };
})(typeof self !== 'undefined' ? self : globalThis);

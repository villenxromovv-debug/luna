// Studio Background Registry & WebGL Lifecycle Controllers
const LUNA_STUDIO_BG_STORAGE_KEY = 'luna_studio_bg';
const LUNA_DEFAULT_STUDIO_BG = 'obsidian';

const LUNA_STUDIO_BACKGROUNDS = [
  {
    id: 'obsidian',
    name: 'Obsidian',
    badge: 'По умолчанию',
    type: 'obsidian',
    css: '#0d0d0d',
    preview: '#0d0d0d',
  },
  {
    id: 'lunar-waves',
    name: 'Lunar Waves',
    badge: 'Анимированный',
    type: 'webgl',
    css: '#000000',
    preview: 'radial-gradient(circle at 50% 95%, rgba(160, 160, 160, 0.28), transparent 48%), linear-gradient(155deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.03) 34%, transparent 52%, rgba(255, 255, 255, 0.11) 70%, transparent 88%), #050505',
  },
  {
    id: 'crimson-horizon',
    name: 'Crimson Horizon',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(125% 125% at 50% 100%, #000000 40%, #2b0707 100%)',
  },
  {
    id: 'emerald-horizon',
    name: 'Emerald Horizon',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(125% 125% at 50% 90%, #000000 40%, #072607 100%)',
  },
  {
    id: 'dark-horizon',
    name: 'Dark Horizon',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(125% 125% at 50% 90%, #000000 40%, #0d1a36 100%)',
  },
  {
    id: 'crimson-abyss',
    name: 'Crimson Abyss',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(125% 125% at 50% 10%, #000000 40%, #2b0707 100%)',
  },
  {
    id: 'emerald-abyss',
    name: 'Emerald Abyss',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(125% 125% at 50% 10%, #000000 40%, #072607 100%)',
  },
  {
    id: 'violet-abyss',
    name: 'Violet Abyss',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(125% 125% at 50% 10%, #000000 40%, #2b092b 100%)',
  },
  {
    id: 'ocean-glow',
    name: 'Ocean Glow',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(6, 182, 212, 0.25), transparent 70%), #000000',
  },
  {
    id: 'copper-forge',
    name: 'Copper Forge',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(249, 115, 22, 0.25), transparent 70%), #000000',
  },
  {
    id: 'stellar-mist',
    name: 'Stellar Mist',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(ellipse 140% 50% at 15% 60%, rgba(124, 58, 237, 0.11), transparent 48%), radial-gradient(ellipse 90% 80% at 85% 25%, rgba(245, 101, 101, 0.09), transparent 58%), radial-gradient(ellipse 120% 65% at 40% 90%, rgba(34, 197, 94, 0.13), transparent 52%), radial-gradient(ellipse 100% 45% at 70% 5%, rgba(251, 191, 36, 0.07), transparent 42%), radial-gradient(ellipse 80% 75% at 90% 80%, rgba(168, 85, 247, 0.10), transparent 55%), #000000',
  },
  {
    id: 'cosmic-nebula',
    name: 'Cosmic Nebula',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(ellipse 110% 70% at 25% 80%, rgba(147, 51, 234, 0.12), transparent 55%), radial-gradient(ellipse 130% 60% at 75% 15%, rgba(59, 130, 246, 0.10), transparent 65%), radial-gradient(ellipse 80% 90% at 20% 30%, rgba(236, 72, 153, 0.14), transparent 50%), radial-gradient(ellipse 100% 40% at 60% 70%, rgba(16, 185, 129, 0.08), transparent 45%), #000000',
  },
  {
    id: 'prismatic-aurora',
    name: 'Prismatic Aurora',
    badge: 'Статичный',
    type: 'css',
    css: 'radial-gradient(ellipse 120% 80% at 70% 20%, rgba(255, 20, 147, 0.15), transparent 50%), radial-gradient(ellipse 100% 60% at 30% 10%, rgba(0, 255, 255, 0.12), transparent 60%), radial-gradient(ellipse 90% 70% at 50% 0%, rgba(138, 43, 226, 0.18), transparent 65%), radial-gradient(ellipse 110% 50% at 80% 30%, rgba(255, 215, 0, 0.08), transparent 40%), #000000',
  },
];

window.LUNA_STUDIO_BACKGROUNDS = LUNA_STUDIO_BACKGROUNDS;

function __resolveStudioBackground(bgId) {
  const raw = String(bgId || '').trim().toLowerCase();
  const match = LUNA_STUDIO_BACKGROUNDS.find(function (item) {
    return item.id === raw;
  });
  return match || LUNA_STUDIO_BACKGROUNDS[0];
}

function __readCachedStudioBackground() {
  try {
    return __resolveStudioBackground(window.localStorage.getItem(LUNA_STUDIO_BG_STORAGE_KEY)).id;
  } catch (e) {
    return LUNA_DEFAULT_STUDIO_BG;
  }
}

let __activeStudioBackgroundId = __readCachedStudioBackground();
let __unicornScriptRequested = false;
let __unicornLastViewport = {
  w: window.innerWidth,
  h: window.innerHeight,
  dpr: window.devicePixelRatio || 1,
};
let __unicornNeedsResize = false;
let __unicornNeedsRefresh = false;
let __unicornResizeTimer = null;
let __unicornBootPending = false;

window.getActiveStudioBackground = function () {
  return __activeStudioBackgroundId;
};

function __isWebGLBackgroundActive() {
  return __activeStudioBackgroundId === 'lunar-waves';
}

(function installUnicornWebGLShim() {
  if (window.__lunaWebGLShimInstalled || typeof HTMLCanvasElement === 'undefined') return;
  window.__lunaWebGLShimInstalled = true;
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  if (typeof origGetContext !== 'function') return;

  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    let ctx = origGetContext.call(this, type, attrs);
    if (
      !ctx &&
      (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') &&
      attrs &&
      attrs.failIfMajorPerformanceCaveat
    ) {
      ctx = origGetContext.call(
        this,
        type,
        Object.assign({}, attrs, { failIfMajorPerformanceCaveat: false })
      );
    }
    return ctx;
  };
})();

function __isStudioTabActive() {
  if (document.documentElement.hasAttribute('data-init-route')) {
    return false;
  }
  if (document.body && (
    document.body.classList.contains('tab-vault') ||
    document.body.classList.contains('tab-settings') ||
    document.body.classList.contains('tab-guide')
  )) {
    return false;
  }
  if (typeof currentMainTab !== 'undefined') {
    return currentMainTab === 'studio';
  }
  return true;
}

function __keepUnicornPlanesDrawable(scene, refreshTextures) {
  if (!scene) return;
  if (scene.curtain && Array.isArray(scene.curtain.planes)) {
    scene.curtain.planes.forEach(function (plane) {
      if (plane) {
        plane._canDraw = true;
      }
    });
  }
  if (refreshTextures && Array.isArray(scene.layers)) {
    scene.layers.forEach(function (layer) {
      const tex = layer && layer.preloadedCanvasTexture;
      if (tex && typeof tex.needUpdate === 'function') {
        tex.needUpdate();
      }
    });
  }
  if (scene.curtain && typeof scene.curtain.needRender === 'function') {
    scene.curtain.needRender();
  }
}

function __bindSceneContextHandlers(scene) {
  const canvas = scene && scene.curtain ? scene.curtain.canvas : null;
  if (!canvas || (canvas.dataset && canvas.dataset.lunaContextBound === '1')) {
    return;
  }
  if (canvas.dataset) {
    canvas.dataset.lunaContextBound = '1';
  }
  canvas.addEventListener('webglcontextlost', function () {
    __unicornNeedsRefresh = true;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    __unicornNeedsRefresh = true;
    if (__isWebGLBackgroundActive() && __isStudioTabActive() && !document.hidden) {
      requestAnimationFrame(function () {
        window.resumeUnicornStudio();
      });
    }
  });
}

function __initUnicornStudioNow() {
  if (!__isWebGLBackgroundActive()) {
    __unicornBootPending = false;
    return;
  }
  if (!window.UnicornStudio || window.UnicornStudio.isInitialized || typeof window.UnicornStudio.init !== 'function') {
    return;
  }
  if (!__isStudioTabActive()) {
    __unicornBootPending = true;
    return;
  }
  __unicornBootPending = false;
  window.UnicornStudio.isInitialized = true;
  window.UnicornStudio.init().then(function (scenes) {
    window.__unicornScenes = scenes;
    if (window.UnicornStudio && typeof window.UnicornStudio.unbindEvents === 'function') {
      window.UnicornStudio.unbindEvents();
    }
    if (scenes && Array.isArray(scenes)) {
      scenes.forEach(function (scene) {
        if (!scene) return;
        if (scene.interactivity && scene.interactivity.mouse) {
          scene.interactivity.mouse.disabled = true;
        }
        scene.disablePlanes = function () {};
        __keepUnicornPlanesDrawable(scene, false);
        __bindSceneContextHandlers(scene);
      });
    }
    if (!__isWebGLBackgroundActive() || !__isStudioTabActive() || document.hidden) {
      window.pauseUnicornStudio();
    } else {
      const curtainsCanvas = document.getElementById('curtains-canvas');
      if (curtainsCanvas) {
        curtainsCanvas.style.removeProperty('display');
        curtainsCanvas.style.opacity = '1';
        curtainsCanvas.style.visibility = 'visible';
      }
      window.resumeUnicornStudio();
    }
  }).catch(function (e) {
    window.UnicornStudio.isInitialized = false;
    console.warn('[StudioBackground]', e);
  });
}

function __ensureUnicornStudioLoaded() {
  if (!__isWebGLBackgroundActive()) return;
  if (window.UnicornStudio && typeof window.UnicornStudio.init === 'function') {
    __initUnicornStudioNow();
    return;
  }
  if (__unicornScriptRequested) return;
  __unicornScriptRequested = true;

  const cdnUrls = [
    'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.30/dist/unicornStudio.umd.js',
    'https://fastly.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v1.4.30/dist/unicornStudio.umd.js',
  ];

  function loadUnicornScript(attempt) {
    if (attempt >= cdnUrls.length) {
      __unicornScriptRequested = false;
      return;
    }
    const s = document.createElement('script');
    s.src = cdnUrls[attempt];
    s.onload = function () {
      __initUnicornStudioNow();
    };
    s.onerror = function () {
      loadUnicornScript(attempt + 1);
    };
    (document.head || document.body).appendChild(s);
  }

  if (!window.UnicornStudio) {
    window.UnicornStudio = { isInitialized: false };
  }
  loadUnicornScript(0);
}

window.pauseUnicornStudio = function () {
  try {
    if (window.__unicornScenes && Array.isArray(window.__unicornScenes)) {
      window.__unicornScenes.forEach(function (scene) {
        if (!scene) return;
        scene.paused = true;
        if (scene.curtain && typeof scene.curtain.disableDrawing === 'function') {
          scene.curtain.disableDrawing();
        } else if (typeof scene.disable === 'function') {
          scene.disable();
        }
      });
    }
  } catch (e) {
    console.debug('[StudioBackground pause]', e);
  }
};

window.resumeUnicornStudio = function () {
  if (!__isWebGLBackgroundActive()) {
    window.pauseUnicornStudio();
    return;
  }
  if (__isStudioTabActive()) {
    if (!window.UnicornStudio || typeof window.UnicornStudio.init !== 'function') {
      __ensureUnicornStudioLoaded();
      return;
    }
    if (__unicornBootPending || !window.UnicornStudio.isInitialized) {
      __initUnicornStudioNow();
    }
  }
  try {
    if (__isStudioTabActive() && !document.hidden) {
      if (window.__unicornScenes && Array.isArray(window.__unicornScenes)) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const dpr = window.devicePixelRatio || 1;
        const viewportChanged = (
          __unicornNeedsResize ||
          vw !== __unicornLastViewport.w ||
          vh !== __unicornLastViewport.h ||
          dpr !== __unicornLastViewport.dpr
        );
        window.__unicornScenes.forEach(function (scene) {
          if (!scene) return;
          scene.paused = false;
          scene.disablePlanes = function () {};
          if (scene.curtain && typeof scene.curtain.enableDrawing === 'function') {
            scene.curtain.enableDrawing();
          } else if (typeof scene.enable === 'function') {
            scene.enable();
          }
          const canvas = scene.curtain ? scene.curtain.canvas : null;
          const needsZeroFix = Boolean(canvas && (canvas.width === 0 || canvas.height === 0));
          __keepUnicornPlanesDrawable(scene, true);
          if (__unicornNeedsRefresh || viewportChanged || needsZeroFix) {
            if (typeof scene.refresh === 'function') {
              scene.refresh();
            } else if (typeof scene.resize === 'function') {
              scene.resize();
            } else if (scene.curtain && typeof scene.curtain.resize === 'function') {
              scene.curtain.resize();
            }
          }
        });
        __unicornLastViewport = { w: vw, h: vh, dpr: dpr };
        __unicornNeedsResize = false;
        __unicornNeedsRefresh = false;
      }
    }
  } catch (e) {
    console.debug('[StudioBackground resume]', e);
  }
};

window.applyStudioBackground = function (bgId, options) {
  const preset = __resolveStudioBackground(bgId);
  __activeStudioBackgroundId = preset.id;
  if (!options || options.persistCache !== false) {
    try {
      window.localStorage.setItem(LUNA_STUDIO_BG_STORAGE_KEY, preset.id);
    } catch (e) {}
  }

  const bgContainer = document.getElementById('studioBackgroundContainer');
  const cssLayer = document.getElementById('studioBgCssLayer');
  const usNode = bgContainer ? bgContainer.querySelector('[data-us-project]') : null;
  const curtainsCanvas = document.getElementById('curtains-canvas');

  if (bgContainer) {
    bgContainer.setAttribute('data-bg-id', preset.id);
    bgContainer.setAttribute('data-bg-type', preset.type);
  }

  if (preset.type === 'webgl') {
    if (cssLayer) {
      cssLayer.style.background = '#000000';
      cssLayer.style.opacity = '0';
    }
    if (usNode) {
      usNode.style.display = '';
    }
    if (curtainsCanvas && __isStudioTabActive()) {
      curtainsCanvas.style.removeProperty('display');
      curtainsCanvas.style.opacity = '1';
      curtainsCanvas.style.visibility = 'visible';
    }
    __ensureUnicornStudioLoaded();
    if (__isStudioTabActive()) {
      window.resumeUnicornStudio();
    }
  } else {
    window.pauseUnicornStudio();
    if (usNode) {
      usNode.style.display = 'none';
    }
    if (curtainsCanvas) {
      curtainsCanvas.style.opacity = '0';
      curtainsCanvas.style.visibility = 'hidden';
      curtainsCanvas.style.display = 'none';
    }
    if (cssLayer) {
      cssLayer.style.background = preset.css;
      cssLayer.style.opacity = '1';
    }
  }

  return preset;
};

window.addEventListener('resize', function () {
  if (!__isWebGLBackgroundActive()) return;
  __unicornNeedsResize = true;
  if (__unicornResizeTimer) clearTimeout(__unicornResizeTimer);
  __unicornResizeTimer = setTimeout(function () {
    __unicornResizeTimer = null;
    if (!document.hidden && __isStudioTabActive()) {
      window.resumeUnicornStudio();
    }
  }, 120);
});

document.addEventListener('visibilitychange', function () {
  if (!__isWebGLBackgroundActive()) return;
  if (document.hidden) {
    window.pauseUnicornStudio();
  } else if (__isStudioTabActive()) {
    window.resumeUnicornStudio();
  }
});

window.addEventListener('pageshow', function (event) {
  if (!__isWebGLBackgroundActive()) return;
  if (event && event.persisted) {
    __unicornNeedsRefresh = true;
  }
  if (!document.hidden && __isStudioTabActive()) {
    window.resumeUnicornStudio();
  }
});

window.addEventListener('pagehide', function () {
  window.pauseUnicornStudio();
});

// Apply initial background immediately without loading WebGL unless lunar-waves is selected
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    window.applyStudioBackground(__activeStudioBackgroundId, { persistCache: false });
  });
} else {
  window.applyStudioBackground(__activeStudioBackgroundId, { persistCache: false });
}

// Guide Script Functions
const GUIDE_DOCS_ORDER = [
  {
    id: 'wf-youtube',
    label: 'YouTube',
    title: 'Сценарии работы с YouTube',
    subtitle: 'Выберите режим YouTube ниже и просмотрите весь путь от ссылки до файлов в медиатеке.',
  },
  {
    id: 'wf-instagram',
    label: 'Instagram Reels',
    title: 'Сценарии работы с Instagram Reels',
    subtitle: 'Как Luna проверяет и скачивает Instagram Reels прямо в вашу локальную медиатеку.',
  },
  {
    id: 'wf-tiktok',
    label: 'TikTok',
    title: 'Сценарии работы с TikTok',
    subtitle: 'Выберите режим «Видео MP4» или «Аудио MP3», чтобы изучить каждый этап обработки от ссылки до сохранённого файла.',
  },
  {
    id: 'modes',
    label: 'Возможности и режимы',
    title: 'Возможности и режимы',
    subtitle: 'Сравните четыре режима скачивания, нарезки и ИИ-клипов и выберите подходящий для вашего контента.',
  },
  {
    id: 'setup',
    label: 'Установка и требования',
    title: 'Установка и требования',
    subtitle: 'Что Luna настраивает автоматически через install.ps1, install.sh или Docker, а что можно настроить по желанию.',
  },
  {
    id: 'vault',
    label: 'Медиатека',
    title: 'Медиатека',
    subtitle: 'Luna раскладывает вывод по папкам категорий; их можно в любой момент изменить через «Перенести папку» в Настройках.',
  },
  {
    id: 'faq',
    label: 'Вопросы и ответы',
    title: 'Вопросы и ответы',
    subtitle: 'Быстрые ответы на частые вопросы по установке, загрузке и настройке.',
  },
];

const GUIDE_WORKFLOWS = {
  youtube: {
    canvasId: 'wfYoutubeCanvas',
    stepsId: 'wfYoutubeSteps',
    summaryId: 'wfYoutubeSummary',
    modes: {
      ai_clip: {
        summary: 'Конвейер ИИ-клипов: нужен ключ LLM (а также ключ Groq или Gemini, если у видео нет субтитров).',
        phases: ['1. Ввод', '2. Речь и кэш', '3. ИИ и рендер', '4. Вывод'],
        studio: [
          {
            align: 'bottom',
            nodes: [
              { id: 'u-url', kind: 'box', label: 'Ссылка YouTube', step: 0 },
              { id: 'u-cfg', kind: 'pill', label: 'Настройка и запуск', step: 0 },
            ],
          },
          { align: 'bottom', nodes: [] },
          { align: 'bottom', nodes: [] },
          {
            align: 'bottom',
            nodes: [
              { id: 'u-zip', kind: 'pill', label: 'Скачать .ZIP', step: 3 },
              { id: 'u-prev', kind: 'pill', label: 'Просмотр клипов', step: 3 },
              { id: 'u-canv', kind: 'box', label: 'Холст нарезки', step: 3 },
            ],
          },
        ],
        pipeline: [
          {
            align: 'top',
            nodes: [
              { id: 'p-dlp', kind: 'box', label: 'yt-dlp + Deno', step: 1 },
              { id: 'p-h264', kind: 'pill', label: '1080p H.264', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-stt', kind: 'box', label: 'Транскрипция', step: 1 },
              { id: 'p-srt', kind: 'pill', label: 'Субтитры / .SRT', step: 1 },
              { id: 'p-asr', kind: 'pill', label: 'Groq · Gemini · Whisper', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-ai', kind: 'box', label: 'Вирусность + FFmpeg', step: 2 },
              { id: 'p-llm', kind: 'pill', label: 'Оценка вирусности (LLM)', step: 2 },
              { id: 'p-crop', kind: 'pill', label: 'Обрезка / слежение за лицом', step: 2 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-vault', kind: 'box', label: '01-AI-Clips', step: 3 },
              { id: 'p-meta', kind: 'pill', label: 'Клипы + meta.json', step: 3 },
            ],
          },
        ],
        edges: [
          { from: 'u-url', to: 'u-cfg', route: 'v', style: 'green' },
          { from: 'u-cfg', to: 'p-dlp', route: 'v', style: 'dashed', badge: { color: '#a855f7', text: 'Отправить' } },
          { from: 'p-dlp', to: 'p-h264', route: 'left-branch', style: 'green' },
          { from: 'p-dlp', to: 'p-stt', route: 'h', style: 'green' },
          { from: 'p-stt', to: 'p-srt', route: 'left-branch', style: 'green' },
          { from: 'p-stt', to: 'p-asr', route: 'left-branch', style: 'green' },
          { from: 'p-stt', to: 'p-ai', route: 'h', style: 'green' },
          { from: 'p-ai', to: 'p-llm', route: 'left-branch', style: 'green' },
          { from: 'p-ai', to: 'p-crop', route: 'left-branch', style: 'green' },
          { from: 'p-ai', to: 'p-vault', route: 'h', style: 'green' },
          { from: 'p-vault', to: 'p-meta', route: 'left-branch', style: 'green' },
          { from: 'p-vault', to: 'u-canv', route: 'v-up', style: 'dashed', badge: { color: '#22c55e', text: 'Готово' } },
          { from: 'u-canv', to: 'u-prev', route: 'right-up', style: 'green' },
          { from: 'u-canv', to: 'u-zip', route: 'right-up', style: 'green' },
        ],
        steps: [
          {
            tag: 'Студия',
            title: 'Ввод URL и настройка',
            detail: 'Вставьте ссылку на видео YouTube в Студии. Перед запуском задачи Luna проверяет формат URL и безопасность публичного хоста, быстро получает метаданные и фиксирует ваши настройки рендера.',
            points: [
              '<strong>Целевое соотношение сторон:</strong> выберите 9:16 (вертикальные Reels/Shorts/TikTok), 16:9, 1:1 или 3:4.',
              '<strong>Количество клипов и кадрирование:</strong> выберите от 3 до 7 клипов и быструю обрезку по центру или слежение за лицом через OpenCV.',
              '<strong>Папка медиатеки:</strong> вывод попадает в подпапку активной медиатеки, чтобы параллельные каналы и проекты не смешивались.',
            ],
          },
          {
            tag: 'yt-dlp + речь',
            title: 'Загрузка источника и получение транскрипта',
            detail: 'Luna загружает чистый поток источника в высоком разрешении через yt-dlp на среде Deno, затем строит синхронизированный по времени транскрипт, прежде чем расходовать квоту LLM.',
            points: [
              '<strong>Поток 1080p H.264 и cookies:</strong> скачивает видео и звук и автоматически подставляет cookies.txt, если он загружен в Настройках, чтобы обойти вход в YouTube или ошибки 403.',
              '<strong>Порядок поиска транскрипта:</strong> сначала проверяет локальный кэш .srt, затем официальные субтитры YouTube и только потом переходит к Groq Cloud Whisper, транскрипции Gemini или локальному Faster-Whisper.',
            ],
          },
          {
            tag: 'LLM + FFmpeg',
            title: 'Оценка вирусности, перекадрирование и рендер',
            detail: 'Настроенная вами LLM просматривает транскрипт с таймкодами и находит самостоятельные хуки, затем FFmpeg чисто нарезает и перекадрирует выбранные моменты.',
            points: [
              '<strong>Оценка вирусности (0–100):</strong> ранжирует самостоятельные фрагменты с непересекающимися таймкодами через совместимую с OpenAI конечную точку или модель Gemini.',
              '<strong>Перекадрирование и кодирование:</strong> точно режет видео по таймкодам и применяет обрезку по центру или центрирование по лицу через OpenCV, сохраняя готовые к загрузке MP4 (без вшитых субтитров).',
            ],
          },
          {
            tag: 'Хранилище + интерфейс',
            title: 'Сохранение в медиатеку и на холст нарезки',
            detail: 'Готовые клипы атомарно индексируются и передаются в интерфейс Студии, чтобы вы сразу могли посмотреть результат.',
            points: [
              '<strong>Структура папок:</strong> сохраняет каждый отрендеренный MP4 вместе с meta.json (оценка, таймкоды, краткое описание и метаданные провайдера) в 01-AI-Clips\\{Медиатека}.',
              '<strong>Просмотр и экспорт:</strong> открывает клипы на холсте нарезки для мгновенного просмотра, скачивания по одному или пакетного архива .ZIP в один клик.',
            ],
          },
        ],
      },
      video: {
        summary: 'Обычная загрузка видео YouTube с выбором разрешения, обрезкой по соотношению сторон и сменой FPS. API-ключ не нужен.',
        phases: ['1. Ввод', '2. Загрузка и формат', '3. Вывод'],
        studio: [
          {
            align: 'bottom',
            nodes: [
              { id: 'u-url', kind: 'box', label: 'Ссылка YouTube', step: 0 },
              { id: 'u-cfg', kind: 'pill', label: 'Качество, соотношение и FPS', step: 0 },
            ],
          },
          { align: 'bottom', nodes: [] },
          {
            align: 'bottom',
            nodes: [
              { id: 'u-open', kind: 'pill', label: 'Открыть папку', step: 2 },
              { id: 'u-prev', kind: 'pill', label: 'Просмотр MP4', step: 2 },
              { id: 'u-vault', kind: 'box', label: 'Медиатека', step: 2 },
            ],
          },
        ],
        pipeline: [
          {
            align: 'top',
            nodes: [
              { id: 'p-dlp', kind: 'box', label: 'Сборка yt-dlp', step: 1 },
              { id: 'p-res', kind: 'pill', label: '1080p / 720p / 480p', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-ff', kind: 'box', label: 'Формат FFmpeg', step: 1 },
              { id: 'p-ratio', kind: 'pill', label: 'Обрезка по соотношению', step: 1 },
              { id: 'p-fps', kind: 'pill', label: 'Авто / 60 / 30 FPS', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-out', kind: 'box', label: '02-YouTube-Full', step: 2 },
              { id: 'p-meta', kind: 'pill', label: 'MP4 + meta.json', step: 2 },
            ],
          },
        ],
        edges: [
          { from: 'u-url', to: 'u-cfg', route: 'v', style: 'green' },
          { from: 'u-cfg', to: 'p-dlp', route: 'v', style: 'dashed', badge: { color: '#a855f7', text: 'Отправить' } },
          { from: 'p-dlp', to: 'p-res', route: 'left-branch', style: 'green' },
          { from: 'p-dlp', to: 'p-ff', route: 'h', style: 'green' },
          { from: 'p-ff', to: 'p-ratio', route: 'left-branch', style: 'green' },
          { from: 'p-ff', to: 'p-fps', route: 'left-branch', style: 'green' },
          { from: 'p-ff', to: 'p-out', route: 'h', style: 'green' },
          { from: 'p-out', to: 'p-meta', route: 'left-branch', style: 'green' },
          { from: 'p-out', to: 'u-vault', route: 'v-up', style: 'dashed', badge: { color: '#22c55e', text: 'Готово' } },
          { from: 'u-vault', to: 'u-prev', route: 'right-up', style: 'green' },
          { from: 'u-vault', to: 'u-open', route: 'right-up', style: 'green' },
        ],
        steps: [
          {
            tag: 'Студия',
            title: 'Ввод URL и параметров формата',
            detail: 'Вставьте обычную ссылку YouTube или Shorts в Студии и выберите разрешение, соотношение сторон и частоту кадров без настройки ключей ИИ.',
            points: [
              '<strong>Качество видео:</strong> выберите 1080p, 720p или 480p в зависимости от требований к скорости и размеру файла.',
              '<strong>Соотношение и частота кадров:</strong> оставьте «Оригинал» и «Авто FPS» для максимальной скорости или задайте обрезку 9:16 / 3:4 / 1:1 и вывод 60 или 30 FPS.',
            ],
          },
          {
            tag: 'yt-dlp + FFmpeg',
            title: 'Загрузка, сборка и при необходимости перекодирование',
            detail: 'Luna вытягивает отдельные лучшие потоки видео и звука через yt-dlp на среде Deno и объединяет их в обычный контейнер H.264 MP4.',
            points: [
              '<strong>Копирование потока или перекодирование:</strong> при выборе «Оригинал» и «Авто FPS» сборка проходит быстро, без повторного кодирования пикселей.',
              '<strong>Своё преобразование формата:</strong> если выбрана обрезка по соотношению или фиксированный FPS (60/30), FFmpeg сам кадрирует по центру и приводит частоту кадров к нужной.',
            ],
          },
          {
            tag: 'Хранилище + интерфейс',
            title: 'Сохранение в 02-YouTube-Full и медиатеку',
            detail: 'Готовые файлы раскладываются в корне хранилища и сразу появляются в Студии и медиатеке.',
            points: [
              '<strong>Папка и метаданные:</strong> сохраняет итоговый MP4 и meta.json в 02-YouTube-Full\\{Медиатека}.',
              '<strong>Быстрые действия:</strong> воспроизводите прямо в медиатеке, запускайте скачивание в браузере или сразу открывайте локальную папку.',
            ],
          },
        ],
      },
      mp3: {
        summary: 'Быстрое извлечение только звука сразу в MP3 с высоким битрейтом. API-ключ не нужен.',
        phases: ['1. Ввод', '2. Извлечение звука', '3. Вывод'],
        studio: [
          {
            align: 'bottom',
            nodes: [
              { id: 'u-url', kind: 'box', label: 'Ссылка YouTube', step: 0 },
              { id: 'u-cfg', kind: 'pill', label: 'Режим Аудио MP3', step: 0 },
            ],
          },
          { align: 'bottom', nodes: [] },
          {
            align: 'bottom',
            nodes: [
              { id: 'u-open', kind: 'pill', label: 'Открыть папку', step: 2 },
              { id: 'u-play', kind: 'pill', label: 'Слушать аудио', step: 2 },
              { id: 'u-vault', kind: 'box', label: 'Медиатека', step: 2 },
            ],
          },
        ],
        pipeline: [
          {
            align: 'top',
            nodes: [
              { id: 'p-dlp', kind: 'box', label: 'yt-dlp: аудио', step: 1 },
              { id: 'p-trk', kind: 'pill', label: 'Лучшая аудиодорожка', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-ff', kind: 'box', label: 'Перекодирование FFmpeg', step: 1 },
              { id: 'p-br', kind: 'pill', label: '320 kbps MP3', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-out', kind: 'box', label: '05-Audio-MP3', step: 2 },
              { id: 'p-meta', kind: 'pill', label: 'MP3 + meta.json', step: 2 },
            ],
          },
        ],
        edges: [
          { from: 'u-url', to: 'u-cfg', route: 'v', style: 'green' },
          { from: 'u-cfg', to: 'p-dlp', route: 'v', style: 'dashed', badge: { color: '#a855f7', text: 'Отправить' } },
          { from: 'p-dlp', to: 'p-trk', route: 'left-branch', style: 'green' },
          { from: 'p-dlp', to: 'p-ff', route: 'h', style: 'green' },
          { from: 'p-ff', to: 'p-br', route: 'left-branch', style: 'green' },
          { from: 'p-ff', to: 'p-out', route: 'h', style: 'green' },
          { from: 'p-out', to: 'p-meta', route: 'left-branch', style: 'green' },
          { from: 'p-out', to: 'u-vault', route: 'v-up', style: 'dashed', badge: { color: '#22c55e', text: 'Готово' } },
          { from: 'u-vault', to: 'u-play', route: 'right-up', style: 'green' },
          { from: 'u-vault', to: 'u-open', route: 'right-up', style: 'green' },
        ],
        steps: [
          {
            tag: 'Студия',
            title: 'Ввод ссылки YouTube',
            detail: 'Вставьте ссылку YouTube (музыка, подкаст, интервью или видео) и выберите режим «Аудио MP3». Токены ИИ и API-ключи не нужны.',
            points: [
              '<strong>Быстрая проверка метаданных:</strong> проверяет хост URL и получает название и обложку до начала извлечения.',
            ],
          },
          {
            tag: 'yt-dlp + FFmpeg',
            title: 'Получение аудиопотока и перекодирование в MP3 320 kbps',
            detail: 'Вместо загрузки больших видео 1080p yt-dlp берёт только аудиодорожку с максимальным битрейтом и передаёт её в FFmpeg.',
            points: [
              '<strong>Высокий битрейт:</strong> FFmpeg запускает FFmpegExtractAudio с кодеком mp3 и качеством 320 kbps.',
              '<strong>Поддержка cookies:</strong> автоматически использует cookies.txt из Настроек, если YouTube требует подтвердить вход.',
            ],
          },
          {
            tag: 'Хранилище + интерфейс',
            title: 'Сохранение в 05-Audio-MP3 и медиатеку',
            detail: 'Когда преобразование закончено, аудиофайл регистрируется в вашей медиатеке.',
            points: [
              '<strong>Папка и воспроизведение:</strong> сохраняет .mp3 вместе с meta.json в 05-Audio-MP3\\{Медиатека} для мгновенного прослушивания или доступа к папке.',
            ],
          },
        ],
      },
      trim: {
        summary: 'Точная нарезка нескольких фрагментов (до 20 диапазонов за задачу) с кадрированием по соотношению сторон. Лимиты ИИ не расходуются.',
        phases: ['1. Ввод и отрезки', '2. Нарезка и кадрирование', '3. Вывод'],
        studio: [
          {
            align: 'bottom',
            nodes: [
              { id: 'u-url', kind: 'box', label: 'Ссылка YouTube', step: 0 },
              { id: 'u-cfg', kind: 'pill', label: '1–20 таймкодов', step: 0 },
            ],
          },
          { align: 'bottom', nodes: [] },
          {
            align: 'bottom',
            nodes: [
              { id: 'u-zip', kind: 'pill', label: 'Скачать .ZIP', step: 2 },
              { id: 'u-prev', kind: 'pill', label: 'Просмотр клипов', step: 2 },
              { id: 'u-vault', kind: 'box', label: 'Медиатека', step: 2 },
            ],
          },
        ],
        pipeline: [
          {
            align: 'top',
            nodes: [
              { id: 'p-dlp', kind: 'box', label: 'Источник yt-dlp', step: 1 },
              { id: 'p-src', kind: 'pill', label: 'MP4 до 1080p', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-ff', kind: 'box', label: 'Обрезка FFmpeg', step: 1 },
              { id: 'p-rng', kind: 'pill', label: 'Точные таймкоды', step: 1 },
              { id: 'p-crop', kind: 'pill', label: 'Обрезка по соотношению', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-out', kind: 'box', label: '02-YouTube-Full', step: 2 },
              { id: 'p-meta', kind: 'pill', label: 'Клипы + meta.json', step: 2 },
            ],
          },
        ],
        edges: [
          { from: 'u-url', to: 'u-cfg', route: 'v', style: 'green' },
          { from: 'u-cfg', to: 'p-dlp', route: 'v', style: 'dashed', badge: { color: '#a855f7', text: 'Отправить' } },
          { from: 'p-dlp', to: 'p-src', route: 'left-branch', style: 'green' },
          { from: 'p-dlp', to: 'p-ff', route: 'h', style: 'green' },
          { from: 'p-ff', to: 'p-rng', route: 'left-branch', style: 'green' },
          { from: 'p-ff', to: 'p-crop', route: 'left-branch', style: 'green' },
          { from: 'p-ff', to: 'p-out', route: 'h', style: 'green' },
          { from: 'p-out', to: 'p-meta', route: 'left-branch', style: 'green' },
          { from: 'p-out', to: 'u-vault', route: 'v-up', style: 'dashed', badge: { color: '#22c55e', text: 'Готово' } },
          { from: 'u-vault', to: 'u-prev', route: 'right-up', style: 'green' },
          { from: 'u-vault', to: 'u-zip', route: 'right-up', style: 'green' },
        ],
        steps: [
          {
            tag: 'Студия',
            title: 'Ввод ссылки и точных диапазонов',
            detail: 'Выберите режим «Нарезка видео», если уже знаете точные таймкоды для извлечения. Лимиты ИИ не расходуются, API-ключи не нужны.',
            points: [
              '<strong>Очередь из нескольких фрагментов:</strong> добавьте от 1 до 20 диапазонов начала и конца в одну задачу.',
              '<strong>Кадрирование по соотношению:</strong> выберите «Оригинал», 9:16, 3:4 или 1:1, чтобы применить обрезку ко всем фрагментам одинаково.',
            ],
          },
          {
            tag: 'yt-dlp + FFmpeg',
            title: 'Однократная загрузка источника и нарезка всех фрагментов',
            detail: 'Luna один раз скачивает исходное видео до 1080p локально, затем последовательно прогоняет список таймкодов через FFmpeg для покадровой точности.',
            points: [
              '<strong>Точная перемотка:</strong> чисто вырезает каждый диапазон от начала до конца с синхронным звуком и видео.',
              '<strong>Необязательное перекадрирование:</strong> применяет выбранный фильтр соотношения сторон к каждому фрагменту при рендере.',
            ],
          },
          {
            tag: 'Хранилище + интерфейс',
            title: 'Сохранение нарезанных клипов в 02-YouTube-Full и .ZIP',
            detail: 'Все фрагменты пакета сохраняются вместе и упаковываются для удобной выдачи.',
            points: [
              '<strong>Папка и пакетный экспорт:</strong> записывает пронумерованные клипы и meta.json в 02-YouTube-Full\\{Медиатека}, с просмотром прямо в интерфейсе и одним архивом .ZIP для всех фрагментов.',
            ],
          },
        ],
      },
    },
  },
  instagram: {
    canvasId: 'wfInstagramCanvas',
    stepsId: 'wfInstagramSteps',
    summaryId: 'wfInstagramSummary',
    modes: {
      reels: {
        summary: 'Прямое скачивание видео Instagram Reels в доступном качестве. API-ключ не нужен.',
        phases: ['1. Ввод', '2. Загрузка Reel', '3. Вывод'],
        studio: [
          {
            align: 'bottom',
            nodes: [
              { id: 'u-url', kind: 'box', label: 'Ссылка Reels', step: 0 },
              { id: 'u-cfg', kind: 'pill', label: 'Начать загрузку', step: 0 },
            ],
          },
          { align: 'bottom', nodes: [] },
          {
            align: 'bottom',
            nodes: [
              { id: 'u-open', kind: 'pill', label: 'Открыть папку', step: 2 },
              { id: 'u-prev', kind: 'pill', label: 'Просмотр Reel', step: 2 },
              { id: 'u-vault', kind: 'box', label: 'Медиатека', step: 2 },
            ],
          },
        ],
        pipeline: [
          {
            align: 'top',
            nodes: [
              { id: 'p-val', kind: 'box', label: 'Проверка URL', step: 0 },
              { id: 'p-sec', kind: 'pill', label: 'Проверка HTTPS и хоста', step: 0 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-dlp', kind: 'box', label: 'yt-dlp: Reels', step: 1 },
              { id: 'p-mp4', kind: 'pill', label: 'MP4 в полном качестве', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-out', kind: 'box', label: '03-Instagram-Reels', step: 2 },
              { id: 'p-meta', kind: 'pill', label: 'MP4 + meta.json', step: 2 },
            ],
          },
        ],
        edges: [
          { from: 'u-url', to: 'u-cfg', route: 'v', style: 'green' },
          { from: 'u-cfg', to: 'p-val', route: 'v', style: 'dashed', badge: { color: '#a855f7', text: 'Отправить' } },
          { from: 'p-val', to: 'p-sec', route: 'left-branch', style: 'green' },
          { from: 'p-val', to: 'p-dlp', route: 'h', style: 'green' },
          { from: 'p-dlp', to: 'p-mp4', route: 'left-branch', style: 'green' },
          { from: 'p-dlp', to: 'p-out', route: 'h', style: 'green' },
          { from: 'p-out', to: 'p-meta', route: 'left-branch', style: 'green' },
          { from: 'p-out', to: 'u-vault', route: 'v-up', style: 'dashed', badge: { color: '#22c55e', text: 'Готово' } },
          { from: 'u-vault', to: 'u-prev', route: 'right-up', style: 'green' },
          { from: 'u-vault', to: 'u-open', route: 'right-up', style: 'green' },
        ],
        steps: [
          {
            tag: 'Студия + проверка',
            title: 'Ввод и проверка ссылки Instagram Reels',
            detail: 'Вставьте любую публичную ссылку Instagram Reels в Студии. Для скачивания Reels API-ключ ИИ не нужен.',
            points: [
              '<strong>Проверка хоста и безопасности:</strong> проверяет схему HTTPS и допустимые публичные домены Instagram, прежде чем поставить запрос в очередь.',
              '<strong>Мгновенная обратная связь:</strong> сразу отклоняет некорректные, приватные или локальные адреса с понятным окном предупреждения.',
            ],
          },
          {
            tag: 'yt-dlp',
            title: 'Загрузка MP4 Reels в полном качестве',
            detail: 'Luna передаёт проверенный URL в yt-dlp, чтобы получить доступный видеопоток MP4 с аудио в максимальном качестве для этого Reel.',
            points: [
              '<strong>Готовность к cookies:</strong> если Instagram ограничивает частоту запросов или требует авторизацию, автоматически используются cookies, загруженные в Настройках.',
            ],
          },
          {
            tag: 'Хранилище + интерфейс',
            title: 'Сохранение в 03-Instagram-Reels и медиатеку',
            detail: 'Готовые Reels попадают в отдельную папку платформы и не смешиваются с загрузками из YouTube или TikTok.',
            points: [
              '<strong>Папка и доступ:</strong> записывает MP4 вместе с meta.json в 03-Instagram-Reels\\{Медиатека}, сразу с просмотром в медиатеке, скачиванием и кнопкой «Открыть папку».',
            ],
          },
        ],
      },
    },
  },
  tiktok: {
    canvasId: 'wfTiktokCanvas',
    stepsId: 'wfTiktokSteps',
    summaryId: 'wfTiktokSummary',
    modes: {
      video: {
        summary: 'Чистая загрузка MP4 из TikTok без водяного знака. API-ключ не нужен.',
        phases: ['1. Ввод', '2. Чистая загрузка', '3. Вывод'],
        studio: [
          {
            align: 'bottom',
            nodes: [
              { id: 'u-url', kind: 'box', label: 'Ссылка TikTok', step: 0 },
              { id: 'u-cfg', kind: 'pill', label: 'Предпросмотр oEmbed', step: 0 },
            ],
          },
          { align: 'bottom', nodes: [] },
          {
            align: 'bottom',
            nodes: [
              { id: 'u-open', kind: 'pill', label: 'Открыть папку', step: 2 },
              { id: 'u-prev', kind: 'pill', label: 'Просмотр видео', step: 2 },
              { id: 'u-vault', kind: 'box', label: 'Медиатека', step: 2 },
            ],
          },
        ],
        pipeline: [
          {
            align: 'top',
            nodes: [
              { id: 'p-val', kind: 'box', label: 'Проверка URL', step: 0 },
              { id: 'p-sec', kind: 'pill', label: 'Проверка хоста и ссылки', step: 0 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-dlp', kind: 'box', label: 'yt-dlp: без водяного знака', step: 1 },
              { id: 'p-mp4', kind: 'pill', label: 'MP4 без водяного знака', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-out', kind: 'box', label: '04-TikTok-Clean', step: 2 },
              { id: 'p-meta', kind: 'pill', label: 'MP4 + meta.json', step: 2 },
            ],
          },
        ],
        edges: [
          { from: 'u-url', to: 'u-cfg', route: 'v', style: 'green' },
          { from: 'u-cfg', to: 'p-val', route: 'v', style: 'dashed', badge: { color: '#a855f7', text: 'Отправить' } },
          { from: 'p-val', to: 'p-sec', route: 'left-branch', style: 'green' },
          { from: 'p-val', to: 'p-dlp', route: 'h', style: 'green' },
          { from: 'p-dlp', to: 'p-mp4', route: 'left-branch', style: 'green' },
          { from: 'p-dlp', to: 'p-out', route: 'h', style: 'green' },
          { from: 'p-out', to: 'p-meta', route: 'left-branch', style: 'green' },
          { from: 'p-out', to: 'u-vault', route: 'v-up', style: 'dashed', badge: { color: '#22c55e', text: 'Готово' } },
          { from: 'u-vault', to: 'u-prev', route: 'right-up', style: 'green' },
          { from: 'u-vault', to: 'u-open', route: 'right-up', style: 'green' },
        ],
        steps: [
          {
            tag: 'Студия + проверка',
            title: 'Ввод ссылки, проверка и предпросмотр метаданных',
            detail: 'Вставьте полную или сокращённую ссылку на видео TikTok в Студии. API-ключ ИИ не нужен.',
            points: [
              '<strong>Предпросмотр и проверка безопасности:</strong> получает название видео, автора и обложку через TikTok oEmbed (с запасным вариантом через yt-dlp) и проверяет, что URL публичный и использует HTTPS.',
            ],
          },
          {
            tag: 'yt-dlp',
            title: 'Загрузка чистого MP4 без водяного знака',
            detail: 'Luna напрямую извлекает исходный видеопоток через yt-dlp, без наложенного водяного знака TikTok.',
            points: [
              '<strong>Исходное качество:</strong> сохраняет вертикальное разрешение источника и синхронизацию звука в чистом контейнере MP4.',
            ],
          },
          {
            tag: 'Хранилище + интерфейс',
            title: 'Сохранение в 04-TikTok-Clean и медиатеку',
            detail: 'Завершённые загрузки автоматически индексируются в вашей локальной медиатеке TikTok.',
            points: [
              '<strong>Папка и быстрые действия:</strong> сохраняет чистый MP4 и meta.json в 04-TikTok-Clean\\{Медиатека}, чтобы сразу посмотреть видео, скачать его или открыть папку.',
            ],
          },
        ],
      },
      mp3: {
        summary: 'Извлечение аудиодорожки или песни из TikTok сразу в MP3 320 kbps. API-ключ не нужен.',
        phases: ['1. Ввод', '2. Извлечение звука', '3. Вывод'],
        studio: [
          {
            align: 'bottom',
            nodes: [
              { id: 'u-url', kind: 'box', label: 'Ссылка TikTok', step: 0 },
              { id: 'u-cfg', kind: 'pill', label: 'Режим Аудио MP3', step: 0 },
            ],
          },
          { align: 'bottom', nodes: [] },
          {
            align: 'bottom',
            nodes: [
              { id: 'u-open', kind: 'pill', label: 'Открыть папку', step: 2 },
              { id: 'u-play', kind: 'pill', label: 'Слушать аудио', step: 2 },
              { id: 'u-vault', kind: 'box', label: 'Медиатека', step: 2 },
            ],
          },
        ],
        pipeline: [
          {
            align: 'top',
            nodes: [
              { id: 'p-dlp', kind: 'box', label: 'yt-dlp: аудио', step: 0 },
              { id: 'p-trk', kind: 'pill', label: 'Получение аудиодорожки', step: 0 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-ff', kind: 'box', label: 'Перекодирование FFmpeg', step: 1 },
              { id: 'p-br', kind: 'pill', label: '320 kbps MP3', step: 1 },
            ],
          },
          {
            align: 'top',
            nodes: [
              { id: 'p-out', kind: 'box', label: '05-Audio-MP3', step: 2 },
              { id: 'p-meta', kind: 'pill', label: 'MP3 + meta.json', step: 2 },
            ],
          },
        ],
        edges: [
          { from: 'u-url', to: 'u-cfg', route: 'v', style: 'green' },
          { from: 'u-cfg', to: 'p-dlp', route: 'v', style: 'dashed', badge: { color: '#a855f7', text: 'Отправить' } },
          { from: 'p-dlp', to: 'p-trk', route: 'left-branch', style: 'green' },
          { from: 'p-dlp', to: 'p-ff', route: 'h', style: 'green' },
          { from: 'p-ff', to: 'p-br', route: 'left-branch', style: 'green' },
          { from: 'p-ff', to: 'p-out', route: 'h', style: 'green' },
          { from: 'p-out', to: 'p-meta', route: 'left-branch', style: 'green' },
          { from: 'p-out', to: 'u-vault', route: 'v-up', style: 'dashed', badge: { color: '#22c55e', text: 'Готово' } },
          { from: 'u-vault', to: 'u-play', route: 'right-up', style: 'green' },
          { from: 'u-vault', to: 'u-open', route: 'right-up', style: 'green' },
        ],
        steps: [
          {
            tag: 'Студия + yt-dlp',
            title: 'Проверка ссылки и извлечение исходной аудиодорожки',
            detail: 'Вставьте ссылку на видео или звук TikTok и выберите режим «Аудио MP3». Ключи ИИ не нужны.',
            points: [
              '<strong>Загрузка только звука:</strong> проверяет URL TikTok и забирает чистую аудиодорожку через yt-dlp без лишних видеокопий.',
            ],
          },
          {
            tag: 'FFmpeg',
            title: 'Перекодирование в MP3 320 kbps с высоким битрейтом',
            detail: 'FFmpeg обрабатывает полученную аудиодорожку через FFmpegExtractAudio и делает стандартный MP3 высокого качества.',
            points: [
              '<strong>Единое качество:</strong> выдаёт чистый стерео MP3 320 kbps, совместимый с редакторами, DAW и мобильными плеерами.',
            ],
          },
          {
            tag: 'Хранилище + интерфейс',
            title: 'Сохранение в 05-Audio-MP3 и медиатеку',
            detail: 'Готовые MP3 лежат в общей папке аудио для всех платформ и аккуратно разделены по медиатекам.',
            points: [
              '<strong>Папка и воспроизведение:</strong> сохраняет .mp3 и meta.json в 05-Audio-MP3\\{Медиатека} для встроенного проигрывания и мгновенного доступа к папке.',
            ],
          },
        ],
      },
    },
  },
};

const activeWorkflowModes = {
  youtube: 'ai_clip',
  instagram: 'reels',
  tiktok: 'video',
};

function roundedOrthoPath(pts, radius = 8) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const dx1 = x1 - x0;
    const dy1 = y1 - y0;
    const dx2 = x2 - x1;
    const dy2 = y2 - y1;
    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);
    if (!len1 || !len2) continue;
    const r = Math.min(radius, len1 * 0.45, len2 * 0.45);
    const ax = x1 - (dx1 / len1) * r;
    const ay = y1 - (dy1 / len1) * r;
    const bx = x1 + (dx2 / len2) * r;
    const by = y1 + (dy2 / len2) * r;
    d += ` L ${ax} ${ay} Q ${x1} ${y1}, ${bx} ${by}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

function drawGuideFlowConnectors(canvas) {
  if (!canvas) return;
  const stage = canvas.querySelector('.sl-stage');
  const svg = canvas.querySelector('.sl-svg');
  const badgesLayer = canvas.querySelector('.sl-badges');
  if (!stage || !svg) return;

  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;

  const platform = canvas.dataset.platform;
  const modeKey = canvas.dataset.mode;
  const mode = GUIDE_WORKFLOWS[platform] && GUIDE_WORKFLOWS[platform].modes[modeKey];
  if (!mode) return;

  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = '';
  if (badgesLayer) badgesLayer.innerHTML = '';

  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  const mkArrow = (id, fill) => {
    const m = document.createElementNS(ns, 'marker');
    m.setAttribute('id', id);
    m.setAttribute('viewBox', '0 0 8 8');
    m.setAttribute('refX', '7');
    m.setAttribute('refY', '4');
    m.setAttribute('markerWidth', '5');
    m.setAttribute('markerHeight', '5');
    m.setAttribute('orient', 'auto');
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', '0,1 8,4 0,7');
    poly.setAttribute('fill', fill);
    m.appendChild(poly);
    defs.appendChild(m);
  };
  const greenId = `${canvas.id}-arrow-green`;
  const dashedId = `${canvas.id}-arrow-dashed`;
  mkArrow(greenId, '#737373');
  mkArrow(dashedId, '#a3a3a3');
  svg.appendChild(defs);

  const uiZoom = (typeof window.__getLunaUiScale === 'function') ? window.__getLunaUiScale() : 1;
  const sRect = stage.getBoundingClientRect();
  const rects = {};
  stage.querySelectorAll('[data-sl-id]').forEach(el => {
    const r = el.getBoundingClientRect();
    rects[el.dataset.slId] = {
      el,
      left: (r.left - sRect.left) / uiZoom,
      right: (r.right - sRect.left) / uiZoom,
      top: (r.top - sRect.top) / uiZoom,
      bottom: (r.bottom - sRect.top) / uiZoom,
      cx: ((r.left + r.right) / 2 - sRect.left) / uiZoom,
      cy: ((r.top + r.bottom) / 2 - sRect.top) / uiZoom,
    };
  });

  const gapEl = stage.querySelector('.sl-lane-gap');
  const gapMidY = gapEl
    ? ((gapEl.getBoundingClientRect().top + gapEl.getBoundingClientRect().bottom) / 2 - sRect.top) / uiZoom
    : h / 2;

  mode.edges.forEach(edge => {
    const a = rects[edge.from];
    const b = rects[edge.to];
    if (!a || !b) return;

    const getCellMinLeft = box => {
      const children = box.el && box.el.parentElement ? Array.from(box.el.parentElement.children) : [];
      const lefts = children.map(c => rects[c.dataset.slId] && rects[c.dataset.slId].left).filter(v => v !== undefined);
      return lefts.length ? Math.min(...lefts) : box.left;
    };
    const getCellMaxRight = box => {
      const children = box.el && box.el.parentElement ? Array.from(box.el.parentElement.children) : [];
      const rights = children.map(c => rects[c.dataset.slId] && rects[c.dataset.slId].right).filter(v => v !== undefined);
      return rights.length ? Math.max(...rights) : box.right;
    };

    let pts = [];
    if (edge.route === 'v') {
      if (Math.abs(a.cx - b.cx) < 2) {
        pts = [[a.cx, a.bottom], [a.cx, b.top]];
      } else {
        const midY = (a.bottom + b.top) / 2;
        pts = [[a.cx, a.bottom], [a.cx, midY], [b.cx, midY], [b.cx, b.top]];
      }
    } else if (edge.route === 'v-up') {
      if (Math.abs(a.cx - b.cx) < 2) {
        pts = [[a.cx, a.top], [a.cx, b.bottom]];
      } else {
        const midY = (a.top + b.bottom) / 2;
        pts = [[a.cx, a.top], [a.cx, midY], [b.cx, midY], [b.cx, b.bottom]];
      }
    } else if (edge.route === 'h') {
      const yA = a.cy - 3;
      const yB = b.cy - 3;
      if (Math.abs(yA - yB) < 2) {
        pts = [[a.right, yA], [b.left, yA]];
      } else {
        const midX = (a.right + b.left) / 2;
        pts = [[a.right, yA], [midX, yA], [midX, yB], [b.left, yB]];
      }
    } else if (edge.route === 'left-branch') {
      const gx = getCellMinLeft(a) - 10;
      pts = [[a.left, a.cy + 4], [gx, a.cy + 4], [gx, b.cy], [b.left, b.cy]];
    } else if (edge.route === 'right-up') {
      const gx = getCellMaxRight(a) + 10;
      pts = [[a.right, a.cy], [gx, a.cy], [gx, b.cy], [b.right, b.cy]];
    }

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', roundedOrthoPath(pts, 7));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '1.35');
    path.setAttribute('stroke-linecap', 'round');

    if (edge.style === 'dashed') {
      path.setAttribute('stroke', 'rgba(163, 163, 163, 0.85)');
      path.setAttribute('stroke-dasharray', '4 3');
      path.setAttribute('marker-end', `url(#${dashedId})`);
      svg.appendChild(path);

      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', pts[0][0]);
      dot.setAttribute('cy', pts[0][1]);
      dot.setAttribute('r', '2.5');
      dot.setAttribute('fill', '#0b0b0b');
      dot.setAttribute('stroke', '#a3a3a3');
      dot.setAttribute('stroke-width', '1.3');
      svg.appendChild(dot);
    } else {
      path.setAttribute('stroke', '#737373');
      path.setAttribute('marker-end', `url(#${greenId})`);
      svg.appendChild(path);
    }

    if (edge.badge && badgesLayer) {
      const badgeEl = document.createElement('div');
      badgeEl.className = 'sl-wire-badge';
      badgeEl.style.left = `${(pts[0][0] + pts[pts.length - 1][0]) / 2}px`;
      badgeEl.style.top = `${gapMidY}px`;
      badgeEl.textContent = edge.badge.text;
      badgesLayer.appendChild(badgeEl);
    }
  });
}

function selectWorkflowStep(platform, idx) {
  const cfg = GUIDE_WORKFLOWS[platform];
  if (!cfg) return;
  const canvas = document.getElementById(cfg.canvasId);
  const stepsEl = document.getElementById(cfg.stepsId);
  if (!canvas || !stepsEl) return;

  const items = stepsEl.querySelectorAll('.guide-flow-step-item');
  const nodes = canvas.querySelectorAll('[data-sl-step]');
  const already = items[idx] && items[idx].classList.contains('active');

  items.forEach((el, i) => el.classList.toggle('active', !already && i === idx));
  nodes.forEach(n => n.classList.toggle('active', !already && Number(n.dataset.slStep) === idx));
}

function renderSwimlaneCell(col, platform) {
  const alignClass = col.align === 'top' ? 'align-top' : 'align-bottom';
  const items = col.nodes.map(n => {
    const cls = n.kind === 'pill' ? 'sl-node-pill' : 'sl-node-box';
    return `<button type="button" class="${cls}" data-sl-id="${n.id}" data-sl-step="${n.step}" onclick="selectWorkflowStep('${platform}', ${n.step})">${n.label}</button>`;
  }).join('');
  return `<div class="sl-cell ${alignClass}">${items}</div>`;
}

function renderGuideWorkflow(platform) {
  const cfg = GUIDE_WORKFLOWS[platform];
  if (!cfg) return;
  const modeKey = activeWorkflowModes[platform];
  const mode = cfg.modes[modeKey];
  const canvas = document.getElementById(cfg.canvasId);
  const stepsEl = document.getElementById(cfg.stepsId);
  if (!mode || !canvas) return;

  canvas.dataset.platform = platform;
  canvas.dataset.mode = modeKey;

  const summaryEl = document.getElementById(cfg.summaryId);
  if (summaryEl) {
    summaryEl.textContent = mode.summary;
  }

  const colsCount = mode.phases.length;
  const headsHtml = `<div></div>` + mode.phases.map(p => `<div class="sl-head-cell">${p}</div>`).join('');
  const studioHtml = mode.studio.map(col => renderSwimlaneCell(col, platform)).join('');
  const pipeHtml = mode.pipeline.map(col => renderSwimlaneCell(col, platform)).join('');

  canvas.innerHTML = `
    <div class="sl-stage" style="--sl-cols: ${colsCount};">
      <div class="sl-head-row">${headsHtml}</div>
      <div class="sl-lane">
        <div class="sl-lane-grid">
          <div class="sl-lane-rail">Студия</div>
          ${studioHtml}
        </div>
      </div>
      <div class="sl-lane-gap"></div>
      <div class="sl-lane">
        <div class="sl-lane-grid">
          <div class="sl-lane-rail">Конвейер</div>
          ${pipeHtml}
        </div>
      </div>
      <svg class="sl-svg" aria-hidden="true"></svg>
      <div class="sl-badges"></div>
    </div>
  `;

  if (stepsEl) {
    stepsEl.innerHTML = mode.steps.map((s, idx) => {
      const stepNum = idx + 1;
      const pointsHtml = Array.isArray(s.points) && s.points.length
        ? `<ul class="guide-flow-step-points">${s.points.map(pt => `<li>${pt}</li>`).join('')}</ul>`
        : '';
      return `
        <div class="guide-flow-step-item">
          <h3 class="guide-flow-step-title">${stepNum}. ${s.title}</h3>
          <p class="guide-flow-step-detail">${s.detail}</p>
          ${pointsHtml}
        </div>
      `;
    }).join('');
  }

  requestAnimationFrame(() => drawGuideFlowConnectors(canvas));
}

function setWorkflowSubmode(platform, modeKey, btn) {
  activeWorkflowModes[platform] = modeKey;
  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll('.guide-submode-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
    });
  }
  renderGuideWorkflow(platform);
}

function redrawVisibleGuideFlows() {
  Object.keys(GUIDE_WORKFLOWS).forEach(plat => {
    const canvas = document.getElementById(GUIDE_WORKFLOWS[plat].canvasId);
    if (canvas && canvas.offsetParent !== null) {
      drawGuideFlowConnectors(canvas);
    }
  });
}

function initGuideWorkflows() {
  Object.keys(GUIDE_WORKFLOWS).forEach(plat => renderGuideWorkflow(plat));
}

window.addEventListener('resize', () => {
  requestAnimationFrame(redrawVisibleGuideFlows);
});

document.addEventListener('DOMContentLoaded', () => {
  initGuideWorkflows();
});

function updateGuidePager(tabId) {
  const idx = GUIDE_DOCS_ORDER.findIndex(item => item.id === tabId);
  const currentItem = GUIDE_DOCS_ORDER[idx] || GUIDE_DOCS_ORDER[0];
  const breadcrumb = document.getElementById('guideBreadcrumbCurrent');
  const titleEl = document.getElementById('guidePageTitle');
  const subtitleEl = document.getElementById('guidePageSubtitle');

  if (breadcrumb && currentItem) {
    breadcrumb.textContent = currentItem.label;
  }
  if (titleEl && currentItem) {
    titleEl.textContent = currentItem.title;
  }
  if (subtitleEl && currentItem) {
    subtitleEl.textContent = currentItem.subtitle;
  }

  const prevBtn = document.getElementById('guidePrevBtn');
  const prevTitle = document.getElementById('guidePrevTitle');
  const nextBtn = document.getElementById('guideNextBtn');
  const nextTitle = document.getElementById('guideNextTitle');

  if (prevBtn && prevTitle) {
    const prev = idx > 0 ? GUIDE_DOCS_ORDER[idx - 1] : null;
    if (prev) {
      prevBtn.classList.remove('invisible', 'pointer-events-none');
      prevBtn.dataset.targetTab = prev.id;
      prevTitle.textContent = prev.label;
    } else {
      prevBtn.classList.add('invisible', 'pointer-events-none');
      prevBtn.dataset.targetTab = '';
    }
  }

  if (nextBtn && nextTitle) {
    const next = idx >= 0 && idx < GUIDE_DOCS_ORDER.length - 1 ? GUIDE_DOCS_ORDER[idx + 1] : null;
    if (next) {
      nextBtn.classList.remove('invisible', 'pointer-events-none');
      nextBtn.dataset.targetTab = next.id;
      nextTitle.textContent = next.label;
    } else {
      nextBtn.classList.add('invisible', 'pointer-events-none');
      nextBtn.dataset.targetTab = '';
    }
  }
}

function updateGuidePill(tab, immediate = false) {
  const pill = document.getElementById('tabsPill');
  if (!pill || !tab) return;
  if (immediate) {
    pill.style.transition = 'none';
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
    void pill.offsetHeight;
    pill.style.transition = '';
  } else {
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
  }
}

function switchGuideTab(tabId, btn, shouldScroll = false, options = {}) {
  const bar = document.getElementById('guideTabsBar');
  let targetBtn = btn;
  if (bar) {
    if (!targetBtn || !bar.contains(targetBtn)) {
      targetBtn = bar.querySelector(`[data-guide-tab="${tabId}"]`);
    }
    bar.querySelectorAll('[data-guide-tab]').forEach(b => {
      const isSelected = (b === targetBtn) || b.dataset.guideTab === tabId;
      b.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      b.classList.toggle('active', isSelected);
    });
  }
  window.currentGuideTab = tabId;
  if (options.updateUrl !== false && typeof currentMainTab !== 'undefined' && currentMainTab === 'guide' && typeof syncLocationHash === 'function') {
    syncLocationHash(tabId === 'wf-youtube' ? '#guide' : `#guide/${tabId}`);
  }
  updateGuidePill(targetBtn, Boolean(options.immediate));

  document.querySelectorAll('.guide-tab-pane').forEach(p => p.classList.add('hidden'));
  const activePane = document.getElementById(`tab-${tabId}`);
  if (activePane) {
    activePane.classList.remove('hidden');
  }
  updateGuidePager(tabId);
  requestAnimationFrame(redrawVisibleGuideFlows);
  if (shouldScroll) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function stepGuideTab(direction) {
  const btn = direction < 0
    ? document.getElementById('guidePrevBtn')
    : document.getElementById('guideNextBtn');
  const nextId = btn && btn.dataset ? btn.dataset.targetTab : '';
  if (nextId) {
    switchGuideTab(nextId, null, true);
  }
}

function initGuidePill() {
  if (!document.querySelector('#wfYoutubeCanvas .sl-node-box')) {
    initGuideWorkflows();
  }
  const activeBtn = document.querySelector('#guideTabsBar [aria-selected="true"]')
    || document.querySelector('#guideTabsBar [data-guide-tab]');
  if (activeBtn) {
    updateGuidePill(activeBtn, true);
    if (activeBtn.dataset && activeBtn.dataset.guideTab) {
      updateGuidePager(activeBtn.dataset.guideTab);
    }
  }
  requestAnimationFrame(redrawVisibleGuideFlows);
}

function toggleTaskRow(btn) {
  const row = btn.closest('.task-row');
  if (!row) return;
  const isOpen = row.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function toggleFaq(element) {
  const p = element.querySelector('p');
  const chevron = element.querySelector('.faq-chevron');
  if (!p) return;
  const isHidden = p.classList.contains('hidden');
  if (isHidden) {
    p.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  } else {
    p.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}

function copySnippet(text, triggerEl) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = triggerEl.classList.contains('spell-copy-btn') 
      ? triggerEl 
      : triggerEl.querySelector('.spell-copy-btn');
    if (btn) {
      btn.classList.add('is-copied');
      setTimeout(() => btn.classList.remove('is-copied'), 1600);
    }
  });
}

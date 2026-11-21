// Global application and navigation state
var currentMainTab = 'studio';
var currentGuideTab = 'wf-youtube';
var currentActiveProjectId = null;
var vaultItems = [];
var vaultProjects = [];
var nextWorkspaceIndex = 1;
var vaultStats = { storage_root: 'D:\\Luna-Media', total_files: 0, total_bytes: 0, total_mb: 0, total_gb: 0 };
var currentVaultFilter = 'all';
var currentVaultModeFilter = 'all';
var currentVaultSort = 'newest';
var currentVaultSearch = '';
var deletingItemId = null;
var deletingProjectId = null;
var currentlyPlayingAudioId = null;
var clipperFilesCache = [];

var currentPlatform = 'youtube';
var currentYtSub = 'type_yt_ai_clip';
var currentIgSub = 'type_ig_reels';
var currentTtSub = 'type_tt_video';

var selectedRatio = '9:16';
var selectedClipCount = 5;
var selectedFaceDetect = false;
var selectedQuality = '1080';
var selectedVideoRatio = 'original';
var selectedVideoFps = 'auto';
var selectedTrimRatio = 'original';
var isYoutubeShortLocked = false;

// Multi-Segment Trimmer State (Max 24h, 6 digits: HH:MM:SS or MM:SS)
var trimSegments = [
  { id: 'seg_1', start_time: '00:00', end_time: '00:30' }
];

function parseAndFormatTime(str) {
  if (!str) return '00:00';
  str = String(str).trim();
  const pad = (n) => String(n).padStart(2, '0');

  // If user typed with colons
  if (str.includes(':')) {
    const rawParts = str.split(':').filter(p => p.length > 0).map(p => {
      const clean = p.replace(/\D/g, '').slice(0, 2);
      return parseInt(clean, 10) || 0;
    });

    if (rawParts.length === 3) {
      const h = Math.min(23, rawParts[0]);
      const m = Math.min(59, rawParts[1]);
      const s = Math.min(59, rawParts[2]);
      return `${pad(h)}:${pad(m)}:${pad(s)}`;
    } else if (rawParts.length === 2) {
      const m = Math.min(59, rawParts[0]);
      const s = Math.min(59, rawParts[1]);
      return `${pad(m)}:${pad(s)}`;
    } else if (rawParts.length === 1) {
      const m = Math.min(59, rawParts[0]);
      return `${pad(m)}:00`;
    }
  }

  // If user typed raw digits without colon
  const digits = str.replace(/\D/g, '').slice(0, 6);
  if (!digits) return '00:00';

  if (digits.length <= 2) {
    const s = Math.min(59, parseInt(digits, 10) || 0);
    return `00:${pad(s)}`;
  } else if (digits.length <= 4) {
    const m = Math.min(59, parseInt(digits.slice(0, -2), 10) || 0);
    const s = Math.min(59, parseInt(digits.slice(-2), 10) || 0);
    return `${pad(m)}:${pad(s)}`;
  } else {
    const s = Math.min(59, parseInt(digits.slice(-2), 10) || 0);
    const m = Math.min(59, parseInt(digits.slice(-4, -2), 10) || 0);
    const h = Math.min(23, parseInt(digits.slice(0, -4), 10) || 0);
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
}

function timeToSeconds(str) {
  if (!str) return 0;
  const parts = String(str).trim().split(':').map(p => parseInt(p, 10) || 0);
  if (parts.length === 3) return Math.min(86399, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  if (parts.length === 2) return Math.min(86399, parts[0] * 60 + parts[1]);
  return Math.min(86399, parts[0] || 0);
}

function secondsToTime(sec) {
  sec = Math.max(0, Math.min(86399, Math.floor(sec)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

function renderTrimSegments() {
  // 1. Sync Row 0 in main toolbar
  const seg0 = trimSegments[0] || { id: 'seg_1', start_time: '00:00', end_time: '00:30' };
  const inStart0 = document.getElementById('trimInputStart_0');
  const inEnd0 = document.getElementById('trimInputEnd_0');
  if (inStart0) inStart0.value = seg0.start_time || '00:00';
  if (inEnd0) inEnd0.value = seg0.end_time || '00:30';

  // 2. Render Extra Rows in #trimExtraSegmentsWrapper
  const wrapper = document.getElementById('trimExtraSegmentsWrapper');
  if (!wrapper) return;
  wrapper.innerHTML = '';

  const hasExtras = trimSegments.length > 1;
  const isTrimmerActive = document.getElementById('drawer-trimmer') && !document.getElementById('drawer-trimmer').classList.contains('hidden');
  wrapper.classList.toggle('hidden', !hasExtras || !isTrimmerActive);

  if (hasExtras && isTrimmerActive) {
    trimSegments.slice(1).forEach((seg) => {
      const row = document.createElement('div');
      row.className = 'trim-extra-row flex items-center gap-1.5 flex-shrink-0';
      row.setAttribute('data-seg-id', seg.id);

      row.innerHTML = `
        <!-- Start Pill -->
        <div class="pill-control !py-0 !px-2.5 flex items-center gap-1 cursor-text flex-shrink-0" onclick="this.querySelector('input')?.focus()">
          <span class="text-zinc-400 text-[11px] select-none pointer-events-none">Start:</span>
          <input type="text" maxlength="8" value="${escapeHtml(seg.start_time || '00:00')}"
            class="trim-input-field bg-transparent text-white text-xs font-mono text-center focus:outline-none w-[68px] selection:bg-white/20"
            placeholder="00:00" data-seg-id="${seg.id}" data-field="start_time" />
        </div>

        <!-- End Pill -->
        <div class="pill-control !py-0 !px-2.5 flex items-center gap-1 cursor-text flex-shrink-0" onclick="this.querySelector('input')?.focus()">
          <span class="text-zinc-400 text-[11px] select-none pointer-events-none">End:</span>
          <input type="text" maxlength="8" value="${escapeHtml(seg.end_time || '00:30')}"
            class="trim-input-field bg-transparent text-white text-xs font-mono text-center focus:outline-none w-[68px] selection:bg-white/20"
            placeholder="00:30" data-seg-id="${seg.id}" data-field="end_time" />
        </div>

        <!-- Delete Button -->
        <button type="button" onclick="removeTrimSegment('${seg.id}')"
          class="pill-control !w-7 !h-7 !p-0 flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-white/[0.08] transition-colors flex-shrink-0"
          aria-label="Delete this clip">
          <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
      `;

      wrapper.appendChild(row);
    });
  }

  bindTrimInputEvents();
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  requestAnimationFrame(() => {
    alignExtraTrimSegments();
  });

  // The ratio/sub-feature labels change width, which shifts row 0 and used to leave
  // the extra rows stuck at the old offset. Re-align whenever a toolbar control resizes.
  if (!window.__trimAlignObserver && typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => alignExtraTrimSegments());
    const container = document.getElementById('mainInputCapsuleContainer');
    const controls = container ? container.querySelectorAll('.pill-control') : [];
    controls.forEach((el) => observer.observe(el));
    if (container) observer.observe(container);
    window.__trimAlignObserver = observer;
  }
}

function getLunaUiScale() {
  return typeof window.__getLunaUiScale === 'function' ? window.__getLunaUiScale() : 1;
}

function alignExtraTrimSegments() {
  const startPill = document.getElementById('trimStartPill_0');
  const wrapper = document.getElementById('trimExtraSegmentsWrapper');
  const container = document.getElementById('mainInputCapsuleContainer');
  if (!startPill || !wrapper || !container) return;

  const uiZoom = getLunaUiScale();
  const startRect = startPill.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const offsetLeft = Math.max(0, Math.round((startRect.left - containerRect.left) / uiZoom));

  wrapper.querySelectorAll('.trim-extra-row').forEach(row => {
    row.style.paddingLeft = `${offsetLeft}px`;
  });
}

window.addEventListener('resize', alignExtraTrimSegments);

function addTrimSegmentUI() {
  // Sync row 0 from DOM first
  const inS0 = document.getElementById('trimInputStart_0');
  const inE0 = document.getElementById('trimInputEnd_0');
  if (trimSegments[0]) {
    if (inS0) trimSegments[0].start_time = parseAndFormatTime(inS0.value);
    if (inE0) trimSegments[0].end_time = parseAndFormatTime(inE0.value);
    let s0 = timeToSeconds(trimSegments[0].start_time);
    let e0 = timeToSeconds(trimSegments[0].end_time);
    if (e0 <= s0) {
      trimSegments[0].end_time = secondsToTime(Math.min(86399, s0 + 30));
      if (inE0) inE0.value = trimSegments[0].end_time;
    }
  }

  const lastSeg = trimSegments[trimSegments.length - 1];
  let startSec = 0;
  let endSec = 30;

  if (lastSeg) {
    startSec = timeToSeconds(lastSeg.end_time || '00:30');
    endSec = Math.min(86399, startSec + 30);
  }

  const newId = 'seg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  trimSegments.push({
    id: newId,
    start_time: secondsToTime(startSec),
    end_time: secondsToTime(endSec)
  });
  renderTrimSegments();
}

function removeTrimSegment(segId) {
  if (trimSegments.length <= 1) return;
  trimSegments = trimSegments.filter(s => s.id !== segId);
  renderTrimSegments();
}

function renderTimeFromDigits(digits) {
  digits = String(digits || '').replace(/\D/g, '').slice(0, 6);
  const pad = (n) => String(n).padStart(2, '0');

  if (digits.length === 0) {
    return { text: '00:00', cursor: 0 };
  }
  if (digits.length === 1) {
    let m = parseInt(digits, 10) || 0;
    return { text: `${pad(m)}:00`, cursor: 2 };
  }
  if (digits.length === 2) {
    let m = Math.min(59, parseInt(digits, 10) || 0);
    return { text: `${pad(m)}:00`, cursor: 3 };
  }
  if (digits.length === 3) {
    let m = Math.min(59, parseInt(digits.slice(0, 2), 10) || 0);
    let s = Math.min(59, parseInt(digits[2] + '0', 10) || 0);
    return { text: `${pad(m)}:${pad(s)}`, cursor: 4 };
  }
  if (digits.length === 4) {
    let m = Math.min(59, parseInt(digits.slice(0, 2), 10) || 0);
    let s = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
    return { text: `${pad(m)}:${pad(s)}`, cursor: 5 };
  }
  if (digits.length === 5) {
    let h = Math.min(23, parseInt(digits[0], 10) || 0);
    let m = Math.min(59, parseInt(digits.slice(1, 3), 10) || 0);
    let s = Math.min(59, parseInt(digits.slice(3, 5), 10) || 0);
    return { text: `${pad(h)}:${pad(m)}:${pad(s)}`, cursor: 7 };
  }
  // 6 digits
  let h = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
  let m = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
  let s = Math.min(59, parseInt(digits.slice(4, 6), 10) || 0);
  return { text: `${pad(h)}:${pad(m)}:${pad(s)}`, cursor: 8 };
}

function syncTrimModel(input) {
  const segId = input.getAttribute('data-seg-id');
  const segIdx = input.getAttribute('data-seg-idx');
  const field = input.getAttribute('data-field');
  const seg = segId ? trimSegments.find(s => s.id === segId) : (segIdx !== null ? trimSegments[parseInt(segIdx, 10)] : null);
  if (seg) seg[field] = input.value;
}

function bindTrimInputEvents() {
  document.querySelectorAll('.trim-input-field').forEach(input => {
    // Initialize internal digits buffer from current DOM value
    if (typeof input._digits === 'undefined') {
      input._digits = (input.value || '').replace(/\D/g, '');
    }

    input.onfocus = function() {
      this._justFocused = true;
      setTimeout(() => this.select(), 10);
    };

    input.onmouseup = function(e) {
      if (this.selectionStart === 0 && this.selectionEnd === this.value.length) {
        e.preventDefault();
      }
    };

    input.onkeydown = function(e) {
      // Allow navigation & standard control keys
      if (['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'].includes(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        this.blur();
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (this._justFocused || (this.selectionStart === 0 && this.selectionEnd === this.value.length)) {
          this._digits = '';
          this._justFocused = false;
        } else {
          this._digits = (this._digits || '').slice(0, -1);
        }
        const res = renderTimeFromDigits(this._digits);
        this.value = res.text;
        try { this.setSelectionRange(res.cursor, res.cursor); } catch (err) {}
        syncTrimModel(this);
        return;
      }

      if (e.key === ':') {
        e.preventDefault();
        this._justFocused = false;
        let d = this._digits || '';
        if (d.length === 1) {
          this._digits = '0' + d;
        } else if (d.length === 3) {
          this._digits = d.slice(0, 2) + '0' + d[2];
        }
        const res = renderTimeFromDigits(this._digits);
        this.value = res.text;
        try { this.setSelectionRange(res.cursor, res.cursor); } catch (err) {}
        syncTrimModel(this);
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (this._justFocused || (this.selectionStart === 0 && this.selectionEnd === this.value.length)) {
          this._digits = e.key;
          this._justFocused = false;
        } else {
          if ((this._digits || '').length >= 6) return;
          this._digits = (this._digits || '') + e.key;
        }
        const res = renderTimeFromDigits(this._digits);
        this.value = res.text;
        try { this.setSelectionRange(res.cursor, res.cursor); } catch (err) {}
        syncTrimModel(this);
        return;
      }

      // Disallow any other keystroke
      e.preventDefault();
    };

    // Safety fallback for paste
    input.onpaste = function(e) {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text') || '';
      const digits = pasted.replace(/\D/g, '').slice(0, 6);
      if (digits) {
        this._digits = digits;
        this._justFocused = false;
        const res = renderTimeFromDigits(this._digits);
        this.value = res.text;
        try { this.setSelectionRange(res.cursor, res.cursor); } catch (err) {}
        syncTrimModel(this);
      }
    };

    // Safety fallback for mobile/virtual keyboards
    input.oninput = function() {
      if (!this.value.includes(':')) {
        let raw = this.value.replace(/\D/g, '').slice(0, 6);
        this._digits = raw;
        const res = renderTimeFromDigits(raw);
        this.value = res.text;
        try { this.setSelectionRange(res.cursor, res.cursor); } catch (err) {}
      }
      syncTrimModel(this);
    };

    // Validation & Auto-correction: End MUST be strictly greater than Start
    input.onblur = function() {
      this._justFocused = false;
      const formatted = parseAndFormatTime(this.value);
      this.value = formatted;
      this._digits = formatted.replace(/\D/g, '');

      const segId = this.getAttribute('data-seg-id');
      const segIdx = this.getAttribute('data-seg-idx');
      const field = this.getAttribute('data-field');
      const seg = segId ? trimSegments.find(s => s.id === segId) : (segIdx !== null ? trimSegments[parseInt(segIdx, 10)] : null);
      if (!seg) return;
      seg[field] = formatted;

      let stSec = timeToSeconds(seg.start_time || '00:00');
      let etSec = timeToSeconds(seg.end_time || '00:30');

      if (field === 'start_time') {
        if (etSec <= stSec) {
          etSec = Math.min(86399, stSec + 30);
          seg.end_time = secondsToTime(etSec);
          if (segIdx === '0' || segIdx === 0) {
            const inEnd = document.getElementById('trimInputEnd_0');
            if (inEnd) {
              inEnd.value = seg.end_time;
              inEnd._digits = seg.end_time.replace(/\D/g, '');
            }
          } else {
            const row = document.querySelector(`.trim-extra-row[data-seg-id="${seg.id}"]`);
            if (row) {
              const inEnd = row.querySelector('[data-field="end_time"]');
              if (inEnd) {
                inEnd.value = seg.end_time;
                inEnd._digits = seg.end_time.replace(/\D/g, '');
              }
            }
          }
        }
      } else if (field === 'end_time') {
        if (etSec <= stSec) {
          etSec = Math.min(86399, stSec + 30);
          seg.end_time = secondsToTime(etSec);
          this.value = seg.end_time;
          this._digits = seg.end_time.replace(/\D/g, '');
        }
      }
    };
  });
}

function getAllTrimSegments() {
  return trimSegments.map((s, idx) => {
    if (idx === 0) {
      const inS = document.getElementById('trimInputStart_0');
      const inE = document.getElementById('trimInputEnd_0');
      return {
        start_time: parseAndFormatTime(inS ? inS.value : (s.start_time || '00:00')),
        end_time: parseAndFormatTime(inE ? inE.value : (s.end_time || '00:30'))
      };
    }
    return {
      start_time: parseAndFormatTime(s.start_time || '00:00'),
      end_time: parseAndFormatTime(s.end_time || '00:30')
    };
  });
}

// Trim Ratio Selector Handlers
function toggleTrimRatioDropdown(e) {
  if (e) e.stopPropagation();
  if (isYoutubeShortLocked) return;
  const menu = document.getElementById('trimRatioMenu');
  const chev = document.getElementById('trimRatioChevron');
  const btn = document.getElementById('trimRatioDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'trimRatioMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('trimRatioMenu');
  }
}

function selectTrimRatioFromMenu(r, label) {
  const nextRatio = isYoutubeShortLocked ? 'original' : r;
  const nextLabel = isYoutubeShortLocked ? 'Original' : label;
  selectedTrimRatio = nextRatio;
  const labelEl = document.getElementById('currentTrimRatioLabel');
  if (labelEl) labelEl.innerText = nextLabel;

  document.querySelectorAll('#trimRatioMenu .quality-menu-item[data-tratio]').forEach(item => {
    const isAct = item.getAttribute('data-tratio') === nextRatio;
    item.classList.toggle('active', isAct);
  });

  closeDropdownSmoothly('trimRatioMenu', 'trimRatioChevron', 'trimRatioDropdownBtn', 80);
  requestAnimationFrame(alignExtraTrimSegments);
}
var currentLang = 'en';
var defaultClipLanguage = 'en';

var activeJobId = null;
var pollInterval = null;

if (window.lucide && typeof window.lucide.createIcons === 'function') {
  window.lucide.createIcons();
}

const SUB_FEATURES = {
  youtube: [
    { id: 'type_yt_ai_clip', label: 'AI Short Clips', desc: 'Virality Score', icon: 'clapperboard', btnText: 'Generate', drawer: 'ai-clip' },
    { id: 'type_yt_video', label: 'Full HD Video', desc: '1080p / 720p / 480p MP4', icon: 'film', btnText: 'Download', drawer: 'quality' },
    { id: 'type_yt_mp3', label: 'Audio MP3', desc: '320kbps High Quality', icon: 'music', btnText: 'Download', drawer: null },
    { id: 'type_yt_clip', label: 'Video Trimmer', desc: 'Manually trim video duration', icon: 'scissors', btnText: 'Download', drawer: 'trimmer' }
  ],
  instagram: [
    { id: 'type_ig_reels', label: 'Reels', desc: 'Reels / Video Post', icon: 'film', btnText: 'Download', drawer: null }
  ],
  tiktok: [
    { id: 'type_tt_video', label: 'Video MP4', desc: 'HD Video MP4', icon: 'film', btnText: 'Download', drawer: null },
    { id: 'type_tt_mp3', label: 'Audio MP3', desc: 'TikTok song / soundtrack', icon: 'music', btnText: 'Download', drawer: null }
  ]
};

const mainUrlInput = document.getElementById('mainUrlInput');
const mainBtnText = document.getElementById('mainBtnText');
const mainActionBtn = document.getElementById('mainActionBtn');

function setMainActionLabel(text) {
  const labelEl = document.getElementById('mainBtnText');
  if (labelEl) labelEl.innerText = text;
  else mainActionBtn.textContent = text;
}

const videoInfoCard = document.getElementById('videoInfoCard');
const previewThumb = document.getElementById('previewThumb');
const previewTitle = document.getElementById('previewTitle');
const previewDuration = document.getElementById('previewDuration');
const previewBullet = document.getElementById('previewBullet');
const previewPlatformTag = document.getElementById('previewPlatformTag');

const progressStateCard = document.getElementById('progressStateCard');
const stageMainTitle = document.getElementById('stageMainTitle');
const stageSubTitle = document.getElementById('stageSubTitle');
const jobIdPill = document.getElementById('jobIdPill');

const resultsShowcase = document.getElementById('resultsShowcase');
const shortsGalleryGrid = document.getElementById('shortsGalleryGrid');
const batchZipDownloadBtn = document.getElementById('batchZipDownloadBtn');
const resultsCountNotice = document.getElementById('resultsCountNotice');

// Paste Action
async function pasteMainUrl() {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      mainUrlInput.value = text;
      detectUrlPlatform(text);
      fastPreview(text);
      fetchVideoInfo(text, 0);
    }
  } catch (err) {
    console.log(err);
  }
}

function formatPlatformName(platform) {
  if (!platform) return 'Media';
  const p = platform.toLowerCase();
  if (p.includes('youtube')) return 'YouTube';
  if (p.includes('tiktok')) return 'TikTok';
  if (p.includes('instagram') || p.includes('reels')) return 'Instagram';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

function isYoutubeShortUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(String(url).trim());
    const host = parsed.hostname.toLowerCase();
    return (host === 'youtube.com' || host.endsWith('.youtube.com'))
      && /^\/shorts\/[A-Za-z0-9_-]+/i.test(parsed.pathname);
  } catch {
    return /(?:^|https?:\/\/)(?:[\w-]+\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]+/i.test(String(url).trim());
  }
}

const SUPPORTED_MEDIA_DOMAINS = ['youtube.com', 'youtu.be', 'instagram.com', 'instagr.am', 'tiktok.com'];
const QUALITY_LABELS = { '1080': '1080p FHD', '720': '720p HD', '480': '480p SD', '360': '360p SD' };

function isSupportedMediaHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return SUPPORTED_MEDIA_DOMAINS.some(d => host === d || host.endsWith('.' + d));
}

function getMediaHost(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return (u.hostname || '').toLowerCase();
  } catch (_) {
    return '';
  }
}

function extractVideoInfoInstant(url) {
  if (!isValidMediaUrl(url)) return null;
  const host = getMediaHost(url);
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be')) {
    const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|watch\?v=|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      return {
        platform: isYoutubeShortUrl(url) ? 'YouTube Shorts' : 'YouTube',
        thumbnail: `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`,
        title: 'Loading video title...'
      };
    }
    return null;
  }
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
    return {
      platform: 'TikTok',
      thumbnail: null,
      title: 'Loading media title...'
    };
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am' || host.endsWith('.instagr.am')) {
    return {
      platform: 'Instagram',
      thumbnail: null,
      title: 'Loading Reels title...'
    };
  }
  return null;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0 || isNaN(seconds)) return '';
  const totalSec = Math.round(Number(seconds));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function fastPreview(url) {
  if (!isValidMediaUrl(url)) {
    videoInfoCard.classList.add('hidden');
    return;
  }
  const instant = extractVideoInfoInstant(url);
  if (instant) {
    previewPlatformTag.innerText = instant.platform;
    previewDuration.innerText = '';
    previewDuration.classList.add('hidden');
    if (previewBullet) previewBullet.classList.add('hidden');
    previewTitle.innerText = instant.title;
    if (instant.thumbnail) {
      previewThumb.src = instant.thumbnail;
      previewThumb.classList.remove('hidden');
    } else {
      previewThumb.classList.add('hidden');
    }
    videoInfoCard.classList.remove('hidden');
  }

  // Fast instant client-side oEmbed query (sub-100ms) so real title appears immediately
  const host = getMediaHost(url);
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts\/|watch\?v=|embed\/|v\/|live\/))([a-zA-Z0-9_-]{11})/);
  if ((host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be')) && ytMatch) {
    const vidId = ytMatch[1];
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vidId}&format=json`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.title && mainUrlInput.value.trim() === url) {
          previewTitle.innerText = data.title;
          previewPlatformTag.innerText = isYoutubeShortUrl(url) ? 'YouTube Shorts' : 'YouTube';
          if (data.thumbnail_url) {
            previewThumb.src = data.thumbnail_url;
            previewThumb.classList.remove('hidden');
          }
        }
      })
      .catch(() => {});
  } else if ((host === 'tiktok.com' || host.endsWith('.tiktok.com')) && host !== 'vt.tiktok.com' && host !== 'vm.tiktok.com' && !url.includes('/t/')) {
    fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.title && mainUrlInput.value.trim() === url) {
          previewTitle.innerText = data.title;
          previewPlatformTag.innerText = 'TikTok';
          if (data.thumbnail_url) {
            previewThumb.src = data.thumbnail_url;
            previewThumb.classList.remove('hidden');
          }
        }
      })
      .catch(() => {});
  }
}

mainUrlInput.addEventListener('input', (e) => {
  const url = e.target.value.trim();
  detectUrlPlatform(url);
  fastPreview(url);
  fetchVideoInfo(url, 150);
});

mainUrlInput.addEventListener('paste', () => {
  setTimeout(() => {
    const url = mainUrlInput.value.trim();
    detectUrlPlatform(url);
    fastPreview(url);
    fetchVideoInfo(url, 0);
  }, 0);
});

mainUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    triggerAction();
  }
});

const LUNA_LOCK_ICON_PATHS = '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>';

const YOUTUBE_SHORT_LOCKED_FEATURES = {
  type_yt_ai_clip: 'AI Short Clips is unavailable for YouTube Shorts',
  type_yt_clip: 'Video Trimmer is unavailable for YouTube Shorts',
};

function createLockBadgeElement(wrapperClass, svgClass) {
  const badge = document.createElement('span');
  badge.className = wrapperClass;
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = `<svg viewBox="0 0 24 24" class="${svgClass}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LUNA_LOCK_ICON_PATHS}</svg>`;
  return badge;
}

function syncRatioControlLock(btnId, chevId, locked, lockTitle = 'YouTube Shorts always use Original ratio') {
  const btn = document.getElementById(btnId);
  const chev = document.getElementById(chevId);
  if (btn) {
    btn.disabled = locked;
    btn.setAttribute('aria-disabled', locked ? 'true' : 'false');
    btn.classList.toggle('is-locked', locked);
    if (locked) {
      btn.setAttribute('title', lockTitle);
    } else {
      btn.removeAttribute('title');
    }
    const existingLock = btn.querySelector('.pill-lock-icon');
    if (locked && !existingLock) {
      btn.appendChild(createLockBadgeElement('pill-lock-icon', 'w-2.5 h-2.5'));
    } else if (!locked && existingLock) {
      existingLock.remove();
    }
  }
  if (chev) chev.classList.toggle('hidden', locked);
}

function syncFaceDetectLockUI() {
  const locked = selectedRatio === '16:9' || selectedRatio === 'original';
  const lockTitle = selectedRatio === 'original'
    ? 'Face Track is unavailable for Original ratio'
    : 'Face Track is unavailable for 16:9 Wide ratio';
  syncRatioControlLock(
    'faceDetectDropdownBtn',
    'faceChevron',
    locked,
    lockTitle
  );
  if (locked) {
    if (selectedFaceDetect) selectFaceDetectFromMenu(false, 'Center Crop');
    const menu = document.getElementById('faceDetectMenu');
    const btn = document.getElementById('faceDetectDropdownBtn');
    if (menu) { menu.setAttribute('data-open', 'false'); menu.classList.remove('open'); }
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('active'); }
  }
}

function syncSubFeatureShortLockUI() {
  const locked = Boolean(isYoutubeShortLocked && currentPlatform === 'youtube');
  Object.entries(YOUTUBE_SHORT_LOCKED_FEATURES).forEach(([subId, lockTitle]) => {
    const item = document.querySelector(`#subFeatureMenu .sub-menu-item[data-sub="${subId}"]`);
    if (!item) return;
    item.classList.toggle('is-disabled', locked);
    item.setAttribute('aria-disabled', locked ? 'true' : 'false');
    if (locked) {
      item.setAttribute('title', lockTitle);
    } else {
      item.removeAttribute('title');
    }
    item.querySelector('.short-lock-tag')?.remove();
    const existingLock = item.querySelector('.short-lock-icon');
    if (locked && !existingLock) {
      item.appendChild(createLockBadgeElement('short-lock-icon ml-auto flex items-center text-zinc-500 shrink-0', 'w-3 h-3'));
    } else if (!locked && existingLock) {
      existingLock.remove();
    }
  });
}

function syncYoutubeShortLockUI() {
  const locked = Boolean(isYoutubeShortLocked && currentPlatform === 'youtube');
  syncRatioControlLock('videoRatioDropdownBtn', 'videoRatioChevron', locked);
  syncRatioControlLock('trimRatioDropdownBtn', 'trimRatioChevron', locked);
  syncSubFeatureShortLockUI();

  if (locked) {
    if (selectedVideoRatio !== 'original') selectVideoRatioFromMenu('original', 'Original');
    if (selectedTrimRatio !== 'original') selectTrimRatioFromMenu('original', 'Original');
    const vMenu = document.getElementById('videoRatioMenu');
    const tMenu = document.getElementById('trimRatioMenu');
    if (vMenu) { vMenu.setAttribute('data-open', 'false'); vMenu.classList.remove('open'); }
    if (tMenu) { tMenu.setAttribute('data-open', 'false'); tMenu.classList.remove('open'); }
  }
}

function syncYoutubeShortState(url) {
  const nextShort = isYoutubeShortUrl(url);
  const becameShort = !isYoutubeShortLocked && nextShort;
  isYoutubeShortLocked = nextShort;

  if (
    nextShort &&
    currentPlatform === 'youtube' &&
    (becameShort || Object.prototype.hasOwnProperty.call(YOUTUBE_SHORT_LOCKED_FEATURES, currentYtSub))
  ) {
    selectSubFeature('type_yt_video', false);
  }
  syncYoutubeShortLockUI();
}

function detectUrlPlatform(url) {
  const trimmed = String(url || '').trim();
  const host = getMediaHost(trimmed);
  const checkHost = host || (!/^https?:\/\//i.test(trimmed) ? trimmed.toLowerCase() : '');
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com') || (!host && checkHost.includes('tiktok.com'))) {
    isYoutubeShortLocked = false;
    switchPlatform('tiktok', false);
    return;
  }
  if (host === 'instagram.com' || host.endsWith('.instagram.com') || host === 'instagr.am' || host.endsWith('.instagr.am') || (!host && (checkHost.includes('instagram.com') || checkHost.includes('instagr.am')))) {
    isYoutubeShortLocked = false;
    switchPlatform('instagram', false);
    return;
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be') || (!host && (checkHost.includes('youtube.com') || checkHost.includes('youtu.be')))) {
    if (currentPlatform !== 'youtube') {
      switchPlatform('youtube', false);
    }
    syncYoutubeShortState(url);
    return;
  }
  if (isYoutubeShortLocked) {
    isYoutubeShortLocked = false;
    syncYoutubeShortLockUI();
  }
}

let debounceTimer = null;
let lastUnavailableUrl = '';
function showUnavailablePreview(message, url, notify = true) {
  latestVideoTitle = { url: '', title: '' };
  previewPlatformTag.innerText = 'Unavailable';
  previewTitle.innerText = 'Link unavailable';
  previewDuration.innerText = '';
  previewDuration.classList.add('hidden');
  if (previewBullet) previewBullet.classList.add('hidden');
  if (previewThumb) previewThumb.classList.add('hidden');
  videoInfoCard.classList.remove('hidden');
  if (notify && url !== lastUnavailableUrl) {
    lastUnavailableUrl = url;
    showToast(message, true);
  }
}

function fetchVideoInfo(url, delay = 150) {
  clearTimeout(debounceTimer);
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) {
    lastUnavailableUrl = '';
    videoInfoCard.classList.add('hidden');
    return;
  }
  if (!/^https?:\/\//i.test(cleanUrl)) {
    videoInfoCard.classList.add('hidden');
    if (!/^https?:?\/?\/?$/i.test(cleanUrl) && cleanUrl.length >= 4) {
      debounceTimer = setTimeout(() => {
        if (mainUrlInput.value.trim() !== cleanUrl) return;
        showUnavailablePreview(
          'Invalid URL. Paste a link starting with https:// from YouTube, Instagram, or TikTok.',
          cleanUrl,
          false
        );
      }, Math.max(delay, 350));
    }
    return;
  }
  if (!isValidMediaUrl(cleanUrl)) {
    videoInfoCard.classList.add('hidden');
    let hasHostDot = false;
    try {
      hasHostDot = new URL(cleanUrl).hostname.includes('.');
    } catch (_) {}
    if (hasHostDot) {
      debounceTimer = setTimeout(() => {
        if (mainUrlInput.value.trim() !== cleanUrl) return;
        showUnavailablePreview(
          'Unsupported URL. Only YouTube, Instagram, and TikTok links are supported.',
          cleanUrl,
          true
        );
      }, Math.max(delay, 250));
    }
    return;
  }
  debounceTimer = setTimeout(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14000);
    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
        signal: controller.signal
      });
      if (mainUrlInput.value.trim() !== cleanUrl) return;
      if (res.ok) {
        const data = await res.json();
        if (mainUrlInput.value.trim() !== cleanUrl) return;
        if (data.title && data.title !== 'Media Item') {
          lastUnavailableUrl = '';
          latestVideoTitle = { url: cleanUrl, title: data.title };
          previewTitle.innerText = data.title;
          const durText = formatDuration(data.duration);
          if (durText) {
            previewDuration.innerText = durText;
            previewDuration.classList.remove('hidden');
            if (previewBullet) previewBullet.classList.remove('hidden');
          } else {
            previewDuration.innerText = '';
            previewDuration.classList.add('hidden');
            if (previewBullet) previewBullet.classList.add('hidden');
          }
          previewPlatformTag.innerText = formatPlatformName(data.platform);

          if (data.thumbnail) {
            previewThumb.src = data.thumbnail;
            previewThumb.classList.remove('hidden');
          }
          videoInfoCard.classList.remove('hidden');
        } else {
          showUnavailablePreview(
            data.warning || 'Could not read video details from this link. Check the URL and try again.',
            cleanUrl
          );
        }
      } else {
        let detailMsg = 'Could not read this link. Make sure it is a supported YouTube, Instagram, or TikTok URL.';
        try {
          const errData = await res.json();
          if (errData && errData.detail) detailMsg = errData.detail;
        } catch (_) {}
        showUnavailablePreview(detailMsg, cleanUrl);
      }
    } catch (e) {
      if (mainUrlInput.value.trim() !== cleanUrl) return;
      showUnavailablePreview(
        'Could not read this link. Check the URL, or copy a fresh link from the app.',
        cleanUrl
      );
    } finally {
      clearTimeout(timeout);
    }
  }, delay);
}

// Gliding dropdown indicator on hover
function attachGlidingListener(menu) {
  if (!menu) return;
  let indicator = menu.querySelector('.gliding-menu-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'gliding-menu-indicator pointer-events-none absolute left-[3px] right-[3px] rounded-[6px] bg-white/[0.08] z-[1]';
    indicator.style.opacity = '0';
    indicator.style.transition = 'top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease';
    menu.insertBefore(indicator, menu.firstChild);
  }

  const getItems = () => menu.querySelectorAll('.platform-menu-item, .sub-menu-item, .aspect-menu-item, .count-menu-item, .fd-menu-item, .quality-menu-item');

  const moveToItem = (item) => {
    if (!item || !indicator) return;
    indicator.style.top = `${item.offsetTop}px`;
    indicator.style.height = `${item.offsetHeight}px`;
    indicator.style.opacity = '1';
  };

  getItems().forEach(item => {
    item.onmouseenter = (e) => {
      e.stopPropagation();
      moveToItem(item);
    };
  });

  menu.onmouseleave = () => {
    const active = menu.querySelector('.active');
    if (active) {
      moveToItem(active);
    } else {
      indicator.style.opacity = '0';
    }
  };
}

function alignMenuIndicator(menuId) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  attachGlidingListener(menu);
  const indicator = menu.querySelector('.gliding-menu-indicator');
  const active = menu.querySelector('.active') || menu.querySelector('.platform-menu-item, .sub-menu-item, .aspect-menu-item, .count-menu-item, .fd-menu-item, .quality-menu-item');
  if (indicator && active) {
    indicator.style.transition = 'none';
    indicator.style.top = `${active.offsetTop}px`;
    indicator.style.height = `${active.offsetHeight}px`;
    indicator.style.opacity = '1';
    void indicator.offsetHeight;
    indicator.style.transition = 'top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease';
  }
}

function initAllGlidingIndicators() {
  ['platformMenu', 'subFeatureMenu', 'aspectRatioMenu', 'clipCountMenu', 'faceDetectMenu', 'qualityMenu', 'videoRatioMenu', 'videoFpsMenu', 'trimRatioMenu', 'vaultModeMenu', 'vaultSortMenu'].forEach(id => {
    const m = document.getElementById(id);
    if (m) attachGlidingListener(m);
  });
}

// Dropdown Toggles
function togglePlatformDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('platformMenu');
  const chev = document.getElementById('platformChevron');
  const btn = document.getElementById('platformDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'platformMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('platformMenu');
  }
}

function closeDropdownSmoothly(menuId, chevId, btnId, delay = 80) {
  setTimeout(() => {
    const menu = document.getElementById(menuId);
    const chev = chevId ? document.getElementById(chevId) : null;
    const btn = btnId ? document.getElementById(btnId) : null;
    if (menu) {
      menu.setAttribute('data-open', 'false');
      menu.classList.remove('open');
    }
    if (chev) chev.classList.remove('rotate-180');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('active');
    }
  }, delay);
}

function selectPlatformFromMenu(plat) {
  switchPlatform(plat, true);
  closeDropdownSmoothly('platformMenu', 'platformChevron', 'platformDropdownBtn', 80);
}

function selectPlatformBadge(plat) {
  switchPlatform(plat, true);
}

// Platform Switcher
function switchPlatform(plat, manualSwitch = false) {
  currentPlatform = plat;

  if (manualSwitch) {
    mainUrlInput.value = '';
    videoInfoCard.classList.add('hidden');
    isYoutubeShortLocked = false;
  }

  // Highlight active platform badge
  document.querySelectorAll('.platform-badge').forEach(item => {
    item.classList.toggle('active', item.id === `badge-${plat}`);
  });

  const labels = {
    youtube: 'YouTube',
    instagram: 'Reels',
    tiktok: 'TikTok'
  };
  const icons = {
    youtube: '/assets/youtube-logo.svg?v=3',
    instagram: '/assets/instagram-logo.svg?v=3',
    tiktok: '/assets/tiktok-logo.svg?v=3'
  };

  const labelEl = document.getElementById('currentPlatformLabel');
  const iconEl = document.getElementById('currentPlatformIcon');
  if (labelEl) labelEl.innerText = labels[plat] || plat;
  if (iconEl) iconEl.src = icons[plat] || '/assets/youtube-logo.svg?v=3';

  // Highlight active item in platform dropdown
  document.querySelectorAll('.platform-menu-item[data-plat]').forEach(item => {
    const isAct = item.getAttribute('data-plat') === plat;
    item.classList.toggle('active', isAct);
  });

  // Populate sub-features menu for this platform
  populateSubFeatureMenu(plat);

  // Select default sub-feature
  const defaultSub = plat === 'youtube' ? currentYtSub : (plat === 'instagram' ? currentIgSub : currentTtSub);
  selectSubFeature(defaultSub, false);
  syncYoutubeShortLockUI();

  // Handle sub-feature chevron and interactivity for single-option platforms (Reels)
  const subChev = document.getElementById('subChevron');
  const subBtn = document.getElementById('subFeatureDropdownBtn');
  if (plat === 'instagram') {
    if (subChev) subChev.classList.add('hidden');
    if (subBtn) subBtn.style.cursor = 'default';
  } else {
    if (subChev) subChev.classList.remove('hidden');
    if (subBtn) subBtn.style.cursor = 'pointer';
  }

  // Update placeholder
  if (plat === 'youtube') mainUrlInput.placeholder = 'Paste a YouTube link';
  else if (plat === 'instagram') mainUrlInput.placeholder = 'Paste link Reels';
  else if (plat === 'tiktok') mainUrlInput.placeholder = 'Paste link TikTok';
}

function populateSubFeatureMenu(plat) {
  const menu = document.getElementById('subFeatureMenu');
  if (!menu) return;
  menu.innerHTML = '<span class="gliding-menu-indicator pointer-events-none absolute left-[3px] right-[3px] rounded-[6px] bg-white/[0.08] z-[1]" style="opacity: 0; transition: top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease;"></span>';
  const list = SUB_FEATURES[plat] || [];

  list.forEach(item => {
    const el = document.createElement('div');
    el.className = 'sub-menu-item group flex items-center transition cursor-pointer select-none';
    el.setAttribute('data-sub', item.id);
    el.onclick = () => selectSubFeature(item.id, true);

    el.innerHTML = `
      <span class="sub-item-title truncate text-[#d4d4d8]">${escapeHtml(item.label)}</span>
    `;
    menu.appendChild(el);
  });

  attachGlidingListener(menu);
  syncSubFeatureShortLockUI();
  lucide.createIcons();
}

function selectSubFeature(subId, closeMenu = true) {
  if (
    isYoutubeShortLocked &&
    currentPlatform === 'youtube' &&
    Object.prototype.hasOwnProperty.call(YOUTUBE_SHORT_LOCKED_FEATURES, subId)
  ) {
    return;
  }
  if (currentPlatform === 'youtube') currentYtSub = subId;
  else if (currentPlatform === 'instagram') currentIgSub = subId;
  else if (currentPlatform === 'tiktok') currentTtSub = subId;

  const features = SUB_FEATURES[currentPlatform] || [];
  const feat = features.find(f => f.id === subId) || features[0];
  if (!feat) return;

  const subLabel = document.getElementById('currentSubFeatureLabel');
  if (subLabel) subLabel.innerText = feat.label;

  if (mainBtnText) {
    mainBtnText.innerText = feat.btnText;
  }

  // Highlight in sub-feature menu
  document.querySelectorAll('.sub-menu-item').forEach(item => {
    const isAct = item.getAttribute('data-sub') === feat.id;
    const titleEl = item.querySelector('.sub-item-title');
    const iconEl = item.querySelector('.sub-icon');

    item.classList.toggle('active', isAct);
    if (iconEl) {
      iconEl.classList.toggle('text-white', isAct);
      iconEl.classList.toggle('text-[#a1a1aa]', !isAct);
      iconEl.classList.remove('text-white', 'text-[#71717a]');
    }
    if (titleEl) {
      titleEl.classList.toggle('text-white', isAct);
      titleEl.classList.toggle('text-[#d4d4d8]', !isAct);
      titleEl.classList.remove('text-[#a1a1aa]');
    }
  });

  // Update Options Drawer
  updateDrawer(feat);

  if (closeMenu) {
    closeDropdownSmoothly('subFeatureMenu', 'subChevron', 'subFeatureDropdownBtn', 80);
  }

  lucide.createIcons();
}

function updateDrawer(feat) {
  const drawerAi = document.getElementById('drawer-ai-clip');
  const drawerQuality = document.getElementById('drawer-quality');
  const drawerQualityPill = document.getElementById('drawer-quality-pill');
  const drawerTrimmer = document.getElementById('drawer-trimmer');
  const extraTrimmer = document.getElementById('trimExtraSegmentsWrapper');

  [drawerAi, drawerQuality, drawerQualityPill, drawerTrimmer, extraTrimmer].forEach(el => {
    if (el) el.classList.add('hidden');
  });

  if (feat.drawer === 'ai-clip') {
    if (drawerQualityPill) drawerQualityPill.classList.remove('hidden');
    if (drawerAi) drawerAi.classList.remove('hidden');
  } else if (feat.drawer === 'quality') {
    if (drawerQualityPill) drawerQualityPill.classList.remove('hidden');
    if (drawerQuality) drawerQuality.classList.remove('hidden');
  } else if (feat.drawer === 'trimmer') {
    if (drawerTrimmer) drawerTrimmer.classList.remove('hidden');
    renderTrimSegments();
  }
}

// Central Dropdown Manager (Prevents overlapping/collision)
function closeAllDropdowns(exceptId = null) {
  const menus = ['subFeatureMenu', 'aspectRatioMenu', 'clipCountMenu', 'faceDetectMenu', 'qualityMenu', 'videoRatioMenu', 'videoFpsMenu', 'trimRatioMenu', 'platformMenu', 'vaultModeMenu', 'vaultSortMenu'];
  const chevrons = {
    subFeatureMenu: 'subChevron',
    aspectRatioMenu: 'aspectChevron',
    clipCountMenu: 'countChevron',
    faceDetectMenu: 'faceChevron',
    qualityMenu: 'qualityChevron',
    videoRatioMenu: 'videoRatioChevron',
    videoFpsMenu: 'videoFpsChevron',
    trimRatioMenu: 'trimRatioChevron',
    platformMenu: 'platformChevron',
    vaultModeMenu: 'vaultModeChevron',
    vaultSortMenu: 'vaultSortChevron'
  };
  const triggerBtns = {
    subFeatureMenu: 'subFeatureDropdownBtn',
    aspectRatioMenu: 'aspectRatioDropdownBtn',
    clipCountMenu: 'clipCountDropdownBtn',
    faceDetectMenu: 'faceDetectDropdownBtn',
    qualityMenu: 'qualityDropdownBtn',
    videoRatioMenu: 'videoRatioDropdownBtn',
    videoFpsMenu: 'videoFpsDropdownBtn',
    trimRatioMenu: 'trimRatioDropdownBtn',
    platformMenu: 'platformDropdownBtn',
    vaultModeMenu: 'vaultModeDropdownBtn',
    vaultSortMenu: 'vaultSortDropdownBtn'
  };
  menus.forEach(id => {
    if (id !== exceptId) {
      const menu = document.getElementById(id);
      if (menu) {
        menu.setAttribute('data-open', 'false');
        menu.classList.remove('open');
      }
      const chevId = chevrons[id];
      if (chevId) document.getElementById(chevId)?.classList.remove('rotate-180');
      const btnId = triggerBtns[id];
      if (btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.setAttribute('aria-expanded', 'false');
          btn.classList.remove('active');
        }
      }
    }
  });
}

function toggleSubFeatureDropdown(e) {
  if (e) e.stopPropagation();
  if (currentPlatform === 'instagram') return;
  const menu = document.getElementById('subFeatureMenu');
  const chev = document.getElementById('subChevron');
  const btn = document.getElementById('subFeatureDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'subFeatureMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('subFeatureMenu');
  }
}

// Ratio Dropdown Handlers
function toggleAspectRatioDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('aspectRatioMenu');
  const chev = document.getElementById('aspectChevron');
  const btn = document.getElementById('aspectRatioDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'aspectRatioMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('aspectRatioMenu');
  }
}

function selectRatioFromMenu(r, label) {
  selectedRatio = r;
  const labelEl = document.getElementById('currentAspectRatioLabel');
  if (labelEl) labelEl.innerText = label;

  document.querySelectorAll('.aspect-menu-item[data-ratio]').forEach(item => {
    const isAct = item.getAttribute('data-ratio') === r;
    item.classList.toggle('active', isAct);
  });

  syncFaceDetectLockUI();
  closeDropdownSmoothly('aspectRatioMenu', 'aspectChevron', 'aspectRatioDropdownBtn', 80);
}

function setRatio(r) {
  const labels = {
    '9:16': '9:16 Vertical',
    '16:9': '16:9 Wide',
    '1:1': '1:1 Square',
    '3:4': '3:4 Portrait'
  };
  selectRatioFromMenu(r, labels[r] || r);
}

// Clip Count Dropdown Handlers
function toggleClipCountDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('clipCountMenu');
  const chev = document.getElementById('countChevron');
  const btn = document.getElementById('clipCountDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'clipCountMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('clipCountMenu');
  }
}

function selectClipCountFromMenu(cnt, label) {
  selectedClipCount = Number(cnt);
  const labelEl = document.getElementById('currentClipCountLabel');
  if (labelEl) labelEl.innerText = label;

  document.querySelectorAll('.count-menu-item[data-count]').forEach(item => {
    const isAct = Number(item.getAttribute('data-count')) === Number(cnt);
    item.classList.toggle('active', isAct);
  });

  closeDropdownSmoothly('clipCountMenu', 'countChevron', 'clipCountDropdownBtn', 80);
}

function setClipCount(cnt) {
  selectClipCountFromMenu(cnt, `${cnt} Clips`);
}

// Face Detect Dropdown Handlers
function toggleFaceDetectDropdown(e) {
  if (e) e.stopPropagation();
  if (selectedRatio === '16:9' || selectedRatio === 'original') return;
  const menu = document.getElementById('faceDetectMenu');
  const chev = document.getElementById('faceChevron');
  const btn = document.getElementById('faceDetectDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'faceDetectMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('faceDetectMenu');
  }
}

function selectFaceDetectFromMenu(val, label) {
  const locked = selectedRatio === '16:9' || selectedRatio === 'original';
  selectedFaceDetect = locked ? false : (val === true || val === 'true');
  const displayLabel = selectedFaceDetect ? label : 'Center Crop';
  const labelEl = document.getElementById('currentFaceDetectLabel');
  const iconEl = document.getElementById('currentFaceDetectIcon');
  if (labelEl) labelEl.innerText = displayLabel;
  if (iconEl) {
    iconEl.innerHTML = selectedFaceDetect
      ? '<i data-lucide="scan-face" class="w-3.5 h-3.5"></i>'
      : '<i data-lucide="crop" class="w-3.5 h-3.5"></i>';
  }

  document.querySelectorAll('.fd-menu-item[data-fd]').forEach(item => {
    const isAct = (item.getAttribute('data-fd') === 'true') === selectedFaceDetect;
    const icon = item.querySelector('.fd-icon');
    item.classList.toggle('active', isAct);
    if (icon) {
      icon.classList.toggle('text-white', isAct);
      icon.classList.toggle('text-[#a1a1aa]', !isAct);
      icon.classList.remove('text-white', 'text-[#71717a]');
    }
  });

  closeDropdownSmoothly('faceDetectMenu', 'faceChevron', 'faceDetectDropdownBtn', 80);
  lucide.createIcons();
}

function setFaceDetect(val) {
  const isTrue = (val === true || val === 'true');
  selectFaceDetectFromMenu(isTrue, isTrue ? 'Face Track' : 'Center Crop');
}

// Quality Dropdown Handlers
function toggleQualityDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('qualityMenu');
  const chev = document.getElementById('qualityChevron');
  const btn = document.getElementById('qualityDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'qualityMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('qualityMenu');
  }
}

function selectQualityFromMenu(q, label) {
  selectedQuality = q;
  const labelEl = document.getElementById('currentQualityLabel');
  if (labelEl) labelEl.innerText = label;

  document.querySelectorAll('.quality-menu-item[data-quality]').forEach(item => {
    const isAct = item.getAttribute('data-quality') === q;
    item.classList.toggle('active', isAct);
  });

  closeDropdownSmoothly('qualityMenu', 'qualityChevron', 'qualityDropdownBtn', 80);
}

    // Video Ratio Dropdown Handlers
function toggleVideoRatioDropdown(e) {
  if (e) e.stopPropagation();
  if (isYoutubeShortLocked) return;
  const menu = document.getElementById('videoRatioMenu');
  const chev = document.getElementById('videoRatioChevron');
  const btn = document.getElementById('videoRatioDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'videoRatioMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('videoRatioMenu');
  }
}

function selectVideoRatioFromMenu(r, label) {
  const nextRatio = isYoutubeShortLocked ? 'original' : r;
  const nextLabel = isYoutubeShortLocked ? 'Original' : label;
  selectedVideoRatio = nextRatio;
  const labelEl = document.getElementById('currentVideoRatioLabel');
  if (labelEl) labelEl.innerText = nextLabel;

  document.querySelectorAll('#videoRatioMenu .quality-menu-item[data-vratio]').forEach(item => {
    const isAct = item.getAttribute('data-vratio') === nextRatio;
    item.classList.toggle('active', isAct);
  });

  closeDropdownSmoothly('videoRatioMenu', 'videoRatioChevron', 'videoRatioDropdownBtn', 80);
  requestAnimationFrame(alignExtraTrimSegments);
}

// Video FPS Dropdown Handlers
function toggleVideoFpsDropdown(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('videoFpsMenu');
  const chev = document.getElementById('videoFpsChevron');
  const btn = document.getElementById('videoFpsDropdownBtn');
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? 'videoFpsMenu' : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator('videoFpsMenu');
  }
}

function selectVideoFpsFromMenu(fps, label) {
  selectedVideoFps = fps;
  const labelEl = document.getElementById('currentVideoFpsLabel');
  if (labelEl) labelEl.innerText = label;

  document.querySelectorAll('#videoFpsMenu .quality-menu-item[data-vfps]').forEach(item => {
    const isAct = item.getAttribute('data-vfps') === fps;
    item.classList.toggle('active', isAct);
  });

  closeDropdownSmoothly('videoFpsMenu', 'videoFpsChevron', 'videoFpsDropdownBtn', 80);
}

function setQuality(q) {
  selectQualityFromMenu(q, QUALITY_LABELS[q] || `${q}p`);
}

// Trim Ratio Selector (Chips)
function setTrimRatio(r) {
  selectedTrimRatio = r;
  ['916', '169', '34'].forEach(tr => {
    const btn = document.getElementById(`trimR-${tr}`);
    if (btn) btn.classList.remove('active');
  });
  const active = document.getElementById(`trimR-${r.replace(':', '')}`);
  if (active) active.classList.add('active');
}

// Close dropdowns when clicked outside
document.addEventListener('click', (e) => {
  const isDropdownClick = e.target.closest(
    '#platformDropdownBtn, #platformMenu, #subFeatureDropdownBtn, #subFeatureMenu, ' +
    '#aspectRatioDropdownBtn, #aspectRatioMenu, #clipCountDropdownBtn, #clipCountMenu, ' +
    '#faceDetectDropdownBtn, #faceDetectMenu, #qualityDropdownBtn, #qualityMenu, #videoRatioDropdownBtn, #videoRatioMenu, #videoFpsDropdownBtn, #videoFpsMenu, #trimRatioDropdownBtn, #trimRatioMenu, ' +
    '#vaultModeDropdownBtn, #vaultModeMenu, #vaultSortDropdownBtn, #vaultSortMenu'
  );
  if (!isDropdownClick) {
    closeAllDropdowns(null);
  }
  const isWsDropdownClick = e.target.closest('#wsDropdownWrapper');
  if (!isWsDropdownClick && typeof closeWsDropdown === 'function') {
    closeWsDropdown();
  }
});

function setLang(lang) {
  currentLang = lang || 'en';
}

// Initialize Default Platform & Sub-features
switchPlatform('youtube', false);
setLang('en');

// Task configurations and step rows per workflow action
const TASK_CONFIGS = {
  type_yt_ai_clip: [
    {
      key: 'ingest',
      label: 'Ingest Video',
      amount: 'Source Video',
      details: [
        { label: 'Video and audio streams', meta: 'Chosen quality' },
        { label: 'Demux audio and video streams', meta: 'Direct Stream' }
      ]
    },
    {
      key: 'check_sub',
      label: 'Checking transcript',
      amount: 'YouTube API',
      details: [
        { label: 'Searching for auto-captions and official subtitles', meta: 'Auto API' },
        { label: 'Reading subtitle timestamps', meta: 'Per segment' }
      ]
    },
    {
      key: 'whisper',
      label: 'Audio transcription',
      amount: 'Cloud API',
      details: [
        { label: 'Speech-to-text fallback', meta: 'When no subtitles' },
        { label: 'Groq, Gemini or local Faster-Whisper', meta: 'Many languages' }
      ]
    },
    {
      key: 'virality',
      label: 'Viral Potential & Hook Analysis',
      amount: 'Hook Scoring',
      details: [
        { label: 'Viral potential and retention score', meta: 'Top Hooks' },
        { label: 'Vertical framing and hook detection', meta: '9:16' }
      ]
    },
    {
      key: 'render',
      label: 'Render Vertical Clips',
      amount: 'H.264',
      details: [
        { label: 'Hardware encoder when available', meta: 'AMF, MF or x264' },
        { label: 'Multi-clip MP4 encoding', meta: 'H.264 MP4' }
      ]
    }
  ],

  type_yt_video: [
    {
      key: 'download',
      label: 'Downloading Video 1080p',
      amount: '1080p FHD',
      details: [
        { label: 'High-speed video and audio stream', meta: 'Direct Stream' },
        { label: 'Lossless merge into MP4', meta: 'Lossless' }
      ]
    },
    {
      key: 'vault',
      label: 'Saving to Workspace',
      amount: 'Waiting',
      details: [
        { label: 'Adding to the local storage catalog', meta: 'Waiting' },
        { label: 'Files are ready to play or download', meta: 'Ready' }
      ]
    }
  ],

  type_yt_mp3: [
    {
      key: 'extract',
      label: 'Downloading source audio',
      amount: 'HQ Audio',
      details: [
        { label: 'Extracting full-resolution audio', meta: 'Opus/M4A' },
        { label: 'Normalizing stereo channels', meta: 'Stereo' }
      ]
    },
    {
      key: 'vault',
      label: 'Convert to 320 kbps MP3 & Save',
      amount: 'Waiting',
      details: [
        { label: 'High-quality FFmpeg LAME encoding', meta: 'CBR 320k' },
        { label: 'Saving to the local Workspace', meta: 'Waiting' }
      ]
    }
  ],

  type_yt_clip: [
    {
      key: 'trim',
      label: 'Trimming video segments',
      amount: 'Custom Range',
      details: [
        { label: 'Validating clip time range', meta: 'Keyframe' },
        { label: 'Hardware-accelerated segment extraction', meta: 'Fast Cut' }
      ]
    },
    {
      key: 'vault',
      label: 'Saving to Workspace',
      amount: 'Waiting',
      details: [
        { label: 'Adding the trimmed video to the library', meta: 'Waiting' },
        { label: 'File is ready to share', meta: 'Ready' }
      ]
    }
  ],

  type_ig_reels: [
    {
      key: 'download',
      label: 'Downloading Instagram Reels',
      amount: 'Reel Stream',
      details: [
        { label: 'Download video without a watermark', meta: 'Lossless' },
        { label: 'Verifying MP4 stream integrity', meta: 'Checked' }
      ]
    },
    {
      key: 'vault',
      label: 'Saving to Workspace',
      amount: 'Waiting',
      details: [
        { label: 'Saving to the Instagram folder', meta: 'Waiting' },
        { label: 'File is ready for offline viewing', meta: 'Ready' }
      ]
    }
  ],

  type_tt_video: [
    {
      key: 'download',
      label: 'Downloading TikTok video (no watermark)',
      amount: 'TikTok HD',
      details: [
        { label: 'Bypass lapisan watermark TikTok', meta: 'HD Clean' },
        { label: 'Mux into a full-resolution MP4 container', meta: 'Ready' }
      ]
    },
    {
      key: 'vault',
      label: 'Saving to Workspace',
      amount: 'Waiting',
      details: [
        { label: 'Saving to the TikTok folder', meta: 'Waiting' },
        { label: 'File is ready to use', meta: 'Ready' }
      ]
    }
  ],

  type_tt_mp3: [
    {
      key: 'extract',
      label: 'Downloading TikTok audio',
      amount: 'Sound Track',
      details: [
        { label: 'Extracting audio from the TikTok stream', meta: 'HQ Audio' },
        { label: 'Normalizing dynamics and volume', meta: 'Balanced' }
      ]
    },
    {
      key: 'vault',
      label: 'Convert to 320 kbps MP3 & Save',
      amount: 'Waiting',
      details: [
        { label: 'Encoding FFmpeg LAME 320kbps', meta: 'MP3' },
        { label: 'Saving to the local Workspace', meta: 'Waiting' }
      ]
    }
  ]
};

let currentActionType = 'type_yt_video';
let activeTaskQuality = '1080';
let currentTaskRows = [];
let highestJobProgress = 0;

function isDownloadProgressRow(key, stage) {
  if (key === 'download' || key === 'ingest' || key === 'extract') return true;
  if (key === 'trim') return !stage || stage === 'queued' || stage === 'downloading';
  return false;
}

function initTaskRows(action, qualityOverride) {
  currentActionType = action || 'type_yt_video';
  activeTaskQuality = String(qualityOverride || selectedQuality || '1080').trim() || '1080';
  const qualityBadge = QUALITY_LABELS[activeTaskQuality] || `${activeTaskQuality}p`;
  highestJobProgress = 0;
  const template = TASK_CONFIGS[currentActionType] || TASK_CONFIGS.type_yt_video;
  currentTaskRows = template.map((t, idx) => {
    let label = t.label;
    let amount = t.amount;
    if (currentActionType === 'type_yt_video' && t.key === 'download') {
      label = `Downloading Video ${activeTaskQuality}p`;
      amount = qualityBadge;
    } else if (currentActionType === 'type_yt_ai_clip' && t.key === 'ingest') {
      amount = qualityBadge;
    }
    return {
      key: t.key,
      label,
      amount,
      status: idx === 0 ? 'running' : 'pending',
      step: idx + 1,
      details: t.details || []
    };
  });

  const container = document.getElementById('taskRowsContainer');
  if (!container) return;

  container.innerHTML = currentTaskRows.map((row, idx) => {
    const badgeHtml = getBadgeHtml(row.status, row.step);
    const pillHtml = getPillHtml(row.status);

    const detailsHtml = (row.details || []).map(d => `
      <div class="flex items-center justify-between text-[11.5px]">
        <span class="text-zinc-300">${escapeHtml(d.label)}</span>
        <span class="font-mono text-[11px] text-zinc-500 tabular-nums">${escapeHtml(d.meta)}</span>
      </div>
    `).join('');

    return `
      <div 
        id="task-row-${row.key}"
        class="task-row-card self-stretch overflow-hidden border border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.05] transition-all duration-300 relative flex flex-col"
        style="border-radius: 20px; animation: fade-up 450ms cubic-bezier(0.23,1,0.32,1) ${idx * 80}ms both;"
      >
        <button
          type="button"
          id="task-btn-${row.key}"
          aria-expanded="false"
          onclick="toggleTaskRowAccordion('${row.key}')"
          class="flex h-11 w-full items-center gap-2.5 px-3 text-left cursor-pointer select-none bg-transparent border-none"
        >
          <span id="task-badge-${row.key}" class="flex size-6 shrink-0 items-center justify-center">
            ${badgeHtml}
          </span>
          <span id="task-label-${row.key}" class="min-w-0 flex-1 truncate text-[13px] font-medium ${row.status === 'done' ? 'text-white' : (row.status === 'running' ? 'text-zinc-200' : 'text-zinc-400')}">
            ${escapeHtml(row.label)}
          </span>
          <span id="task-amount-${row.key}" class="text-[11.5px] text-zinc-400 tabular-nums font-mono">${escapeHtml(row.amount)}</span>
          <span id="task-pill-${row.key}">
            ${pillHtml}
          </span>
          <span
            aria-hidden="true"
            class="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white"
          >
            <svg
              id="task-chevron-${row.key}"
              width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
              class="transition-transform duration-300"
              style="transform: rotate(0deg);"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>

        <!-- Dedicated progress indicator area: Enlarges card height specifically for the indicator, inset with side padding -->
        <div id="task-progress-box-${row.key}" class="px-3.5 pb-2.5 pt-0.5 ${row.status === 'running' ? '' : 'hidden'}">
          <div class="flex items-center justify-between text-[11px] mb-1.5 font-mono">
            <div class="flex items-center gap-2 min-w-0">
              <span id="task-progress-pct-${row.key}" class="text-emerald-400 font-semibold tabular-nums text-[11.5px] ${isDownloadProgressRow(row.key) ? '' : 'hidden'}">0%</span>
              <span id="task-progress-stage-${row.key}" class="text-zinc-300 text-[11px] font-sans truncate ${isDownloadProgressRow(row.key) ? 'hidden' : ''}">Preparing...</span>
            </div>
            <div class="flex items-center gap-2.5 text-zinc-400 tabular-nums text-[11px] shrink-0">
              <span id="task-progress-meta-${row.key}">Connecting to stream...</span>
              <span id="task-stopwatch-${row.key}" class="inline-flex items-center gap-1 text-zinc-300 font-mono text-[11px] pl-1.5 border-l border-white/10">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400 shrink-0">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span id="task-stopwatch-val-${row.key}">00:00</span>
              </span>
            </div>
          </div>
          <div class="w-full h-1.5 bg-white/[0.07] rounded-full overflow-hidden p-[1px] relative">
            <div id="task-progress-fill-${row.key}" class="h-full bg-emerald-400 rounded-full transition-all duration-300 ${isDownloadProgressRow(row.key) ? '' : 'task-indeterminate-bar'}" style="width: ${isDownloadProgressRow(row.key) ? '0%' : '35%'};"></div>
          </div>
        </div>

        <div
          id="task-details-${row.key}"
          class="task-details-grid grid transition-[grid-template-rows,opacity] duration-300"
          style="grid-template-rows: 0fr; opacity: 0; transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1);"
        >
          <div class="overflow-hidden">
            <div class="mb-2.5 grid grid-cols-[24px_1fr] gap-2.5 px-3">
              <span aria-hidden="true" class="mx-auto h-full w-px bg-white/10"></span>
              <div class="flex flex-col gap-1.5 pt-0.5 pb-1">
                ${detailsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleTaskRowAccordion(key) {
  const detailsEl = document.getElementById(`task-details-${key}`);
  const chevEl = document.getElementById(`task-chevron-${key}`);
  const cardEl = document.getElementById(`task-row-${key}`);
  const btnEl = document.getElementById(`task-btn-${key}`);
  if (!detailsEl) return;

  const isOpen = detailsEl.style.gridTemplateRows === '1fr';
  if (isOpen) {
    detailsEl.style.gridTemplateRows = '0fr';
    detailsEl.style.opacity = '0';
    if (chevEl) chevEl.style.transform = 'rotate(0deg)';
    if (cardEl) cardEl.style.borderRadius = '20px';
    if (btnEl) btnEl.setAttribute('aria-expanded', 'false');
  } else {
    detailsEl.style.gridTemplateRows = '1fr';
    detailsEl.style.opacity = '1';
    if (chevEl) chevEl.style.transform = 'rotate(180deg)';
    if (cardEl) cardEl.style.borderRadius = '14px';
    if (btnEl) btnEl.setAttribute('aria-expanded', 'true');
  }
}

let taskStartTimestamps = {};
let taskDurations = {};
let taskElapsedTimer = null;

function formatStopwatch(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function ensureStopwatchRunning() {
  if (taskElapsedTimer) return;
  taskElapsedTimer = setInterval(() => {
    const now = Date.now();
    currentTaskRows.forEach(row => {
      if (row.status === 'running' && taskStartTimestamps[row.key]) {
        const elapsedMs = now - taskStartTimestamps[row.key];
        const swEl = document.getElementById(`task-stopwatch-val-${row.key}`);
        if (swEl) swEl.innerText = formatStopwatch(elapsedMs);
      }
    });
  }, 1000);
}

function setTaskStatuses(statusArr, progressData, computedProgressPct) {
  statusArr.forEach((newStatus, idx) => {
    const row = currentTaskRows[idx];
    if (!row) return;

    const statusChanged = row.status !== newStatus;
    row.status = newStatus;
    const badgeEl = document.getElementById(`task-badge-${row.key}`);
    const pillEl = document.getElementById(`task-pill-${row.key}`);
    const labelEl = document.getElementById(`task-label-${row.key}`);
    const progressBoxEl = document.getElementById(`task-progress-box-${row.key}`);
    const progressPctEl = document.getElementById(`task-progress-pct-${row.key}`);
    const progressStageEl = document.getElementById(`task-progress-stage-${row.key}`);
    const progressMetaEl = document.getElementById(`task-progress-meta-${row.key}`);
    const progressFillEl = document.getElementById(`task-progress-fill-${row.key}`);

    if (statusChanged && badgeEl) {
      badgeEl.innerHTML = getBadgeHtml(newStatus, row.step);
    }
    if (statusChanged && pillEl) {
      pillEl.innerHTML = getPillHtml(newStatus);
    }
    if (statusChanged && labelEl) {
      labelEl.className = `min-w-0 flex-1 truncate text-[13px] font-medium ${
        newStatus === 'done' ? 'text-white' : (newStatus === 'running' ? 'text-zinc-200' : 'text-zinc-400')
      }`;
    }

    const currentStage = (progressData && progressData.stage) || '';
    const amountEl = document.getElementById(`task-amount-${row.key}`);

    if (newStatus === 'running') {
      if (!taskStartTimestamps[row.key]) {
        taskStartTimestamps[row.key] = Date.now();
        ensureStopwatchRunning();
      }
    } else if (newStatus === 'done') {
      if (taskStartTimestamps[row.key] && !taskDurations[row.key]) {
        const elapsedSec = Math.max(1, Math.round((Date.now() - taskStartTimestamps[row.key]) / 1000));
        taskDurations[row.key] = elapsedSec < 60 ? `${elapsedSec}s` : `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;
        if (amountEl) {
          amountEl.innerText = taskDurations[row.key];
        }
      }
    }

    if (amountEl && !taskDurations[row.key]) {
      if (row.key === 'vault') {
        if (newStatus === 'done') {
          amountEl.innerText = 'Saved';
        } else if (newStatus === 'running') {
          amountEl.innerText = 'Saving...';
        } else if (newStatus === 'failed') {
          amountEl.innerText = 'Failed';
        } else {
          amountEl.innerText = 'Waiting';
        }
      } else if (row.key === 'check_sub') {
        if (newStatus === 'done') {
          amountEl.innerText = currentStage === 'transcript_found' ? 'Found' : 'Checked';
        } else if (newStatus === 'running') {
          amountEl.innerText = 'Checking...';
        }
      } else if (row.key === 'whisper') {
        if (currentStage === 'transcript_found') {
          amountEl.innerText = 'Available';
        } else if (newStatus === 'running') {
          amountEl.innerText = 'Transcribing...';
        } else if (newStatus === 'done') {
          amountEl.innerText = 'Complete';
        }
      }
    }

    // Dedicated indicator box handling
    if (progressBoxEl) {
      if (newStatus === 'running') {
        progressBoxEl.classList.remove('hidden');
        const isDownload = isDownloadProgressRow(row.key, currentStage);

        if (isDownload) {
          if (progressPctEl) progressPctEl.classList.remove('hidden');
          if (progressStageEl) progressStageEl.classList.add('hidden');
          if (progressFillEl) progressFillEl.classList.remove('task-indeterminate-bar');

          const pctVal = typeof computedProgressPct === 'number' ? computedProgressPct : 0;
          const pctFormatted = `${pctVal.toFixed(pctVal % 1 === 0 ? 0 : 1)}%`;
          if (progressPctEl) progressPctEl.innerText = pctFormatted;

          const speed = (progressData && progressData.download_speed) || '';
          const eta = (progressData && progressData.download_eta) ? `ETA ${progressData.download_eta}` : '';
          const metaStr = [speed, eta].filter(Boolean).join(' • ') || (pctVal >= 99 ? 'Finalizing stream...' : 'Connecting to stream...');
          if (progressMetaEl) {
            progressMetaEl.innerText = metaStr;
            progressMetaEl.classList.remove('hidden');
          }

          if (progressFillEl) {
            progressFillEl.style.width = `${Math.min(100, Math.max(0, pctVal))}%`;
          }
        } else {
          // Indeterminate: No misleading percentage number! Clean active beam & description
          if (progressPctEl) progressPctEl.classList.add('hidden');
          if (progressStageEl) {
            progressStageEl.classList.remove('hidden');
            progressStageEl.innerText = (progressData && progressData.stage_detail) || 'Processing...';
          }
          if (progressMetaEl) progressMetaEl.classList.add('hidden');
          if (progressFillEl) {
            progressFillEl.classList.add('task-indeterminate-bar');
          }
        }
      } else {
        progressBoxEl.classList.add('hidden');
        if (progressFillEl) {
          progressFillEl.classList.remove('task-indeterminate-bar');
          progressFillEl.style.width = newStatus === 'done' ? '100%' : '0%';
        }
      }
    }
  });
}

function getBadgeHtml(status, step) {
  if (status === 'done') {
    return `
      <span class="flex w-[22px] h-[22px] shrink-0 items-center justify-center rounded-full text-black bg-emerald-400" style="animation: pop-in 300ms cubic-bezier(0.23,1,0.32,1) both;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      </span>
    `;
  } else if (status === 'running') {
    const size = 24, stroke = 2;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return `
      <span class="relative inline-flex shrink-0 items-center justify-center" style="width: 24px; height: 24px;">
        <svg width="24" height="24" class="absolute inset-0 animate-spin">
          <circle cx="12" cy="12" r="${r}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="${stroke}" />
          <circle cx="12" cy="12" r="${r}" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * 0.28).toFixed(1)} ${(c * 0.72).toFixed(1)}" />
        </svg>
        <span class="relative text-[10.5px] font-semibold tabular-nums text-white">${step}</span>
      </span>
    `;
  } else if (status === 'failed') {
    return `
      <span class="flex w-[22px] h-[22px] shrink-0 items-center justify-center rounded-full text-white bg-rose-500 shadow-sm" style="animation: pop-in 300ms cubic-bezier(0.23,1,0.32,1) both;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </span>
    `;
  } else {
    const size = 24, stroke = 2;
    const r = (size - stroke) / 2;
    return `
      <span class="relative inline-flex shrink-0 items-center justify-center" style="width: 24px; height: 24px;">
        <svg width="24" height="24" class="absolute inset-0">
          <circle cx="12" cy="12" r="${r}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="${stroke}" />
        </svg>
        <span class="relative text-[10.5px] font-semibold tabular-nums text-zinc-500">${step}</span>
      </span>
    `;
  }
}

function getPillHtml(status) {
  if (status === 'done') {
    return `
      <span class="inline-flex h-5 items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 text-[10.5px] font-medium text-emerald-400" style="animation: pop-in 250ms ease-out both;">
        Completed
      </span>
    `;
  } else if (status === 'failed') {
    return `
      <span class="inline-flex h-5 items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/25 px-2 text-[10.5px] font-medium text-rose-400" style="animation: pop-in 200ms ease-out both;">
        Failed
      </span>
    `;
  }
  return '';
}

// Workspace Confirmation & Trigger Action
function getPipelineLabel(act) {
  if (act === 'type_yt_ai_clip' || act === 'ai_clip') return 'AI Shorts 9:16 Virality';
  if (act === 'type_yt_video') return `YouTube Full Video (${selectedQuality}p)`;
  if (act === 'type_yt_mp3' || act === 'type_tt_mp3') return 'Audio MP3 320kbps';
  if (act === 'type_yt_clip') return 'Manual Video Trimmer';
  if (act === 'type_ig_reels') return 'Instagram Reels Full HD';
  if (act === 'type_tt_video') return 'TikTok Clean (No Watermark)';
  return 'Media Download';
}

function showNoticeModal(heading, desc) {
  const modal = document.getElementById('noticeModal');
  const box = document.getElementById('noticeModalBox');
  const h = document.getElementById('noticeModalHeading');
  const p = document.getElementById('noticeModalDesc');
  if (!modal || !box) return;
  if (h) h.innerText = heading || 'Notice';
  if (p) p.innerText = desc || '';
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    box.classList.remove('scale-95', 'opacity-0');
    box.classList.add('scale-100', 'opacity-100');
  });
}

function closeNoticeModal() {
  const modal = document.getElementById('noticeModal');
  const box = document.getElementById('noticeModalBox');
  if (box) {
    box.classList.remove('scale-100', 'opacity-100');
    box.classList.add('scale-95', 'opacity-0');
  }
  setTimeout(() => {
    if (modal) modal.classList.add('hidden');
  }, 150);
}

function showConfirmModal(heading, desc, proceedLabel) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const box = document.getElementById('confirmModalBox');
    const h = document.getElementById('confirmModalHeading');
    const p = document.getElementById('confirmModalDesc');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');
    const proceedBtn = document.getElementById('confirmModalProceedBtn');
    if (!modal || !box) {
      resolve(true);
      return;
    }
    if (h) h.innerText = heading || 'Confirmation';
    if (p) p.innerText = desc || '';
    if (proceedBtn) proceedBtn.innerText = proceedLabel || 'Continue';
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      box.classList.remove('scale-95', 'opacity-0');
      box.classList.add('scale-100', 'opacity-100');
    });

    const cleanup = (result) => {
      box.classList.remove('scale-100', 'opacity-100');
      box.classList.add('scale-95', 'opacity-0');
      setTimeout(() => {
        modal.classList.add('hidden');
        resolve(result);
      }, 150);
    };

    if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
    if (proceedBtn) proceedBtn.onclick = () => cleanup(true);
  });
}

function clearSavedJobStorage() {
  try {
    localStorage.removeItem('luna_active_job_id');
    localStorage.removeItem('luna_active_ws');
    localStorage.removeItem('luna_active_action');
    localStorage.removeItem('luna_active_quality');
  } catch (e) {}
}

function isValidMediaUrl(str) {
  if (!str) return false;
  const s = str.trim();
  if (!s.startsWith('http://') && !s.startsWith('https://')) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return isSupportedMediaHost(u.hostname);
  } catch (_) {
    return false;
  }
}

function showMissingApiKeyToast(message) {
  lunaToast.add({
    type: 'warning',
    title: 'API key required',
    description: message || 'Gemini and Groq API keys are required for AI Short Clips.',
    timeout: 6500,
    link: {
      label: 'Go to Settings',
      onClick: (toastId) => {
        lunaToast.close(toastId);
        switchMainTab('settings');
        setTimeout(() => {
          const el = document.getElementById('inputGeminiKey') || document.getElementById('sectionSettings');
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 120);
      },
    },
  });
}

async function checkAiClipApiKeysBeforeGenerate() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    if (!res.ok) return { ok: true };
    const cfg = await res.json();
    const activeLlm = (cfg.llm_provider || '').trim().toLowerCase() || (cfg.has_openai_api_key ? 'openai' : 'gemini');
    const activeTranscribe = (cfg.transcribe_provider || 'groq').trim().toLowerCase();
    const missing = [];

    if (activeLlm === 'gemini' && !cfg.has_gemini_api_key) {
      missing.push('Gemini');
    } else if (activeLlm === 'openai' && !cfg.has_openai_api_key) {
      missing.push('OpenAI');
    }

    if (activeTranscribe === 'groq' && !cfg.has_groq_api_key && !missing.includes('Groq')) {
      missing.push('Groq');
    } else if (activeTranscribe === 'gemini' && !cfg.has_gemini_api_key && !missing.includes('Gemini')) {
      missing.push('Gemini');
    }

    if (missing.length === 0) return { ok: true };
    const message = missing.length === 1
      ? (missing[0] === 'Groq'
        ? 'Groq API key is required for audio transcription in AI Short Clips.'
        : `${missing[0]} API key is required for AI Short Clips.`)
      : `${missing.join(' and ')} API keys are required for AI Short Clips.`;
    return { ok: false, message };
  } catch (e) {
    return { ok: true };
  }
}

async function triggerAction() {
  if (activeJobId || isProcessStarting) {
    showNoticeModal('A job is in progress', 'Another job is running. Wait for it to finish or cancel it before starting a new one.');
    return;
  }
  const url = mainUrlInput.value.trim();
  if (!url) {
    mainUrlInput.focus();
    mainUrlInput.classList.add('ring-2', 'ring-red-500/60');
    setTimeout(() => mainUrlInput.classList.remove('ring-2', 'ring-red-500/60'), 1500);
    showNoticeModal('URL is required', 'Enter a YouTube, Instagram, or TikTok video URL.');
    return;
  }

  if (!isValidMediaUrl(url)) {
    mainUrlInput.focus();
    mainUrlInput.classList.add('ring-2', 'ring-red-500/60');
    setTimeout(() => mainUrlInput.classList.remove('ring-2', 'ring-red-500/60'), 1500);
    showNoticeModal('Invalid URL', 'The video URL is invalid or incomplete. Make sure it starts with https:// and belongs to a supported platform.');
    return;
  }

  let action = '';
  if (currentPlatform === 'youtube') action = currentYtSub;
  else if (currentPlatform === 'instagram') action = currentIgSub;
  else if (currentPlatform === 'tiktok') action = currentTtSub;

  if (action === 'type_yt_ai_clip' || action === 'type_ig_ai_clip' || action === 'ai_clip') {
    const keyCheck = await checkAiClipApiKeysBeforeGenerate();
    if (!keyCheck.ok) {
      showMissingApiKeyToast(keyCheck.message);
      return;
    }
  }

  openWorkspaceModal(action);
}

async function fetchNextWorkspaceIndex(action) {
  try {
    const res = await fetch('/api/vault/projects');
    if (res.ok) {
      const data = await res.json();
      if (data.next_workspace_index) return data.next_workspace_index;
      if (data.projects && data.projects.length > 0) return data.projects.length + 1;
    }
  } catch (e) {
    console.warn('fetchNextWorkspaceIndex error:', e);
  }
  return nextWorkspaceIndex || 1;
}

window.checkDuplicateWorkspaceName = function (val) {
  const notice = document.getElementById('wsDuplicateNotice');
  if (!notice) return;
  const cleanVal = (val || '').trim().toLowerCase();
  if (!cleanVal) {
    notice.classList.add('hidden');
    return;
  }
  const exists = (vaultProjects || []).some(p => (p.workspace_name || '').trim().toLowerCase() === cleanVal);
  if (exists) {
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
};

let latestVideoTitle = { url: '', title: '' };
let currentWorkspaceMode = 'new';
let currentJobProjectId = null;
let currentJobWorkspaceName = null;

window.setWorkspaceMode = function (mode) {
  currentWorkspaceMode = mode;
  const btnNew = document.getElementById('wsModeNewBtn');
  const btnExisting = document.getElementById('wsModeExistingBtn');
  const containerNew = document.getElementById('wsNewContainer');
  const containerExisting = document.getElementById('wsExistingContainer');
  const inputNew = document.getElementById('wsModalInput');
  const selectExisting = document.getElementById('wsExistingSelect');

  if (mode === 'new') {
    if (btnNew) {
      btnNew.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer bg-white/[0.08] text-white shadow-sm flex items-center justify-center gap-1.5';
    }
    if (btnExisting) {
      btnExisting.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition cursor-pointer text-zinc-400 hover:text-white flex items-center justify-center gap-1.5';
    }
    if (containerNew) containerNew.classList.remove('hidden');
    if (containerExisting) containerExisting.classList.add('hidden');
    if (inputNew) {
      setTimeout(() => {
        inputNew.focus();
        try { inputNew.select(); } catch (e) {}
      }, 50);
    }
  } else {
    if (btnExisting) {
      btnExisting.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer bg-white/[0.08] text-white shadow-sm flex items-center justify-center gap-1.5';
    }
    if (btnNew) {
      btnNew.className = 'flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition cursor-pointer text-zinc-400 hover:text-white flex items-center justify-center gap-1.5';
    }
    if (containerNew) containerNew.classList.add('hidden');
    if (containerExisting) containerExisting.classList.remove('hidden');
    const trigger = document.getElementById('wsDropdownTrigger');
    if (trigger) trigger.focus();
  }
  lucide.createIcons();
};

window.toggleWsDropdown = function (e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const menu = document.getElementById('wsDropdownMenu');
  const chevron = document.getElementById('wsDropdownChevron');
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  if (isHidden) {
    menu.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
  } else {
    menu.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
  }
};

window.closeWsDropdown = function () {
  const menu = document.getElementById('wsDropdownMenu');
  const chevron = document.getElementById('wsDropdownChevron');
  if (menu) menu.classList.add('hidden');
  if (chevron) chevron.classList.remove('rotate-180');
};

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('wsDropdownWrapper');
  if (wrap && !wrap.contains(e.target)) {
    closeWsDropdown();
  }
});

window.selectCustomWorkspace = function (wsName) {
  const hiddenInput = document.getElementById('wsExistingSelect');
  if (hiddenInput) hiddenInput.value = wsName;

  const proj = vaultProjects.find(p => p.workspace_name === wsName);
  const count = proj && proj.files ? proj.files.length : 0;

  const selectedText = document.getElementById('wsDropdownSelectedText');
  const selectedBadge = document.getElementById('wsDropdownSelectedBadge');
  if (selectedText) selectedText.innerText = wsName;
  if (selectedBadge) {
    selectedBadge.innerText = `${count} file`;
    selectedBadge.classList.remove('hidden');
  }

  closeWsDropdown();
  populateExistingWorkspacesSelect(wsName);
};

window.populateExistingWorkspacesSelect = function (preselectedName = null) {
  const hiddenInput = document.getElementById('wsExistingSelect');
  const listContainer = document.getElementById('wsDropdownList');
  const selectedText = document.getElementById('wsDropdownSelectedText');
  const selectedBadge = document.getElementById('wsDropdownSelectedBadge');
  const triggerBtn = document.getElementById('wsDropdownTrigger');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  if (vaultProjects.length === 0) {
    if (hiddenInput) hiddenInput.value = '';
    if (selectedText) selectedText.innerText = 'No projects in Workspace yet';
    if (selectedBadge) selectedBadge.classList.add('hidden');
    if (triggerBtn) triggerBtn.disabled = true;

    const emptyItem = document.createElement('div');
    emptyItem.className = 'px-3 py-3 text-center text-xs text-zinc-500 font-sans';
    emptyItem.innerText = 'No projects in Workspace yet';
    listContainer.appendChild(emptyItem);
    return;
  }

  if (triggerBtn) triggerBtn.disabled = false;

  let activeName = preselectedName || (hiddenInput ? hiddenInput.value : '');
  if (!activeName || !vaultProjects.some(p => p.workspace_name === activeName)) {
    activeName = vaultProjects[0].workspace_name;
  }
  if (hiddenInput) hiddenInput.value = activeName;

  const activeProj = vaultProjects.find(p => p.workspace_name === activeName) || vaultProjects[0];
  const activeCount = (activeProj && activeProj.files) ? activeProj.files.length : 0;
  if (selectedText) selectedText.innerText = activeProj.workspace_name;
  if (selectedBadge) {
    selectedBadge.innerText = `${activeCount} file`;
    selectedBadge.classList.remove('hidden');
  }

  vaultProjects.forEach(p => {
    const isSelected = p.workspace_name === activeName;
    const count = (p.files || []).length;
    const itemBtn = document.createElement('button');
    itemBtn.type = 'button';
    itemBtn.className = `w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-left text-[11px] transition cursor-pointer group ${isSelected
      ? 'bg-white/10 text-zinc-100 font-semibold border border-white/20'
      : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white border border-transparent'
      }`;
    itemBtn.onclick = () => selectCustomWorkspace(p.workspace_name);

    itemBtn.innerHTML = `
      <div class="flex items-center gap-2 truncate min-w-0 pr-2">
        <i data-lucide="folder" class="w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-zinc-500 group-hover:text-white'} shrink-0 transition-colors"></i>
        <span class="truncate">${escapeHtml(p.workspace_name)}</span>
      </div>
      <span class="text-[9.5px] font-mono ${isSelected ? 'text-white bg-white/10' : 'text-zinc-500 bg-white/[0.04]'} px-1.5 py-0.5 rounded shrink-0">${count} file</span>
    `;
    listContainer.appendChild(itemBtn);
  });
  lucide.createIcons();
};

async function openWorkspaceModal(action) {
  const modal = document.getElementById('workspaceConfirmModal');
  const wsInput = document.getElementById('wsModalInput');
  const pipelineSummary = document.getElementById('wsModalPipelineSummary');
  const notice = document.getElementById('wsDuplicateNotice');
  if (notice) notice.classList.add('hidden');

  if (pipelineSummary) {
    pipelineSummary.innerText = getPipelineLabel(action);
  }

  let nextNum = nextWorkspaceIndex || 1;

  // Refresh vault projects list to have the freshest workspaces
  try {
    const res = await fetch('/api/vault/projects');
    if (res.ok) {
      const data = await res.json();
      vaultProjects = data.projects || [];
      if (data.next_workspace_index) {
        nextNum = data.next_workspace_index;
        nextWorkspaceIndex = data.next_workspace_index;
      } else if (vaultProjects.length > 0) {
        nextNum = vaultProjects.length + 1;
        nextWorkspaceIndex = nextNum;
      }
    }
  } catch (e) {
    console.warn('Failed fetching vault projects for modal:', e);
  }

  try {
    populateExistingWorkspacesSelect();
    setWorkspaceMode('new');

    const nextNumStr = String(nextNum).padStart(2, '0');
    if (wsInput) {
      const currentUrl = mainUrlInput.value.trim();
      // shortcut: falls back to the numbered name if the preview has not loaded yet
      wsInput.value = latestVideoTitle.url === currentUrl ? latestVideoTitle.title : `Workspace ${nextNumStr}`;
      checkDuplicateWorkspaceName(wsInput.value);
    }
  } catch (err) {
    console.warn('Error setting up workspace inputs:', err);
  }

  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
      if (wsInput) {
        wsInput.focus();
        try { wsInput.select(); } catch (e) {}
      }
    }, 50);
  }
  lucide.createIcons();
}

function closeWorkspaceModal() {
  if (typeof closeWsDropdown === 'function') closeWsDropdown();
  const modal = document.getElementById('workspaceConfirmModal');
  if (modal) modal.classList.add('hidden');
}

let isProcessStarting = false;

async function confirmAndStartProcess() {
  if (isProcessStarting) return;

  let chosenWs = '';
  if (currentWorkspaceMode === 'existing') {
    const select = document.getElementById('wsExistingSelect');
    chosenWs = select ? select.value.trim() : '';
  } else {
    const wsInput = document.getElementById('wsModalInput');
    chosenWs = wsInput ? wsInput.value.trim() : '';
  }
  if (!chosenWs) {
    chosenWs = `Workspace ${String(nextWorkspaceIndex || 1).padStart(2, '0')}`;
  }
  closeWorkspaceModal();
  await executeActualProcess(chosenWs);
}

async function executeActualProcess(workspaceName) {
  if (isProcessStarting) return;
  isProcessStarting = true;

  try {
    const url = mainUrlInput.value.trim();
    if (!url || !isValidMediaUrl(url)) {
      showNoticeModal('Invalid URL', 'The video URL is invalid or incomplete. Make sure it starts with https:// and belongs to a supported platform.');
      return;
    }

    let action = '';
    if (currentPlatform === 'youtube') action = currentYtSub;
    else if (currentPlatform === 'instagram') action = currentIgSub;
    else if (currentPlatform === 'tiktok') action = currentTtSub;

    if (action === 'type_yt_ai_clip') {
      const origBtnText = mainBtnText ? mainBtnText.innerText : mainActionBtn.textContent;
      mainActionBtn.disabled = true;
      setMainActionLabel('Checking transcript...');
      try {
        const chkRes = await fetch(`/api/check-transcript?url=${encodeURIComponent(url)}`);
        if (chkRes.ok) {
          const chkData = await chkRes.json();
          if (chkData.has_transcript === false) {
            const proceed = await showConfirmModal(
              'No built-in transcript available',
              'This YouTube video has no official transcript. AI audio transcription will take longer. Continue?'
            );
            if (!proceed) {
              mainActionBtn.disabled = false;
              mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
              setMainActionLabel(origBtnText);
              return;
            }
          }
        }
      } catch (e) {
        console.warn('Transcript check error, proceeding:', e);
      } finally {
        setMainActionLabel(origBtnText);
      }
    }

    currentJobWorkspaceName = workspaceName;
    currentJobProjectId = null;

    mainActionBtn.disabled = true;
    mainActionBtn.classList.add('opacity-50', 'cursor-not-allowed');

    progressStateCard.classList.remove('hidden');
    setCancelButtonVisible(true, 'Cancel');
    progressStateCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    resultsShowcase.classList.add('hidden');

    const compBanner = document.getElementById('progressCompletionBanner');
    if (compBanner) compBanner.classList.add('hidden');

    shortsGalleryGrid.innerHTML = '';

    initTaskRows(action, selectedQuality);
    updateProgressUI('queued');

    const payload = {
      url: url,
      action: action,
      workspace_name: workspaceName,
      num_clips: selectedClipCount,
      aspect_ratio: action === 'type_yt_clip' ? selectedTrimRatio : (action === 'type_yt_video' ? selectedVideoRatio : selectedRatio),
      fps: action === 'type_yt_video' ? selectedVideoFps : 'auto',
      use_face_detect: selectedFaceDetect,
      quality: selectedQuality,
      clip_language: (action === 'type_yt_ai_clip' || action === 'type_ig_ai_clip' || action === 'ai_clip') ? defaultClipLanguage : undefined,
      start_time: action === 'type_yt_clip' ? (getAllTrimSegments()[0]?.start_time || '00:00') : '00:00',
      end_time: action === 'type_yt_clip' ? (getAllTrimSegments()[0]?.end_time || '00:30') : '00:30',
      segments: action === 'type_yt_clip' ? getAllTrimSegments() : undefined,
    };

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        if (res.headers.get('X-Luna-Error-Code') === 'MISSING_API_KEYS') {
          clearSavedJobStorage();
          mainActionBtn.disabled = false;
          mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          progressStateCard.classList.add('hidden');
          showMissingApiKeyToast(err.detail);
          return;
        }
        throw new Error(err.detail || 'Could not start the job');
      }

      const data = await res.json();
      activeJobId = data.job_id;
      try {
        localStorage.setItem('luna_active_job_id', activeJobId);
        if (workspaceName) localStorage.setItem('luna_active_ws', workspaceName);
        if (action) localStorage.setItem('luna_active_action', action);
        if (selectedQuality) localStorage.setItem('luna_active_quality', selectedQuality);
      } catch (e) {}
      jobIdPill.innerText = `JOB-${activeJobId}`;
      startPolling(activeJobId);

    } catch (err) {
      clearSavedJobStorage();
      mainActionBtn.disabled = false;
      mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      progressStateCard.classList.add('hidden');
      showNoticeModal('Could not start processing', err.message || 'An error occurred while processing the request.');
    }
  } finally {
    isProcessStarting = false;
  }
}

function setCancelButtonVisible(visible, label) {
  const btn = document.getElementById('btnCancelJob');
  if (!btn) return;
  btn.classList.toggle('hidden', !visible);
  btn.disabled = !visible;
  const text = btn.querySelector('span');
  if (text && label) text.textContent = label;
}

async function cancelActiveJob() {
  clearSavedJobStorage();

  if (!activeJobId) {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (taskElapsedTimer) {
      clearInterval(taskElapsedTimer);
      taskElapsedTimer = null;
    }
    progressStateCard.classList.add('hidden');
    setCancelButtonVisible(false);
    mainActionBtn.disabled = false;
    mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    return;
  }

  try {
    await fetch(`/api/cancel/${activeJobId}`, { method: 'POST' });
  } catch (e) {
    console.warn('Cancel error:', e);
    showToast('The server could not be reached, but the job was stopped locally.', true);
  }

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (taskElapsedTimer) {
    clearInterval(taskElapsedTimer);
    taskElapsedTimer = null;
  }

  currentTaskRows.forEach(r => {
    if (r.status === 'running') {
      r.status = 'failed';
      const b = document.getElementById(`task-badge-${r.key}`);
      const p = document.getElementById(`task-pill-${r.key}`);
      const pBox = document.getElementById(`task-progress-box-${r.key}`);
      if (b) b.innerHTML = getBadgeHtml('failed', r.step);
      if (p) p.innerHTML = getPillHtml('failed');
      if (pBox) pBox.classList.add('hidden');
    }
  });

  activeJobId = null;
  progressStateCard.classList.add('hidden');
  setCancelButtonVisible(false);
  mainActionBtn.disabled = false;
  mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}

function startPolling(jobId) {
  if (pollInterval) clearInterval(pollInterval);
  if (taskElapsedTimer) {
    clearInterval(taskElapsedTimer);
    taskElapsedTimer = null;
  }
  taskStartTimestamps = {};
  taskDurations = {};
  highestJobProgress = 0;

  const intervalId = setInterval(async () => {
    // Ignore late responses from a job that is no longer the active one.
    if (jobId !== activeJobId) {
      clearInterval(intervalId);
      return;
    }
    try {
      const res = await fetch(`/api/status/${jobId}`);
      // Jobs live in server memory, so a restart loses them and they will never report again.
      if (res.status === 404) {
        clearSavedJobStorage();
        clearInterval(pollInterval);
        pollInterval = null;
        if (taskElapsedTimer) {
          clearInterval(taskElapsedTimer);
          taskElapsedTimer = null;
        }
        activeJobId = null;
        progressStateCard.classList.add('hidden');
        mainActionBtn.disabled = false;
        mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        showToast('This job was lost because the server restarted. Please start it again.', true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();

      // Re-check after the await: the active job may have changed while this response was in flight.
      if (jobId !== activeJobId) {
        clearInterval(intervalId);
        return;
      }

      if (data.status === 'cancelled') {
        clearSavedJobStorage();
        clearInterval(pollInterval);
        pollInterval = null;
        if (taskElapsedTimer) {
          clearInterval(taskElapsedTimer);
          taskElapsedTimer = null;
        }
        activeJobId = null;
        progressStateCard.classList.add('hidden');
        mainActionBtn.disabled = false;
        mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        return;
      }

      updateProgressUI(data.stage, data);

      if (data.status === 'completed') {
        clearSavedJobStorage();
        clearInterval(pollInterval);
        pollInterval = null;
        if (taskElapsedTimer) {
          clearInterval(taskElapsedTimer);
          taskElapsedTimer = null;
        }
        activeJobId = null;
        setCancelButtonVisible(false);
        updateProgressUI('done', data);

        currentJobProjectId = data.project_id || null;
        currentJobWorkspaceName = data.workspace_name || null;
        const wsLabel = document.getElementById('completionWsLabel');
        if (wsLabel) wsLabel.innerText = data.workspace_name || 'Workspace';

        const compBanner = document.getElementById('progressCompletionBanner');
        if (compBanner) compBanner.classList.remove('hidden');

        renderOpusResults(data);
        updateVaultBadge();
        mainActionBtn.disabled = false;
        mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      } else if (data.status === 'failed') {
        clearSavedJobStorage();
        clearInterval(pollInterval);
        pollInterval = null;
        if (taskElapsedTimer) {
          clearInterval(taskElapsedTimer);
          taskElapsedTimer = null;
        }
        activeJobId = null;
        // Keep a way out: the job is gone, but the failed card must be dismissable.
        setCancelButtonVisible(true, 'Close');
        currentTaskRows.forEach(r => {
          if (r.status === 'running') {
            r.status = 'failed';
            const b = document.getElementById(`task-badge-${r.key}`);
            const p = document.getElementById(`task-pill-${r.key}`);
            const pBox = document.getElementById(`task-progress-box-${r.key}`);
            if (b) b.innerHTML = getBadgeHtml('failed', r.step);
            if (p) p.innerHTML = getPillHtml('failed');
            if (pBox) pBox.classList.add('hidden');
          }
        });
        mainActionBtn.disabled = false;
        mainActionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        let errMsg = data.error || 'An error occurred during processing. Check your connection or the link.';
        if (errMsg.includes('This video is unavailable') || errMsg.includes('This video is unavailable')) {
          errMsg = 'This YouTube video may be private, deleted, or restricted. Try another video.';
        }
        if (/getaddrinfo|name resolution|name or service|timed out|timeout|urlopen|unable to download|connection (was )?(reset|aborted|refused)|network is unreachable|errno 2\]/i.test(errMsg)) {
          errMsg = 'The download was interrupted. Check your internet connection and try again.';
        }
        if (data.retryable) {
          offerRetry(data.id, errMsg);
        } else {
          showNoticeModal('Processing failed', errMsg);
        }
      }
    } catch (e) {
      console.log(e);
    }
  }, 850);
  pollInterval = intervalId;
}

function updateProgressUI(stage, data) {
  const pData = data || {};
  const rawPct = (typeof pData.progress === 'number') ? pData.progress : 0;
  const isDownloadStage = (stage === 'queued' || stage === 'downloading');

  let downloadPct = rawPct;
  if (pData.download_eta && pData.download_eta !== '00:00' && pData.download_eta !== '0' && pData.download_eta !== '00:01') {
    if (downloadPct > 95.0) downloadPct = 95.0;
  }
  if (isDownloadStage) {
    highestJobProgress = Math.max(highestJobProgress, downloadPct);
  }
  const progressPct = isDownloadStage ? Math.min(100, Math.max(0, highestJobProgress)) : 0;

  if (currentActionType === 'type_yt_ai_clip') {
    if (stage === 'queued' || stage === 'downloading') {
      stageMainTitle.innerText = 'Downloading source video';
      stageSubTitle.innerText = `Downloading the ${activeTaskQuality}p video stream`;
      setTaskStatuses(['running', 'pending', 'pending', 'pending', 'pending'], pData, progressPct);
    } else if (stage === 'checking_transcript') {
      stageMainTitle.innerText = 'Checking transcript';
      stageSubTitle.innerText = 'Checking for auto-captions or official subtitles';
      setTaskStatuses(['done', 'running', 'pending', 'pending', 'pending'], pData, 0);
    } else if (stage === 'transcript_found') {
      stageMainTitle.innerText = 'Official transcript found';
      stageSubTitle.innerText = 'Built-in transcript extracted';
      setTaskStatuses(['done', 'done', 'done', 'pending', 'pending'], pData, 0);
    } else if (stage === 'transcribing' || stage === 'transcribing_groq' || stage === 'transcribing_local' || stage === 'extracting_audio' || stage === 'uploading') {
      stageMainTitle.innerText = 'Audio transcription';
      stageSubTitle.innerText = 'Processing audio with AI speech-to-text';
      setTaskStatuses(['done', 'done', 'running', 'pending', 'pending'], pData, 0);
    } else if (stage === 'detecting_highlights' || stage === 'ranking_highlights') {
      stageMainTitle.innerText = 'Viral Potential & Hook Analysis';
      stageSubTitle.innerText = 'Finding the strongest moments';
      setTaskStatuses(['done', 'done', 'done', 'running', 'pending'], pData, 0);
    } else if (stage === 'clipping' || stage === 'rendering') {
      const ratioText = selectedRatio === '16:9' ? '16:9 Wide' : selectedRatio;
      stageMainTitle.innerText = selectedRatio === '16:9' ? 'Render Clips' : 'Render Vertical Clips';
      stageSubTitle.innerText = `Encoding ${ratioText} clips`;
      setTaskStatuses(['done', 'done', 'done', 'done', 'running'], pData, 0);
    } else if (stage === 'saving') {
      stageMainTitle.innerText = 'Saving to Workspace';
      stageSubTitle.innerText = 'Adding clips to the selected workspace';
      setTaskStatuses(['done', 'done', 'done', 'done', 'running'], pData, 0);
    } else if (stage === 'done') {
      stageMainTitle.innerText = 'Clip generation complete';
      stageSubTitle.innerText = 'Clips are ready to post';
      setTaskStatuses(['done', 'done', 'done', 'done', 'done'], pData, 100);
    }
  } else {
    // Direct Video, Audio, or Trimmer: strictly 2 tasks top-to-bottom
    const isAudio = currentActionType === 'type_yt_mp3' || currentActionType === 'type_tt_mp3';
    const isClip = currentActionType === 'type_yt_clip';

    if (stage === 'queued') {
      stageMainTitle.innerText = 'Preparing download';
      stageSubTitle.innerText = 'Connecting to the media source';
      setTaskStatuses(['running', 'pending'], pData, progressPct);
    } else if (stage === 'downloading') {
      stageMainTitle.innerText = isAudio
        ? 'Downloading audio'
        : (isClip ? 'Downloading source segments' : 'Downloading video');
      stageSubTitle.innerText = isAudio
        ? 'Downloading bitstream audio high fidelity'
        : (isClip ? 'Downloading video segments from the source' : `Downloading the ${activeTaskQuality}p video`);
      setTaskStatuses(['running', 'pending'], pData, progressPct);
    } else if (stage === 'clipping') {
      stageMainTitle.innerText = 'Trimming video segments';
      stageSubTitle.innerText = 'Trimming timestamps with FFmpeg';
      setTaskStatuses(['running', 'pending'], pData, progressPct);
    } else if (stage === 'rendering') {
      stageMainTitle.innerText = 'Re-encoding video';
      stageSubTitle.innerText = 'Re-encoding to the requested ratio and frame rate before saving';
      const vaultRow = currentTaskRows[1];
      const vaultLabel = document.getElementById('task-label-vault');
      if (vaultRow && vaultLabel) vaultLabel.innerText = 'Re-encoding video';
      setTaskStatuses(['done', 'running'], pData, 100);
    } else if (stage === 'saving') {
      stageMainTitle.innerText = 'Saving to Workspace';
      stageSubTitle.innerText = 'Finishing processing and organizing media';
      const vaultRow = currentTaskRows[1];
      const vaultLabel = document.getElementById('task-label-vault');
      if (vaultRow && vaultLabel) vaultLabel.innerText = vaultRow.label;
      setTaskStatuses(['done', 'running'], pData, progressPct);
    } else if (stage === 'done') {
      stageMainTitle.innerText = 'Download complete';
      stageSubTitle.innerText = 'Files are saved and ready to play or download';
      setTaskStatuses(['done', 'done'], pData, 100);
    }
  }
}

async function goToCurrentJobWorkspace() {
  try {
    const res = await fetch('/api/vault/projects');
    if (res.ok) {
      const data = await res.json();
      vaultProjects = data.projects || [];
      nextWorkspaceIndex = data.next_workspace_index || 1;
      vaultStats = data.stats || vaultStats;
      updateVaultStatsUI();
    }
  } catch (e) {
    console.warn('Failed refreshing vault projects:', e);
  }

  let targetProject = null;
  if (currentJobProjectId) {
    targetProject = vaultProjects.find(it => it.project_id === currentJobProjectId);
  }
  if (!targetProject && currentJobWorkspaceName) {
    targetProject = vaultProjects.find(it => (it.workspace_name || '').trim().toLowerCase() === currentJobWorkspaceName.trim().toLowerCase());
  }

  switchMainTab('vault');

  if (targetProject) {
    await openProjectPage(targetProject.project_id);
  } else {
    showToast('Saved to Workspace');
  }
}

const AUDIO_WAVEFORM_HEIGHTS = [20, 45, 75, 30, 85, 55, 95, 70, 40, 90, 100, 65, 45, 80, 60, 35, 75, 50, 25, 15, 35, 65, 80, 45, 70, 90, 40, 20];

function renderAudioShowcaseHtml(fileId, audioUrl, thumbnailUrl, isLarge = false) {
  const heights = isLarge ? AUDIO_WAVEFORM_HEIGHTS : AUDIO_WAVEFORM_HEIGHTS.slice(0, 20);
  const barsHtml = heights
    .map(h => `<span class="waveform-bar w-[3.5px] rounded-full" style="height: ${h}%;"></span>`)
    .join('');

  const safeThumb = thumbnailUrl ? escapeHtml(encodeMediaUrl(thumbnailUrl)) : '';
  const safeAudioUrl = encodeMediaUrl(audioUrl);
  const hasThumb = Boolean(safeThumb);

  const sutroAudioPlayerHtml = `
    <media-theme-sutro
      data-player-size="medium"
      data-audio-player="true"
      class="absolute inset-0 z-20 block w-full h-full"
      style="--media-background-color: transparent; background: transparent;">
      <audio
        id="audio-el-${fileId}"
        slot="media"
        src="${safeAudioUrl}"
        preload="metadata"
        style="position:absolute;width:0;height:0;opacity:0;pointer-events:none;">
      </audio>
    </media-theme-sutro>
  `;

  if (hasThumb) {
    return `
      <div class="audio-card-showcase audio-has-thumb relative bg-[#0a0a0a] border-b border-white/[0.06] overflow-hidden select-none">
        <div class="relative w-full ${isLarge ? 'h-48' : 'h-40'} flex items-center justify-center overflow-hidden pointer-events-none">
          <img src="${safeThumb}" alt="" loading="lazy" class="audio-thumb-img absolute inset-0 w-full h-full object-cover object-center brightness-[0.52] pointer-events-none" onerror="const s = this.closest('.audio-card-showcase'); if (s) s.classList.remove('audio-has-thumb'); this.remove();" />
          <div class="absolute inset-0 shadow-[inset_0_0_36px_rgba(10,10,10,0.8)] pointer-events-none"></div>

          <div id="waveform-bars-${fileId}" class="relative z-10 waveform-bars flex items-end justify-center gap-[4px] ${isLarge ? 'h-10 max-w-[260px]' : 'h-8 max-w-[190px]'} w-full px-3 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
            ${barsHtml}
          </div>
        </div>
        <div class="relative w-full h-[46px] pointer-events-none"></div>
        ${sutroAudioPlayerHtml}
      </div>
    `;
  }

  return `
    <div class="audio-card-showcase relative bg-[#121212] border-b border-white/[0.06] ${isLarge ? 'p-7 pb-14' : 'p-5 pb-12'} flex flex-col items-center justify-center overflow-hidden select-none">
      <div class="absolute inset-0 bg-radial from-white/[0.07] via-transparent to-transparent pointer-events-none"></div>

      <div class="relative ${isLarge ? 'my-3' : 'my-2'} flex items-center justify-center pointer-events-none">
        <div id="vinyl-disc-${fileId}" class="vinyl-disc ${isLarge ? 'w-28 h-28' : 'w-20 h-20'} rounded-full bg-[#0a0a0a] border border-zinc-700/60 ${isLarge ? 'shadow-[0_12px_32px_rgba(0,0,0,0.8)]' : 'shadow-[0_8px_25px_rgba(0,0,0,0.8)]'} relative flex items-center justify-center transition-transform">
          <div class="absolute ${isLarge ? 'inset-2' : 'inset-1.5'} rounded-full border border-white/[0.06]"></div>
          <div class="absolute ${isLarge ? 'inset-4' : 'inset-3'} rounded-full border border-white/[0.04]"></div>
          <div class="absolute ${isLarge ? 'inset-6' : 'inset-4.5'} rounded-full border border-white/[0.05]"></div>
          <div class="${isLarge ? 'w-9 h-9' : 'w-7 h-7'} rounded-full bg-zinc-800 border border-white/20 flex items-center justify-center shadow-inner">
            <div class="${isLarge ? 'w-2.5 h-2.5' : 'w-2 h-2'} rounded-full bg-[#0a0a0a] border border-white/40"></div>
          </div>
        </div>
      </div>

      <div id="waveform-bars-${fileId}" class="waveform-bars flex items-end justify-center gap-[3.5px] ${isLarge ? 'h-8 max-w-[280px] mt-2 mb-2' : 'h-6 max-w-[200px] mt-1 mb-2'} w-full px-2 pointer-events-none">
        ${barsHtml}
      </div>

      ${sutroAudioPlayerHtml}
    </div>
  `;
}

/**
 * Build concise Studio video footer metadata tokens (e.g. "Clip #2 • 41s"),
 * keeping zero-second start times and omitting raw timestamp ranges or "MP4 Video".
 */
function buildStudioVideoMetaParts(item, idx) {
  const parseTimestampSec = (val) => {
    if (typeof val === 'number') return val;
    if (val === undefined || val === null) return NaN;
    const trimmed = String(val).trim();
    if (!trimmed) return NaN;
    return trimmed.includes(':') ? timeToSeconds(trimmed) : Number(trimmed);
  };

  const startSec = parseTimestampSec(item.start_time);
  const endSec = parseTimestampSec(item.end_time);
  const hasRange = isFinite(startSec) && isFinite(endSec) && endSec > startSec;
  const hasExplicitStart = item.start_time !== undefined && item.start_time !== null && String(item.start_time).trim() !== '';
  const hasClip = hasRange || hasExplicitStart;

  const parts = [];
  // Check hasClip explicitly because numeric 0s start_time is falsy in JS.
  if (hasClip) parts.push(`Clip #${idx + 1}`);
  if (item.quality) {
    const qStr = String(item.quality).trim();
    parts.push(/^\d+$/.test(qStr) ? `${qStr}p` : qStr);
  }
  if (hasRange) parts.push(`${Math.round(endSec - startSec)}s`);
  return parts;
}

function renderOpusResults(data) {
  shortsGalleryGrid.innerHTML = '';
  const items = data.results || [];

  if (items.length === 0) {
    batchZipDownloadBtn.classList.add('hidden');
    shortsGalleryGrid.classList.add('hidden');
    resultsCountNotice.innerText = 'No files were produced. Check the job log and try again.';
  } else {
    if (items.length > 1) {
      batchZipDownloadBtn.href = `/api/download-zip/${data.id}`;
      batchZipDownloadBtn.classList.remove('hidden');
    } else {
      batchZipDownloadBtn.classList.add('hidden');
    }
    shortsGalleryGrid.classList.remove('hidden');
    resultsCountNotice.innerText = `${items.length} media files are ready to play and download.`;
    shortsGalleryGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start';
  }

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.id = `studio-card-${idx}`;
    const downloadUrl = item.download_url || `/api/download-file/${data.id}/${item.filename}`;

    if (item.type === 'audio') {
      const fileId = `studio-aud-${idx}`;
      const showcaseHtml = renderAudioShowcaseHtml(fileId, item.url, item.thumbnail || '', false);

      card.className = 'vault-file-card rounded-2xl bg-[#171717] border border-white/[0.08] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between group';
      card.innerHTML = `
        ${showcaseHtml}

        <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <h4 class="text-xs sm:text-sm font-semibold font-sans text-white line-clamp-2 leading-snug mb-1">
              ${escapeHtml(item.title || item.filename || 'Audio')}
            </h4>
            <div class="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
              <span>320 kbps</span>
              <span>• MP3</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-2.5 border-t border-white/[0.06]">
            <span class="text-[10.5px] font-mono text-zinc-500">MP3 Audio</span>
            <div class="vault-file-actions flex items-center gap-2">
              <a href="${escapeHtml(encodeMediaUrl(downloadUrl))}" download="${escapeHtml(item.filename || 'audio.mp3')}" class="luna-download-icon-link" aria-label="Download File">
                <i data-lucide="download" class="w-4 h-4"></i>
              </a>
            </div>
          </div>
        </div>
      `;
      setTimeout(() => initAudioEvents(fileId), 20);
    } else {
      const fileId = `studio-vid-${idx}`;
      const isPortraitDefault = currentPlatform === 'tiktok' || currentPlatform === 'instagram' || currentActionType === 'type_yt_ai_clip';
      const itemMeta = resolveMediaRatioMeta(item.aspect_ratio, item.filename, isPortraitDefault);
      const itemIsWide = itemMeta.kind === 'landscape';

      const footerMetaParts = buildStudioVideoMetaParts(item, idx);
      const footerMetaHtml = footerMetaParts
        .map((part, i) => i === 0
          ? `<span>${escapeHtml(part)}</span>`
          : `<span class="text-zinc-600" aria-hidden="true">•</span><span>${escapeHtml(part)}</span>`)
        .join('');

      const captionSnippetHtml = item.caption ? `
        <p class="mt-2 text-xs text-zinc-400 leading-relaxed line-clamp-2 select-all">
          ${escapeHtml(item.caption)}
        </p>
      ` : '';

      const copyBtn = item.caption ? `
        <button
          type="button"
          onclick="copyText('${escapeQuotes(item.caption)}', this)"
          class="caption-copy-btn w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
          aria-label="Copy caption">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
        </button>
        <span class="vault-card-action-sep" aria-hidden="true"></span>
      ` : '';

      card.className = 'vault-file-card rounded-2xl bg-[#171717] border border-white/[0.08] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between group';
      card.innerHTML = `
        <div class="video-preview-wrapper relative bg-[#09090b] w-full overflow-hidden border-b border-white/[0.06] flex items-center justify-center ${ratioAspectClass(itemMeta)} ${itemIsWide ? 'max-h-[520px]' : 'max-h-[500px]'}" style="aspect-ratio: ${ratioAspectStyle(itemMeta)}" data-file-id="${fileId}">
          <div class="ambient-glow absolute inset-0 opacity-15 pointer-events-none filter blur-2xl scale-125 bg-gradient-to-t from-white/10 via-white/5 to-transparent"></div>

          ${renderRatioBadgeHtml(itemMeta.label)}

          <media-theme-sutro style="width:100%; height:100%;" data-player-size="medium">
            <video 
              slot="media"
              preload="metadata" 
              playsinline 
              disablepictureinpicture
              controlslist="nodownload nopictureinpicture"
              class="w-full h-full object-contain relative z-10" 
              src="${encodeMediaUrl(item.url)}" 
              onloadedmetadata="handleVaultVideoMetadata(this, '${fileId}')">
            </video>
          </media-theme-sutro>
        </div>

        <div class="p-4 flex-1 flex flex-col justify-between gap-3.5">
          <div>
            <h4 class="text-sm sm:text-[15px] font-semibold font-sans text-white line-clamp-2 leading-snug tracking-[-0.01em]">
              ${escapeHtml(item.title || item.filename)}
            </h4>
            ${captionSnippetHtml}
          </div>

          <div class="flex items-center justify-between pt-3 border-t border-white/[0.06]">
            <div class="flex items-center gap-1.5 text-[11.5px] font-mono font-medium text-zinc-400">
              ${footerMetaHtml}
            </div>
            <div class="vault-file-actions flex items-center gap-2">
              ${copyBtn}
              <a href="${escapeHtml(encodeMediaUrl(downloadUrl))}" download="${escapeHtml(item.filename || 'video.mp4')}" class="luna-download-icon-link" aria-label="Download File">
                <i data-lucide="download" class="w-4 h-4"></i>
              </a>
            </div>
          </div>
        </div>
      `;
    }

    card.querySelectorAll('video, audio').forEach(el => {
      if (el.tagName === 'VIDEO') {
        try { el.disablePictureInPicture = true; } catch (e) {}
      }
      attachMediaRecovery(el);
    });
    shortsGalleryGrid.appendChild(card);
  });

  resultsShowcase.classList.remove('hidden');
  initVideoHoverPlayers(shortsGalleryGrid);
  lucide.createIcons();
  setTimeout(compactSutroPlayers, 30);
  setTimeout(compactSutroPlayers, 150);
  setTimeout(compactSutroPlayers, 500);
}



function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const span = btn.querySelector('span');
    if (span) {
      const original = span.innerText;
      span.innerText = 'Copied! ✓';
      setTimeout(() => { span.innerText = original; }, 2000);
      return;
    }
    const prevHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i>';
    lucide.createIcons();
    setTimeout(() => {
      btn.innerHTML = prevHtml;
      lucide.createIcons();
    }, 1800);
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function escapeQuotes(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/[\r\n]+/g, ' ');
}

function encodeMediaUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value || value === '#') return '#';
  if (/^https?:\/\//i.test(value)) return encodeURI(value);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return '#';
  return value.split('/').map((seg, idx) => {
    if (idx === 0 && seg === '') return '';
    try {
      return encodeURIComponent(decodeURIComponent(seg));
    } catch (e) {
      return encodeURIComponent(seg);
    }
  }).join('/');
}

// Automatically recovers <audio>/<video> elements (and clears Sutro's error dialog)
// if a transient network abort or range glitch causes MEDIA_ERR_SRC_NOT_SUPPORTED.
function attachMediaRecovery(mediaEl) {
  if (!mediaEl || mediaEl.dataset.recoveryBound === '1') return;
  const originalSrc = mediaEl.getAttribute('src');
  if (!originalSrc || originalSrc === '#') return;
  mediaEl.dataset.recoveryBound = '1';

  const clearSutroErrorDialog = () => {
    const sutro = mediaEl.closest('media-theme-sutro');
    if (!sutro || !sutro.shadowRoot) return;
    const dlg = sutro.shadowRoot.querySelector('media-error-dialog');
    if (dlg) dlg.removeAttribute('open');
  };

  mediaEl.addEventListener('loadedmetadata', () => {
    delete mediaEl.dataset.recoverCount;
    clearSutroErrorDialog();
  });
  mediaEl.addEventListener('canplay', clearSutroErrorDialog);

  mediaEl.addEventListener('error', () => {
    if (mediaEl.dataset.intentionallyReleased === '1') return;
    if (!mediaEl.isConnected || !mediaEl.getAttribute('src')) return;
    const retries = Number(mediaEl.dataset.recoverCount || 0);
    if (retries >= 2) return;
    mediaEl.dataset.recoverCount = String(retries + 1);
    const delay = retries === 0 ? 350 : 900;
    setTimeout(() => {
      if (mediaEl.dataset.intentionallyReleased === '1') return;
      if (!mediaEl.isConnected || !mediaEl.getAttribute('src')) return;
      try {
        mediaEl.removeAttribute('src');
        mediaEl.load();
        mediaEl.setAttribute('src', originalSrc);
        mediaEl.load();
      } catch (e) {}
    }, delay);
  });
}

// Media vault methods

function updateTabsPill(immediate = false) {
  const pill = document.getElementById('mainTabsPill');
  const btnStudio = document.getElementById('tabBtnStudio');
  const btnVault = document.getElementById('tabBtnVault');
  if (!pill) return;

  if (currentMainTab === 'settings' || currentMainTab === 'guide') {
    if (immediate) pill.style.transition = 'none';
    pill.style.opacity = '0';
    pill.style.width = '0px';
    if (immediate) {
      void pill.offsetHeight;
      pill.style.transition = '';
    }
    if (btnStudio) {
      btnStudio.classList.remove('active');
      btnStudio.setAttribute('aria-selected', 'false');
    }
    if (btnVault) {
      btnVault.classList.remove('active');
      btnVault.setAttribute('aria-selected', 'false');
    }
    return;
  }

  pill.style.opacity = '1';
  const activeTab = currentMainTab === 'vault' ? btnVault : btnStudio;
  if (!activeTab) return;

  if (btnStudio) {
    btnStudio.classList.toggle('active', currentMainTab === 'studio');
    btnStudio.setAttribute('aria-selected', currentMainTab === 'studio' ? 'true' : 'false');
  }
  if (btnVault) {
    btnVault.classList.toggle('active', currentMainTab === 'vault');
    btnVault.setAttribute('aria-selected', currentMainTab === 'vault' ? 'true' : 'false');
  }

  if (immediate) {
    pill.style.transition = 'none';
    pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
    pill.style.width = `${activeTab.offsetWidth}px`;
    void pill.offsetHeight;
    pill.style.transition = '';
  } else {
    pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
    pill.style.width = `${activeTab.offsetWidth}px`;
  }
}

let studioBgResumeTimer = null;

function activateStudioBackground() {
  const bgContainer = document.getElementById('studioBackgroundContainer');
  const curtainsCanvas = document.getElementById('curtains-canvas');
  const activeBgId = typeof window.getActiveStudioBackground === 'function'
    ? window.getActiveStudioBackground()
    : 'obsidian';
  const isWebGL = activeBgId === 'lunar-waves';

  if (bgContainer) {
    bgContainer.classList.remove('is-hidden');
    bgContainer.style.opacity = '1';
    bgContainer.style.visibility = 'visible';
    bgContainer.style.pointerEvents = 'none';
    bgContainer.style.removeProperty('display');
  }
  if (typeof window.applyStudioBackground === 'function') {
    window.applyStudioBackground(activeBgId, { persistCache: false });
  }
  if (curtainsCanvas) {
    if (isWebGL) {
      curtainsCanvas.style.opacity = '1';
      curtainsCanvas.style.visibility = 'visible';
      curtainsCanvas.style.pointerEvents = 'none';
      curtainsCanvas.style.removeProperty('display');
    } else {
      curtainsCanvas.style.opacity = '0';
      curtainsCanvas.style.visibility = 'hidden';
      curtainsCanvas.style.display = 'none';
    }
  }
  if (isWebGL && typeof window.resumeUnicornStudio === 'function') {
    window.resumeUnicornStudio();
  }
}

function syncLocationHash(targetHash, options = {}) {
  const normalized = targetHash || '';
  const current = window.location.hash || '';
  if (current === normalized) return;
  const method = options.replace ? 'replaceState' : 'pushState';
  const nextUrl = normalized || window.location.pathname;
  history[method](null, '', nextUrl);
}

function getMainTabHash(tab) {
  if (tab === 'vault') return '#vault';
  if (tab === 'settings') return '#settings';
  if (tab === 'guide') {
    return currentGuideTab && currentGuideTab !== 'wf-youtube'
      ? `#guide/${currentGuideTab}`
      : '#guide';
  }
  return '';
}

function switchMainTab(tab, options = {}) {
  try {
    const previousTab = currentMainTab;
    if (
      previousTab === 'settings' &&
      tab !== 'settings' &&
      !options.force &&
      !options.isInitial &&
      typeof guardUnsavedSettingsLeave === 'function' &&
      guardUnsavedSettingsLeave()
    ) {
      return;
    }
    const updateUrl = options.updateUrl !== false;
    const replaceUrl = Boolean(options.replaceUrl);
    const immediatePill = Boolean(options.immediate);
    currentMainTab = tab;
    if (studioBgResumeTimer) {
      clearTimeout(studioBgResumeTimer);
      studioBgResumeTimer = null;
    }
    if (tab !== 'vault') {
      if (typeof exitActiveSelectionMode === 'function') exitActiveSelectionMode();
      else if (typeof exitVaultSelectionMode === 'function') exitVaultSelectionMode();
    }

    document.body.classList.remove('tab-studio', 'tab-vault', 'tab-settings', 'tab-guide');
    document.body.classList.add('tab-' + tab);
    if (tab !== 'vault') {
      document.body.classList.remove('in-workspace');
      if (currentActiveProjectId) {
        closeProjectPage({ preserveHash: true });
      }
    } else if (!currentActiveProjectId) {
      document.body.classList.remove('in-workspace');
    }

    const sectionStudio = document.getElementById('section-studio');
    const sectionVault = document.getElementById('section-vault');
    const sectionSettings = document.getElementById('section-settings');
    const btnNavSettings = document.getElementById('btnNavSettings');
    const pill = document.getElementById('mainTabsPill');

    // Running WebGL Background active ONLY in Studio
    const bgContainer = document.getElementById('studioBackgroundContainer');
    const curtainsCanvas = document.getElementById('curtains-canvas');
    const shouldDeferStudioBg = tab === 'studio' && previousTab !== 'studio';
    if (tab === 'studio') {
      if (!shouldDeferStudioBg) {
        activateStudioBackground();
      }
    } else {
      if (bgContainer) {
        bgContainer.classList.add('is-hidden');
        bgContainer.style.opacity = '0';
        bgContainer.style.visibility = 'hidden';
        bgContainer.style.pointerEvents = 'none';
      }
      if (curtainsCanvas) {
        curtainsCanvas.style.opacity = '0';
        curtainsCanvas.style.visibility = 'hidden';
        curtainsCanvas.style.pointerEvents = 'none';
      }
      if (typeof window.pauseUnicornStudio === 'function') {
        window.pauseUnicornStudio();
      }
    }

    const sectionGuide = document.getElementById('section-guide');
    const btnNavGuide = document.getElementById('btnNavGuide');

    if (tab === 'settings') {
      if (sectionStudio) sectionStudio.classList.add('hidden');
      if (sectionVault) sectionVault.classList.add('hidden');
      if (sectionGuide) sectionGuide.classList.add('hidden');
      if (sectionSettings) sectionSettings.classList.remove('hidden');

      if (btnNavSettings) {
        btnNavSettings.classList.add('text-white', 'active');
        btnNavSettings.classList.remove('text-zinc-400');
      }
      if (btnNavGuide) {
        btnNavGuide.classList.remove('text-white', 'active');
      }

      if (pill) {
        pill.style.opacity = '0';
        pill.style.width = '0px';
      }

      document.title = 'Luna: Settings';
      try {
        if (typeof loadSettingsData === 'function') loadSettingsData();
      } catch (e) {
        console.error('[Settings] Load error:', e);
      }
    } else if (tab === 'guide') {
      if (sectionStudio) sectionStudio.classList.add('hidden');
      if (sectionVault) sectionVault.classList.add('hidden');
      if (sectionSettings) sectionSettings.classList.add('hidden');
      if (sectionGuide) sectionGuide.classList.remove('hidden');

      if (btnNavGuide) {
        btnNavGuide.classList.add('text-white', 'active');
      }
      if (btnNavSettings) {
        btnNavSettings.classList.remove('text-white', 'active');
        btnNavSettings.classList.add('text-zinc-400');
      }

      if (pill) {
        pill.style.opacity = '0';
        pill.style.width = '0px';
      }

      document.title = 'Luna: User Guide';
      if (typeof initGuidePill === 'function') {
        requestAnimationFrame(() => initGuidePill());
      }
    } else {
      if (sectionSettings) sectionSettings.classList.add('hidden');
      if (sectionGuide) sectionGuide.classList.add('hidden');

      if (btnNavSettings) {
        btnNavSettings.classList.remove('text-white', 'active');
        btnNavSettings.classList.add('text-zinc-400');
      }
      if (btnNavGuide) {
        btnNavGuide.classList.remove('text-white', 'active');
      }

      if (tab === 'studio') {
        if (sectionStudio) sectionStudio.classList.remove('hidden');
        if (sectionVault) sectionVault.classList.add('hidden');
        document.title = 'Luna: AI Video Clipper & Downloader';
      } else if (tab === 'vault') {
        if (sectionStudio) sectionStudio.classList.add('hidden');
        if (sectionVault) sectionVault.classList.remove('hidden');
        document.title = 'Luna: Workspace';

        if (!currentActiveProjectId && !document.body.classList.contains('in-workspace')) {
          const listView = document.getElementById('vaultProjectsListView');
          const detailView = document.getElementById('vaultProjectDetailView');
          if (listView) listView.classList.remove('hidden');
          if (detailView) detailView.classList.add('hidden');
        }

        if (typeof syncVaultModeDropdownOptions === 'function') syncVaultModeDropdownOptions();
        if (typeof updateVaultPlatformUnderline === 'function') {
          requestAnimationFrame(() => updateVaultPlatformUnderline(true));
        }

        try {
          if (typeof loadVaultItems === 'function') loadVaultItems();
        } catch (e) {
          console.error('[Vault] Load error:', e);
        }
      }
    }

    updateTabsPill(immediatePill);

    if (updateUrl) {
      syncLocationHash(getMainTabHash(tab), { replace: replaceUrl });
    }

    if (shouldDeferStudioBg) {
      studioBgResumeTimer = setTimeout(() => {
        studioBgResumeTimer = null;
        if (currentMainTab !== 'studio') return;
        activateStudioBackground();
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }, 270);
    } else if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  } catch (err) {
    console.error('[switchMainTab error]', err);
  }
}

// Settings page methods
function triggerInputError(wrapId, msgId, message) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const box = wrap.querySelector('.t-input');
  const msg = document.getElementById(msgId);

  if (message && msg) msg.innerText = message;

  if (box) {
    box.classList.remove('is-shaking');
    void box.offsetWidth;
    box.classList.add('is-error', 'is-shaking');
  }
  wrap.classList.add('is-error');

  setTimeout(() => {
    if (box) box.classList.remove('is-shaking');
  }, 280);

  if (wrap._revertTimer) clearTimeout(wrap._revertTimer);
  wrap._revertTimer = setTimeout(() => {
    wrap.classList.remove('is-error');
    if (box) box.classList.remove('is-error');
  }, 3000);
}

const TOAST_ICON_BY_TYPE = {
  success: 'circle-check',
  info: 'info',
  warning: 'triangle-alert',
  error: 'circle-alert',
};

const lunaToast = (() => {
  let seq = 0;
  const active = new Map();
  const MAX_VISIBLE = 3;
  const PEEK_STEP = 7;
  const EXPAND_GAP = 7;
  let isExpanded = false;
  let listenersBound = false;

  function pauseAllTimers() {
    active.forEach(entry => {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
        entry.remaining = Math.max(800, entry.remaining - (performance.now() - entry.startedAt));
      }
    });
  }

  function resumeAllTimers() {
    active.forEach(entry => {
      if (!entry.timer && entry.remaining > 0) {
        scheduleClose(entry, entry.remaining);
      }
    });
  }

  function bindViewportHover(viewport) {
    if (listenersBound || !viewport) return;
    listenersBound = true;
    viewport.addEventListener('mouseenter', () => {
      if (active.size === 0) return;
      isExpanded = true;
      viewport.classList.add('is-expanded');
      pauseAllTimers();
      layoutStack();
    });
    viewport.addEventListener('mouseleave', () => {
      isExpanded = false;
      viewport.classList.remove('is-expanded');
      resumeAllTimers();
      layoutStack();
    });
    // Tap on stacked mobile toast expands stack cleanly
    viewport.addEventListener('touchstart', () => {
      if (active.size > 1 && !isExpanded) {
        isExpanded = true;
        viewport.classList.add('is-expanded');
        pauseAllTimers();
        layoutStack();
      }
    }, { passive: true });
  }

  function layoutStack() {
    const viewport = document.getElementById('toastNotification');
    if (!viewport) return;
    const entries = Array.from(active.values()).reverse(); // newest index 0 (front) -> oldest (back)

    if (entries.length === 0) {
      isExpanded = false;
      viewport.classList.remove('is-expanded');
      viewport.style.height = '0px';
      return;
    }

    let expandedOffset = 0;
    let totalHeight = 0;

    entries.forEach((entry, index) => {
      const el = entry.el;
      const h = el.offsetHeight || 40;
      el.style.zIndex = String(100 - index);

      if (isExpanded) {
        el.dataset.stackedHidden = 'false';
        el.style.opacity = '1';
        el.style.transform = `translate3d(0, -${expandedOffset}px, 0) scale(1)`;
        expandedOffset += h + EXPAND_GAP;
        totalHeight = expandedOffset - EXPAND_GAP;
      } else {
        const scale = Math.max(0.84, 1 - index * 0.06);
        const y = -(index * PEEK_STEP);
        el.dataset.stackedHidden = index > 0 ? 'true' : 'false';
        el.style.opacity = index >= MAX_VISIBLE ? '0' : '1';
        el.style.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
        if (index === 0) {
          totalHeight = h + (entries.length - 1) * PEEK_STEP;
        }
      }
    });

    viewport.style.height = `${Math.max(0, totalHeight)}px`;
  }

  function close(id) {
    const entry = active.get(id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    active.delete(id);
    const el = entry.el;
    el.classList.add('is-leaving');
    el.style.transform = 'translate3d(0, 14px, 0) scale(0.95)';
    layoutStack();
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  function scheduleClose(entry, duration) {
    if (entry.timer) clearTimeout(entry.timer);
    if (duration <= 0) return;
    entry.remaining = duration;
    entry.startedAt = performance.now();
    entry.timer = setTimeout(() => close(entry.id), duration);
  }

  function add(opts = {}) {
    const viewport = document.getElementById('toastNotification');
    if (!viewport) return null;
    bindViewportHover(viewport);

    const normalized = typeof opts === 'string' ? { description: opts } : (opts || {});
    const type = ['success', 'info', 'warning', 'error', 'default'].includes(normalized.type)
      ? normalized.type
      : 'default';
    const title = normalized.title ? String(normalized.title) : '';
    const description = normalized.description ? String(normalized.description) : '';
    const priority = normalized.priority === 'high' || type === 'error' ? 'high' : 'normal';
    const timeout = typeof normalized.timeout === 'number'
      ? normalized.timeout
      : (priority === 'high' || normalized.actionProps ? 4500 : 3200);

    const id = `toast_${++seq}`;

    // Keep #toastMessage unique on the newest active toast so browser E2E selectors keep working cleanly.
    viewport.querySelectorAll('#toastMessage').forEach(node => node.removeAttribute('id'));

    while (active.size >= MAX_VISIBLE) {
      const oldestId = active.keys().next().value;
      close(oldestId);
    }

    const card = document.createElement('div');
    card.className = `luna-toast-card${title && description ? ' has-title-layout' : ''}`;
    card.dataset.toastId = id;
    card.dataset.type = type;
    card.dataset.stackedHidden = 'false';
    card.setAttribute('role', priority === 'high' ? 'alert' : 'status');

    const iconName = TOAST_ICON_BY_TYPE[type];
    const iconHtml = iconName
      ? `<i data-lucide="${iconName}" class="luna-toast-icon" aria-hidden="true"></i>`
      : '';
    const titleHtml = title
      ? `<div class="luna-toast-title">${escapeHtml(title)}</div>`
      : '';
    const descHtml = description
      ? `<div id="toastMessage" class="luna-toast-desc${title ? ' has-title' : ''}">${escapeHtml(description)}</div>`
      : `<div id="toastMessage" class="luna-toast-desc sr-only">${escapeHtml(title)}</div>`;

    const progressHtml = normalized.indeterminate
      ? '<div class="luna-toast-progress-track" aria-hidden="true"><div class="luna-toast-progress-bar"></div></div>'
      : '';

    card.innerHTML = `
      ${iconHtml}
      <div class="luna-toast-body">
        ${titleHtml}
        ${descHtml}
      </div>
      <div class="luna-toast-actions"></div>
      ${progressHtml}
    `;

    if (normalized.link && normalized.link.label) {
      const bodyEl = card.querySelector('.luna-toast-body');
      if (bodyEl) {
        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'luna-toast-link';
        linkBtn.textContent = String(normalized.link.label);
        linkBtn.onclick = (e) => {
          e.stopPropagation();
          if (typeof normalized.link.onClick === 'function') {
            normalized.link.onClick(id, linkBtn);
          }
        };
        bodyEl.appendChild(linkBtn);
      }
    }

    const actionsEl = card.querySelector('.luna-toast-actions');
    const actionItems = Array.isArray(normalized.actions)
      ? normalized.actions
      : (normalized.actionProps ? [normalized.actionProps] : []);

    actionItems.forEach((item) => {
      if (!item || !(item.children || item.label)) return;
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      if (item.id) actionBtn.id = String(item.id);
      actionBtn.className = `luna-toast-action-btn${item.variant === 'primary' ? ' is-primary' : ''}`;
      actionBtn.textContent = String(item.children || item.label);
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        if (typeof item.onClick === 'function') {
          item.onClick(id, actionBtn);
        }
      };
      actionsEl.appendChild(actionBtn);
    });

    if (normalized.closable !== false) {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'luna-toast-close';
      closeBtn.setAttribute('aria-label', 'Close notification');
      closeBtn.innerHTML = '<i data-lucide="x" class="w-3.5 h-3.5" aria-hidden="true"></i>';
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        close(id);
      };
      actionsEl.appendChild(closeBtn);
    }

    viewport.appendChild(card);
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: card });
    }

    const entry = { id, el: card, timer: null, remaining: timeout, startedAt: 0 };
    active.set(id, entry);

    requestAnimationFrame(() => {
      layoutStack();
    });

    if (!isExpanded) {
      scheduleClose(entry, timeout);
    } else {
      entry.remaining = timeout;
    }
    return id;
  }

  function update(id, patch = {}) {
    const entry = active.get(id);
    if (!entry) return false;
    const card = entry.el;
    if (patch.type && ['success', 'info', 'warning', 'error', 'default'].includes(patch.type)) {
      card.dataset.type = patch.type;
      const oldIcon = card.querySelector('.luna-toast-icon');
      const nextIconName = TOAST_ICON_BY_TYPE[patch.type];
      if (nextIconName) {
        const iconNode = document.createElement('i');
        iconNode.setAttribute('data-lucide', nextIconName);
        iconNode.className = 'luna-toast-icon';
        iconNode.setAttribute('aria-hidden', 'true');
        if (oldIcon) oldIcon.replaceWith(iconNode);
        else card.insertBefore(iconNode, card.firstChild);
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: card });
        }
      } else if (oldIcon) {
        oldIcon.remove();
      }
    }
    if (typeof patch.title === 'string') {
      let titleEl = card.querySelector('.luna-toast-title');
      if (!titleEl && patch.title) {
        titleEl = document.createElement('div');
        titleEl.className = 'luna-toast-title';
        card.querySelector('.luna-toast-body')?.prepend(titleEl);
      }
      if (titleEl) titleEl.textContent = patch.title;
    }
    if (typeof patch.description === 'string') {
      const descEl = card.querySelector('.luna-toast-desc');
      if (descEl) {
        descEl.textContent = patch.description;
        descEl.classList.remove('sr-only');
      }
    }
    if (typeof patch.indeterminate === 'boolean') {
      const existingTrack = card.querySelector('.luna-toast-progress-track');
      if (patch.indeterminate && !existingTrack) {
        const track = document.createElement('div');
        track.className = 'luna-toast-progress-track';
        track.setAttribute('aria-hidden', 'true');
        track.innerHTML = '<div class="luna-toast-progress-bar"></div>';
        card.appendChild(track);
      } else if (!patch.indeterminate && existingTrack) {
        existingTrack.remove();
      }
    }
    if (typeof patch.timeout === 'number') {
      if (patch.timeout > 0) {
        scheduleClose(entry, patch.timeout);
      } else if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
        entry.remaining = 0;
      }
    }
    requestAnimationFrame(() => layoutStack());
    return true;
  }

  function attention(id, hintText) {
    const entry = active.get(id);
    if (!entry) return;
    if (typeof hintText === 'string' && hintText) {
      update(id, { description: hintText });
    }
    const card = entry.el;
    card.classList.remove('is-attention');
    void card.offsetWidth;
    card.classList.add('is-attention');
    setTimeout(() => card.classList.remove('is-attention'), 650);
  }

  return { add, close, update, attention, has: (id) => active.has(id) };
})();

window.toast = lunaToast;

function showToast(message, typeOrIsError = false) {
  if (message && typeof message === 'object') {
    return lunaToast.add(message);
  }
  let type = 'success';
  let priority = 'normal';
  if (typeOrIsError === true || typeOrIsError === 'error') {
    type = 'error';
    priority = 'high';
  } else if (['info', 'warning', 'success', 'default'].includes(typeOrIsError)) {
    type = typeOrIsError;
  }
  return lunaToast.add({ type, description: String(message || ''), priority });
}

function toggleSecret(inputId, iconId) {
  const el = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  if (!el || !icon) return;

  if (el.type === 'password') {
    el.type = 'text';
    icon.setAttribute('data-lucide', 'eye-off');
  } else {
    el.type = 'password';
    icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

let currentStorageDir = '';
const providerKeyUi = {
  openai: { configured: false, editing: true, validated: false, hint: '' },
  gemini: { configured: false, editing: true, validated: false, hint: '' },
  groq: { configured: false, editing: true, validated: false, hint: '' }
};
const providerKeyFields = { openai: 'inputOpenai', gemini: 'inputGemini', groq: 'inputGroq' };
const providerKeyPlaceholders = { openai: 'Enter your API key...', gemini: 'Enter your Gemini API key...', groq: 'Enter your Groq API key...' };

function updateProviderKeyUI(provider) {
  const state = providerKeyUi[provider];
  const input = document.getElementById(providerKeyFields[provider]);
  if (!state || !input) return;
  const locked = state.configured && !state.editing;
  input.disabled = locked;
  input.placeholder = locked ? `Key saved ····${state.hint}` : providerKeyPlaceholders[provider];
  input.parentElement?.querySelector('button[title="Show / Hide"]')?.classList.toggle('hidden', locked);
  document.getElementById(`change${provider[0].toUpperCase()}${provider.slice(1)}Key`)?.classList.toggle('hidden', !state.configured || state.editing);
  const hasSecondaryAction = state.configured || state.validated;
  const showActionDot = provider === 'openai'
    ? hasSecondaryAction
    : ((state.configured && !state.editing) || state.validated);
  document.getElementById(`${provider}KeyActionDot`)?.classList.toggle('hidden', !showActionDot);
  const saveButton = document.getElementById(`save${provider[0].toUpperCase()}${provider.slice(1)}Key`);
  if (saveButton) {
    saveButton.classList.toggle('hidden', !state.editing || !state.validated);
    saveButton.disabled = !state.validated;
    saveButton.classList.toggle('text-emerald-400/50', !state.validated);
    saveButton.classList.toggle('text-emerald-400', state.validated);
  }
  document.getElementById(`cancel${provider[0].toUpperCase()}${provider.slice(1)}Key`)?.classList.toggle('hidden', !state.editing || !state.configured);
  const hasUnsavedTypedKey = Boolean(state.editing && input.value.trim());
  const statusId = { openai: 'statusOpenai', gemini: 'statusGemini', groq: 'statusGroq' }[provider];
  const statusEl = document.getElementById(statusId);
  const stateLabel = document.getElementById(`${provider}KeyState`);
  if (stateLabel) {
    stateLabel.className = 'text-[11px]';
    if (locked) {
      stateLabel.classList.add('text-zinc-500');
      stateLabel.textContent = 'API key is saved. Use Test Connection to check it, or Change Key to replace it.';
    } else if (state.validated) {
      stateLabel.classList.add('text-emerald-400');
      stateLabel.textContent = 'Key verified — click Save Key above to apply.';
    } else if (hasUnsavedTypedKey) {
      stateLabel.classList.add('text-amber-400');
      stateLabel.textContent = state.configured
        ? 'Unsaved replacement key — click Test Connection to verify before saving.'
        : 'Unsaved key entered — click Test Connection to verify and enable Save Key.';
      if (statusEl && !statusEl.textContent.trim()) {
        statusEl.innerHTML = '<span class="text-amber-400">Unsaved • Test to save</span>';
      }
    } else {
      stateLabel.classList.add('text-zinc-500');
      stateLabel.textContent = state.configured
        ? 'Enter a replacement key. The current key stays active until you save.'
        : 'No API key saved yet. Test the key, then save it.';
    }
  }
}

function beginKeyChange(provider) {
  const state = providerKeyUi[provider];
  if (!state) return;
  state.editing = true;
  state.validated = false;
  const input = document.getElementById(providerKeyFields[provider]);
  if (input) input.value = '';
  const statusId = { openai: 'statusOpenai', gemini: 'statusGemini', groq: 'statusGroq' }[provider];
  const status = document.getElementById(statusId);
  if (status) status.textContent = '';
  updateProviderKeyUI(provider);
  input?.focus();
}

function cancelKeyChange(provider) {
  const state = providerKeyUi[provider];
  if (!state || !state.configured) return;
  state.editing = false;
  state.validated = false;
  const input = document.getElementById(providerKeyFields[provider]);
  if (input) input.value = '';
  updateProviderKeyUI(provider);
  const status = document.getElementById(`${provider === 'openai' ? 'statusOpenai' : provider === 'gemini' ? 'statusGemini' : 'statusGroq'}`);
  if (status) status.textContent = '';
  syncSettingsDirtyState();
}

function providerKeyInputChanged(provider) {
  const state = providerKeyUi[provider];
  if (!state?.editing) return;
  state.validated = false;
  const statusId = { openai: 'statusOpenai', gemini: 'statusGemini', groq: 'statusGroq' }[provider];
  const status = document.getElementById(statusId);
  if (status) status.textContent = '';
  updateProviderKeyUI(provider);
  syncSettingsDirtyState();
}

async function saveProviderKey(provider, options = {}) {
  const state = providerKeyUi[provider];
  const input = document.getElementById(providerKeyFields[provider]);
  if (!state?.editing || !state.validated || !input?.value.trim()) return false;
  const field = { openai: 'openai_api_key', gemini: 'gemini_api_key', groq: 'groq_api_key' }[provider];
  const payload = { [field]: input.value.trim() };
  if (provider === 'openai') {
    payload.openai_base_url = document.getElementById('inputOpenaiBase')?.value.trim();
    payload.openai_model = document.getElementById('inputOpenaiModel')?.value.trim();
  }
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Could not save API key');
    const savedValue = input.value.trim();
    state.configured = true;
    state.hint = savedValue.slice(-4);
    state.editing = false;
    state.validated = false;
    input.value = '';
    updateProviderKeyUI(provider);
    if (provider === 'openai' && savedSettingsSnapshot) {
      savedSettingsSnapshot.openai_base_url = payload.openai_base_url || '';
      savedSettingsSnapshot.openai_model = payload.openai_model || '';
    }
    syncSettingsDirtyState();
    if (!options.silent) {
      showToast(options.auto ? `${provider.toUpperCase()} API key verified & saved` : `${provider.toUpperCase()} API key saved`);
    }
    if (provider === 'openai') loadOpenaiModels();
    return true;
  } catch (err) {
    showToast(err.message || 'Could not save API key', true);
    return false;
  }
}

// ---- Logo dropdowns (clip provider, transcription provider, model) ----
// Every dropdown keeps its real value in a hidden input, so the settings save path
// is unchanged. The menu is a fixed popover so a scrolling card cannot clip it.
const openMenus = new Map(); // menuId -> triggerId

function positionMenu(trigger, menu) {
  const uiZoom = getLunaUiScale();
  const rect = trigger.getBoundingClientRect();
  const vpW = window.innerWidth / uiZoom;
  const vpH = window.innerHeight / uiZoom;
  const rLeft = rect.left / uiZoom;
  const rTop = rect.top / uiZoom;
  const rBottom = rect.bottom / uiZoom;
  const rWidth = rect.width / uiZoom;
  const menuHeight = Math.min(280, menu.scrollHeight || 180);
  const menuWidth = Math.max(rWidth, 200);
  const roomBelow = vpH - rBottom;
  menu.style.width = `${menuWidth}px`;
  menu.style.left = `${Math.max(8, Math.min(rLeft, vpW - menuWidth - 8))}px`;
  menu.style.top = roomBelow < menuHeight + 16
    ? `${Math.max(8, rTop - menuHeight - 6)}px`
    : `${rBottom + 6}px`;
}

function closeMenu(menuId) {
  const trigger = document.getElementById(openMenus.get(menuId) || '');
  const menu = document.getElementById(menuId);
  if (menu) menu.classList.add('hidden');
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  openMenus.delete(menuId);
}

function closeAllMenus() {
  Array.from(openMenus.keys()).forEach(closeMenu);
}

function toggleMenu(triggerId, menuId, force) {
  const trigger = document.getElementById(triggerId);
  const menu = document.getElementById(menuId);
  if (!trigger || !menu) return;
  const open = typeof force === 'boolean' ? force : !openMenus.has(menuId);
  if (!open) {
    closeMenu(menuId);
    return;
  }
  closeAllMenus();
  menu.classList.remove('hidden');
  positionMenu(trigger, menu);
  trigger.setAttribute('aria-expanded', 'true');
  openMenus.set(menuId, triggerId);
  attachSettingsGliding(menu);
  alignSettingsIndicator(menuId);
}

// Smooth hover highlight, same motion as the Studio dropdowns (220ms glide).
function ensureMenuIndicator(menu) {
  let indicator = menu.querySelector('.gliding-menu-indicator');
  if (!indicator) {
    indicator = document.createElement('span');
    indicator.className = 'gliding-menu-indicator';
    menu.insertBefore(indicator, menu.firstChild);
  }
  return indicator;
}

function moveIndicatorTo(menu, item) {
  const indicator = ensureMenuIndicator(menu);
  if (!item) {
    indicator.style.opacity = '0';
    return;
  }
  indicator.style.top = `${item.offsetTop}px`;
  indicator.style.height = `${item.offsetHeight}px`;
  indicator.style.opacity = '1';
}

function attachSettingsGliding(menu) {
  if (!menu) return;
  ensureMenuIndicator(menu);
  menu.querySelectorAll('.settings-menu-item').forEach((item) => {
    item.onmouseenter = (event) => {
      event.stopPropagation();
      moveIndicatorTo(menu, item);
    };
  });
  menu.onmouseleave = () => {
    moveIndicatorTo(menu, menu.querySelector('[aria-selected="true"]'));
  };
}

// Snap the indicator onto the selected row when the menu opens (no glide from 0).
function alignSettingsIndicator(menuId) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  const indicator = ensureMenuIndicator(menu);
  const active = menu.querySelector('[aria-selected="true"]');
  if (!active) {
    indicator.style.opacity = '0';
    return;
  }
  indicator.style.transition = 'none';
  indicator.style.top = `${active.offsetTop}px`;
  indicator.style.height = `${active.offsetHeight}px`;
  indicator.style.opacity = '1';
  void indicator.offsetHeight;
  indicator.style.transition = '';
}

// Paints the trigger label and marks the active row from the hidden input.
function syncLogoSelect(config) {
  const input = document.getElementById(config.hiddenId);
  const menu = document.getElementById(config.menuId);
  if (!input || !menu) return;
  const value = input.value || '';
  const rows = Array.from(menu.querySelectorAll('[data-value]'));
  let active = rows.find((row) => (row.getAttribute('data-value') || '') === value);
  if (!active && rows.length) active = rows[0];
  const labelBox = document.getElementById(config.labelId);
  if (labelBox) labelBox.textContent = active ? (active.getAttribute('data-label') || '') : '';
  rows.forEach((row) => {
    const isActive = row === active;
    row.setAttribute('aria-selected', isActive ? 'true' : 'false');
    const check = row.querySelector('.select-check');
    if (check) check.classList.toggle('hidden', !isActive);
  });
  alignSettingsIndicator(config.menuId);
}

function syncLlmProviderUI() {
  syncLogoSelect({
    hiddenId: 'selectLlmProvider', menuId: 'llmProviderMenu',
    labelId: 'llmProviderTriggerLabel',
  });
}

function syncTranscribeUI() {
  syncLogoSelect({
    hiddenId: 'selectTranscribeProvider', menuId: 'transcribeMenu',
    labelId: 'transcribeTriggerLabel',
  });
}

function syncClipLanguageUI() {
  syncLogoSelect({
    hiddenId: 'selectClipLanguage', menuId: 'clipLanguageMenu',
    labelId: 'clipLanguageTriggerLabel',
  });
}

function syncModelMenu() {
  syncLogoSelect({
    hiddenId: 'selectOpenaiModel', menuId: 'openaiModelMenu',
    labelId: 'openaiModelTriggerLabel',
  });
}

function setLlmProvider(value) {
  const input = document.getElementById('selectLlmProvider');
  if (input) input.value = value || '';
  syncLlmProviderUI();
  closeMenu('llmProviderMenu');
  if ((value || '') === 'openai' && typeof loadOpenaiModels === 'function') loadOpenaiModels();
  syncSettingsDirtyState();
}

function selectTranscribe(value) {
  const input = document.getElementById('selectTranscribeProvider');
  if (input) input.value = value || '';
  syncTranscribeUI();
  closeMenu('transcribeMenu');
  syncSettingsDirtyState();
}

function setClipLanguage(value) {
  const input = document.getElementById('selectClipLanguage');
  if (input) input.value = value || 'en';
  syncClipLanguageUI();
  closeMenu('clipLanguageMenu');
  syncSettingsDirtyState();
}

function toggleLlmProviderMenu(force) { toggleMenu('llmProviderTrigger', 'llmProviderMenu', force); }
function closeLlmProviderMenu() { closeMenu('llmProviderMenu'); }

const CUSTOM_MODEL = '__custom__';
const CHECK_ICON_SVG = '<svg class="select-check ml-auto w-3.5 h-3.5 text-emerald-400 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

// Model IDs come from a third party, so the label is set with textContent, not HTML.
function buildSelectRow(value, label, onSelect) {
  const row = document.createElement('button');
  row.type = 'button';
  row.setAttribute('role', 'option');
  row.setAttribute('data-value', value);
  row.setAttribute('data-label', label);
  row.className = 'settings-menu-item relative z-[2] w-full flex items-center rounded-lg px-2.5 py-2 text-xs text-zinc-200 transition cursor-pointer';

  const text = document.createElement('span');
  text.className = 'truncate';
  text.textContent = label;

  row.append(text);
  row.insertAdjacentHTML('beforeend', CHECK_ICON_SVG);
  row.addEventListener('click', onSelect);
  return row;
}

function renderOpenaiModelItems(names) {
  const items = document.getElementById('openaiModelItems');
  if (!items) return;
  items.replaceChildren();
  names.forEach((name) => {
    items.appendChild(buildSelectRow(name, name, () => selectOpenaiModel(name)));
  });
  items.appendChild(buildSelectRow(CUSTOM_MODEL, 'Custom...', () => selectOpenaiModel(CUSTOM_MODEL)));
  attachSettingsGliding(document.getElementById('openaiModelMenu'));
  syncModelMenu();
}

function selectOpenaiModel(value) {
  const hidden = document.getElementById('selectOpenaiModel');
  if (hidden) hidden.value = value;
  const isCustom = value === CUSTOM_MODEL;
  const wrap = document.getElementById('wrapOpenaiModelCustom');
  if (wrap) wrap.classList.toggle('hidden', !isCustom);
  const customInput = document.getElementById('inputOpenaiModel');
  if (customInput) {
    if (isCustom) customInput.focus();
    else customInput.value = value;
  }
  syncModelMenu();
  closeMenu('openaiModelMenu');
  syncSettingsDirtyState();
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Node)) return;
  Array.from(openMenus.keys()).forEach((menuId) => {
    const menu = document.getElementById(menuId);
    const trigger = document.getElementById(openMenus.get(menuId) || '');
    if ((menu && menu.contains(event.target)) || (trigger && trigger.contains(event.target))) return;
    closeMenu(menuId);
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeAllMenus();
});
window.addEventListener('scroll', () => {
  if (openMenus.size) closeAllMenus();
}, { passive: true });
window.addEventListener('resize', () => {
  if (openMenus.size) closeAllMenus();
});

syncLlmProviderUI();
syncTranscribeUI();
syncClipLanguageUI();

// While "Custom..." is active, the trigger should mirror what is typed.
const customModelInput = document.getElementById('inputOpenaiModel');
if (customModelInput) {
  customModelInput.addEventListener('input', () => {
    const hidden = document.getElementById('selectOpenaiModel');
    if (hidden && hidden.value === CUSTOM_MODEL) {
      const label = document.getElementById('openaiModelTriggerLabel');
      if (label) label.textContent = customModelInput.value.trim() || 'Custom...';
    }
    syncSettingsDirtyState();
  });
}

let savedSettingsSnapshot = null;
let settingsPromptToastId = null;

function getSettingsSnapshot() {
  return {
    storage_dir: (document.getElementById('inputStorage')?.value || '').trim(),
    llm_provider: document.getElementById('selectLlmProvider')?.value || '',
    transcribe_provider: document.getElementById('selectTranscribeProvider')?.value || '',
    clip_language: document.getElementById('selectClipLanguage')?.value || 'en',
    openai_base_url: (document.getElementById('inputOpenaiBase')?.value || '').trim(),
    openai_model: (document.getElementById('inputOpenaiModel')?.value || '').trim(),
  };
}

function dismissSettingsPromptToast() {
  if (settingsPromptToastId) {
    lunaToast.close(settingsPromptToastId);
    settingsPromptToastId = null;
  }
}

function hasUnsavedApiKeys() {
  return Object.keys(providerKeyFields).some((provider) => {
    const state = providerKeyUi[provider];
    const input = document.getElementById(providerKeyFields[provider]);
    return Boolean(state && state.editing && input && input.value.trim());
  });
}

function hasUnsavedSettingsChanges() {
  if (hasUnsavedApiKeys()) return true;
  if (!savedSettingsSnapshot) return false;
  const cur = getSettingsSnapshot();
  return Object.keys(savedSettingsSnapshot).some(
    (key) => cur[key] !== savedSettingsSnapshot[key]
  );
}

function guardUnsavedSettingsLeave() {
  if (!hasUnsavedSettingsChanges()) return false;
  syncSettingsDirtyState();
  if (settingsPromptToastId) {
    lunaToast.attention(
      settingsPromptToastId,
      'Save or cancel your changes before leaving Settings.'
    );
  }
  return true;
}

function revertSettingsToSnapshot() {
  if (savedSettingsSnapshot) {
    const fields = {
      inputStorage: savedSettingsSnapshot.storage_dir,
      selectLlmProvider: savedSettingsSnapshot.llm_provider,
      selectTranscribeProvider: savedSettingsSnapshot.transcribe_provider,
      selectClipLanguage: savedSettingsSnapshot.clip_language,
      inputOpenaiBase: savedSettingsSnapshot.openai_base_url,
      inputOpenaiModel: savedSettingsSnapshot.openai_model,
    };
    for (const [id, val] of Object.entries(fields)) {
      const el = document.getElementById(id);
      if (el) el.value = val ?? '';
    }
    if (typeof syncLlmProviderUI === 'function') syncLlmProviderUI();
    if (typeof syncTranscribeUI === 'function') syncTranscribeUI();
    if (typeof syncClipLanguageUI === 'function') syncClipLanguageUI();
    const hiddenModel = document.getElementById('selectOpenaiModel');
    if (hiddenModel) {
      const optionValues = Array.from(document.querySelectorAll('#openaiModelItems [data-value]'))
        .map((el) => el.dataset.value);
      const targetModel = savedSettingsSnapshot.openai_model;
      hiddenModel.value = targetModel && optionValues.includes(targetModel) ? targetModel : CUSTOM_MODEL;
      const wrap = document.getElementById('wrapOpenaiModelCustom');
      if (wrap) wrap.classList.toggle('hidden', hiddenModel.value !== CUSTOM_MODEL);
      if (typeof syncModelMenu === 'function') syncModelMenu();
    }
  }
  const statusMap = { openai: 'statusOpenai', gemini: 'statusGemini', groq: 'statusGroq' };
  Object.keys(providerKeyFields).forEach((provider) => {
    const state = providerKeyUi[provider];
    const input = document.getElementById(providerKeyFields[provider]);
    if (!state || !input) return;
    input.value = '';
    state.validated = false;
    state.editing = !state.configured;
    updateProviderKeyUI(provider);
    const st = document.getElementById(statusMap[provider]);
    if (st) st.textContent = '';
  });
  dismissSettingsPromptToast();
}

function syncSettingsDirtyState() {
  if (!savedSettingsSnapshot && !hasUnsavedApiKeys()) {
    dismissSettingsPromptToast();
    return;
  }
  const isDirty = hasUnsavedSettingsChanges();
  if (isDirty) {
    if (!settingsPromptToastId || !lunaToast.has(settingsPromptToastId)) {
      settingsPromptToastId = lunaToast.add({
        type: 'default',
        title: 'Save changes?',
        description: 'Unsaved settings.',
        timeout: 0,
        closable: false,
        actions: [
          {
            id: 'btnToastCancelSettings',
            children: 'Cancel',
            onClick: () => revertSettingsToSnapshot()
          },
          {
            id: 'btnToastSaveSettings',
            children: 'Save',
            variant: 'primary',
            onClick: () => saveSettings()
          }
        ]
      });
    }
  } else {
    dismissSettingsPromptToast();
  }
}

window.addEventListener('beforeunload', (event) => {
  if (currentMainTab === 'settings' && hasUnsavedSettingsChanges()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

function captureSettingsSnapshot() {
  savedSettingsSnapshot = getSettingsSnapshot();
  syncSettingsDirtyState();
}

['inputOpenaiBase', 'inputStorage'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', syncSettingsDirtyState);
  el.addEventListener('change', syncSettingsDirtyState);
});

async function loadSettingsData() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Could not load settings');
    const data = await res.json();

    const openaiFields = {
      selectLlmProvider: data.llm_provider,
      selectTranscribeProvider: data.transcribe_provider,
      selectClipLanguage: data.clip_language || 'en',
      inputOpenaiBase: data.openai_base_url,
      inputOpenaiModel: data.openai_model
    };
    defaultClipLanguage = data.clip_language || 'en';
    if (data.studio_background && typeof window.applyStudioBackground === 'function') {
      window.applyStudioBackground(data.studio_background);
    }
    renderStudioBackgroundCards();
    for (const [id, value] of Object.entries(openaiFields)) {
      const el = document.getElementById(id);
      if (el && value !== undefined) el.value = value;
    }
    // The dropdowns render from their hidden input values.
    if (typeof syncLlmProviderUI === 'function') syncLlmProviderUI();
    if (typeof syncTranscribeUI === 'function') syncTranscribeUI();
    if (typeof syncClipLanguageUI === 'function') syncClipLanguageUI();
    // Secrets come back masked, never as the key itself. Show the hint as a
    // placeholder and leave the field empty, so saving cannot overwrite the key.
    const inputOpenai = document.getElementById('inputOpenai');
    providerKeyUi.openai.configured = Boolean(data.has_openai_api_key);
    providerKeyUi.openai.hint = String(data.openai_api_key || '').slice(-4);
    providerKeyUi.openai.editing = !providerKeyUi.openai.configured;
    providerKeyUi.openai.validated = false;
    if (inputOpenai) inputOpenai.value = '';
    updateProviderKeyUI('openai');
    loadOpenaiModels();

    const inputGemini = document.getElementById('inputGemini');
    const labelGeminiModel = document.getElementById('labelGeminiModel');
    const inputGroq = document.getElementById('inputGroq');
    const labelGroqModel = document.getElementById('labelGroqModel');
    const inputStorage = document.getElementById('inputStorage');
    providerKeyUi.gemini.configured = Boolean(data.has_gemini_api_key);
    providerKeyUi.gemini.hint = String(data.gemini_api_key || '').slice(-4);
    providerKeyUi.gemini.editing = !providerKeyUi.gemini.configured;
    providerKeyUi.gemini.validated = false;
    if (inputGemini) inputGemini.value = '';
    updateProviderKeyUI('gemini');
    if (labelGeminiModel && data.gemini_model) labelGeminiModel.innerText = data.gemini_model;
    providerKeyUi.groq.configured = Boolean(data.has_groq_api_key);
    providerKeyUi.groq.hint = String(data.groq_api_key || '').slice(-4);
    providerKeyUi.groq.editing = !providerKeyUi.groq.configured;
    providerKeyUi.groq.validated = false;
    if (inputGroq) inputGroq.value = '';
    updateProviderKeyUI('groq');
    if (labelGroqModel && data.groq_model) labelGroqModel.innerText = data.groq_model;
    if (inputStorage && data.storage_dir) {
      inputStorage.value = data.storage_dir;
      currentStorageDir = data.storage_dir;
    }
    captureSettingsSnapshot();
    if (typeof updateVaultStatsUI === 'function') updateVaultStatsUI();

    // System status
    if (data.status) {
      const s = data.status;
      renderSystemDependencyStatuses(s, { detailed: false });
      renderCookieStatus(s.cookies);
    }
    lucide.createIcons();
  } catch (err) {
    console.error('[Settings Load Error]', err);
  }
}

async function saveSettings() {
  const storageInput = document.getElementById('inputStorage');
  if (!storageInput || !storageInput.value.trim()) {
    triggerInputError('wrapStorage', 'errStorage', 'Storage directory is required.');
    return;
  }

  const isPathChanged = Boolean(currentStorageDir && storageInput.value.trim().toLowerCase() !== currentStorageDir.toLowerCase());
  const nextClipLang = document.getElementById('selectClipLanguage')?.value || 'en';
  const payload = {
    storage_dir: storageInput.value.trim(),
    migrate_files: isPathChanged,
    llm_provider: document.getElementById('selectLlmProvider')?.value,
    transcribe_provider: document.getElementById('selectTranscribeProvider')?.value,
    clip_language: nextClipLang,
    openai_base_url: document.getElementById('inputOpenaiBase')?.value.trim(),
    openai_model: document.getElementById('inputOpenaiModel')?.value.trim(),
  };

  const toastSaveBtn = document.getElementById('btnToastSaveSettings');
  const toastCancelBtn = document.getElementById('btnToastCancelSettings');
  if (toastSaveBtn) {
    toastSaveBtn.disabled = true;
    toastSaveBtn.textContent = 'Saving...';
  }
  if (toastCancelBtn) toastCancelBtn.disabled = true;

  try {
    // Validate and include any unsaved API keys typed into Settings before saving.
    const keyMeta = {
      openai: { field: 'openai_api_key', wrapId: 'wrapOpenai', statusId: 'statusOpenai' },
      gemini: { field: 'gemini_api_key', wrapId: 'wrapGemini', statusId: 'statusGemini' },
      groq: { field: 'groq_api_key', wrapId: 'wrapGroq', statusId: 'statusGroq' },
    };
    const verifiedProviders = [];
    for (const [provider, meta] of Object.entries(keyMeta)) {
      const state = providerKeyUi[provider];
      const inputEl = document.getElementById(providerKeyFields[provider]);
      const candidateKey = inputEl?.value.trim() || '';
      if (!state?.editing || !candidateKey) continue;
      if (!state.validated) {
        const testRes = await fetch('/api/settings/test-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
            api_key: candidateKey,
            base_url: provider === 'openai' ? payload.openai_base_url : undefined,
          }),
        });
        const testData = await testRes.json();
        const stEl = document.getElementById(meta.statusId);
        if (!testRes.ok || !testData.valid) {
          const errMsg = testData.message || 'Invalid key';
          if (stEl) stEl.innerHTML = `<span class="text-red-400">✗ ${escapeHtml(errMsg)}</span>`;
          triggerInputError(meta.wrapId, meta.wrapId.replace('wrap', 'err'), `Key ${provider} is invalid: ${errMsg}`);
          throw new Error(`Key ${provider.toUpperCase()} is invalid: ${errMsg}`);
        }
        state.validated = true;
        if (stEl) stEl.innerHTML = '<span class="text-emerald-400">✓ Connection valid · Saved</span>';
      }
      payload[meta.field] = candidateKey;
      verifiedProviders.push({ provider, candidateKey });
    }

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Could not save settings');
    }

    verifiedProviders.forEach(({ provider, candidateKey }) => {
      const state = providerKeyUi[provider];
      const inputEl = document.getElementById(providerKeyFields[provider]);
      if (state) {
        state.configured = true;
        state.hint = candidateKey.slice(-4);
        state.editing = false;
        state.validated = false;
      }
      if (inputEl) inputEl.value = '';
      updateProviderKeyUI(provider);
    });

    currentStorageDir = storageInput.value.trim();
    defaultClipLanguage = nextClipLang;
    savedSettingsSnapshot = getSettingsSnapshot();
    dismissSettingsPromptToast();

    if (data.migrated && data.migrated.migrated_files > 0) {
      showToast(`Settings saved. ${data.migrated.migrated_files} files moved to the new folder.`);
    } else {
      showToast('Settings saved successfully');
    }

    if (data.stats) {
      const filesEl = document.getElementById('settingsTotalFiles');
      const sizeEl = document.getElementById('settingsTotalSize');
      if (filesEl) filesEl.innerText = `${data.stats.total_files || 0} files`;
      if (sizeEl) sizeEl.innerText = `${data.stats.total_size_mb || 0} MB`;
    }

    // Update local vaultStats storage root if changed
    if (payload.storage_dir && vaultStats) {
      vaultStats.storage_root = payload.storage_dir;
      updateVaultStatsUI();
    }
  } catch (err) {
    if (toastSaveBtn) {
      toastSaveBtn.disabled = false;
      toastSaveBtn.textContent = 'Save';
    }
    if (toastCancelBtn) toastCancelBtn.disabled = false;
    if (err.message && err.message.toLowerCase().includes('directory')) {
      triggerInputError('wrapStorage', 'errStorage', err.message);
    }
    showToast(err.message || 'Could not save settings', true);
  }
}

let __studioBgSavingId = null;
let __studioBgStatusTimer = null;

function renderStudioBackgroundCards() {
  const grid = document.getElementById('studioBackgroundGrid');
  const presets = Array.isArray(window.LUNA_STUDIO_BACKGROUNDS) ? window.LUNA_STUDIO_BACKGROUNDS : [];
  if (!grid || !presets.length) return;

  const activeId = typeof window.getActiveStudioBackground === 'function'
    ? window.getActiveStudioBackground()
    : 'obsidian';

  grid.innerHTML = '';
  presets.forEach((preset) => {
    const isActive = preset.id === activeId;
    const isSaving = preset.id === __studioBgSavingId;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bg-preset-card' + (isActive ? ' is-active' : '') + (isSaving ? ' is-saving' : '');
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    btn.setAttribute('data-bg-option', preset.id);
    btn.onclick = () => selectStudioBackground(preset.id);

    const swatch = document.createElement('div');
    swatch.className = 'bg-preset-swatch';
    swatch.style.background = preset.preview || preset.css;

    const badge = document.createElement('span');
    badge.className = 'bg-preset-badge absolute top-1.5 left-1.5 font-sans font-medium' + (preset.type === 'webgl' ? ' is-animated' : '');
    badge.textContent = preset.badge || 'Static';
    swatch.appendChild(badge);

    if (isSaving) {
      const overlay = document.createElement('div');
      overlay.className = 'absolute inset-0 bg-black/45 flex items-center justify-center backdrop-blur-[1px]';
      const spinner = document.createElement('span');
      spinner.className = 'bg-preset-spinner';
      overlay.appendChild(spinner);
      swatch.appendChild(overlay);
    }

    const meta = document.createElement('div');
    meta.className = 'bg-preset-meta';

    const title = document.createElement('span');
    title.className = 'text-[11px] font-sans font-medium truncate ' + (isActive ? 'text-white' : 'text-zinc-300');
    title.textContent = preset.name;
    meta.appendChild(title);

    if (isSaving) {
      const savingLabel = document.createElement('span');
      savingLabel.className = 'text-[10px] font-sans text-emerald-400 shrink-0';
      savingLabel.textContent = 'Saving...';
      meta.appendChild(savingLabel);
    } else if (isActive) {
      const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      checkSvg.setAttribute('class', 'w-3.5 h-3.5 text-emerald-400 shrink-0');
      checkSvg.setAttribute('viewBox', '0 0 24 24');
      checkSvg.setAttribute('fill', 'none');
      checkSvg.setAttribute('stroke', 'currentColor');
      checkSvg.setAttribute('stroke-width', '2.5');
      checkSvg.setAttribute('stroke-linecap', 'round');
      checkSvg.setAttribute('stroke-linejoin', 'round');
      checkSvg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M20 6 9 17l-5-5');
      checkSvg.appendChild(path);
      meta.appendChild(checkSvg);
    }

    btn.appendChild(swatch);
    btn.appendChild(meta);
    grid.appendChild(btn);
  });
}

async function selectStudioBackground(bgId) {
  if (!bgId || __studioBgSavingId) return;
  const previousId = typeof window.getActiveStudioBackground === 'function'
    ? window.getActiveStudioBackground()
    : 'obsidian';
  if (bgId === previousId) return;

  const statusEl = document.getElementById('studioBgSaveStatus');
  __studioBgSavingId = bgId;
  if (__studioBgStatusTimer) {
    clearTimeout(__studioBgStatusTimer);
    __studioBgStatusTimer = null;
  }
  if (statusEl) {
    statusEl.textContent = 'Saving...';
    statusEl.className = 'text-[11px] text-emerald-400 font-sans';
  }
  renderStudioBackgroundCards();

  const startedAt = Date.now();
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studio_background: bgId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Could not save background');
    }
    const elapsed = Date.now() - startedAt;
    if (elapsed < 260) {
      await new Promise((resolve) => setTimeout(resolve, 260 - elapsed));
    }
    const applied = typeof window.applyStudioBackground === 'function'
      ? window.applyStudioBackground(bgId)
      : { name: bgId };
    __studioBgSavingId = null;
    renderStudioBackgroundCards();
    if (statusEl) {
      statusEl.textContent = 'Saved';
      statusEl.className = 'text-[11px] text-emerald-400 font-sans';
      __studioBgStatusTimer = setTimeout(() => {
        statusEl.textContent = 'Auto-saves on click';
        statusEl.className = 'text-[11px] text-zinc-500 font-sans';
      }, 2200);
    }
    showToast(`Studio background set to ${applied.name || bgId}`);
  } catch (err) {
    __studioBgSavingId = null;
    if (typeof window.applyStudioBackground === 'function') {
      window.applyStudioBackground(previousId);
    }
    renderStudioBackgroundCards();
    if (statusEl) {
      statusEl.textContent = 'Auto-saves on click';
      statusEl.className = 'text-[11px] text-zinc-500 font-sans';
    }
    showToast(err.message || 'Could not save studio background', true);
  }
}

// Model IDs come from a third party, so rows are built with textContent, not HTML.
window.loadOpenaiModels = async function () {
  const hidden = document.getElementById('selectOpenaiModel');
  const input = document.getElementById('inputOpenaiModel');
  const status = document.getElementById('statusOpenaiModels');
  if (!hidden || !input) return;
  const apiKey = document.getElementById('inputOpenai')?.value.trim();
  const current = input.value.trim();
  let models = [];

  // Paint the current model immediately so the trigger is never blank while the
  // provider request is in flight (or when no key is present yet).
  renderOpenaiModelItems(current ? [current] : []);

  // With no typed key the server uses the saved one, for the saved base URL only.
  if (apiKey || providerKeyUi.openai.configured) {
    status.innerText = 'Loading models...';
    try {
      const res = await fetch('/api/settings/openai-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          base_url: document.getElementById('inputOpenaiBase')?.value.trim()
        })
      });
      if (!res.ok) throw new Error(String(res.status));
      models = (await res.json()).models || [];
      status.innerText = `${models.length} models`;
    } catch (err) {
      status.innerText = 'Could not load models';
    }
  } else {
    status.innerText = providerKeyUi.openai.configured
      ? 'Saved key is hidden; change it to refresh models'
      : 'Add an API key to list models';
  }

  const names = current && !models.includes(current) ? [current, ...models] : models;
  renderOpenaiModelItems(names);
  hidden.value = current || CUSTOM_MODEL;
  const wrap = document.getElementById('wrapOpenaiModelCustom');
  if (wrap) wrap.classList.toggle('hidden', hidden.value !== CUSTOM_MODEL);
  syncModelMenu();
};

async function testApiKey(provider, wrapId, inputId, statusElId, btn) {
  const inputEl = document.getElementById(inputId);
  const statusEl = document.getElementById(statusElId);
  const icon = btn ? btn.querySelector('i') : null;
  const state = providerKeyUi[provider];
  const candidateKey = inputEl?.value.trim() || '';

  if (!inputEl || !state || (state.editing && !candidateKey) || (!state.editing && !state.configured)) {
    triggerInputError(wrapId, wrapId.replace('wrap', 'err'), `Key ${provider} cannot be empty.`);
    if (statusEl) statusEl.innerHTML = '';
    return;
  }

  if (state.editing) {
    state.validated = false;
    updateProviderKeyUI(provider);
  }

  if (icon) icon.classList.add('animate-pulse', 'text-amber-400');
  if (statusEl) statusEl.innerHTML = '<span class="text-zinc-500">Testing...</span>';

  try {
    const res = await fetch('/api/settings/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider.toLowerCase(),
        api_key: state.editing ? candidateKey : '',
        base_url: provider === 'openai' ? document.getElementById('inputOpenaiBase')?.value.trim() : undefined
      })
    });
    const data = await res.json();
    if (icon) icon.classList.remove('animate-pulse', 'text-amber-400');

    if (res.ok && data.valid) {
      if (state.editing) {
        state.validated = true;
        updateProviderKeyUI(provider);
        const savedOk = await saveProviderKey(provider, { auto: true });
        if (savedOk) {
          if (statusEl) statusEl.innerHTML = '<span class="text-emerald-400">✓ Connection valid · Saved</span>';
        } else if (statusEl) {
          statusEl.innerHTML = '<span class="text-emerald-400">✓ Connection valid · click Save Key to apply</span>';
        }
      } else {
        if (statusEl) statusEl.innerHTML = '<span class="text-emerald-400">✓ Saved key connection is valid</span>';
        showToast(`${provider.toUpperCase()} saved key connection is valid`);
      }
      if (provider === 'openai') loadOpenaiModels();
    } else {
      const errMsg = data.message || 'Invalid key';
      if (statusEl) statusEl.innerHTML = `<span class="text-red-400">✗ ${escapeHtml(errMsg)}</span>`;
      triggerInputError(wrapId, wrapId.replace('wrap', 'err'), `Key ${provider} is invalid: ${errMsg}`);
      showToast(`Key ${provider.toUpperCase()} is invalid`, true);
    }
  } catch (err) {
    if (icon) icon.classList.remove('animate-pulse', 'text-amber-400');
    if (statusEl) statusEl.innerHTML = '<span class="text-red-400">✗ Network error</span>';
    showToast(`Could not reach the server: ${err.message}`, true);
  }
}

function renderCookieStatus(cookiesData) {
  const cookieFileDetail = document.getElementById('cookieFileDetail');
  const cookieStatusBadge = document.getElementById('cookieStatusBadge');
  if (cookiesData && cookiesData.exists) {
    setDependencyIcon('chkCookies', 'check', 'w-4 h-4 text-emerald-400');
    if (cookieFileDetail) cookieFileDetail.innerText = `(${cookiesData.name || 'cookies.txt'} • ${cookiesData.size || ''})`;
    if (cookieStatusBadge) cookieStatusBadge.innerText = 'Installed';
  } else {
    setDependencyIcon('chkCookies', 'alert-circle', 'w-4 h-4 text-zinc-500');
    if (cookieFileDetail) cookieFileDetail.innerText = '(cookies.txt not found)';
    if (cookieStatusBadge) cookieStatusBadge.innerText = 'Empty';
  }
}

/**
 * Swap a dependency status icon in place without re-running global lucide.createIcons().
 * Using setAttribute('class', ...) is required because SVGElement.className is SVGAnimatedString.
 */
function setDependencyIcon(id, iconName, className) {
  const el = document.getElementById(id);
  if (!el || !el.parentNode) return;
  const pascalName = iconName.replace(/(^|[-_\s]+)(\w)/g, (_, __, ch) => ch.toUpperCase());
  const iconDef = window.lucide && window.lucide.icons && window.lucide.icons[pascalName];
  if (iconDef && typeof window.lucide.createElement === 'function') {
    const svg = window.lucide.createElement(iconDef);
    svg.id = id;
    svg.setAttribute('data-lucide', iconName);
    svg.setAttribute('class', `lucide lucide-${iconName} ${className}`.trim());
    el.parentNode.replaceChild(svg, el);
    return;
  }
  el.setAttribute('data-lucide', iconName);
  el.setAttribute('class', className);
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function renderSystemDependencyStatuses(data, { detailed = false } = {}) {
  const rows = [
    {
      iconId: 'chkFfmpeg',
      statusId: 'statusFfmpeg',
      icon: data.ffmpeg ? 'check' : 'x',
      cls: data.ffmpeg ? 'w-4 h-4 text-emerald-400' : 'w-4 h-4 text-red-400',
      text: detailed ? (data.ffmpeg_version || (data.ffmpeg ? 'Available' : 'Not found')) : (data.ffmpeg ? 'Available' : 'Not found')
    },
    {
      iconId: 'chkYtdlp',
      statusId: 'statusYtdlp',
      icon: 'check',
      cls: 'w-4 h-4 text-emerald-400',
      text: data.ytdlp || 'Available'
    },
    {
      iconId: 'chkOpencv',
      statusId: 'statusOpencv',
      icon: data.opencv ? 'check' : 'alert-circle',
      cls: data.opencv ? 'w-4 h-4 text-emerald-400' : 'w-4 h-4 text-amber-400',
      text: detailed ? (data.opencv_version || (data.opencv ? 'Active' : 'Inactive')) : (data.opencv ? 'Active' : 'Inactive')
    },
    {
      iconId: 'chkStorage',
      statusId: 'statusStorageAccess',
      icon: data.storage ? 'check' : 'x',
      cls: data.storage ? 'w-4 h-4 text-emerald-400' : 'w-4 h-4 text-red-400',
      text: data.storage ? (detailed ? 'Read/write ready' : 'Writable') : 'Access denied'
    }
  ];

  rows.forEach(({ iconId, statusId, icon, cls, text }) => {
    setDependencyIcon(iconId, icon, cls);
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.innerText = text;
  });
}

async function runSystemCheck(btn) {
  const label = document.getElementById('checkSystemLabel');
  const startIcon = document.getElementById('checkSystemIcon');
  if (btn) btn.disabled = true;
  if (label) label.innerText = 'Checking...';
  if (startIcon) startIcon.classList.add('animate-spin', 'text-amber-400');

  const depIconIds = ['chkFfmpeg', 'chkYtdlp', 'chkOpencv', 'chkStorage'];
  const previousIcons = depIconIds.map((id) => {
    const el = document.getElementById(id);
    return {
      id,
      icon: el?.getAttribute('data-lucide') || 'check',
      cls: el?.getAttribute('class') || 'w-4 h-4 text-emerald-400'
    };
  });

  const checkingBadges = document.querySelectorAll('[data-sys-checking]');
  checkingBadges.forEach((el) => el.classList.remove('hidden'));

  depIconIds.forEach((id) => {
    setDependencyIcon(id, 'loader-2', 'w-4 h-4 text-amber-400 animate-spin');
  });

  try {
    const res = await fetch('/api/settings/check-system', { method: 'POST' });
    if (!res.ok) throw new Error('Could not check the system');
    const data = await res.json();

    renderSystemDependencyStatuses(data, { detailed: true });
    if (data.cookies && typeof renderCookieStatus === 'function') {
      renderCookieStatus(data.cookies);
    }

    const missingCritical = [];
    if (!data.ffmpeg) missingCritical.push('FFmpeg');
    if (!data.storage) missingCritical.push('Storage access');
    const cookiesReady = Boolean(data.cookies && data.cookies.exists);

    if (missingCritical.length) {
      showToast(`Dependency check incomplete: missing ${missingCritical.join(' & ')}`, true);
    } else if (!cookiesReady && !data.opencv) {
      showToast('Core utilities ready (OpenCV inactive & YouTube cookies empty)', 'info');
    } else if (!cookiesReady) {
      showToast('Core utilities ready (YouTube cookies not uploaded)', 'info');
    } else if (!data.opencv) {
      showToast('Core utilities & cookies ready (OpenCV Face Tracker inactive)', 'info');
    } else {
      showToast('All utilities & YouTube cookies are ready');
    }
  } catch (e) {
    previousIcons.forEach(({ id, icon, cls }) => setDependencyIcon(id, icon, cls));
    showToast(`Dependency check failed: ${e.message}`, true);
  } finally {
    checkingBadges.forEach((el) => el.classList.add('hidden'));
    if (btn) btn.disabled = false;
    if (label) label.innerText = 'Check';
    const currentIcon = document.getElementById('checkSystemIcon');
    if (currentIcon) currentIcon.classList.remove('animate-spin', 'text-amber-400');
  }
}

async function browseStorageFolder() {
  const btn = document.getElementById('btnBrowseFolder');
  const originalHtml = btn ? btn.innerHTML : '';
  try {
    if (btn) {
      btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-white"></i><span>Opening...</span>';
      lucide.createIcons({ root: btn });
    }
    const res = await fetch('/api/settings/browse-folder', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.path) {
        const newPath = data.path;
        const inputStorage = document.getElementById('inputStorage');
        if (inputStorage) {
          inputStorage.value = newPath;
        }

        // Immediately move the files and save the settings
        if (btn) {
          btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin text-white"></i><span>Moving...</span>';
          lucide.createIcons({ root: btn });
        }

        showToast(`Moving saved Workspace media to ${newPath}...`, 'info');

        const saveRes = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storage_dir: newPath,
            migrate_files: true
          })
        });

        const saveResult = await saveRes.json();
        if (!saveRes.ok) {
          throw new Error(saveResult.detail || 'Could not move files to the new folder');
        }

        currentStorageDir = newPath;
        captureSettingsSnapshot();
        if (saveResult.stats) {
          const filesEl = document.getElementById('settingsTotalFiles');
          const sizeEl = document.getElementById('settingsTotalSize');
          if (filesEl) filesEl.innerText = `${saveResult.stats.total_files || 0} files`;
          if (sizeEl) sizeEl.innerText = `${saveResult.stats.total_size_mb || 0} MB`;
        }

        const migratedCount = saveResult.migrated ? (saveResult.migrated.migrated_files || 0) : 0;
        showToast(
          migratedCount > 0
            ? `Workspace media moved to ${newPath} (${migratedCount} files)`
            : `Workspace folder updated to ${newPath}`
        );

        // Sync the Media Vault list.
        if (typeof loadVaultItems === 'function') loadVaultItems();
      }
    } else {
      showToast('Could not open the folder picker', true);
    }
  } catch (err) {
    showToast(`Could not move files: ${err.message}`, true);
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml;
      lucide.createIcons({ root: btn });
    }
  }
}

async function openExplorer() {
  const inputStorage = document.getElementById('inputStorage');
  const folderVal = inputStorage ? inputStorage.value.trim() : '';
  try {
    const res = await fetch('/api/vault/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: folderVal })
    });
    if (res.ok) {
      showToast('Opening the storage folder', 'info');
    } else {
      showToast('Could not open the folder in Explorer', true);
    }
  } catch (err) {
    showToast('Could not open the folder in Explorer', true);
  }
}

async function handleCookieUpload(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    try {
      const text = await file.text();
      const res = await fetch('/api/settings/upload-cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content: text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not upload cookies');

      const detailEl = document.getElementById('cookieFileDetail');
      const badgeEl = document.getElementById('cookieStatusBadge');

      if (detailEl) detailEl.innerText = `(${data.filename || file.name} • ${data.size || ''})`;
      if (badgeEl) badgeEl.innerText = 'Installed';
      setDependencyIcon('chkCookies', 'check', 'w-4 h-4 text-emerald-400');
      showToast(`File ${file.name} uploaded successfully`);
    } catch (err) {
      showToast(`Could not load cookies: ${err.message}`, true);
    }
  }
}


async function loadVaultItems() {
  const loadingEl = document.getElementById('vaultLoadingState');
  if (loadingEl && vaultProjects.length === 0) loadingEl.classList.remove('hidden');

  try {
    const res = await fetch('/api/vault/projects');
    if (!res.ok) throw new Error('Could not load Workspace');
    const data = await res.json();
    vaultProjects = data.projects || [];
    nextWorkspaceIndex = data.next_workspace_index || 1;
    vaultStats = data.stats || vaultStats;

    vaultItems = [];
    vaultProjects.forEach(p => {
      if (p.files && Array.isArray(p.files)) {
        vaultItems.push(...p.files);
      }
    });

    updateVaultStatsUI();
    renderVaultGallery();
  } catch (err) {
    console.error('[Vault Load Error]', err);
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

async function updateVaultBadge() {
  try {
    const res = await fetch('/api/vault/projects');
    if (res.ok) {
      const data = await res.json();
      vaultProjects = data.projects || [];
      nextWorkspaceIndex = data.next_workspace_index || 1;
      vaultStats = data.stats || vaultStats;
      vaultItems = [];
      vaultProjects.forEach(p => {
        if (p.files && Array.isArray(p.files)) {
          vaultItems.push(...p.files);
        }
      });
      updateVaultStatsUI();
    }
  } catch (e) {
    console.warn('Could not auto-fetch vault count', e);
  }
}

function updateVaultStatsUI() {
  const totalCount = vaultStats.total_files !== undefined ? vaultStats.total_files : vaultItems.length;

  const totalFiles = document.getElementById('vaultTotalFiles');
  if (totalFiles) totalFiles.innerText = totalCount;

  const settingsFiles = document.getElementById('settingsTotalFiles');
  if (settingsFiles) settingsFiles.innerText = `${totalCount} files`;

  let sizeStr = '0 MB';
  if (vaultStats.total_gb && vaultStats.total_gb >= 1.0) {
    sizeStr = `${vaultStats.total_gb} GB`;
  } else {
    sizeStr = `${vaultStats.total_mb || 0} MB`;
  }

  const totalSize = document.getElementById('vaultTotalSize');
  if (totalSize) totalSize.innerText = sizeStr;

  const settingsSize = document.getElementById('settingsTotalSize');
  if (settingsSize) settingsSize.innerText = sizeStr;

  const storagePath = document.getElementById('vaultStoragePath');
  if (storagePath && vaultStats.storage_root) {
    storagePath.innerText = vaultStats.storage_root;
  }

  if (currentMainTab === 'vault') {
    requestAnimationFrame(() => {
      updateTabsPill(false);
      updateVaultPlatformUnderline(true);
    });
  }
}

const VAULT_MODE_OPTIONS_BY_PLATFORM = {
  all: [
    { id: 'all', label: 'All Types' },
    { id: 'clips', label: 'AI Clips' },
    { id: 'trim', label: 'Video Trimmer' },
    { id: 'video', label: 'Full Video' },
    { id: 'audio', label: 'Audio MP3' },
  ],
  youtube: [
    { id: 'all', label: 'All Types' },
    { id: 'clips', label: 'AI Clips' },
    { id: 'trim', label: 'Video Trimmer' },
    { id: 'video', label: 'Full Video' },
    { id: 'audio', label: 'Audio MP3' },
  ],
  tiktok: [
    { id: 'all', label: 'All Types' },
    { id: 'video', label: 'Video MP4' },
    { id: 'audio', label: 'Audio MP3' },
  ],
  instagram: null,
};

const VAULT_SORT_LABELS = {
  newest: 'Newest',
  oldest: 'Oldest',
  files: 'Most Files',
  alpha: 'Name A-Z',
};

const VAULT_DROPDOWN_META = {
  vaultModeMenu: { chev: 'vaultModeChevron', btn: 'vaultModeDropdownBtn' },
  vaultSortMenu: { chev: 'vaultSortChevron', btn: 'vaultSortDropdownBtn' },
};

function getProjectOutputMode(record) {
  const cat = (record.category || '').toLowerCase();
  const act = (record.action || '').toLowerCase();
  const plat = (record.platform || '').toLowerCase();
  const fname = (record.filename || '').toLowerCase();

  if (
    cat.includes('audio') ||
    act.includes('mp3') ||
    record.type === 'audio' ||
    plat.includes('audio') ||
    fname.endsWith('.mp3')
  ) {
    return 'audio';
  }
  if (act.includes('ai_clip') || cat.includes('01-ai-clips')) {
    return 'clips';
  }
  if (
    act === 'type_yt_clip' ||
    act === 'manual_clip' ||
    act === 'clip' ||
    act.includes('trim')
  ) {
    return 'trim';
  }
  return 'video';
}

function getProjectPlatformKey(record) {
  const cat = (record.category || '').toLowerCase();
  const act = (record.action || '').toLowerCase();
  const plat = (record.platform || '').toLowerCase();

  if (plat.includes('instagram') || act.includes('ig_reels') || act.includes('ig_ai_clip') || cat.includes('instagram') || cat.includes('reels')) {
    return 'instagram';
  }
  if (plat.includes('tiktok') || act.includes('tt_video') || act.includes('tt_mp3') || cat.includes('tiktok')) {
    return 'tiktok';
  }
  if (plat.includes('youtube') || act.startsWith('type_yt_') || cat.includes('youtube') || cat.includes('01-ai-clips')) {
    return 'youtube';
  }
  return plat;
}

let vaultUnderlineRaf = null;
let vaultUnderlineState = { x: 0, w: 0, initialized: false };

function updateVaultPlatformUnderline(immediate = false) {
  const tabsBar = document.getElementById('vaultPlatformTabs');
  const indicator = document.getElementById('vaultPlatformUnderline');
  if (!tabsBar || !indicator) return;

  const activeBtn = tabsBar.querySelector('.vault-u-tab.active') ||
    tabsBar.querySelector(`.vault-u-tab[data-filter="${currentVaultFilter}"]`) ||
    tabsBar.querySelector('.vault-u-tab');
  if (!activeBtn) {
    indicator.style.opacity = '0';
    return;
  }

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shouldSnap = immediate || reduceMotion || !vaultUnderlineState.initialized;

  indicator.style.opacity = '1';
  if (shouldSnap) {
    if (vaultUnderlineRaf) {
      cancelAnimationFrame(vaultUnderlineRaf);
      vaultUnderlineRaf = null;
    }
    const tx = activeBtn.offsetLeft;
    const tw = activeBtn.offsetWidth;
    if (tw > 0) {
      vaultUnderlineState = { x: tx, w: tw, initialized: true };
    }
    indicator.style.transform = `translate3d(${tx}px, 0, 0)`;
    indicator.style.width = `${tw}px`;
    return;
  }

  if (vaultUnderlineRaf) {
    cancelAnimationFrame(vaultUnderlineRaf);
    vaultUnderlineRaf = null;
  }

  const startTime = performance.now();
  let lastTime = startTime;

  const tick = (now) => {
    const currentBtn = tabsBar.querySelector('.vault-u-tab.active') || activeBtn;
    const targetX = currentBtn.offsetLeft;
    const targetW = currentBtn.offsetWidth;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    // Frame-rate-independent exponential ease stays locked onto activeBtn while badges animate
    const alpha = 1 - Math.exp(-18 * dt);
    vaultUnderlineState.x += (targetX - vaultUnderlineState.x) * alpha;
    vaultUnderlineState.w += (targetW - vaultUnderlineState.w) * alpha;

    indicator.style.transform = `translate3d(${vaultUnderlineState.x.toFixed(2)}px, 0, 0)`;
    indicator.style.width = `${vaultUnderlineState.w.toFixed(2)}px`;

    const settled = (now - startTime >= 340) &&
      Math.abs(targetX - vaultUnderlineState.x) < 0.25 &&
      Math.abs(targetW - vaultUnderlineState.w) < 0.25;

    if (settled) {
      vaultUnderlineState.x = targetX;
      vaultUnderlineState.w = targetW;
      indicator.style.transform = `translate3d(${targetX}px, 0, 0)`;
      indicator.style.width = `${targetW}px`;
      vaultUnderlineRaf = null;
      return;
    }
    vaultUnderlineRaf = requestAnimationFrame(tick);
  };

  vaultUnderlineRaf = requestAnimationFrame(tick);
}

function toggleVaultDropdown(menuId, e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById(menuId);
  const meta = VAULT_DROPDOWN_META[menuId] || {};
  const chev = meta.chev ? document.getElementById(meta.chev) : null;
  const btn = meta.btn ? document.getElementById(meta.btn) : null;
  const isClosed = menu?.getAttribute('data-open') !== 'true' && !menu?.classList.contains('open');
  closeAllDropdowns(isClosed ? menuId : null);
  if (menu) {
    menu.setAttribute('data-open', isClosed ? 'true' : 'false');
    menu.classList.toggle('open', isClosed);
    if (chev) chev.classList.toggle('rotate-180', isClosed);
    if (btn) {
      btn.setAttribute('aria-expanded', isClosed ? 'true' : 'false');
      btn.classList.toggle('active', isClosed);
    }
    if (isClosed) alignMenuIndicator(menuId);
  }
}

function syncVaultModeDropdownOptions() {
  const wrap = document.getElementById('vaultModeDropdownWrap');
  const menu = document.getElementById('vaultModeMenu');
  const labelEl = document.getElementById('vaultModeLabel');
  const options = VAULT_MODE_OPTIONS_BY_PLATFORM[currentVaultFilter];

  if (!options) {
    currentVaultModeFilter = 'all';
    if (wrap) wrap.classList.add('hidden');
    closeAllDropdowns(null);
    return;
  }

  if (wrap) wrap.classList.remove('hidden');
  if (!options.some(o => o.id === currentVaultModeFilter)) {
    currentVaultModeFilter = 'all';
  }

  if (menu) {
    const itemsHtml = options.map(opt => {
      const isAct = opt.id === currentVaultModeFilter;
      return `<div onclick="setVaultModeFilter('${opt.id}')" class="quality-menu-item${isAct ? ' active' : ''}" data-vmode="${opt.id}"><span class="quality-item-title truncate">${escapeHtml(opt.label)}</span></div>`;
    }).join('');
    menu.innerHTML = `<span class="gliding-menu-indicator pointer-events-none absolute left-[3px] right-[3px] rounded-[6px] bg-white/[0.08] z-[1]" style="opacity: 0; transition: top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease;"></span>${itemsHtml}`;
    attachGlidingListener(menu);
  }

  const activeOpt = options.find(o => o.id === currentVaultModeFilter) || options[0];
  if (labelEl && activeOpt) labelEl.innerText = activeOpt.label;
}

function setVaultModeFilter(mode) {
  currentVaultModeFilter = mode || 'all';
  const options = VAULT_MODE_OPTIONS_BY_PLATFORM[currentVaultFilter] || VAULT_MODE_OPTIONS_BY_PLATFORM.all;
  const activeOpt = options.find(o => o.id === currentVaultModeFilter) || options[0];
  const labelEl = document.getElementById('vaultModeLabel');
  if (labelEl && activeOpt) labelEl.innerText = activeOpt.label;

  document.querySelectorAll('#vaultModeMenu .quality-menu-item[data-vmode]').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-vmode') === currentVaultModeFilter);
  });

  closeDropdownSmoothly('vaultModeMenu', 'vaultModeChevron', 'vaultModeDropdownBtn', 80);
  renderVaultGallery();
}

function setVaultSort(sortKey) {
  currentVaultSort = VAULT_SORT_LABELS[sortKey] ? sortKey : 'newest';
  const labelEl = document.getElementById('vaultSortLabel');
  if (labelEl) labelEl.innerText = VAULT_SORT_LABELS[currentVaultSort];

  document.querySelectorAll('#vaultSortMenu .quality-menu-item[data-vsort]').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-vsort') === currentVaultSort);
  });

  closeDropdownSmoothly('vaultSortMenu', 'vaultSortChevron', 'vaultSortDropdownBtn', 80);
  renderVaultGallery();
}

function setVaultFilter(filter, btn) {
  if (['clips', 'trim', 'video', 'audio'].includes(filter)) {
    currentVaultFilter = 'all';
    document.querySelectorAll('#vaultPlatformTabs .vault-u-tab').forEach(t => {
      const isAll = t.dataset.filter === 'all';
      t.classList.toggle('active', isAll);
      t.setAttribute('aria-selected', isAll ? 'true' : 'false');
    });
    updateVaultPlatformUnderline(false);
    syncVaultModeDropdownOptions();
    setVaultModeFilter(filter);
    return;
  }

  currentVaultFilter = filter || 'all';
  const tabs = document.querySelectorAll('#vaultPlatformTabs .vault-u-tab');
  let activeTab = btn || null;
  tabs.forEach(t => {
    const isMatch = t === btn || (!btn && t.dataset.filter === currentVaultFilter);
    if (isMatch) activeTab = t;
    t.classList.toggle('active', isMatch);
    t.setAttribute('aria-selected', isMatch ? 'true' : 'false');
  });
  if (activeTab && typeof activeTab.scrollIntoView === 'function') {
    activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
  updateVaultPlatformUnderline(false);
  syncVaultModeDropdownOptions();
  renderVaultGallery();
}

function onVaultSearchInput(val) {
  currentVaultSearch = (val || '').toLowerCase().trim();
  const clearBtn = document.getElementById('vaultSearchClearBtn');
  if (clearBtn) {
    if (currentVaultSearch) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }
  renderVaultGallery();
}

function clearVaultSearch() {
  const searchInput = document.getElementById('vaultSearchInput');
  if (searchInput) searchInput.value = '';
  currentVaultSearch = '';
  const clearBtn = document.getElementById('vaultSearchClearBtn');
  if (clearBtn) clearBtn.classList.add('hidden');
  renderVaultGallery();
}

function matchesPlatformFilter(record) {
  if (!currentVaultFilter || currentVaultFilter === 'all') return true;
  return getProjectPlatformKey(record) === currentVaultFilter;
}

function matchesVaultScope(record) {
  if (!matchesPlatformFilter(record)) return false;
  if (currentVaultModeFilter && currentVaultModeFilter !== 'all') {
    return getProjectOutputMode(record) === currentVaultModeFilter;
  }
  return true;
}

function matchesFilter(item) {
  return matchesVaultScope(item);
}

function matchesProjectFilter(proj) {
  return matchesVaultScope(proj);
}

function getProjectTimestamp(proj) {
  const raw = proj.created_at ?? proj.saved_at ?? proj.files?.[0]?.saved_at;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const num = Number(raw);
    if (!Number.isNaN(num)) return num;
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed / 1000;
  }
  return 0;
}

function sortVaultProjects(list) {
  const indexed = list.map((proj, idx) => ({ proj, idx, ts: getProjectTimestamp(proj) }));
  indexed.sort((a, b) => {
    if (currentVaultSort === 'oldest') {
      if (a.ts !== b.ts) return a.ts - b.ts;
      return b.idx - a.idx;
    }
    if (currentVaultSort === 'files') {
      const fa = Array.isArray(a.proj.files) ? a.proj.files.length : 0;
      const fb = Array.isArray(b.proj.files) ? b.proj.files.length : 0;
      if (fb !== fa) return fb - fa;
    }
    if (currentVaultSort === 'alpha') {
      const cmp = (a.proj.workspace_name || '').localeCompare(b.proj.workspace_name || '');
      if (cmp !== 0) return cmp;
    }
    if (b.ts !== a.ts) return b.ts - a.ts;
    return a.idx - b.idx;
  });
  return indexed.map(entry => entry.proj);
}

function updateVaultTabCounts() {
  const searched = vaultProjects.filter(p => matchesProjectSearch(p));
  const counts = { all: searched.length, youtube: 0, instagram: 0, tiktok: 0 };
  searched.forEach(proj => {
    const plat = getProjectPlatformKey(proj);
    if (plat in counts) counts[plat] += 1;
  });

  const elMap = {
    all: 'vaultCountAll',
    youtube: 'vaultCountYoutube',
    instagram: 'vaultCountInstagram',
    tiktok: 'vaultCountTiktok',
  };
  Object.keys(elMap).forEach(key => {
    const el = document.getElementById(elMap[key]);
    if (el) el.textContent = String(counts[key] || 0);
  });
}

function matchesSearch(item) {
  if (!currentVaultSearch) return true;
  const title = (item.title || '').toLowerCase();
  const fname = (item.filename || '').toLowerCase();
  const caption = (item.caption || '').toLowerCase();
  const plat = (item.platform || '').toLowerCase();
  return title.includes(currentVaultSearch) ||
    fname.includes(currentVaultSearch) ||
    caption.includes(currentVaultSearch) ||
    plat.includes(currentVaultSearch);
}

function matchesProjectSearch(proj) {
  if (!currentVaultSearch) return true;
  const ws = (proj.workspace_name || '').toLowerCase();
  const title = (proj.source_title || '').toLowerCase();
  const plat = (proj.platform || '').toLowerCase();
  if (ws.includes(currentVaultSearch) || title.includes(currentVaultSearch) || plat.includes(currentVaultSearch)) {
    return true;
  }
  if (proj.files && Array.isArray(proj.files)) {
    return proj.files.some(f =>
      (f.title || '').toLowerCase().includes(currentVaultSearch) ||
      (f.filename || '').toLowerCase().includes(currentVaultSearch)
    );
  }
  return false;
}

function getProjectMeter(proj) {
  const act = (proj.action || '').toLowerCase();
  const plat = (proj.platform || '').toLowerCase();
  if (act.includes('ai_clip')) {
    return { signal: 3, tone: '#ffffff', label: 'AI Clipper' };
  }
  if (act.includes('clip') || act.includes('trim')) {
    return { signal: 3, tone: '#a1a1aa', label: 'Video Trimmer' };
  }
  // Match the platform before the action: "type_tt_video" contains "video", which
  // used to label TikTok workspaces as YouTube.
  if (plat.includes('tiktok')) {
    return { signal: 3, tone: '#a1a1aa', label: 'TikTok' };
  }
  if (plat.includes('instagram') || act.includes('reels')) {
    return { signal: 3, tone: '#ec4899', label: 'Instagram Reels' };
  }
  if (plat.includes('youtube')) {
    return { signal: 3, tone: '#ef4444', label: 'YouTube' };
  }
  if (act.includes('mp3') || plat.includes('audio')) {
    return { signal: 3, tone: '#f59e0b', label: 'Audio MP3' };
  }
  return { signal: 2, tone: '#a1a1aa', label: 'Workspace' };
}

function renderVaultGallery() {
  const grid = document.getElementById('vaultGalleryGrid');
  const emptyState = document.getElementById('vaultEmptyState');
  const emptyTitle = document.getElementById('vaultEmptyTitle');
  const emptyDesc = document.getElementById('vaultEmptyDesc');
  if (!grid) return;

  closeVaultCardMenu();
  updateVaultTabCounts();
  if (!vaultUnderlineRaf) {
    requestAnimationFrame(() => updateVaultPlatformUnderline(!vaultUnderlineState.initialized));
  }
  grid.innerHTML = '';

  const filtered = sortVaultProjects(
    vaultProjects.filter(p => matchesProjectFilter(p) && matchesProjectSearch(p))
  );

  // Selection only covers cards the user can currently see, so a bulk delete never hits hidden workspaces.
  const visibleSelectable = new Set(filtered.filter(p => !p.virtual).map(p => p.project_id));
  Array.from(vaultSelectedIds).forEach(id => {
    if (!visibleSelectable.has(id)) vaultSelectedIds.delete(id);
  });

  if (filtered.length === 0) {
    syncVaultSelectionUI();
    if (emptyState) {
      emptyState.classList.remove('hidden');
      if (currentVaultSearch) {
        if (emptyTitle) emptyTitle.innerText = 'Not found';
        if (emptyDesc) emptyDesc.innerText = `No projects match the search "${currentVaultSearch}".`;
      } else if (currentVaultFilter !== 'all' || currentVaultModeFilter !== 'all') {
        if (emptyTitle) emptyTitle.innerText = 'Empty Category';
        if (emptyDesc) emptyDesc.innerText = 'No projects match this filter yet.';
      } else {
        if (emptyTitle) emptyTitle.innerText = 'Empty Workspace';
        if (emptyDesc) emptyDesc.innerText = 'No projects in Workspace yet.';
      }
    }
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  filtered.forEach(proj => {
    const card = document.createElement('div');
    card.id = `vault-proj-card-${proj.project_id}`;
    const isVirtualProj = !!proj.virtual;
    card.className = `t-rec-card vault-card cursor-pointer${isVirtualProj ? ' is-virtual' : ''}`;
    card.dataset.projectId = proj.project_id;
    card.onclick = (e) => {
      if (vaultSelectionMode) {
        if (!isVirtualProj) toggleVaultProjectSelection(proj.project_id);
        return;
      }
      if (!e.target.closest('button') && !e.target.closest('a')) {
        openProjectPage(proj.project_id);
      }
    };

    const meter = getProjectMeter(proj);

    card.innerHTML = `
      ${isVirtualProj ? '' : `
      <span class="vault-card-check" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8.5L6.75 11L12 5.5"></path>
        </svg>
      </span>`}
      <!-- primitive-card-pad -->
      <div class="primitive-card-pad">
        <span class="text-[14px] font-medium text-white tracking-tight block truncate">
          ${escapeHtml(proj.workspace_name)}
        </span>
        <p class="mt-1.5 min-h-[44px] text-[13px] leading-relaxed text-zinc-400 line-clamp-2">
          ${escapeHtml(proj.source_title || 'Media Project')}
        </p>
      </div>

      <!-- primitive-card-footer -->
      <div class="primitive-card-footer flex items-center justify-between gap-3 bg-surface">
        <span class="flex items-center gap-2">
          <span class="flex items-end gap-0.5">
            <span class="w-1 rounded-full transition-colors duration-300" style="height: 10px; background: ${meter.signal >= 1 ? meter.tone : 'rgba(255, 255, 255, 0.16)'};"></span>
            <span class="w-1 rounded-full transition-colors duration-300" style="height: 10px; background: ${meter.signal >= 2 ? meter.tone : 'rgba(255, 255, 255, 0.16)'};"></span>
            <span class="w-1 rounded-full transition-colors duration-300" style="height: 10px; background: ${meter.signal >= 3 ? meter.tone : 'rgba(255, 255, 255, 0.16)'};"></span>
          </span>
          <span class="text-[12.5px] font-medium text-zinc-400">${meter.label}</span>
        </span>

        <span class="vault-card-actions -mr-0.5 flex items-center gap-2">
          <button 
            type="button" 
            onclick="toggleVaultCardMenu('${proj.project_id}', this, event)" 
            class="t-card-btn-more${isVirtualProj ? ' hidden' : ''}"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded="false"
            ${isVirtualProj ? 'disabled aria-disabled="true"' : ''}>
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="3.5" r="1.2"></circle>
              <circle cx="8" cy="8" r="1.2"></circle>
              <circle cx="8" cy="12.5" r="1.2"></circle>
            </svg>
          </button>
          <span class="vault-card-action-sep${isVirtualProj ? ' hidden' : ''}" aria-hidden="true"></span>
          <button 
            type="button" 
            onclick="openProjectPage('${proj.project_id}')" 
            class="luna-open-link">
            <span>Open</span>
            <svg class="luna-open-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M6 4L10 8L6 12"></path>
            </svg>
          </button>
        </span>
      </div>
    `;

    grid.appendChild(card);
  });

  syncVaultSelectionUI();
  lucide.createIcons();
}

// Media Vault card "more" menu and multi-select mode (workspaces + files)
let vaultSelectionMode = false;
const vaultSelectedIds = new Set();
let vaultFileSelectionMode = false;
const vaultFileSelectedIds = new Set();
let vaultCardMenuContext = null; // { type: 'project' | 'workspace-header' | 'file', id: string }
let vaultCardMenuAnchor = null;

function attachVaultCardMenuGliding(menu) {
  if (!menu) return;
  const indicator = ensureMenuIndicator(menu);
  indicator.style.transition = 'none';
  indicator.style.opacity = '0';
  void indicator.offsetHeight;
  indicator.style.transition = '';

  menu.querySelectorAll('.vault-card-menu-item').forEach((item) => {
    item.onmouseenter = (event) => {
      event.stopPropagation();
      moveIndicatorTo(menu, item);
    };
    item.onfocus = () => {
      moveIndicatorTo(menu, item);
    };
  });
  menu.onmouseleave = () => {
    moveIndicatorTo(menu, null);
  };
}

function findActiveProjectFile(fileId) {
  if (!fileId) return null;
  const activeProj = currentActiveProjectId
    ? vaultProjects.find(p => p.project_id === currentActiveProjectId)
    : null;
  const fromProj = activeProj && Array.isArray(activeProj.files)
    ? activeProj.files.find(f => f.id === fileId)
    : null;
  return fromProj || vaultItems.find(it => it.id === fileId) || null;
}

function configureVaultCardMenu(context) {
  const selectBtn = document.getElementById('vaultCardMenuSelectBtn');
  const selectLabel = document.getElementById('vaultCardMenuSelectLabel');
  const renameBtn = document.getElementById('vaultCardMenuRenameBtn');
  const sepEl = document.getElementById('vaultCardMenuSep');
  const deleteBtn = document.getElementById('vaultCardMenuDeleteBtn');

  if (selectBtn) selectBtn.classList.remove('hidden');
  if (renameBtn) renameBtn.classList.remove('hidden');
  if (sepEl) sepEl.classList.remove('hidden');
  if (deleteBtn) deleteBtn.classList.remove('hidden');
  if (selectLabel) selectLabel.textContent = context.type === 'workspace-header' ? 'Select Files' : 'Select';

  if (context.type === 'workspace-header') {
    const proj = vaultProjects.find(p => p.project_id === context.id);
    const isVirtual = !!(proj && proj.virtual);
    const hasFiles = !!(proj && proj.files && proj.files.length > 0);
    if (isVirtual && !hasFiles) return false;
    if (selectBtn) selectBtn.classList.toggle('hidden', !hasFiles);
    if (renameBtn) renameBtn.classList.toggle('hidden', isVirtual);
    if (sepEl) sepEl.classList.toggle('hidden', isVirtual);
    if (deleteBtn) deleteBtn.classList.toggle('hidden', isVirtual);
  }
  return true;
}

function openVaultMoreMenu(context, btn, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const menu = document.getElementById('vaultCardMenu');
  if (!menu || !btn || !context || !context.id) return;
  if (vaultCardMenuAnchor === btn && menu.dataset.open === 'true') {
    closeVaultCardMenu();
    return;
  }
  closeVaultCardMenu();
  if (!configureVaultCardMenu(context)) return;

  vaultCardMenuContext = context;
  vaultCardMenuAnchor = btn;
  btn.setAttribute('aria-expanded', 'true');
  attachVaultCardMenuGliding(menu);

  const uiZoom = getLunaUiScale();
  const rect = btn.getBoundingClientRect();
  const vpW = window.innerWidth / uiZoom;
  const vpH = window.innerHeight / uiZoom;
  const rRight = rect.right / uiZoom;
  const rTop = rect.top / uiZoom;
  const rBottom = rect.bottom / uiZoom;
  const menuW = menu.offsetWidth || 148;
  const menuH = menu.offsetHeight || 114;
  const gap = 6;
  const left = Math.max(8, Math.min(rRight - menuW, vpW - menuW - 8));
  let top = rBottom + gap;
  let placement = 'bottom';
  if (top + menuH > vpH - 8 && rTop - gap - menuH >= 8) {
    top = rTop - gap - menuH;
    placement = 'top';
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.dataset.placement = placement;
  menu.setAttribute('aria-hidden', 'false');
  void menu.offsetHeight;
  menu.dataset.open = 'true';
}

function toggleVaultCardMenu(projectId, btn, event) {
  openVaultMoreMenu({ type: 'project', id: projectId }, btn, event);
}

function toggleWorkspaceHeaderMenu(projectId, btn, event) {
  openVaultMoreMenu({ type: 'workspace-header', id: projectId }, btn, event);
}

function toggleFileCardMenu(fileId, btn, event) {
  openVaultMoreMenu({ type: 'file', id: fileId }, btn, event);
}

function closeVaultCardMenu() {
  const menu = document.getElementById('vaultCardMenu');
  if (menu) {
    menu.dataset.open = 'false';
    menu.setAttribute('aria-hidden', 'true');
    const indicator = menu.querySelector('.gliding-menu-indicator');
    if (indicator) indicator.style.opacity = '0';
  }
  if (vaultCardMenuAnchor) vaultCardMenuAnchor.setAttribute('aria-expanded', 'false');
  vaultCardMenuAnchor = null;
  vaultCardMenuContext = null;
}

function handleVaultCardMenuAction(action) {
  const ctx = vaultCardMenuContext;
  closeVaultCardMenu();
  if (!ctx) return;

  if (ctx.type === 'project' || ctx.type === 'workspace-header') {
    const proj = vaultProjects.find(p => p.project_id === ctx.id);
    if (!proj) return;
    if (action === 'select') {
      if (ctx.type === 'workspace-header') enterFileSelectionMode(null);
      else if (!proj.virtual) enterVaultSelectionMode(proj.project_id);
    } else if (action === 'rename' && !proj.virtual) {
      promptRenameWorkspace(proj.project_id, proj.workspace_name);
    } else if (action === 'delete' && !proj.virtual) {
      confirmDeleteVaultProject(proj.project_id, proj.workspace_name);
    }
    return;
  }

  if (ctx.type === 'file') {
    const file = findActiveProjectFile(ctx.id);
    if (!file) return;
    if (action === 'select') {
      enterFileSelectionMode(file.id);
    } else if (action === 'rename') {
      promptRenameVaultItem(file.id);
    } else if (action === 'delete') {
      confirmDeleteVaultItem(file.id, file.title || file.filename, file.file_path);
    }
  }
}

function updateSelectionToolbar({ isOpen, selectedCount, allSelected, ariaLabel }) {
  const bar = document.getElementById('vaultSelectionBar');
  if (bar) {
    bar.dataset.open = isOpen ? 'true' : 'false';
    bar.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    if (ariaLabel) bar.setAttribute('aria-label', ariaLabel);
  }
  const countEl = document.getElementById('vaultSelectionCount');
  if (countEl) countEl.textContent = `${selectedCount} selected`;
  const deleteBtn = document.getElementById('vaultSelectionDeleteBtn');
  if (deleteBtn) deleteBtn.disabled = selectedCount === 0;
  const selectAllBtn = document.getElementById('vaultSelectionSelectAllBtn');
  if (selectAllBtn) selectAllBtn.textContent = allSelected ? 'Deselect all' : 'Select all';
}

function handleSelectionSelectAll() {
  if (vaultFileSelectionMode) toggleSelectAllVaultFiles();
  else toggleSelectAllVaultProjects();
}

function handleSelectionConfirmDelete() {
  if (vaultFileSelectionMode) confirmBulkDeleteVaultItems();
  else confirmBulkDeleteVaultProjects();
}

function exitActiveSelectionMode() {
  exitFileSelectionMode();
  exitVaultSelectionMode();
}

function getVisibleSelectableVaultIds() {
  return Array.from(document.querySelectorAll('#vaultGalleryGrid .vault-card:not(.is-virtual)'))
    .map(el => el.dataset.projectId)
    .filter(Boolean);
}

function enterVaultSelectionMode(initialId) {
  vaultFileSelectionMode = false;
  vaultFileSelectedIds.clear();
  vaultSelectionMode = true;
  vaultSelectedIds.clear();
  if (initialId) vaultSelectedIds.add(initialId);
  syncVaultSelectionUI();
}

function exitVaultSelectionMode() {
  if (!vaultSelectionMode && vaultSelectedIds.size === 0) return;
  vaultSelectionMode = false;
  vaultSelectedIds.clear();
  syncVaultSelectionUI();
}

function toggleVaultProjectSelection(projectId) {
  if (!projectId) return;
  if (vaultSelectedIds.has(projectId)) vaultSelectedIds.delete(projectId);
  else vaultSelectedIds.add(projectId);
  syncVaultSelectionUI();
}

function toggleSelectAllVaultProjects() {
  const ids = getVisibleSelectableVaultIds();
  const allSelected = ids.length > 0 && ids.every(id => vaultSelectedIds.has(id));
  ids.forEach(id => {
    if (allSelected) vaultSelectedIds.delete(id);
    else vaultSelectedIds.add(id);
  });
  syncVaultSelectionUI();
}

function syncVaultSelectionUI() {
  const grid = document.getElementById('vaultGalleryGrid');
  if (grid) {
    grid.classList.toggle('is-selecting', vaultSelectionMode);
    grid.querySelectorAll('.vault-card').forEach(card => {
      card.classList.toggle('is-selected', vaultSelectionMode && vaultSelectedIds.has(card.dataset.projectId));
    });
  }
  if (vaultFileSelectionMode) return;
  const ids = getVisibleSelectableVaultIds();
  updateSelectionToolbar({
    isOpen: vaultSelectionMode,
    selectedCount: vaultSelectedIds.size,
    allSelected: ids.length > 0 && ids.every(id => vaultSelectedIds.has(id)),
    ariaLabel: 'Selected workspaces',
  });
}

function getVisibleSelectableFileIds() {
  const activeProj = currentActiveProjectId
    ? vaultProjects.find(p => p.project_id === currentActiveProjectId)
    : null;
  if (activeProj && isAiClipperProject(activeProj)) {
    return Array.from(document.querySelectorAll('#clipperBranchingClipsWrapper .vault-file-card'))
      .map(el => el.dataset.fileId)
      .filter(Boolean);
  }
  return Array.from(document.querySelectorAll('#projectFilesGrid .vault-file-card:not(.hidden)'))
    .map(el => el.dataset.fileId)
    .filter(Boolean);
}

function enterFileSelectionMode(initialFileId) {
  vaultSelectionMode = false;
  vaultSelectedIds.clear();
  vaultFileSelectionMode = true;
  vaultFileSelectedIds.clear();
  if (initialFileId) vaultFileSelectedIds.add(initialFileId);
  syncFileSelectionUI();
}

function exitFileSelectionMode() {
  if (!vaultFileSelectionMode && vaultFileSelectedIds.size === 0) return;
  vaultFileSelectionMode = false;
  vaultFileSelectedIds.clear();
  syncFileSelectionUI();
}

function toggleVaultFileSelection(fileId) {
  if (!fileId) return;
  if (vaultFileSelectedIds.has(fileId)) vaultFileSelectedIds.delete(fileId);
  else vaultFileSelectedIds.add(fileId);
  syncFileSelectionUI();
}

function toggleSelectAllVaultFiles() {
  const ids = getVisibleSelectableFileIds();
  const allSelected = ids.length > 0 && ids.every(id => vaultFileSelectedIds.has(id));
  ids.forEach(id => {
    if (allSelected) vaultFileSelectedIds.delete(id);
    else vaultFileSelectedIds.add(id);
  });
  syncFileSelectionUI();
}

function syncFileSelectionUI() {
  ['projectFilesGrid', 'clipperBranchingClipsWrapper'].forEach(containerId => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.classList.toggle('is-selecting', vaultFileSelectionMode);
    if (vaultFileSelectionMode) {
      clearVideoHoverControls(container);
    }
    container.querySelectorAll('.vault-file-card').forEach(card => {
      card.classList.toggle('is-selected', vaultFileSelectionMode && vaultFileSelectedIds.has(card.dataset.fileId));
    });
  });
  if (vaultSelectionMode) return;
  const ids = getVisibleSelectableFileIds();
  updateSelectionToolbar({
    isOpen: vaultFileSelectionMode,
    selectedCount: vaultFileSelectedIds.size,
    allSelected: ids.length > 0 && ids.every(id => vaultFileSelectedIds.has(id)),
    ariaLabel: 'Selected files',
  });
}

function syncAfterProjectFilesChanged(activeProj, { deletedClip = false, forceRerender = false } = {}) {
  if (!activeProj) return;
  if (isAiClipperProject(activeProj)) {
    if (deletedClip) {
      Object.keys(clipperNodeOffsets).forEach(k => {
        if (k.startsWith('clip-node-')) delete clipperNodeOffsets[k];
      });
    }
    renderClipperWorkflow(activeProj);
    return;
  }
  updateProjectDetailHeaderMeta(activeProj);
  if (forceRerender) {
    renderProjectFiles(activeProj);
  } else {
    updateVaultFilterCounters();
  }
}

function updateProjectDetailHeaderMeta(proj) {
  if (!proj) return;
  const files = proj.files || [];
  const totalSize = files.reduce((acc, f) => acc + (f.file_size || 0), 0);
  const countEl = document.getElementById('projectDetailFileCount');
  const sizeEl = document.getElementById('projectDetailTotalSize');
  const emptyState = document.getElementById('projectFilesEmptyState');
  const btnDetailMenu = document.getElementById('btnProjectDetailMenu');

  if (countEl) countEl.innerText = `${files.length} Media Files`;
  if (sizeEl) sizeEl.innerText = `${formatBytes(totalSize)} Total`;
  if (emptyState) emptyState.classList.toggle('hidden', files.length > 0);
  if (btnDetailMenu) {
    btnDetailMenu.classList.toggle('hidden', !!proj.virtual && files.length === 0);
  }
}

function confirmBulkDeleteVaultProjects() {
  const ids = Array.from(vaultSelectedIds);
  if (!ids.length) return;
  deletingProjectId = null;
  deletingItemId = null;
  const heading = document.getElementById('deleteModalHeading');
  const desc = document.getElementById('deleteModalDesc');
  const btnText = document.getElementById('deleteModalBtnText');
  const confirmBtn = document.getElementById('deleteModalConfirmBtn');

  if (ids.length === 1) {
    const proj = vaultProjects.find(p => p.project_id === ids[0]);
    if (heading) heading.innerText = 'Delete this workspace?';
    if (desc) desc.innerText = `Are you sure you want to delete workspace "${(proj && proj.workspace_name) || 'Workspace'}"? All files in it will be deleted and cannot be recovered.`;
  } else {
    if (heading) heading.innerText = `Delete ${ids.length} workspaces?`;
    if (desc) desc.innerText = `All files in the ${ids.length} selected workspaces will be deleted and cannot be recovered.`;
  }
  if (btnText) btnText.innerText = 'Delete';
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.onclick = executeBulkDeleteVaultProjects;
  }

  openDeleteModalBox();
}

async function executeBulkDeleteVaultProjects() {
  const ids = Array.from(vaultSelectedIds);
  if (!ids.length) return;
  const confirmBtn = document.getElementById('deleteModalConfirmBtn');
  const btnText = document.getElementById('deleteModalBtnText');
  const btnSpinner = document.getElementById('deleteModalBtnSpinner');

  if (confirmBtn) confirmBtn.disabled = true;
  if (btnSpinner) btnSpinner.classList.remove('hidden');
  if (btnText) btnText.innerText = 'Deleting...';

  releaseMediaLocks();

  const failedIds = [];
  for (const id of ids) {
    try {
      const res = await fetch(`/api/vault/project/${id}`, { method: 'DELETE' });
      if (!res.ok) failedIds.push(id);
    } catch (e) {
      failedIds.push(id);
    }
  }

  const failedNames = failedIds.map(id => {
    const proj = vaultProjects.find(p => p.project_id === id);
    return (proj && proj.workspace_name) || id;
  });

  if (confirmBtn) confirmBtn.disabled = false;
  if (btnSpinner) btnSpinner.classList.add('hidden');
  if (btnText) btnText.innerText = 'Delete';
  closeDeleteModal();

  // Keep only the workspaces that failed selected, so the user can retry them.
  vaultSelectedIds.clear();
  failedIds.forEach(id => vaultSelectedIds.add(id));
  if (!failedIds.length) vaultSelectionMode = false;

  await loadVaultItems();
  syncVaultSelectionUI();

  if (failedIds.length) {
    showNoticeModal(
      'Some workspaces could not be deleted',
      `Could not delete: ${failedNames.join(', ')}. Close any files that are open elsewhere and try again.`
    );
  }
}

function confirmBulkDeleteVaultItems() {
  const ids = Array.from(vaultFileSelectedIds);
  if (!ids.length) return;
  deletingProjectId = null;
  deletingItemId = null;
  const heading = document.getElementById('deleteModalHeading');
  const desc = document.getElementById('deleteModalDesc');
  const btnText = document.getElementById('deleteModalBtnText');
  const confirmBtn = document.getElementById('deleteModalConfirmBtn');

  if (ids.length === 1) {
    const file = findActiveProjectFile(ids[0]);
    const label = (file && (file.title || file.filename)) || 'this file';
    if (heading) heading.innerText = 'Delete this file?';
    if (desc) desc.innerText = `Are you sure you want to delete "${label}"? This action cannot be undone.`;
  } else {
    if (heading) heading.innerText = `Delete ${ids.length} files?`;
    if (desc) desc.innerText = `${ids.length} selected files will be permanently removed from this workspace.`;
  }
  if (btnText) btnText.innerText = 'Delete';
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.onclick = executeBulkDeleteVaultItems;
  }

  openDeleteModalBox();
}

async function executeBulkDeleteVaultItems() {
  const ids = Array.from(vaultFileSelectedIds);
  if (!ids.length) return;
  const confirmBtn = document.getElementById('deleteModalConfirmBtn');
  const btnText = document.getElementById('deleteModalBtnText');
  const btnSpinner = document.getElementById('deleteModalBtnSpinner');

  if (confirmBtn) confirmBtn.disabled = true;
  if (btnSpinner) btnSpinner.classList.remove('hidden');
  if (btnText) btnText.innerText = 'Deleting...';

  ids.forEach(id => {
    const cardEl = document.getElementById(`vault-card-${id}`);
    if (cardEl) releaseMediaLocks(cardEl);
  });

  const deletedIds = new Set();
  const failedIds = [];
  for (const id of ids) {
    try {
      const res = await fetch(`/api/vault/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) deletedIds.add(id);
      else failedIds.push(id);
    } catch (e) {
      failedIds.push(id);
    }
  }

  const failedNames = failedIds.map(id => {
    const f = findActiveProjectFile(id);
    return (f && (f.title || f.filename)) || id;
  });

  deletedIds.forEach(id => {
    const cardEl = document.getElementById(`vault-card-${id}`);
    if (cardEl && cardEl.parentNode) cardEl.remove();
  });

  if (deletedIds.size > 0) {
    vaultItems = vaultItems.filter(it => !deletedIds.has(it.id));
    if (vaultStats.total_files >= deletedIds.size) vaultStats.total_files -= deletedIds.size;
  }

  const activeProj = currentActiveProjectId
    ? vaultProjects.find(p => p.project_id === currentActiveProjectId)
    : null;
  if (activeProj && Array.isArray(activeProj.files)) {
    activeProj.files = activeProj.files.filter(f => !deletedIds.has(f.id));
    syncAfterProjectFilesChanged(activeProj, {
      deletedClip: deletedIds.size > 0,
      forceRerender: failedIds.length > 0,
    });
  }

  if (confirmBtn) confirmBtn.disabled = false;
  if (btnSpinner) btnSpinner.classList.add('hidden');
  if (btnText) btnText.innerText = 'Delete';
  closeDeleteModal();

  // Keep only the files that failed selected so the user can retry or cancel.
  vaultFileSelectedIds.clear();
  failedIds.forEach(id => vaultFileSelectedIds.add(id));
  if (!failedIds.length) vaultFileSelectionMode = false;

  syncFileSelectionUI();
  await loadVaultItems();
  if (vaultFileSelectionMode) syncFileSelectionUI();

  if (failedIds.length) {
    showNoticeModal(
      'Some files could not be deleted',
      `Could not delete: ${failedNames.join(', ')}. Close any files that are open elsewhere and try again.`
    );
  }
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('vaultCardMenu');
  if (!menu || menu.dataset.open !== 'true') return;
  if (menu.contains(e.target)) return;
  if (vaultCardMenuAnchor && vaultCardMenuAnchor.contains(e.target)) return;
  closeVaultCardMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const menu = document.getElementById('vaultCardMenu');
  if (menu && menu.dataset.open === 'true') {
    closeVaultCardMenu();
    return;
  }
  if (!vaultSelectionMode && !vaultFileSelectionMode) return;
  const modalOpen = ['deleteModal', 'renameWorkspaceModal', 'noticeModal', 'confirmModal'].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
  if (!modalOpen) exitActiveSelectionMode();
});

window.addEventListener('scroll', () => {
  if (vaultCardMenuAnchor) closeVaultCardMenu();
}, { passive: true });

window.addEventListener('resize', () => {
  if (vaultCardMenuAnchor) closeVaultCardMenu();
});

let openProjectRequestSeq = 0;

async function openProjectPage(projectId) {
  if (!projectId) return;
  const reqSeq = ++openProjectRequestSeq;
  let proj = vaultProjects.find(p => p.project_id === projectId);
  if (!proj) {
    try {
      const res = await fetch('/api/vault/projects');
      if (res.ok) {
        const data = await res.json();
        vaultProjects = data.projects || [];
        proj = vaultProjects.find(p => p.project_id === projectId);
      }
    } catch (e) {
      console.warn('Error fetching projects in openProjectPage:', e);
    }
  }
  if (reqSeq !== openProjectRequestSeq) return;
  if (!proj) {
    document.documentElement.removeAttribute('data-init-route');
    closeProjectPage();
    return;
  }
  exitActiveSelectionMode();
  closeVaultCardMenu();
  for (const k in clipperNodeOffsets) {
    delete clipperNodeOffsets[k];
  }
  currentActiveProjectId = projectId;
  document.body.classList.add('in-workspace');
  document.documentElement.removeAttribute('data-init-route');

  // Use pushState instead of assigning location.hash so opening a card doesn't
  // fire hashchange and double-render the workspace mid-media-load.
  const targetHash = `#vault-project/${projectId}`;
  if (window.location.hash !== targetHash) {
    history.pushState(null, '', targetHash);
  }
  document.title = `${proj.workspace_name} (${projectId}) | Luna`;

  const listView = document.getElementById('vaultProjectsListView');
  const detailView = document.getElementById('vaultProjectDetailView');
  if (listView) listView.classList.add('hidden');
  if (detailView) detailView.classList.remove('hidden');

  const titleEl = document.getElementById('projectDetailPageTitle');
  const idEl = document.getElementById('projectDetailPageId');
  const srcEl = document.getElementById('projectDetailSourceTitle');
  const countEl = document.getElementById('projectDetailFileCount');
  const sizeEl = document.getElementById('projectDetailTotalSize');
  const dateEl = document.getElementById('projectDetailCreatedDate');
  const breadcrumbEl = document.getElementById('detailViewBreadcrumb');
  const btnDetailMenu = document.getElementById('btnProjectDetailMenu');

  const files = proj.files || [];
  const totalSize = files.reduce((acc, f) => acc + (f.file_size || 0), 0);

  if (titleEl) titleEl.innerText = proj.workspace_name || 'Workspace';
  if (idEl) idEl.innerText = `ID: ${proj.project_id}`;
  if (srcEl) {
    srcEl.innerHTML = '';
    srcEl.classList.add('hidden');
  }
  if (countEl) countEl.innerText = `${files.length} Media Files`;
  if (sizeEl) sizeEl.innerText = `${formatBytes(totalSize)} Total`;
  if (dateEl) dateEl.innerText = formatSavedDate(proj.created_at);
  if (breadcrumbEl) breadcrumbEl.innerText = `${proj.project_id}`;

  const stdView = document.getElementById('vaultStandardDetailView');
  const clipContainer = document.getElementById('clipperWorkflowContainer');
  const clipperTitle = document.getElementById('clipperWorkspaceTitle');
  const clipperId = document.getElementById('clipperWorkspaceId');
  const btnClipperRename = document.getElementById('btnClipperRename');
  const btnClipperDelete = document.getElementById('btnClipperDelete');

  const isVirtualProj = !!proj.virtual;

  if (btnDetailMenu) {
    btnDetailMenu.classList.toggle('hidden', isVirtualProj && files.length === 0);
    btnDetailMenu.onclick = (e) => toggleWorkspaceHeaderMenu(proj.project_id, btnDetailMenu, e);
  }

  [btnClipperRename, btnClipperDelete].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle('hidden', isVirtualProj);
    if (isVirtualProj) {
      btn.setAttribute('disabled', 'disabled');
      btn.setAttribute('aria-disabled', 'true');
    } else {
      btn.removeAttribute('disabled');
      btn.removeAttribute('aria-disabled');
    }
  });

  if (clipperTitle) clipperTitle.innerText = proj.workspace_name || 'Workspace';
  if (clipperId) clipperId.innerText = `ID: ${proj.project_id}`;
  if (btnClipperRename) {
    btnClipperRename.onclick = () => promptRenameWorkspace(proj.project_id, proj.workspace_name);
  }
  if (btnClipperDelete) {
    btnClipperDelete.onclick = (e) => confirmDeleteVaultProject(proj.project_id, proj.workspace_name, e);
  }

  if (isAiClipperProject(proj)) {
    if (stdView) stdView.classList.add('hidden');
    if (clipContainer) clipContainer.classList.remove('hidden');
    renderClipperWorkflow(proj);
  } else {
    if (clipContainer) clipContainer.classList.add('hidden');
    if (stdView) stdView.classList.remove('hidden');
    renderProjectFiles(proj);
    requestAnimationFrame(() => {
      setVaultMediaFilter(window.currentVaultMediaFilter || 'all', true);
    });
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
  lucide.createIcons();
}

window.initAudioEvents = function (fileId) {
  const audioEl = document.getElementById(`audio-el-${fileId}`);
  if (!audioEl) return;
  attachMediaRecovery(audioEl);

  const setVisualPlaying = (isPlaying) => {
    const vinyl = document.getElementById(`vinyl-disc-${fileId}`);
    const waveform = document.getElementById(`waveform-bars-${fileId}`);
    if (vinyl) vinyl.classList.toggle('spinning', isPlaying);
    if (waveform) waveform.classList.toggle('playing', isPlaying);
  };

  audioEl.onplay = () => {
    if (currentlyPlayingAudioId && currentlyPlayingAudioId !== fileId) {
      const prevEl = document.getElementById(`audio-el-${currentlyPlayingAudioId}`);
      const prevVinyl = document.getElementById(`vinyl-disc-${currentlyPlayingAudioId}`);
      const prevWaveform = document.getElementById(`waveform-bars-${currentlyPlayingAudioId}`);
      if (prevEl) prevEl.pause();
      if (prevVinyl) prevVinyl.classList.remove('spinning');
      if (prevWaveform) prevWaveform.classList.remove('playing');
    }
    currentlyPlayingAudioId = fileId;
    setVisualPlaying(true);
  };

  audioEl.onpause = () => {
    setVisualPlaying(false);
    if (currentlyPlayingAudioId === fileId) currentlyPlayingAudioId = null;
  };

  audioEl.onended = () => {
    setVisualPlaying(false);
    if (currentlyPlayingAudioId === fileId) currentlyPlayingAudioId = null;
  };

  if (typeof compactSutroPlayers === 'function') {
    compactSutroPlayers();
  }
  if (window.customElements && customElements.whenDefined) {
    customElements.whenDefined('media-theme-sutro').then(() => {
      if (typeof compactSutroPlayers === 'function') compactSutroPlayers();
    });
  }
};

// Shared aspect ratio helpers across Studio and Media Vault video cards:
// pill badges display pure numeric ratios (e.g. "16:9", "9:16") with no icon or text clutter.
const VAULT_RATIOS = [
  { ratio: 16 / 9, label: '16:9', kind: 'landscape' },
  { ratio: 4 / 3, label: '4:3', kind: 'landscape' },
  { ratio: 21 / 9, label: '21:9', kind: 'landscape' },
  { ratio: 9 / 16, label: '9:16', kind: 'portrait' },
  { ratio: 3 / 4, label: '3:4', kind: 'portrait' },
  { ratio: 4 / 5, label: '4:5', kind: 'portrait' },
  { ratio: 1, label: '1:1', kind: 'square' },
];

function formatCompactRatio(width, height) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  const rw = Math.round(w / g);
  const rh = Math.round(h / g);
  if (rw <= 21 && rh <= 21) return `${rw}:${rh}`;
  // Fallback continued-fraction search so odd "Original" dimensions still show a compact ratio.
  const target = w / h;
  let best = { num: rw, den: rh, err: Infinity };
  for (let den = 1; den <= 16; den++) {
    const num = Math.max(1, Math.round(target * den));
    const err = Math.abs(target - num / den) / target;
    if (err < best.err) {
      best = { num, den, err };
      if (err < 0.015) break;
    }
  }
  const g2 = gcd(best.num, best.den);
  return `${Math.round(best.num / g2)}:${Math.round(best.den / g2)}`;
}

function ratioMetaFromSize(width, height) {
  if (!width || !height) return null;
  const actual = width / height;
  let best = null;
  for (const item of VAULT_RATIOS) {
    const diff = Math.abs(actual - item.ratio) / item.ratio;
    if (diff <= 0.06 && (!best || diff < best.diff)) best = { ...item, diff };
  }
  if (best) return best;
  const kind = actual > 1.05 ? 'landscape' : (actual < 0.95 ? 'portrait' : 'square');
  return {
    label: formatCompactRatio(width, height),
    kind,
  };
}

function ratioMetaFromValue(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,4})\s*[:x×]\s*(\d{1,4})/i);
  return match ? ratioMetaFromSize(Number(match[1]), Number(match[2])) : null;
}

function ratioMetaFromFilename(name) {
  const match = /_(\d{1,2})x(\d{1,2})(?:\.[a-z0-9]+)?$/i.exec(name || '');
  return match ? ratioMetaFromSize(Number(match[1]), Number(match[2])) : null;
}

function resolveMediaRatioMeta(ratioValue, filename, preferPortrait = false) {
  return ratioMetaFromValue(ratioValue) || ratioMetaFromFilename(filename) || {
    label: preferPortrait ? '9:16' : '16:9',
    kind: preferPortrait ? 'portrait' : 'landscape',
  };
}

function renderRatioBadgeHtml(label) {
  const text = escapeHtml(label || '16:9');
  return `<div class="ratio-pill absolute top-2.5 left-2.5 z-20 inline-flex items-center px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/10 text-[10px] font-mono font-medium tracking-tight text-zinc-100 tabular-nums pointer-events-none select-none"><span class="ratio-text">${text}</span></div>`;
}

function ratioAspectClass(meta) {
  if (!meta) return 'aspect-video';
  if (meta.kind === 'square') return 'aspect-square';
  if (meta.label === '4:5') return 'aspect-[4/5]';
  if (meta.label === '3:4') return 'aspect-[3/4]';
  if (meta.kind === 'portrait') return 'aspect-[9/16]';
  if (meta.label === '4:3') return 'aspect-[4/3]';
  return 'aspect-video';
}

// The class above is cosmetic; the inline style keeps the box correct even if the
// utility for that ratio has not been generated yet.
function ratioAspectStyle(meta) {
  if (!meta || !meta.label) return '16 / 9';
  const parts = String(meta.label).split(':');
  if (parts.length === 2 && Number(parts[0]) > 0 && Number(parts[1]) > 0) {
    return `${Number(parts[0])} / ${Number(parts[1])}`;
  }
  return meta.kind === 'portrait' ? '9 / 16' : (meta.kind === 'square' ? '1 / 1' : '16 / 9');
}

window.handleVaultVideoMetadata = function (videoEl, fileId) {
  if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;
  const wrapper = videoEl.closest('.video-preview-wrapper');
  if (!wrapper) return;
  const meta = ratioMetaFromSize(videoEl.videoWidth, videoEl.videoHeight);
  const ratioText = wrapper.querySelector('.ratio-text');
  if (ratioText && meta) ratioText.innerText = meta.label;

  const card = wrapper.closest('.t-rec-card') || wrapper.closest('[data-media-type]') || wrapper.parentElement;
  const isSingleCard = card && card.classList.contains('single-result-card');
  const isWide = !meta || meta.kind === 'landscape';

  wrapper.classList.remove('aspect-video', 'aspect-[4/3]', 'aspect-[4/5]', 'aspect-[9/16]', 'aspect-[3/4]', 'aspect-square');
  wrapper.classList.add(ratioAspectClass(meta));
  wrapper.style.aspectRatio = ratioAspectStyle(meta);

  if (isSingleCard) {
    wrapper.classList.remove('max-h-[460px]', 'max-h-[500px]', 'max-h-[520px]', 'max-h-[580px]');
    if (isWide) {
      wrapper.classList.add('max-h-[520px]');
      card.classList.remove('max-w-md');
      card.classList.add('max-w-3xl');
    } else {
      wrapper.classList.add('max-h-[580px]');
      card.classList.remove('max-w-3xl');
      card.classList.add('max-w-md');
    }
  } else {
    wrapper.classList.remove('max-h-[500px]', 'max-h-[520px]', 'max-h-[580px]');
    wrapper.classList.add(isWide ? 'max-h-[520px]' : 'max-h-[500px]');
  }

  if (card) card.setAttribute('data-media-type', meta ? meta.kind : 'landscape');
  if (typeof updateVaultFilterCounters === 'function') {
    updateVaultFilterCounters();
  }
  if (window.currentVaultMediaFilter && window.currentVaultMediaFilter !== 'all') {
    window.setVaultMediaFilter(window.currentVaultMediaFilter);
  }
};

function closeProjectPage(options = {}) {
  openProjectRequestSeq++;
  closeVaultCardMenu();
  exitFileSelectionMode();
  for (const k in clipperNodeOffsets) {
    delete clipperNodeOffsets[k];
  }
  if (currentlyPlayingAudioId) {
    const otherEl = document.getElementById(`audio-el-${currentlyPlayingAudioId}`);
    if (otherEl) otherEl.pause();
    currentlyPlayingAudioId = null;
  }
  const detailView = document.getElementById('vaultProjectDetailView');
  releaseMediaLocks(detailView || document);
  currentActiveProjectId = null;
  document.body.classList.remove('in-workspace');
  if (!options.preserveHash) {
    syncLocationHash(currentMainTab === 'vault' ? '#vault' : '', { replace: true });
  }
  document.title = currentMainTab === 'vault' ? 'Luna: Workspace' : 'Luna: AI Video Clipper & Downloader';

  const listView = document.getElementById('vaultProjectsListView');
  const clipContainer = document.getElementById('clipperWorkflowContainer');
  const stdView = document.getElementById('vaultStandardDetailView');
  const filesGrid = document.getElementById('projectFilesGrid');
  const clipperNodes = document.getElementById('clipperCanvasNodesWrapper');
  if (filesGrid) filesGrid.innerHTML = '';
  if (clipperNodes) clipperNodes.innerHTML = '';
  if (clipContainer) clipContainer.classList.add('hidden');
  if (stdView) stdView.classList.add('hidden');
  if (detailView) detailView.classList.add('hidden');
  if (listView) listView.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'instant' });
  lucide.createIcons();
}

const VIDEO_CONTROLS_HIDE_DELAY_MS = 1000;
const videoHoverHideTimers = new WeakMap();

function isVideoSelectionBlockingHover(wrapper) {
  return Boolean(vaultFileSelectionMode || (wrapper && wrapper.closest('.is-selecting')));
}

function cancelVideoControlsHideTimer(wrapper) {
  const timerId = videoHoverHideTimers.get(wrapper);
  if (timerId) {
    clearTimeout(timerId);
    videoHoverHideTimers.delete(wrapper);
  }
}

function setVideoWrapperControlsVisible(wrapper, visible) {
  if (!wrapper) return;
  const sutro = wrapper.querySelector('media-theme-sutro');
  if (visible) {
    wrapper.setAttribute('data-controls-visible', 'true');
    if (sutro) sutro.setAttribute('data-controls-visible', 'true');
  } else {
    wrapper.removeAttribute('data-controls-visible');
    if (sutro) sutro.removeAttribute('data-controls-visible');
  }
}

function clearVideoHoverControls(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('.video-preview-wrapper').forEach(wrapper => {
    cancelVideoControlsHideTimer(wrapper);
    setVideoWrapperControlsVisible(wrapper, false);
  });
}

function initVideoHoverPlayers(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('.video-preview-wrapper').forEach(wrapper => {
    if (wrapper.dataset.hoverBound === '1') return;
    wrapper.dataset.hoverBound = '1';

    wrapper.addEventListener('mouseenter', () => {
      cancelVideoControlsHideTimer(wrapper);
      if (isVideoSelectionBlockingHover(wrapper)) {
        setVideoWrapperControlsVisible(wrapper, false);
        return;
      }
      setVideoWrapperControlsVisible(wrapper, true);
    });

    wrapper.addEventListener('mouseleave', () => {
      cancelVideoControlsHideTimer(wrapper);
      if (isVideoSelectionBlockingHover(wrapper)) {
        setVideoWrapperControlsVisible(wrapper, false);
        return;
      }
      const timerId = setTimeout(() => {
        videoHoverHideTimers.delete(wrapper);
        setVideoWrapperControlsVisible(wrapper, false);
      }, VIDEO_CONTROLS_HIDE_DELAY_MS);
      videoHoverHideTimers.set(wrapper, timerId);
    });

    if (wrapper.matches && wrapper.matches(':hover') && !isVideoSelectionBlockingHover(wrapper)) {
      setVideoWrapperControlsVisible(wrapper, true);
    }
  });
}

// Global Sutro media player engine
window.compactSutroPlayers = function () {
  initVideoHoverPlayers(document);
  document.querySelectorAll('media-theme-sutro').forEach(player => {
    if (!player.shadowRoot) return;
    if (!player.shadowRoot.querySelector('#sutro-mini-style')) {
      const st = document.createElement('style');
      st.id = 'sutro-mini-style';
      st.textContent = `
        :host {
          --media-tooltip-display: none !important;
        }

        /* Completely disable tap/click on video area to play/pause - ONLY play button controls playback */
        media-gesture-receiver,
        slot[name="gestures-chrome"],
        [part~="gesture-layer"],
        media-controller::part(gesture-layer) {
          display: none !important;
          pointer-events: none !important;
        }

        /* Video ignores direct pointer events in cards so drag passes through and no accidental play occurs */
        video[slot="media"],
        ::slotted(video) {
          pointer-events: none !important;
        }

        /* Hide settings gear button & menu */
        media-settings-menu-button,
        media-settings-menu {
          display: none !important;
        }

        /* Completely disable & hide button tooltips (Pause, Play, Fullscreen, etc.) */
        media-tooltip,
        [part~="tooltip"],
        slot[name="tooltip"],
        media-play-button::part(tooltip),
        media-fullscreen-button::part(tooltip),
        media-mute-button::part(tooltip),
        media-chrome-button::part(tooltip) {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }

        /* Universal Base Controls layout (visibility/opacity driven per mode below) */
        media-control-bar {
          display: flex !important;
          visibility: visible !important;
          align-items: center !important;
          z-index: 30 !important;
        }
        media-play-button {
          display: inline-flex !important;
          visibility: visible !important;
          opacity: 1 !important;
          flex-shrink: 0 !important;
          cursor: pointer !important;
        }
        media-mute-button {
          display: inline-flex !important;
          visibility: visible !important;
          opacity: 1 !important;
          flex-shrink: 0 !important;
          cursor: pointer !important;
        }
        /* One time display only, and always the one that carries the duration.
           The theme ships <media-time-display> and <media-time-display showduration>
           and hides one per breakpoint; picking the duration variant keeps
           "current / total" visible on every card size (and H:MM:SS for long videos). */
        media-time-display {
          flex-shrink: 0 !important;
        }
        media-time-display:not([showduration]) {
          display: none !important;
        }
        media-time-display[showduration] {
          display: inline-flex !important;
        }
        media-time-range {
          display: block !important;
          flex: 1 1 auto !important;
          min-width: 44px !important;
          visibility: visible !important;
          opacity: 1 !important;
          cursor: pointer !important;
          --media-range-track-background: rgba(255, 255, 255, 0.28) !important;
          --media-range-bar-color: #ffffff !important;
        }
        media-fullscreen-button {
          display: inline-flex !important;
          visibility: visible !important;
          opacity: 1 !important;
          flex-shrink: 0 !important;
          cursor: pointer !important;
        }
        media-pip-button,
        [part~="pip-button"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* Audio and fullscreen players keep controls visible & interactive immediately */
        :host([data-audio-player="true"]) media-control-bar,
        :host([data-audio-player="true"]) media-play-button,
        :host([data-audio-player="true"]) media-mute-button,
        :host([data-audio-player="true"]) media-time-range,
        media-controller[mediaisfullscreen] media-control-bar,
        media-controller[mediaisfullscreen] media-play-button,
        media-controller[mediaisfullscreen] media-mute-button,
        media-controller[mediaisfullscreen] media-time-range,
        media-controller[mediaisfullscreen] media-fullscreen-button,
        media-controller:fullscreen media-control-bar,
        media-controller:fullscreen media-play-button,
        media-controller:fullscreen media-mute-button,
        media-controller:fullscreen media-time-range,
        media-controller:fullscreen media-fullscreen-button {
          opacity: 1 !important;
          pointer-events: auto !important;
        }

        /* Video card mode: subtle dark bottom scrim & player bar hide at idle, then fade together on hover */
        :host(:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) .media-gradient-bottom {
          display: block !important;
          visibility: visible !important;
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100% !important;
          height: clamp(68px, 38%, 104px) !important;
          z-index: 20 !important;
          opacity: 0 !important;
          transform: none !important;
          pointer-events: none !important;
          transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1) !important;
        }
        :host(:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) .media-gradient-bottom::before {
          opacity: 1 !important;
          background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.72) 0%,
            rgba(0, 0, 0, 0.36) 52%,
            rgba(0, 0, 0, 0) 100%
          ) !important;
        }
        :host(:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-control-bar {
          opacity: 0 !important;
          transform: none !important;
          pointer-events: none !important;
          transition: opacity 220ms cubic-bezier(0.22, 1, 0.36, 1) !important;
        }
        :host(:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-play-button,
        :host(:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-mute-button,
        :host(:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-time-range,
        :host(:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-fullscreen-button {
          pointer-events: none !important;
        }

        :host([data-controls-visible="true"]:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) .media-gradient-bottom,
        :host([data-controls-visible="true"]:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-control-bar {
          opacity: 1 !important;
        }
        :host([data-controls-visible="true"]:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-control-bar,
        :host([data-controls-visible="true"]:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-play-button,
        :host([data-controls-visible="true"]:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-mute-button,
        :host([data-controls-visible="true"]:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-time-range,
        :host([data-controls-visible="true"]:not([data-audio-player="true"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-fullscreen-button {
          pointer-events: auto !important;
        }

        /* Audio cards use Sutro medium controls over a transparent stage without fullscreen/cast/gradient */
        :host([data-audio-player="true"]),
        :host([data-audio-player="true"]) media-controller {
          background: transparent !important;
          --media-background-color: transparent !important;
          width: 100% !important;
          height: 100% !important;
          display: block !important;
        }
        :host([data-audio-player="true"]) .media-gradient-bottom,
        :host([data-audio-player="true"]) media-fullscreen-button,
        :host([data-audio-player="true"]) media-airplay-button,
        :host([data-audio-player="true"]) media-cast-button {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        /* 1. CARD MODE: MINI (AI Clipper Canvas, 9:16 narrow card) */
        :host([data-player-size="mini"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) {
          --base: 11px !important;
          --media-control-height: 22px !important;
          --media-font-size: 10.5px !important;
          --media-icon-height: 15px !important;
          font-size: 10.5px !important;
        }
        :host([data-player-size="mini"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-control-bar {
          height: 22px !important;
          line-height: 22px !important;
          bottom: 8px !important;
          left: 8px !important;
          right: 8px !important;
          gap: 3px !important;
        }
        :host([data-player-size="mini"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-time-range {
          height: 16px !important;
          --media-range-thumb-width: 9px !important;
          --media-range-thumb-height: 9px !important;
          --media-range-track-height: 3.5px !important;
          --media-range-bar-height: 3.5px !important;
        }
        :host([data-player-size="mini"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) .media-volume-range-wrapper {
          position: absolute !important;
          bottom: 100% !important;
          top: auto !important;
          left: 16px !important;
          width: 68px !important;
          height: 22px !important;
          padding: 0 0 13px 0 !important;
          margin: 0 !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          display: flex !important;
          align-items: flex-start !important;
          box-sizing: border-box !important;
        }
        :host([data-player-size="mini"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-volume-range {
          width: 68px !important;
          height: 9px !important;
          padding: 0 !important;
          border-radius: 4.5px !important;
          overflow: hidden !important;
          background: rgba(255, 255, 255, 0.25) !important;
          backdrop-filter: blur(8px) !important;
          border: none !important;
          box-shadow: none !important;
          --media-range-bar-color: #ffffff !important;
          --media-range-track-width: 68px !important;
          --media-range-track-height: 9px !important;
          --media-range-track-border-radius: 4.5px !important;
          --media-range-thumb-width: 0px !important;
          --media-range-thumb-opacity: 0 !important;
        }

        /* 2. CARD MODE: MEDIUM (Multi-video grid cards ~350px-450px) */
        :host([data-player-size="medium"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) {
          --base: 13px !important;
          --media-control-height: 28px !important;
          --media-font-size: 11.5px !important;
          --media-icon-height: 17px !important;
          font-size: 11.5px !important;
        }
        :host([data-player-size="medium"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-control-bar {
          height: 28px !important;
          line-height: 28px !important;
          bottom: 10px !important;
          left: 10px !important;
          right: 10px !important;
          gap: 5px !important;
        }
        :host([data-player-size="medium"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-time-range {
          height: 18px !important;
          --media-range-thumb-width: 11px !important;
          --media-range-thumb-height: 11px !important;
          --media-range-track-height: 4px !important;
          --media-range-bar-height: 4px !important;
        }
        :host([data-player-size="medium"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) .media-volume-range-wrapper {
          position: absolute !important;
          bottom: 100% !important;
          top: auto !important;
          left: 24px !important;
          width: 80px !important;
          height: 24px !important;
          padding: 0 0 14px 0 !important;
          margin: 0 !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          display: flex !important;
          align-items: flex-start !important;
          box-sizing: border-box !important;
        }
        :host([data-player-size="medium"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-volume-range {
          width: 80px !important;
          height: 10px !important;
          padding: 0 !important;
          border-radius: 5px !important;
          overflow: hidden !important;
          background: rgba(255, 255, 255, 0.25) !important;
          backdrop-filter: blur(8px) !important;
          border: none !important;
          box-shadow: none !important;
          --media-range-bar-color: #ffffff !important;
          --media-range-track-width: 80px !important;
          --media-range-track-height: 10px !important;
          --media-range-track-border-radius: 5px !important;
          --media-range-thumb-width: 0px !important;
          --media-range-thumb-opacity: 0 !important;
        }

        /* 3. CARD MODE: LARGE / DEFAULT (Single video card ~768px, like YouTube full download) */
        :host([data-player-size="large"]) media-controller:not([mediaisfullscreen]):not(:fullscreen),
        :host(:not([data-player-size="mini"]):not([data-player-size="medium"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) {
          --base: 15px !important;
          --media-control-height: 38px !important;
          --media-font-size: 13px !important;
          --media-icon-height: 20px !important;
          font-size: 13px !important;
        }
        :host([data-player-size="large"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-control-bar,
        :host(:not([data-player-size="mini"]):not([data-player-size="medium"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-control-bar {
          height: 38px !important;
          line-height: 38px !important;
          bottom: 12px !important;
          left: 14px !important;
          right: 14px !important;
          gap: 8px !important;
        }
        :host([data-player-size="large"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-time-range,
        :host(:not([data-player-size="mini"]):not([data-player-size="medium"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-time-range {
          height: 22px !important;
          --media-range-thumb-width: 13px !important;
          --media-range-thumb-height: 13px !important;
          --media-range-track-height: 4.5px !important;
          --media-range-bar-height: 4.5px !important;
        }
        :host([data-player-size="large"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) .media-volume-range-wrapper,
        :host(:not([data-player-size="mini"]):not([data-player-size="medium"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) .media-volume-range-wrapper {
          position: absolute !important;
          bottom: 100% !important;
          top: auto !important;
          left: 32px !important;
          width: 100px !important;
          height: 26px !important;
          padding: 0 0 16px 0 !important;
          margin: 0 !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          display: flex !important;
          align-items: flex-start !important;
          box-sizing: border-box !important;
        }
        :host([data-player-size="large"]) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-volume-range,
        :host(:not([data-player-size="mini"]):not([data-player-size="medium"])) media-controller:not([mediaisfullscreen]):not(:fullscreen) media-volume-range {
          width: 100px !important;
          height: 11px !important;
          padding: 0 !important;
          border-radius: 5.5px !important;
          overflow: hidden !important;
          background: rgba(255, 255, 255, 0.25) !important;
          backdrop-filter: blur(8px) !important;
          border: none !important;
          box-shadow: none !important;
          --media-range-bar-color: #ffffff !important;
          --media-range-track-width: 100px !important;
          --media-range-track-height: 11px !important;
          --media-range-track-border-radius: 5.5px !important;
          --media-range-thumb-width: 0px !important;
          --media-range-thumb-opacity: 0 !important;
        }

        /* 4. FULLSCREEN MODE (All player sizes revert to full specs) */
        media-controller[mediaisfullscreen],
        media-controller:fullscreen {
          --base: 24px !important;
          --media-control-height: 48px !important;
          --media-font-size: 16px !important;
          --media-icon-height: 24px !important;
          font-size: 16px !important;
          cursor: default !important;
        }
        media-controller[mediaisfullscreen] video[slot="media"],
        media-controller[mediaisfullscreen] ::slotted(video),
        media-controller:fullscreen video[slot="media"],
        media-controller:fullscreen ::slotted(video) {
          pointer-events: auto !important;
          cursor: default !important;
        }
        media-controller[mediaisfullscreen] media-play-button,
        media-controller[mediaisfullscreen] media-play-button *,
        media-controller[mediaisfullscreen] media-play-button::part(button),
        media-controller[mediaisfullscreen] media-mute-button,
        media-controller[mediaisfullscreen] media-mute-button *,
        media-controller[mediaisfullscreen] media-mute-button::part(button),
        media-controller[mediaisfullscreen] media-fullscreen-button,
        media-controller[mediaisfullscreen] media-fullscreen-button *,
        media-controller[mediaisfullscreen] media-fullscreen-button::part(button),
        media-controller[mediaisfullscreen] media-time-range,
        media-controller[mediaisfullscreen] media-time-range *,
        media-controller[mediaisfullscreen] media-volume-range,
        media-controller[mediaisfullscreen] media-volume-range *,
        media-controller[mediaisfullscreen] button,
        media-controller[mediaisfullscreen] button *,
        media-controller[mediaisfullscreen] [role="button"],
        media-controller[mediaisfullscreen] [role="button"] *,
        media-controller:fullscreen media-play-button,
        media-controller:fullscreen media-play-button *,
        media-controller:fullscreen media-play-button::part(button),
        media-controller:fullscreen media-mute-button,
        media-controller:fullscreen media-mute-button *,
        media-controller:fullscreen media-mute-button::part(button),
        media-controller:fullscreen media-fullscreen-button,
        media-controller:fullscreen media-fullscreen-button *,
        media-controller:fullscreen media-fullscreen-button::part(button),
        media-controller:fullscreen media-time-range,
        media-controller:fullscreen media-time-range *,
        media-controller:fullscreen media-volume-range,
        media-controller:fullscreen media-volume-range *,
        media-controller:fullscreen button,
        media-controller:fullscreen button *,
        media-controller:fullscreen [role="button"],
        media-controller:fullscreen [role="button"] * {
          cursor: pointer !important;
        }
        media-controller[mediaisfullscreen] media-control-bar,
        media-controller:fullscreen media-control-bar {
          height: 48px !important;
          line-height: 48px !important;
          bottom: 24px !important;
          left: 24px !important;
          right: 24px !important;
          gap: 10px !important;
        }
        media-controller[mediaisfullscreen] media-time-range,
        media-controller:fullscreen media-time-range {
          height: 48px !important;
          --media-range-thumb-width: 24px !important;
          --media-range-thumb-height: 24px !important;
          --media-range-track-height: 4px !important;
          --media-range-bar-height: 4px !important;
        }
        media-controller[mediaisfullscreen] .media-volume-range-wrapper,
        media-controller:fullscreen .media-volume-range-wrapper {
          position: absolute !important;
          top: -100% !important;
          bottom: auto !important;
          left: 48px !important;
          width: 240px !important;
          height: 60px !important;
          padding: 0 !important;
          margin: 0 !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          display: block !important;
          transform-origin: center left !important;
        }
        media-controller[mediaisfullscreen] media-volume-range,
        media-controller:fullscreen media-volume-range {
          width: 240px !important;
          height: 24px !important;
          padding: 0 !important;
          border-radius: 6px !important;
          overflow: hidden !important;
          background: rgba(0, 0, 0, 0.3) !important;
          backdrop-filter: blur(10px) brightness(80%) !important;
          border: none !important;
          box-shadow: none !important;
          --media-range-bar-color: #ffffff !important;
          --media-range-track-width: 240px !important;
          --media-range-track-height: 24px !important;
          --media-range-track-border-radius: 6px !important;
          --media-range-thumb-width: 24px !important;
          --media-range-thumb-opacity: 0 !important;
        }
        media-controller[mediaisfullscreen] media-time-display,
        media-controller:fullscreen media-time-display {
          padding: 12px !important;
          font-size: 16px !important;
          border-radius: 8px !important;
        }
      `;
      player.shadowRoot.appendChild(st);
    }
    player.querySelectorAll('video').forEach(v => {
      try {
        v.disablePictureInPicture = true;
      } catch (e) {}
      v.setAttribute('disablepictureinpicture', '');
      v.setAttribute('controlslist', 'nodownload nopictureinpicture');
    });
    player.shadowRoot.querySelectorAll('media-play-button, media-fullscreen-button, media-mute-button, media-chrome-button, .media-button, media-time-range, media-volume-range').forEach(btn => {
      btn.setAttribute('notooltip', '');
      btn.style.setProperty('cursor', 'pointer', 'important');
      if (btn.shadowRoot) {
        const tt = btn.shadowRoot.querySelectorAll('media-tooltip, slot[name="tooltip"], [part~="tooltip"]');
        tt.forEach(el => el.style.setProperty('display', 'none', 'important'));
        if (!btn.shadowRoot.querySelector('#pointer-cursor-override')) {
          const ptrStyle = document.createElement('style');
          ptrStyle.id = 'pointer-cursor-override';
          ptrStyle.textContent = ':host, button, [part~="button"], svg, path { cursor: pointer !important; }';
          btn.shadowRoot.appendChild(ptrStyle);
        }
      }
    });
    if (player.shadowRoot) {
      player.shadowRoot.querySelectorAll('media-controller').forEach(ctrl => {
        ctrl.setAttribute('gesturesdisabled', '');
      });
      player.shadowRoot.querySelectorAll('media-gesture-receiver').forEach(mgr => {
        mgr.style.setProperty('display', 'none', 'important');
        mgr.style.setProperty('pointer-events', 'none', 'important');
      });
    }
    player.shadowRoot.querySelectorAll('media-pip-button, [part~="pip-button"]').forEach(btn => {
      btn.style.setProperty('display', 'none', 'important');
    });
  });
};

// Global listener: Sync fullscreen state to media-theme-sutro and body
document.addEventListener('fullscreenchange', () => {
  const isAnyFs = !!document.fullscreenElement;
  document.body.classList.toggle('is-in-fullscreen', isAnyFs);
  document.querySelectorAll('media-theme-sutro').forEach(player => {
    const isFs = !!(document.fullscreenElement && (
      document.fullscreenElement === player ||
      player.contains(document.fullscreenElement) ||
      (player.shadowRoot && player.shadowRoot.contains(document.fullscreenElement))
    ));
    if (isFs) {
      player.setAttribute('mediaisfullscreen', '');
    } else {
      player.removeAttribute('mediaisfullscreen');
      const wrapper = player.closest('.video-preview-wrapper');
      if (wrapper && wrapper.matches && !wrapper.matches(':hover')) {
        cancelVideoControlsHideTimer(wrapper);
        setVideoWrapperControlsVisible(wrapper, false);
      }
    }
  });
});

// Global listener: Pause other media when one video starts playing
document.addEventListener('play', (e) => {
  if (e.target && e.target.tagName === 'VIDEO') {
    document.querySelectorAll('video').forEach(v => {
      if (v !== e.target && !v.paused) {
        v.pause();
      }
    });
    if (currentlyPlayingAudioId) {
      const otherEl = document.getElementById(`audio-el-${currentlyPlayingAudioId}`);
      if (otherEl) otherEl.pause();
      currentlyPlayingAudioId = null;
      lucide.createIcons();
    }
  }
}, true);

// AI Clipper flowchart workspace engine
const clipperNodeOffsets = {};

function isAiClipperProject(proj) {
  if (!proj) return false;
  const act = (proj.action || '').toLowerCase();
  const cat = (proj.category || '').toLowerCase();
  const name = (proj.workspace_name || '').toLowerCase();
  const isActClip = act.includes('ai_clip') || act.includes('clipper') || act.includes('yt_clip') || act.includes('trim');
  const isCatClip = cat.includes('01-ai-clips') || cat.includes('ai-clip') || cat.includes('trim');
  const hasClipFiles = (proj.files || []).some(f =>
    (f.category || '').toLowerCase().includes('01-ai-clips') ||
    (f.action || '').toLowerCase().includes('ai_clip') ||
    (f.action || '').toLowerCase().includes('yt_clip') ||
    (f.filename || '').toLowerCase().includes('virality') ||
    (f.filename || '').toLowerCase().includes('clip')
  );
  return isActClip || isCatClip || hasClipFiles;
}

const FLOW_SKY = "#a1a1aa";
const FLOW_TEAL = "#a1a1aa";
const FLOW_AMBER = "#f59e0b";
const FLOW_ROSE = "#f43f5e";
const FLOW_EMERALD = "#ffffff";

function flowMix(hue, pct, base = "#171717") {
  return `color-mix(in srgb, ${hue} ${pct}%, ${base})`;
}

window.resetClipperCanvasLayout = function () {
  for (const k in clipperNodeOffsets) {
    delete clipperNodeOffsets[k];
  }
  document.querySelectorAll('.clipper-flow-node').forEach(el => {
    el.style.transform = '';
  });
  drawClipperConnectors();
};

function initClipperDraggable(nodeEl) {
  if (!nodeEl) return;
  const savedOffset = clipperNodeOffsets[nodeEl.id];
  if (savedOffset) {
    nodeEl.style.transform = `translate(${savedOffset.dx}px, ${savedOffset.dy}px)`;
  }
  let isDragging = false;
  let startX = 0, startY = 0;
  let initialDx = 0, initialDy = 0;
  let hasMoved = false;

  nodeEl.addEventListener('pointerdown', (e) => {
    if (vaultFileSelectionMode && nodeEl.classList.contains('clipper-branch-clip')) {
      return;
    }
    // Do not drag if currently in fullscreen
    if (document.fullscreenElement || nodeEl.hasAttribute('mediaisfullscreen') || nodeEl.querySelector('[mediaisfullscreen]')) {
      return;
    }

    // Only ignore interactive elements (buttons, links, form inputs, video player, or media control bar)
    const path = e.composedPath ? e.composedPath() : [e.target];
    const isInteractive = path.some(el => {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'video') return true;
      if (tag.startsWith('media-')) return true;
      if (el.hasAttribute && el.hasAttribute('data-no-drag')) return true;
      if (el.classList && (el.classList.contains('caption-popover') || el.classList.contains('video-preview-wrapper') || el.classList.contains('glass-caption-popover'))) return true;
      return false;
    });
    if (isInteractive) return;

    e.preventDefault();
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    startY = e.clientY;

    const currentOffset = clipperNodeOffsets[nodeEl.id] || { dx: 0, dy: 0 };
    initialDx = currentOffset.dx;
    initialDy = currentOffset.dy;

    try { nodeEl.setPointerCapture(e.pointerId); } catch (_) {}
    nodeEl.classList.add('z-30', 'shadow-2xl', 'cursor-grabbing');
  });

  nodeEl.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (dist > 3) hasMoved = true;
    const totalZoom = clipperZoom * getLunaUiScale();
    const dx = initialDx + (e.clientX - startX) / totalZoom;
    const dy = initialDy + (e.clientY - startY) / totalZoom;
    clipperNodeOffsets[nodeEl.id] = { dx, dy };
    nodeEl.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(drawClipperConnectors);
  });

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try { nodeEl.releasePointerCapture(e.pointerId); } catch (_) {}
    nodeEl.classList.remove('z-30', 'cursor-grabbing');
    if (hasMoved) {
      const killClick = (ce) => {
        ce.stopPropagation();
        ce.preventDefault();
      };
      window.addEventListener('click', killClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', killClick, { capture: true }), 120);
    }
    drawClipperConnectors();
  };

  nodeEl.addEventListener('pointerup', endDrag);
  nodeEl.addEventListener('pointercancel', endDrag);
}

function drawClipperConnectors() {
  const svg = document.getElementById('clipperFlowSvg');
  const scrollCanvas = document.getElementById('clipperScrollCanvas');
  if (!svg || !scrollCanvas) return;

  const totalW = Math.max(scrollCanvas.scrollWidth, scrollCanvas.offsetWidth, 4000);
  const totalH = Math.max(scrollCanvas.scrollHeight, scrollCanvas.offsetHeight, 4000);
  svg.setAttribute('width', totalW);
  svg.setAttribute('height', totalH);
  svg.style.overflow = 'visible';

  // Clean SVG canvas
  svg.innerHTML = '';

  function getNodeBox(el) {
    const totalZoom = clipperZoom * getLunaUiScale();
    const canvasRect = scrollCanvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - canvasRect.left) / totalZoom,
      y: (r.top - canvasRect.top) / totalZoom,
      w: r.width / totalZoom,
      h: r.height / totalZoom
    };
  }

  function drawN8nConnection(elA, elB) {
    if (!elA || !elB) return;
    const boxA = getNodeBox(elA);
    const boxB = getNodeBox(elB);

    // Validation guard: only draw when cards are actively rendered with valid dimensions
    if (!boxA.w || !boxB.w || boxA.w < 50 || boxB.w < 50) return;
    if (boxA.x < 15 && boxB.x < 15) return;

    // Header level anchor for all cards (clean 18px offset from card top)
    const anchorA = boxA.y + 18;
    const anchorB = boxB.y + 18;

    // FIXED PORTS: Output is ALWAYS on the right edge of A, Input is ALWAYS on the left edge of B
    // Ports never switch to other sides of cards.
    const p1 = { x: boxA.x + boxA.w, y: anchorA };
    const p2 = { x: boxB.x, y: anchorB };

    const dx = p2.x - p1.x;
    let d;

    if (dx >= -10) {
      // Normal horizontal forward flow
      const k = Math.min(Math.max(dx * 0.52, 40), 220);
      d = `M ${p1.x} ${p1.y} C ${p1.x + k} ${p1.y}, ${p2.x - k} ${p2.y}, ${p2.x} ${p2.y}`;
    } else {
      // Opposite direction (user dragged target to the left / backward):
      // Smoothly loops out of A's right port and enters B's left port from behind, exactly like n8n
      const loopDist = Math.max(Math.abs(dx) * 0.45, 60);
      d = `M ${p1.x} ${p1.y} C ${p1.x + loopDist} ${p1.y}, ${p2.x - loopDist} ${p2.y}, ${p2.x} ${p2.y}`;
    }

    // Connection path with a clean hairline stroke.
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'rgba(255, 255, 255, 0.28)');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-opacity', '0.75');
    path.classList.add('flow-connector-path');
    svg.appendChild(path);
  }

  const triggerEl = document.getElementById('node-trigger');
  const pipelineEl = document.getElementById('node-pipeline-engine');
  const clipNodes = document.querySelectorAll('.clipper-branch-clip');

  if (triggerEl && pipelineEl) {
    drawN8nConnection(triggerEl, pipelineEl);
    clipNodes.forEach(cn => {
      drawN8nConnection(pipelineEl, cn);
    });
  } else if (triggerEl && clipNodes.length > 0) {
    clipNodes.forEach(cn => {
      drawN8nConnection(triggerEl, cn);
    });
  }
}

window.toggleClipCaption = function (idx, event) {
  if (vaultFileSelectionMode) return;
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const popover = document.getElementById(`clip-caption-popover-${idx}`);
  const node = document.getElementById(`clip-node-${idx}`);
  if (!popover) return;
  const isOpen = popover.classList.contains('is-open');

  closeAllClipCaptions();

  if (!isOpen) {
    const trigger = node ? node.querySelector('.caption-trigger-row') : null;
    if (trigger && node) {
      let top = 0;
      let curr = trigger;
      let found = false;
      while (curr && curr !== node) {
        top += curr.offsetTop;
        curr = curr.offsetParent;
        if (curr === node) {
          found = true;
          break;
        }
      }
      if (!found) {
        const nodeRect = node.getBoundingClientRect();
        const triggerRect = trigger.getBoundingClientRect();
        const zoom = (typeof clipperZoom === 'number' && clipperZoom > 0) ? clipperZoom : 1;
        top = (triggerRect.top - nodeRect.top) / (zoom * getLunaUiScale());
      }
      const triggerCenterY = top + (trigger.offsetHeight / 2);
      popover.style.top = `${Math.round(triggerCenterY)}px`;
    }
    popover.classList.add('is-open');
    if (node) {
      node.classList.add('caption-open');
      node.style.zIndex = '45';
      const trigger = node.querySelector('.caption-trigger-row');
      if (trigger) trigger.classList.add('is-open');
    }
    lucide.createIcons({ root: popover });
  }
};

window.closeClipCaption = function (idx) {
  const popover = document.getElementById(`clip-caption-popover-${idx}`);
  const node = document.getElementById(`clip-node-${idx}`);
  if (popover) popover.classList.remove('is-open');
  if (node) {
    node.classList.remove('caption-open');
    node.style.zIndex = '';
    const trigger = node.querySelector('.caption-trigger-row');
    if (trigger) trigger.classList.remove('is-open');
  }
};

window.closeAllClipCaptions = function () {
  document.querySelectorAll('.glass-caption-popover.is-open').forEach(p => {
    p.classList.remove('is-open');
  });
  document.querySelectorAll('.clipper-branch-clip.caption-open').forEach(n => {
    n.classList.remove('caption-open');
    n.style.zIndex = '';
    const trigger = n.querySelector('.caption-trigger-row');
    if (trigger) trigger.classList.remove('is-open');
  });
};

window.copyClipCaption = function (idx, btn, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const file = clipperFilesCache && clipperFilesCache[idx];
  if (!file || !file.caption) return;
  navigator.clipboard.writeText(file.caption.trim()).then(() => {
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i>';
    lucide.createIcons({ root: btn });
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      lucide.createIcons({ root: btn });
    }, 1500);
  });
};

// Backward-compatibility aliases
window.openMorphingCaptionModal = function (idx) {
  toggleClipCaption(idx);
};
window.closeMorphingCaptionModal = function () {
  closeAllClipCaptions();
};

document.addEventListener('pointerdown', function (e) {
  if (!e.target.closest('.glass-caption-popover') && !e.target.closest('.caption-trigger-row')) {
    closeAllClipCaptions();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeAllClipCaptions();
  }
});

function renderClipperWorkflow(proj) {
  const nodesWrapper = document.getElementById('clipperCanvasNodesWrapper');
  if (!nodesWrapper) return;
  closeVaultCardMenu();
  nodesWrapper.innerHTML = '';

  const files = proj.files || [];
  clipperFilesCache = files;

  const sourceTitle = proj.source_title ? escapeHtml(proj.source_title) : (files[0] && files[0].title ? escapeHtml(files[0].title) : 'Source Video');
  const titleLower = String(proj.source_title || proj.workspace_name || '').toLowerCase();

  // Source Channel / Creator extraction (pure factual extraction)
  let rawChannel = proj.channel || proj.source_channel || proj.uploader || '';
  if (!rawChannel) {
    rawChannel = 'YouTube';
  }
  const sourceChannel = escapeHtml(rawChannel);

  // Source URL extraction: NEVER accept local paths or /media-vault/ as valid YouTube link
  let rawUrl = '';
  if (proj.source_url && (proj.source_url.startsWith('http://') || proj.source_url.startsWith('https://'))) {
    rawUrl = proj.source_url;
  } else if (proj.url && (proj.url.startsWith('http://') || proj.url.startsWith('https://'))) {
    rawUrl = proj.url;
  }

  let displayUrl = rawUrl;
  try {
    const parsed = new URL(rawUrl);
    displayUrl = parsed.hostname.replace(/^www\./, '') + (parsed.pathname !== '/' ? parsed.pathname : '') + parsed.search;
  } catch (e) {
    displayUrl = rawUrl.replace(/^https?:\/\/(www\.)?/, '');
  }
  if (displayUrl.length > 26) {
    displayUrl = displayUrl.substring(0, 24) + '...';
  }

  const sourceLinkHtml = rawUrl
    ? `<a href="${encodeURI(rawUrl)}" target="_blank" rel="noopener noreferrer" class="block text-[11px] font-medium text-white hover:text-white leading-tight truncate mt-0.5 hover:underline" data-no-drag="true">
            ${escapeHtml(displayUrl)}
          </a>`
    : `<span class="block text-[11px] font-medium text-zinc-500 leading-tight truncate mt-0.5">Source unavailable</span>`;

  // NODE 1: Trigger Node / Source Input (Exact matching dimensions: w-[224px] h-[238px])
  const triggerNode = document.createElement('div');
  triggerNode.id = 'node-trigger';
  triggerNode.className = 'clipper-flow-node flex flex-col items-start w-[224px] shrink-0 cursor-grab active:cursor-grabbing select-none';
  triggerNode.setAttribute('data-node-id', 'node-trigger');

  triggerNode.innerHTML = `
    <div class="w-full h-[238px] rounded-[14px] bg-[#171717] border border-white/[0.08] shadow-[0_6px_18px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between">
      <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
        <span class="text-[10px] font-semibold text-zinc-300 font-mono">Source</span>
        <span class="text-[9.5px] font-mono text-zinc-400 font-medium">Ingested</span>
      </div>
      <div class="divide-y divide-white/[0.04] flex-1 flex flex-col justify-between">
        <div class="px-3.5 py-2 flex flex-col justify-center flex-1">
          <span class="block text-[9px] text-zinc-500 font-mono leading-tight">Input Video</span>
          <span class="block text-[11px] font-medium text-white leading-tight truncate mt-0.5">${sourceTitle}</span>
        </div>
        <div class="px-3.5 py-2 flex flex-col justify-center flex-1">
          <span class="block text-[9px] text-zinc-500 font-mono leading-tight">Channel / Source</span>
          <span class="block text-[11px] font-medium text-white leading-tight truncate mt-0.5">${sourceChannel}</span>
        </div>
        <div class="px-3.5 py-2 flex flex-col justify-center flex-1">
          <span class="block text-[9px] text-zinc-500 font-mono leading-tight">Link YouTube</span>
          ${sourceLinkHtml}
        </div>
        <div class="px-3.5 py-2.5 flex flex-col justify-center flex-1">
          <span class="block text-[9px] text-zinc-500 font-mono leading-tight">Total Clips</span>
          <span class="block text-[11px] font-medium text-white leading-tight mt-0.5">${files.length} Clips</span>
        </div>
      </div>
    </div>
  `;
  initClipperDraggable(triggerNode);
  nodesWrapper.appendChild(triggerNode);

  // NODE 2: Pipeline Engine Node (Exact matching dimensions: w-[224px] h-[238px])
  const pipelineNode = document.createElement('div');
  pipelineNode.id = 'node-pipeline-engine';
  pipelineNode.className = 'clipper-flow-node flex flex-col items-start w-[224px] shrink-0 cursor-grab active:cursor-grabbing select-none';
  pipelineNode.setAttribute('data-node-id', 'node-pipeline-engine');

  // Aspect ratio extraction (real data from project or files, never fake face tracking)
  let detectedRatio = proj.aspect_ratio || proj.crop_ratio || '';
  if (!detectedRatio && files && files.length > 0) {
    detectedRatio = files[0].aspect_ratio || files[0].ratio || '';
  }
  if (!detectedRatio) {
    detectedRatio = window.selectedRatio || '9:16';
  }
  detectedRatio = String(detectedRatio).trim();

  const isTrimProject = (proj.action === 'type_yt_clip' || proj.action === 'manual_clip' || (proj.category || '').includes('trim'));
  const transcribeProvider = proj.transcribe_provider || 'Groq Cloud Whisper';
  const microSteps = isTrimProject ? [
    { label: 'Download', sub: 'yt-dlp' },
    { label: 'Engine', sub: 'Video Trimmer' },
    { label: 'Crop Ratio', sub: detectedRatio || 'Original' },
    { label: 'Segments', sub: `${files.length} Clips` }
  ] : [
    { label: 'Download', sub: 'yt-dlp' },
    { label: 'Transcribe', sub: transcribeProvider },
    { label: 'Virality LLM', sub: 'AI Ranking' },
    { label: 'Crop Ratio', sub: detectedRatio }
  ];

  const checkmarkHtml = `
    <span class="text-emerald-400 shrink-0">
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
    </span>
  `;

  const stepsHtml = microSteps.map((s, i) => `
    <div class="flex items-center justify-between px-3.5 py-2.5 flex-1 ${i < microSteps.length - 1 ? 'border-b border-white/[0.04]' : ''}">
      <div class="min-w-0 flex-1">
        <span class="block text-[9px] text-zinc-500 font-mono leading-tight">${s.label}</span>
        <span class="block text-[11px] font-medium text-white leading-tight mt-0.5">${s.sub}</span>
      </div>
      ${checkmarkHtml}
    </div>
  `).join('');

  pipelineNode.innerHTML = `
    <div class="w-full h-[238px] rounded-[14px] bg-[#171717] border border-white/[0.08] shadow-[0_6px_18px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between">
      <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
        <span class="text-[10px] font-semibold text-zinc-300 font-mono">${isTrimProject ? "Trim Pipeline" : "AI Pipeline"}</span>
        <span class="text-[9.5px] font-mono text-zinc-400 font-medium">Task</span>
      </div>
      <div class="divide-y divide-white/[0.04] flex-1 flex flex-col justify-between">
        ${stepsHtml}
      </div>
    </div>
  `;
  initClipperDraggable(pipelineNode);
  nodesWrapper.appendChild(pipelineNode);

  // NODE 3+: Branching Output Clip Cards (Vertical Column)
  const clipsCol = document.createElement('div');
  clipsCol.id = 'clipperBranchingClipsWrapper';
  clipsCol.className = 'flex flex-col gap-6 shrink-0 ml-20 sm:ml-28';

  if (files.length === 0) {
    const emptyNode = document.createElement('div');
    emptyNode.className = 'clipper-flow-node flex flex-col items-start w-[245px] shrink-0';
    emptyNode.innerHTML = `
      <div class="w-full rounded-[14px] bg-[#171717] border border-white/[0.08] p-4 text-center text-[11px] text-zinc-400">
        No clips have finished rendering yet.
      </div>
    `;
    clipsCol.appendChild(emptyNode);
  } else {
    files.forEach((file, idx) => {
      const clipNode = document.createElement('div');
      clipNode.id = `clip-node-${idx}`;
      clipNode.className = 'clipper-flow-node clipper-branch-clip relative flex flex-col items-start w-[245px] shrink-0 cursor-grab active:cursor-grabbing select-none';
      clipNode.setAttribute('data-node-id', `clip-node-${idx}`);

      const score = file.score || 90;
      const rawMediaUrl = file.url || (file.relative_path ? `/media-vault/${file.relative_path.replace(/\\/g, '/')}` : '#');
      const mediaUrl = encodeMediaUrl(rawMediaUrl);
      const downloadUrl = file.download_url ? encodeMediaUrl(file.download_url) : mediaUrl;
      const clipTitle = file.title || `Clip #${idx + 1}`;
      const escapedTitle = escapeHtml(clipTitle);

      const hasCaption = !isTrimProject && Boolean(file.caption && file.caption.trim());
      const captionSnippet = hasCaption ? escapeHtml(file.caption.trim()) : '';

      const captionTrigger = hasCaption ? `
        <div class="caption-trigger-row group/caption flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg mx-1 mb-1 cursor-pointer" onclick="toggleClipCaption(${idx}, event)" data-no-drag="true">
          <p class="text-[10px] text-zinc-400 group-hover/caption:text-zinc-200 leading-normal truncate flex-1 min-w-0 transition-colors select-none">${captionSnippet}</p>
          <button type="button" onclick="copyClipCaption(${idx}, this, event)" class="caption-copy-btn p-1 rounded-md text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0" aria-label="Copy caption">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      ` : '';

      const captionPopover = hasCaption ? `
        <div id="clip-caption-popover-${idx}" class="glass-caption-popover absolute left-[calc(100%+12px)] z-50 w-[280px] rounded-[14px] bg-[#171717] border border-white/[0.08] shadow-[0_16px_36px_rgba(0,0,0,0.75)] text-left overflow-hidden" data-no-drag="true" onclick="event.stopPropagation()">
          <div class="max-h-[260px] overflow-y-auto pr-0.5 text-[11.5px] leading-[1.6] text-zinc-200 font-sans select-all text-left whitespace-pre-line break-words">${escapeHtml(file.caption.trim())}</div>
        </div>
      ` : '';

      clipNode.innerHTML = `
        ${captionPopover}
        <div id="vault-card-${file.id}" data-file-id="${file.id}" class="vault-file-card w-full rounded-[14px] bg-[#171717] border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col relative">
          <span class="vault-card-check" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 8.5L6.75 11L12 5.5"></path>
            </svg>
          </span>
          <!-- Video Preview Area (Starts directly at top of card, no header bar above) -->
          <div class="video-preview-wrapper relative bg-black w-full overflow-hidden border-b border-white/[0.06]" style="aspect-ratio: 9/16; max-height: 230px;" data-file-id="${file.id}">
            <media-theme-sutro style="width:100%; height:100%;" data-player-size="mini" disabled>
              <video
                slot="media"
                preload="metadata"
                playsinline
                disablepictureinpicture
                controlslist="nodownload nopictureinpicture"
                src="${mediaUrl}"
                style="width:100%; height:100%; object-fit:contain; pointer-events:none;">
              </video>
            </media-theme-sutro>
          </div>

          <div class="px-3 pt-2.5 pb-1">
            <h4 id="clip-title-${file.id}" class="text-[11px] font-semibold text-white line-clamp-1 leading-snug">${escapedTitle}</h4>
          </div>

          ${captionTrigger}

          <!-- Bottom Bar: Info on Left, Compact Action Icons on Right -->
          <div class="flex items-center justify-between gap-3 px-3 pb-3 pt-2 border-t border-white/[0.04]">
            <div class="min-w-0 flex-1 flex flex-col justify-center">
              ${isTrimProject ? `
                <span class="text-[11px] font-semibold text-white tracking-tight leading-tight">Clip #${idx + 1}</span>
                <span class="text-[10px] font-mono text-zinc-400 leading-tight mt-0.5">${escapeHtml(file.start_time || '00:00')} - ${escapeHtml(file.end_time || '00:30')}</span>
              ` : `
                <span class="text-[11px] font-semibold text-white tracking-tight leading-tight">Score ${score}%</span>
                <span class="text-[10px] font-mono text-zinc-400 leading-tight mt-0.5">Clip #${idx + 1}</span>
              `}
            </div>
            <div class="vault-file-actions flex items-center gap-1.5 shrink-0" data-no-drag="true">
              <button type="button" class="t-card-btn-more" data-file-menu-id="${file.id}" data-no-drag="true" onclick="toggleFileCardMenu('${file.id}', this, event)" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">
                <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <circle cx="8" cy="3.5" r="1.2"></circle>
                  <circle cx="8" cy="8" r="1.2"></circle>
                  <circle cx="8" cy="12.5" r="1.2"></circle>
                </svg>
              </button>
              <span class="vault-card-action-sep" aria-hidden="true"></span>
              <a href="${escapeHtml(downloadUrl)}" download="${escapeHtml(file.filename || `clip_${idx + 1}.mp4`)}" class="luna-download-icon-link" data-no-drag="true" aria-label="Download Clip">
                <i data-lucide="download" class="w-4 h-4"></i>
              </a>
            </div>
          </div>
        </div>
      `;
      const innerCard = clipNode.querySelector('.vault-file-card');
      if (innerCard) {
        innerCard.addEventListener('click', (e) => {
          if (!vaultFileSelectionMode) return;
          if (e.target.closest('.vault-file-actions')) return;
          e.preventDefault();
          e.stopPropagation();
          toggleVaultFileSelection(file.id);
        });
      }
      const clipVid = clipNode.querySelector('video');
      if (clipVid) {
        try { clipVid.disablePictureInPicture = true; } catch (e) {}
        attachMediaRecovery(clipVid);
      }
      initClipperDraggable(clipNode);
      clipsCol.appendChild(clipNode);
    });
  }
  nodesWrapper.appendChild(clipsCol);

  initVideoHoverPlayers(nodesWrapper);
  lucide.createIcons();
  syncFileSelectionUI();

  setTimeout(compactSutroPlayers, 30);
  setTimeout(compactSutroPlayers, 150);
  setTimeout(compactSutroPlayers, 500);

  setTimeout(drawClipperConnectors, 40);
  setTimeout(drawClipperConnectors, 200);
}

// Canvas pan + zoom via CSS transform (translate + scale)
let clipperPanX = 0, clipperPanY = 0, clipperZoom = 1;

(function initClipperCanvasControls() {
  let viewport = null;
  let scrollCanvas = null;
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let panOriginX = 0, panOriginY = 0;

  function getRefs() {
    if (!viewport) {
      viewport = document.getElementById('clipperCanvasViewport');
      if (viewport && !viewport.dataset.menuScrollBound) {
        viewport.dataset.menuScrollBound = '1';
        viewport.addEventListener('scroll', () => {
          if (typeof vaultCardMenuAnchor !== 'undefined' && vaultCardMenuAnchor) closeVaultCardMenu();
        }, { passive: true });
      }
    }
    if (!scrollCanvas) scrollCanvas = document.getElementById('clipperScrollCanvas');
    return viewport;
  }

  function isVisible() {
    const vp = getRefs();
    return vp && vp.style.display !== 'none' && vp.offsetWidth > 0;
  }

  function applyTransform() {
    if (!scrollCanvas) return;
    scrollCanvas.style.transform = `translate(${clipperPanX}px, ${clipperPanY}px) scale(${clipperZoom})`;
    scrollCanvas.style.transformOrigin = '0 0';
    const label = document.getElementById('clipperZoomLabel');
    if (label) label.innerText = Math.round(clipperZoom * 100) + '%';
  }

  // Pan: click empty canvas → cursor becomes hand → drag to move
  document.addEventListener('pointerdown', function (e) {
    if (!isVisible()) return;
    if (!viewport.contains(e.target)) return;
    if (e.target.closest('.clipper-flow-node, button, a, video, media-theme-sutro, input, select, textarea, [data-no-drag]')) return;
    closeVaultCardMenu();
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = clipperPanX;
    panOriginY = clipperPanY;
    viewport.classList.add('is-panning');
    e.preventDefault();
  });

  // Spotlight Tracking
  let spotlightRaf = null;

  document.addEventListener('pointermove', function (e) {
    if (!isVisible()) return;
    const vp = getRefs();

    // Spotlight cursor position tracking
    const uiZoom = getLunaUiScale();
    if (vp) {
      const rect = vp.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        const mx = (e.clientX - rect.left) / uiZoom;
        const my = (e.clientY - rect.top) / uiZoom;
        if (spotlightRaf) cancelAnimationFrame(spotlightRaf);
        spotlightRaf = requestAnimationFrame(function () {
          vp.style.setProperty('--mouse-x', mx + 'px');
          vp.style.setProperty('--mouse-y', my + 'px');
          vp.style.setProperty('--hero-spotlight-opacity', '1');
        });
      } else {
        vp.style.setProperty('--hero-spotlight-opacity', '0');
      }
    }

    if (!isPanning) return;
    clipperPanX = panOriginX + (e.clientX - panStartX) / uiZoom;
    clipperPanY = panOriginY + (e.clientY - panStartY) / uiZoom;
    applyTransform();
  });

  document.addEventListener('pointerleave', function () {
    const vp = getRefs();
    if (vp) vp.style.setProperty('--hero-spotlight-opacity', '0');
  });

  document.addEventListener('pointerup', function () {
    if (!isPanning) return;
    isPanning = false;
    if (viewport) viewport.classList.remove('is-panning');
  });

  // Zoom: Ctrl+scroll or pinch: zooms toward cursor position
  document.addEventListener('wheel', function (e) {
    if (!isVisible()) return;
    if (!viewport.contains(e.target)) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();

    const uiZoom = getLunaUiScale();
    const rect = viewport.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / uiZoom;
    const my = (e.clientY - rect.top) / uiZoom;

    const oldZoom = clipperZoom;
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    clipperZoom = Math.min(Math.max(clipperZoom + delta, 0.3), 2.5);
    closeVaultCardMenu();

    // Adjust pan so zoom centers on cursor
    const ratio = clipperZoom / oldZoom;
    clipperPanX = mx - ratio * (mx - clipperPanX);
    clipperPanY = my - ratio * (my - clipperPanY);

    applyTransform();
    setTimeout(drawClipperConnectors, 20);
  }, { passive: false });

  window.clipperZoomIn = function () {
    closeVaultCardMenu();
    getRefs();
    const uiZoom = getLunaUiScale();
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width / (2 * uiZoom), cy = rect.height / (2 * uiZoom);
    const oldZoom = clipperZoom;
    clipperZoom = Math.min(clipperZoom + 0.15, 2.5);
    const ratio = clipperZoom / oldZoom;
    clipperPanX = cx - ratio * (cx - clipperPanX);
    clipperPanY = cy - ratio * (cy - clipperPanY);
    applyTransform();
    setTimeout(drawClipperConnectors, 20);
  };
  window.clipperZoomOut = function () {
    closeVaultCardMenu();
    getRefs();
    const uiZoom = getLunaUiScale();
    const rect = viewport.getBoundingClientRect();
    const cx = rect.width / (2 * uiZoom), cy = rect.height / (2 * uiZoom);
    const oldZoom = clipperZoom;
    clipperZoom = Math.max(clipperZoom - 0.15, 0.3);
    const ratio = clipperZoom / oldZoom;
    clipperPanX = cx - ratio * (cx - clipperPanX);
    clipperPanY = cy - ratio * (cy - clipperPanY);
    applyTransform();
    setTimeout(drawClipperConnectors, 20);
  };
  window.clipperZoomReset = function () {
    closeVaultCardMenu();
    getRefs();
    clipperZoom = 1;
    clipperPanX = 0;
    clipperPanY = 0;
    applyTransform();
    setTimeout(drawClipperConnectors, 20);
  };
})();

window.currentVaultMediaFilter = 'all';

window.updateVaultFilterCounters = function () {
  const grid = document.getElementById('projectFilesGrid');
  if (!grid) return;
  const allCards = grid.querySelectorAll('[data-media-type]');
  let landscapeCount = 0;
  let portraitCount = 0;
  let squareCount = 0;
  allCards.forEach(c => {
    const type = c.getAttribute('data-media-type');
    if (type === 'audio') return;  // audio is not a video orientation
    if (type === 'portrait') portraitCount++;
    else if (type === 'square') squareCount++;
    else landscapeCount++;
  });
  const cAll = document.getElementById('filterCountAll');
  const cLand = document.getElementById('filterCountLandscape');
  const cPort = document.getElementById('filterCountPortrait');
  const cSquare = document.getElementById('filterCountSquare');
  if (cAll) cAll.innerText = allCards.length;
  if (cLand) cLand.innerText = landscapeCount;
  if (cPort) cPort.innerText = portraitCount;
  if (cSquare) cSquare.innerText = squareCount;

  requestAnimationFrame(() => {
    setVaultMediaFilter(window.currentVaultMediaFilter || 'all', false);
  });
};

window.setVaultMediaFilter = function (filterType, immediate = false) {
  window.currentVaultMediaFilter = filterType;
  const filterGroup = document.getElementById('vaultMediaFilterGroup');
  const pill = document.getElementById('vaultMediaFilterPill');

  if (filterGroup) {
    const tabs = filterGroup.querySelectorAll('.t-tab');
    let activeTab = null;
    tabs.forEach(btn => {
      const isSelected = btn.id === `btn-vault-filter-${filterType}`;
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.classList.toggle('active', isSelected);
      if (isSelected) activeTab = btn;
    });

    if (activeTab && pill) {
      if (immediate) {
        pill.style.transition = 'none';
        pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
        pill.style.width = `${activeTab.offsetWidth}px`;
        void pill.offsetHeight;
        pill.style.transition = '';
      } else {
        pill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
        pill.style.width = `${activeTab.offsetWidth}px`;
      }
    }
  }

  const grid = document.getElementById('projectFilesGrid');
  if (!grid) return;
  const cards = grid.querySelectorAll('[data-media-type]');
  let visible = 0;
  cards.forEach(card => {
    const type = card.getAttribute('data-media-type') || 'landscape';
    if (filterType === 'all' || type === filterType) {
      card.classList.remove('hidden');
      visible++;
    } else {
      card.classList.add('hidden');
    }
  });
  const visibleCountEl = document.getElementById('vaultVisibleFileCount');
  if (visibleCountEl) {
    visibleCountEl.innerText = `${visible} files shown`;
  }
};

window.addEventListener('resize', () => {
  if (typeof setVaultMediaFilter === 'function') {
    const group = document.getElementById('vaultMediaFilterGroup');
    if (group && !group.closest('.hidden')) {
      setVaultMediaFilter(window.currentVaultMediaFilter || 'all', true);
    }
  }
});

function renderProjectFiles(proj) {
  closeVaultCardMenu();
  const grid = document.getElementById('projectFilesGrid');
  const emptyState = document.getElementById('projectFilesEmptyState');
  if (!grid) return;
  grid.innerHTML = '';

  const files = proj.files || [];
  if (files.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    updateVaultFilterCounters();
    syncFileSelectionUI();
    return;
  }
  if (emptyState) emptyState.classList.add('hidden');

  const isPortraitWorkspace = proj.platform === 'tiktok' || proj.platform === 'instagram' ||
    (proj.workspace_name || '').toLowerCase().includes('tiktok') ||
    (proj.workspace_name || '').toLowerCase().includes('reels') ||
    (proj.workspace_name || '').toLowerCase().includes('short');

  files.forEach(file => {
    const isAud = file.type === 'audio' || (file.filename || '').endsWith('.mp3');
    const guessPortrait = isPortraitWorkspace || (file.quality && file.quality.includes('vertical')) ||
      (file.filename && (file.filename.includes('Reels') || file.filename.includes('Shorts')));
    const mediaMeta = resolveMediaRatioMeta(file.aspect_ratio, file.filename, guessPortrait);
    const fSize = formatBytes(file.file_size);
    const rawMediaUrl = file.url || (file.relative_path ? `/media-vault/${file.relative_path.replace(/\\/g, '/')}` : '#');
    const mediaUrl = encodeMediaUrl(rawMediaUrl);
    const durStr = formatClipDuration(file);
    const dateStr = formatSavedDate(file.created_at || proj.created_at);

    const card = document.createElement('div');
    card.id = `vault-card-${file.id}`;
    card.className = 'vault-file-card rounded-2xl bg-[#171717] border border-white/[0.08] shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between group';
    card.setAttribute('data-media-type', isAud ? 'audio' : mediaMeta.kind);
    card.dataset.fileId = file.id;
    card.onclick = (e) => {
      if (!vaultFileSelectionMode) return;
      if (e.target.closest('button') || e.target.closest('a')) return;
      e.preventDefault();
      e.stopPropagation();
      toggleVaultFileSelection(file.id);
    };

    let mediaPreviewHtml = '';
    if (isAud) {
      mediaPreviewHtml = renderAudioShowcaseHtml(file.id, mediaUrl, file.thumbnail || '', false);
    } else {
      mediaPreviewHtml = `
        <div class="video-preview-wrapper relative bg-[#09090b] w-full overflow-hidden border-b border-white/[0.06] flex items-center justify-center ${ratioAspectClass(mediaMeta)} ${mediaMeta.kind === 'landscape' ? 'max-h-[520px]' : 'max-h-[500px]'}" style="aspect-ratio: ${ratioAspectStyle(mediaMeta)}" data-file-id="${file.id}">
          <div class="ambient-glow absolute inset-0 opacity-15 pointer-events-none filter blur-2xl scale-125 bg-gradient-to-t from-white/10 via-white/5 to-transparent"></div>

          ${renderRatioBadgeHtml(mediaMeta.label)}

          <media-theme-sutro style="width:100%; height:100%;" data-player-size="medium">
            <video 
              slot="media"
              preload="metadata" 
              playsinline 
              disablepictureinpicture
              controlslist="nodownload nopictureinpicture"
              class="w-full h-full object-contain" 
              src="${mediaUrl}" 
              onloadedmetadata="handleVaultVideoMetadata(this, '${file.id}')">
            </video>
          </media-theme-sutro>
        </div>
      `;
    }

    card.innerHTML = `
      <span class="vault-card-check" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 8.5L6.75 11L12 5.5"></path>
        </svg>
      </span>
      ${mediaPreviewHtml}
      <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h4 class="text-xs sm:text-sm font-semibold font-sans text-white line-clamp-2 leading-snug mb-1">
            ${escapeHtml(file.title || file.filename)}
          </h4>
          <div class="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
            <span>${fSize}</span>
            ${file.quality ? `<span>• ${file.quality}p</span>` : ''}
            ${durStr ? `<span>• ${durStr}</span>` : ''}
          </div>
        </div>

        <div class="flex items-center justify-between pt-2.5 border-t border-white/[0.06]">
          <span class="text-[10.5px] font-mono text-zinc-500">${dateStr}</span>
          <div class="vault-file-actions flex items-center gap-2">
            <button
              type="button"
              onclick="toggleFileCardMenu('${file.id}', this, event)"
              class="t-card-btn-more"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded="false">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <circle cx="8" cy="3.5" r="1.2"></circle>
                <circle cx="8" cy="8" r="1.2"></circle>
                <circle cx="8" cy="12.5" r="1.2"></circle>
              </svg>
            </button>
            <span class="vault-card-action-sep" aria-hidden="true"></span>
            <a
              href="${mediaUrl}"
              download="${escapeHtml(file.filename)}"
              class="luna-download-icon-link"
              aria-label="Download File">
              <i data-lucide="download" class="w-4 h-4"></i>
            </a>
          </div>
        </div>
      </div>
    `;

    card.querySelectorAll('video, audio').forEach(attachMediaRecovery);
    grid.appendChild(card);
    if (isAud) {
      setTimeout(() => initAudioEvents(file.id), 20);
    }
  });

  updateVaultFilterCounters();
  setVaultMediaFilter(window.currentVaultMediaFilter || 'all');
  syncFileSelectionUI();
  initVideoHoverPlayers(grid);

  lucide.createIcons();
  setTimeout(compactSutroPlayers, 30);
  setTimeout(compactSutroPlayers, 150);
  setTimeout(compactSutroPlayers, 500);
}

function toggleProjectDrawer(projectId) {
  openProjectPage(projectId);
}

function splitFilenameParts(filename) {
  const raw = String(filename || '');
  const dotIdx = raw.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < raw.length - 1) {
    return { stem: raw.slice(0, dotIdx), ext: raw.slice(dotIdx) };
  }
  return { stem: raw, ext: '' };
}

function openRenameModalBox({ headingText, labelText, placeholderText, initialValue, targetIdVal, targetTypeVal, lockedExt }) {
  const modal = document.getElementById('renameWorkspaceModal');
  const heading = document.getElementById('renameModalHeading');
  const label = document.getElementById('renameWsLabel');
  const input = document.getElementById('renameWsInput');
  const targetId = document.getElementById('renameWsTargetId');
  const targetType = document.getElementById('renameWsTargetType');
  const extBadge = document.getElementById('renameWsExtBadge');
  if (!modal || !input || !targetId) return;

  if (heading) heading.innerText = headingText;
  if (label) label.innerText = labelText;
  input.placeholder = placeholderText;
  input.value = initialValue || '';
  targetId.value = targetIdVal || '';
  if (targetType) targetType.value = targetTypeVal || 'project';
  if (extBadge) {
    if (lockedExt) {
      extBadge.textContent = lockedExt;
      extBadge.classList.remove('hidden');
    } else {
      extBadge.textContent = '';
      extBadge.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
  setTimeout(() => {
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, 50);
  lucide.createIcons();
}

function promptRenameWorkspace(projectId, currentName) {
  openRenameModalBox({
    headingText: 'Rename Workspace',
    labelText: 'New Name',
    placeholderText: 'New workspace name',
    initialValue: currentName,
    targetIdVal: projectId,
    targetTypeVal: 'project',
    lockedExt: '',
  });
}

function promptRenameVaultItem(fileId) {
  const file = findActiveProjectFile(fileId);
  if (!file) return;
  const activeProj = currentActiveProjectId
    ? vaultProjects.find(p => p.project_id === currentActiveProjectId)
    : null;
  if (activeProj && isAiClipperProject(activeProj)) {
    openRenameModalBox({
      headingText: 'Rename Clip',
      labelText: 'Clip Title',
      placeholderText: 'New clip title',
      initialValue: file.title || file.filename || '',
      targetIdVal: file.id,
      targetTypeVal: 'clip-title',
      lockedExt: '',
    });
    return;
  }
  const { stem, ext } = splitFilenameParts(file.filename || file.title || '');
  openRenameModalBox({
    headingText: 'Rename File',
    labelText: 'New Filename',
    placeholderText: 'New filename',
    initialValue: stem,
    targetIdVal: file.id,
    targetTypeVal: 'file',
    lockedExt: ext,
  });
}

function closeRenameModal() {
  const modal = document.getElementById('renameWorkspaceModal');
  if (modal) modal.classList.add('hidden');
}

async function submitRenameWorkspace() {
  const input = document.getElementById('renameWsInput');
  const targetId = document.getElementById('renameWsTargetId');
  const targetTypeEl = document.getElementById('renameWsTargetType');
  if (!input || !targetId) return;

  const newName = input.value.trim();
  const idValue = targetId.value;
  const targetType = (targetTypeEl && targetTypeEl.value) || 'project';
  if (!newName || !idValue) return;

  if (targetType === 'clip-title') {
    const activeProj = currentActiveProjectId
      ? vaultProjects.find(p => p.project_id === currentActiveProjectId)
      : null;
    try {
      const res = await fetch(`/api/vault/item/${encodeURIComponent(idValue)}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName, title_only: true }),
      });
      if (res.ok) {
        const payload = await res.json();
        const updatedItem = (payload && payload.item) || {};
        const newTitle = updatedItem.title || newName;
        closeRenameModal();

        const syncClipRecord = (rec) => {
          if (rec) Object.assign(rec, updatedItem, { title: newTitle });
        };
        if (activeProj && Array.isArray(activeProj.files)) {
          syncClipRecord(activeProj.files.find(f => f.id === idValue));
        }
        if (Array.isArray(clipperFilesCache)) {
          syncClipRecord(clipperFilesCache.find(f => f.id === idValue));
        }
        syncClipRecord(vaultItems.find(it => it.id === idValue));

        const titleNode = document.getElementById(`clip-title-${idValue}`);
        if (titleNode) {
          titleNode.textContent = newTitle;
        }
        await loadVaultItems();
      } else {
        let errDetail = 'An error occurred while renaming the clip.';
        try {
          const errJson = await res.json();
          if (errJson && errJson.detail) errDetail = errJson.detail;
        } catch (_) {}
        showNoticeModal('Could not rename clip', errDetail);
      }
    } catch (e) {
      showNoticeModal('Connection Error', 'Could not connect to the server while renaming the clip.');
    }
    return;
  }

  if (targetType === 'file') {
    const activeProj = currentActiveProjectId
      ? vaultProjects.find(p => p.project_id === currentActiveProjectId)
      : null;
    releaseMediaLocks(document.getElementById(`vault-card-${idValue}`) || document);

    try {
      const res = await fetch(`/api/vault/item/${encodeURIComponent(idValue)}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: newName }),
      });
      if (res.ok) {
        const payload = await res.json();
        const updatedItem = (payload && payload.item) || {};
        closeRenameModal();

        const syncItemRecord = (rec) => {
          if (rec) Object.assign(rec, updatedItem);
        };
        if (activeProj && Array.isArray(activeProj.files)) {
          syncItemRecord(activeProj.files.find(f => f.id === idValue));
          renderProjectFiles(activeProj);
        }
        syncItemRecord(vaultItems.find(it => it.id === idValue));
        await loadVaultItems();
      } else {
        let errDetail = 'An error occurred while renaming the file.';
        try {
          const errJson = await res.json();
          if (errJson && errJson.detail) errDetail = errJson.detail;
        } catch (_) {}
        if (activeProj) renderProjectFiles(activeProj);
        showNoticeModal('Could not rename file', errDetail);
      }
    } catch (e) {
      if (activeProj) renderProjectFiles(activeProj);
      showNoticeModal('Connection Error', 'Could not connect to the server while renaming the file.');
    }
    return;
  }

  try {
    const res = await fetch(`/api/vault/project/${idValue}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_name: newName }),
    });
    if (res.ok) {
      closeRenameModal();
      const proj = vaultProjects.find(p => p.project_id === idValue);
      if (proj) {
        proj.workspace_name = newName;
      }
      if (currentActiveProjectId === idValue) {
        const titleEl = document.getElementById('projectDetailPageTitle');
        if (titleEl) titleEl.innerText = newName;
        const clipperTitleEl = document.getElementById('clipperWorkspaceTitle');
        if (clipperTitleEl) clipperTitleEl.innerText = newName;
        const breadcrumbEl = document.getElementById('detailViewBreadcrumb');
        if (breadcrumbEl) breadcrumbEl.innerText = `${idValue}`;
        document.title = `${newName} (${idValue}) | Luna`;
      }
      await loadVaultItems();
    } else {
      let errDetail = 'An error occurred while saving the workspace name.';
      try {
        const errJson = await res.json();
        if (errJson && errJson.detail) errDetail = errJson.detail;
      } catch (_) {}
      showNoticeModal('Could not rename', errDetail);
    }
  } catch (e) {
    showNoticeModal('Connection Error', 'Could not connect to the server while updating the workspace.');
  }
}

function openDeleteModalBox() {
  const modal = document.getElementById('deleteModal');
  const box = document.getElementById('deleteModalBox');
  if (!modal || !box) return;
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    box.classList.remove('scale-95', 'opacity-0');
    box.classList.add('scale-100', 'opacity-100');
  });
}

function closeDeleteModal() {
  deletingItemId = null;
  deletingProjectId = null;
  const modal = document.getElementById('deleteModal');
  const box = document.getElementById('deleteModalBox');
  if (box) {
    box.classList.remove('scale-100', 'opacity-100');
    box.classList.add('scale-95', 'opacity-0');
  }
  setTimeout(() => {
    if (modal) modal.classList.add('hidden');
  }, 150);
}

function confirmDeleteVaultProject(projectId, wsName, event) {
  if (event && event.stopPropagation) {
    event.stopPropagation();
  }
  deletingProjectId = projectId;
  deletingItemId = null;
  const heading = document.getElementById('deleteModalHeading');
  const desc = document.getElementById('deleteModalDesc');
  const btnText = document.getElementById('deleteModalBtnText');
  const confirmBtn = document.getElementById('deleteModalConfirmBtn');

  if (heading) heading.innerText = 'Delete this workspace?';
  if (desc) desc.innerText = `Are you sure you want to delete workspace "${wsName || 'Workspace'}"? All files in it will be deleted and cannot be recovered.`;
  if (btnText) btnText.innerText = 'Delete';
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.onclick = executeDeleteVaultProject;
  }

  openDeleteModalBox();
}

function releaseMediaLocks(scopeEl = document) {
  try {
    (scopeEl || document).querySelectorAll('video, audio').forEach(el => {
      try {
        el.dataset.intentionallyReleased = '1';
        if (!el.paused) el.pause();
        el.removeAttribute('src');
        el.load();
      } catch (e) {}
    });
  } catch (e) {}
}

async function executeDeleteVaultProject() {
  if (!deletingProjectId) return;
  const confirmBtn = document.getElementById('deleteModalConfirmBtn');
  const btnText = document.getElementById('deleteModalBtnText');
  const btnSpinner = document.getElementById('deleteModalBtnSpinner');

  if (confirmBtn) confirmBtn.disabled = true;
  if (btnSpinner) btnSpinner.classList.remove('hidden');
  if (btnText) btnText.innerText = 'Deleting...';

  releaseMediaLocks();

  try {
    const res = await fetch(`/api/vault/project/${deletingProjectId}`, { method: 'DELETE' });
    if (res.ok) {
      if (currentActiveProjectId === deletingProjectId) {
        closeProjectPage();
      }
      closeDeleteModal();
      deletingProjectId = null;
      await loadVaultItems();
    } else {
      showNoticeModal('Could not delete workspace', 'Could not delete this workspace. Please try again.');
    }
  } catch (e) {
    showNoticeModal('Server error', 'An error occurred while deleting the workspace.');
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
    if (btnSpinner) btnSpinner.classList.add('hidden');
    if (btnText) btnText.innerText = 'Delete';
  }
}

function getPlatformBadgeHtml(plat) {
  const p = (plat || '').toLowerCase();
  if (p === 'youtube') {
    return `<span class="px-2 py-0.5 rounded-md bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-300 text-[10px] font-semibold flex items-center gap-1 shadow-sm"><img src="/assets/youtube-logo.svg?v=3" class="w-3 h-3 object-contain" /> YouTube</span>`;
  } else if (p === 'instagram') {
    return `<span class="px-2 py-0.5 rounded-md bg-pink-500/20 backdrop-blur-md border border-pink-500/30 text-pink-300 text-[10px] font-semibold flex items-center gap-1 shadow-sm"><img src="/assets/instagram-logo.svg?v=3" class="w-3 h-3 object-contain" /> Reels</span>`;
  } else if (p === 'tiktok') {
    return `<span class="px-2 py-0.5 rounded-md bg-zinc-800/80 backdrop-blur-md border border-white/10 text-zinc-200 text-[10px] font-semibold flex items-center gap-1 shadow-sm"><img src="/assets/tiktok-logo.svg?v=3" class="w-3 h-3 object-contain" /> TikTok</span>`;
  }
  return `<span class="px-2 py-0.5 rounded-md bg-white/10 backdrop-blur-md border border-white/20 text-zinc-300 text-[10px] font-semibold flex items-center gap-1 shadow-sm"><i data-lucide="film" class="w-3 h-3"></i> Media</span>`;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
  return mb.toFixed(1) + ' MB';
}

function formatSavedDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return '';
  }
}

function formatClipDuration(item) {
  if (item.start_time !== undefined && item.end_time !== undefined && item.end_time > item.start_time) {
    const dur = Math.round(item.end_time - item.start_time);
    return `${dur}s`;
  }
  return '';
}

function copyVaultStoragePath() {
  const storageEl = document.getElementById('vaultStoragePath');
  if (!storageEl) return;
  const path = storageEl.innerText.trim();
  if (!path) return;
  navigator.clipboard.writeText(path).catch(err => {
    console.warn('Clipboard write error:', err);
  });
}

async function openVaultFolder() {
  try {
    const res = await fetch('/api/vault/open-folder', { method: 'POST' });
    if (!res.ok) {
      showNoticeModal('Could not open folder', 'Folder not found or the file manager could not be opened.');
    }
  } catch (err) {
    console.error('Error opening vault folder:', err);
    showNoticeModal('Could not open folder', 'An error occurred while opening the folder.');
  }
}

async function openVaultFile(filePath) {
  if (!filePath) return;
  try {
    const res = await fetch('/api/vault/open-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath })
    });
    if (!res.ok) {
      showNoticeModal('Could not open file', 'File not found or the file manager could not open it.');
    }
  } catch (err) {
    console.error('Error opening file in Explorer:', err);
    showNoticeModal('Could not open file', 'An error occurred while opening the file.');
  }
}

function confirmDeleteVaultItem(id, title, filePath) {
  deletingItemId = id;
  deletingProjectId = null;
  const heading = document.getElementById('deleteModalHeading');
  const desc = document.getElementById('deleteModalDesc');
  const btnText = document.getElementById('deleteModalBtnText');
  const confirmBtn = document.getElementById('deleteModalConfirmBtn');

  if (heading) heading.innerText = 'Delete this file?';
  if (desc) desc.innerText = `Are you sure you want to delete "${title || 'this file'}"? This action cannot be undone.`;
  if (btnText) btnText.innerText = 'Delete';
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.onclick = executeDeleteVaultItem;
  }

  openDeleteModalBox();
}

async function executeDeleteVaultItem() {
  if (!deletingItemId) return;
  const confirmBtn = document.getElementById('deleteModalConfirmBtn');
  const btnText = document.getElementById('deleteModalBtnText');
  const btnSpinner = document.getElementById('deleteModalBtnSpinner');

  if (confirmBtn) confirmBtn.disabled = true;
  if (btnSpinner) btnSpinner.classList.remove('hidden');
  if (btnText) btnText.innerText = 'Deleting...';

  const idToDelete = deletingItemId;

  releaseMediaLocks(document.getElementById(`vault-card-${idToDelete}`) || document);

  try {
    const res = await fetch(`/api/vault/${encodeURIComponent(idToDelete)}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Could not delete file');
    }

    // Card smooth exit animation (standard grid); clipper workflow re-renders immediately
    const card = document.getElementById(`vault-card-${idToDelete}`);
    const activeProj = currentActiveProjectId
      ? vaultProjects.find(p => p.project_id === currentActiveProjectId)
      : null;
    const isClipperProj = Boolean(activeProj && isAiClipperProject(activeProj));

    if (card && !isClipperProj) {
      card.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
      setTimeout(() => {
        if (card && card.parentNode) card.remove();
      }, 300);
    }

    // Update in-memory data
    vaultFileSelectedIds.delete(idToDelete);
    vaultItems = vaultItems.filter(it => it.id !== idToDelete);
    if (vaultStats.total_files > 0) vaultStats.total_files -= 1;

    if (activeProj && activeProj.files) {
      activeProj.files = activeProj.files.filter(f => f.id !== idToDelete);
      updateProjectDetailHeaderMeta(activeProj);
      syncAfterProjectFilesChanged(activeProj, { deletedClip: true });
    }

    updateVaultStatsUI();
    closeDeleteModal();

    setTimeout(() => {
      updateVaultFilterCounters();
      loadVaultItems();
    }, 320);

  } catch (err) {
    const activeProj = currentActiveProjectId ? vaultProjects.find(p => p.project_id === currentActiveProjectId) : null;
    if (activeProj) {
      syncAfterProjectFilesChanged(activeProj, { forceRerender: true });
    }
    showNoticeModal('Could not delete file', err.message || 'An error occurred while deleting the file.');
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
    if (btnSpinner) btnSpinner.classList.add('hidden');
    if (btnText) btnText.innerText = 'Delete';
  }
}

// Auto-load vault badge count immediately on load
updateVaultBadge();

let __pendingUpdateInfo = null;
let __lunaUpdateToastId = null;
let __lunaUpdateInFlight = false;

function openUpdateModal(data) {
  const modal = document.getElementById('updateModal');
  const box = document.getElementById('updateModalBox');
  const heading = document.getElementById('updateModalHeading');
  const desc = document.getElementById('updateModalDesc');
  const meta = document.getElementById('updateModalMeta');
  const shaEl = document.getElementById('updateModalSha');
  const msgEl = document.getElementById('updateModalCommitMsg');
  const laterBtn = document.getElementById('updateModalLaterBtn');
  const actionBtn = document.getElementById('updateModalActionBtn');
  const okBtn = document.getElementById('updateModalOkBtn');
  if (!modal || !box) return;

  __pendingUpdateInfo = data || null;
  const available = Boolean(data && data.update_available);

  if (available) {
    if (heading) heading.textContent = 'Update Available';
    if (desc) {
      desc.textContent = data.reason === 'untracked_install'
        ? 'A Luna update is available. Updating once will also sync local version tracking.'
        : 'A newer version of Luna is ready to install. Your settings and saved media will stay untouched.';
    }
    if (meta) meta.classList.remove('hidden');
    if (shaEl) shaEl.textContent = data.latest_short_sha || '-';
    if (msgEl) msgEl.textContent = data.latest_message || 'Latest release on main';
    if (laterBtn) laterBtn.classList.remove('hidden');
    if (actionBtn) {
      actionBtn.classList.remove('hidden');
      actionBtn.disabled = Boolean(data.busy_jobs);
      actionBtn.textContent = data.busy_jobs ? 'Job Running' : 'Update';
    }
    if (okBtn) okBtn.classList.add('hidden');
  } else {
    if (heading) heading.textContent = "You're up to date";
    if (desc) {
      const shaTag = data && data.current_short_sha ? ` (${data.current_short_sha})` : '';
      desc.textContent = `Luna${shaTag} is already running the latest version.`;
    }
    if (meta) meta.classList.add('hidden');
    if (laterBtn) laterBtn.classList.add('hidden');
    if (actionBtn) actionBtn.classList.add('hidden');
    if (okBtn) okBtn.classList.remove('hidden');
  }

  modal.classList.remove('hidden');
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: box });
  }
  requestAnimationFrame(() => {
    box.classList.remove('scale-95', 'opacity-0');
    box.classList.add('scale-100', 'opacity-100');
  });
}

function closeUpdateModal() {
  const modal = document.getElementById('updateModal');
  const box = document.getElementById('updateModalBox');
  if (box) {
    box.classList.remove('scale-100', 'opacity-100');
    box.classList.add('scale-95', 'opacity-0');
  }
  setTimeout(() => {
    if (modal) modal.classList.add('hidden');
  }, 150);
}

async function checkForLunaUpdates(btn) {
  if (__lunaUpdateInFlight) return;
  const trigger = btn || document.getElementById('btnCheckUpdates');
  const icon = document.getElementById('checkUpdatesIcon');
  const spinner = document.getElementById('checkUpdatesSpinner');
  const label = document.getElementById('checkUpdatesLabel');
  if (trigger) trigger.disabled = true;
  if (icon) icon.classList.add('hidden');
  if (spinner) spinner.classList.remove('hidden');
  if (label) label.textContent = 'Checking...';

  try {
    const res = await fetch('/api/system/check-update');
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Could not check for updates');
    }
    openUpdateModal(data);
  } catch (err) {
    showNoticeModal('Update check failed', err.message || 'Could not reach GitHub to check for updates.');
  } finally {
    if (trigger) trigger.disabled = false;
    const currentIcon = document.getElementById('checkUpdatesIcon');
    const currentSpinner = document.getElementById('checkUpdatesSpinner');
    if (currentIcon) currentIcon.classList.remove('hidden');
    if (currentSpinner) currentSpinner.classList.add('hidden');
    if (label) label.textContent = 'Check for Updates';
  }
}

async function waitForServerRestartAndReload() {
  try {
    sessionStorage.setItem('luna_update_just_completed', '1');
  } catch (e) {}

  await new Promise((resolve) => setTimeout(resolve, 1800));
  for (let i = 0; i < 45; i++) {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.ok) {
        if (__lunaUpdateToastId) {
          lunaToast.update(__lunaUpdateToastId, {
            type: 'success',
            title: 'Update complete',
            description: 'Reloading Luna...',
            indeterminate: false,
            timeout: 3000,
          });
        }
        setTimeout(() => window.location.reload(), 600);
        return;
      }
    } catch (e) {}
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  __lunaUpdateInFlight = false;
  if (__lunaUpdateToastId) {
    lunaToast.update(__lunaUpdateToastId, {
      type: 'warning',
      title: 'Restart pending',
      description: 'Update finished. Please refresh or reopen Luna.',
      indeterminate: false,
      timeout: 5000,
    });
  }
}

async function startLunaUpdate() {
  if (__lunaUpdateInFlight) return;
  const targetSha = __pendingUpdateInfo ? __pendingUpdateInfo.latest_sha : null;
  closeUpdateModal();
  __lunaUpdateInFlight = true;

  __lunaUpdateToastId = lunaToast.add({
    type: 'info',
    title: 'Updating Luna',
    description: 'Downloading latest update...',
    timeout: 0,
    closable: false,
    indeterminate: true,
  });

  try {
    const res = await fetch('/api/system/apply-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_sha: targetSha, auto_restart: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Could not start update');
    }

    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      let st;
      try {
        const stRes = await fetch('/api/system/update-status', { cache: 'no-store' });
        if (!stRes.ok) throw new Error('status_lost');
        st = await stRes.json();
      } catch (pollErr) {
        // Connection reset during server restart — wait for the new process to come up.
        if (__lunaUpdateToastId) {
          lunaToast.update(__lunaUpdateToastId, {
            title: 'Updating Luna',
            description: 'Restarting Luna...',
            indeterminate: true,
          });
        }
        await waitForServerRestartAndReload();
        return;
      }

      if (st.status === 'updating') {
        if (__lunaUpdateToastId && st.message) {
          lunaToast.update(__lunaUpdateToastId, {
            title: 'Updating Luna',
            description: st.message,
            indeterminate: true,
          });
        }
        continue;
      }

      if (st.status === 'restarting') {
        if (__lunaUpdateToastId) {
          lunaToast.update(__lunaUpdateToastId, {
            title: 'Updating Luna',
            description: 'Restarting Luna...',
            indeterminate: true,
          });
        }
        await waitForServerRestartAndReload();
        return;
      }

      if (st.status === 'completed') {
        __lunaUpdateInFlight = false;
        if (__lunaUpdateToastId) {
          lunaToast.update(__lunaUpdateToastId, {
            type: 'success',
            title: 'Update complete',
            description: 'Luna has been updated to the latest version.',
            indeterminate: false,
            timeout: 3000,
          });
          __lunaUpdateToastId = null;
        }
        return;
      }

      if (st.status === 'error') {
        throw new Error(st.error || st.message || 'Update failed');
      }
    }
  } catch (err) {
    __lunaUpdateInFlight = false;
    if (__lunaUpdateToastId) {
      lunaToast.update(__lunaUpdateToastId, {
        type: 'error',
        title: 'Update failed',
        description: err.message || 'Could not update Luna.',
        indeterminate: false,
        timeout: 5500,
      });
      __lunaUpdateToastId = null;
    } else {
      showToast(err.message || 'Could not update Luna.', true);
    }
  }
}

function applyRouteFromHash(rawHash = window.location.hash, options = {}) {
  const hash = String(rawHash || '');
  const isInitial = Boolean(options.isInitial);

  if (
    !isInitial &&
    currentMainTab === 'settings' &&
    hash !== '#settings' &&
    typeof guardUnsavedSettingsLeave === 'function' &&
    guardUnsavedSettingsLeave()
  ) {
    syncLocationHash('#settings', { replace: true });
    return;
  }

  if (hash.startsWith('#vault-project/')) {
    const pId = hash.slice('#vault-project/'.length);
    if (isInitial) document.body.classList.add('in-workspace');
    if (currentMainTab !== 'vault') switchMainTab('vault', { updateUrl: false, immediate: isInitial });
    if (currentActiveProjectId !== pId) {
      openProjectPage(pId);
    } else if (isInitial) {
      document.documentElement.removeAttribute('data-init-route');
    }
    return;
  }

  if (currentActiveProjectId) {
    closeProjectPage({ preserveHash: true });
  } else {
    document.body.classList.remove('in-workspace');
  }

  if (hash === '#vault') {
    if (currentMainTab !== 'vault') switchMainTab('vault', { updateUrl: false, immediate: isInitial });
  } else if (hash === '#settings') {
    if (currentMainTab !== 'settings') switchMainTab('settings', { updateUrl: false, immediate: isInitial });
  } else if (hash === '#guide' || hash.startsWith('#guide/')) {
    const subTab = hash.startsWith('#guide/') ? hash.slice('#guide/'.length) : '';
    if (currentMainTab !== 'guide') switchMainTab('guide', { updateUrl: false, immediate: isInitial });
    if (subTab && typeof switchGuideTab === 'function') {
      const targetBtn = document.querySelector(`#guideTabsBar [data-guide-tab="${CSS.escape(subTab)}"]`);
      if (targetBtn) switchGuideTab(subTab, targetBtn, false, { updateUrl: false, immediate: isInitial });
    }
  } else if (!isInitial && (hash === '' || hash === '#studio')) {
    if (currentMainTab !== 'studio') switchMainTab('studio', { updateUrl: false });
  }
  if (isInitial) {
    document.documentElement.removeAttribute('data-init-route');
  }
}

// Handle hash navigation and browser back/forward history
window.addEventListener('hashchange', () => applyRouteFromHash());
window.addEventListener('popstate', () => applyRouteFromHash());

// Remove error states when user types in settings inputs
document.addEventListener('input', (e) => {
  if (e.target && e.target.closest && e.target.closest('.t-input')) {
    const wrap = e.target.closest('.t-input-wrap');
    const box = e.target.closest('.t-input');
    if (wrap) wrap.classList.remove('is-error');
    if (box) box.classList.remove('is-error');
  }
});

// Keep sliding tab indicators and flowchart connectors aligned on resize
window.addEventListener('resize', () => {
  updateTabsPill(true);
  if (currentMainTab === 'vault' && typeof updateVaultPlatformUnderline === 'function') {
    updateVaultPlatformUnderline(true);
  }
  if (currentActiveProjectId) {
    const proj = vaultProjects.find(p => p.project_id === currentActiveProjectId);
    if (proj && typeof isAiClipperProject === 'function' && isAiClipperProject(proj)) {
      drawClipperConnectors();
    }
  }
});
// A failed job runs again in its own folder, so a finished or partial download is reused.
async function offerRetry(jobId, errMsg) {
  if (!await showConfirmModal('Processing failed', errMsg, 'Retry')) return;
  try {
    const res = await fetch(`/api/retry/${jobId}`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).detail || 'Could not retry the job');
    try { localStorage.setItem('luna_active_job_id', jobId); } catch (e) {}
    await checkAndResumeSavedJob(jobId);
  } catch (err) {
    showNoticeModal('Could not retry', err.message);
  }
}

async function checkAndResumeSavedJob(savedJobId) {
  try {
    const res = await fetch(`/api/status/${savedJobId}`);
    if (!res.ok) {
      clearSavedJobStorage();
      return;
    }
    const data = await res.json();
    if (!['completed', 'failed', 'cancelled'].includes(data.status)) {
      activeJobId = savedJobId;
      if (jobIdPill) jobIdPill.innerText = `JOB-${activeJobId}`;
      if (mainActionBtn) {
        mainActionBtn.disabled = true;
        mainActionBtn.classList.add('opacity-50', 'cursor-not-allowed');
      }
      if (progressStateCard) {
        progressStateCard.classList.remove('hidden');
      }
      setCancelButtonVisible(true, 'Cancel');
      const savedAction = data.action || localStorage.getItem('luna_active_action') || 'type_yt_ai_clip';
      const savedQuality = data.quality || localStorage.getItem('luna_active_quality') || selectedQuality || '1080';
      currentJobWorkspaceName = data.workspace_name || localStorage.getItem('luna_active_ws') || null;
      initTaskRows(savedAction, savedQuality);
      updateProgressUI(data.stage || 'queued', data);
      startPolling(savedJobId);
    } else {
      clearSavedJobStorage();
      // The server restarted while this job ran; it now reports failed and can be retried.
      if (data.status === 'failed' && data.retryable) offerRetry(savedJobId, data.error);
    }
  } catch (e) {
    console.warn('Failed to resume saved job:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyRouteFromHash(window.location.hash, { isInitial: true });
  updateTabsPill(true);
  syncFaceDetectLockUI();
  fetch('/api/settings')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && data.clip_language) {
        defaultClipLanguage = data.clip_language;
        const hidden = document.getElementById('selectClipLanguage');
        if (hidden) hidden.value = data.clip_language;
        if (typeof syncClipLanguageUI === 'function') syncClipLanguageUI();
      }
      if (data && data.studio_background && typeof window.applyStudioBackground === 'function') {
        window.applyStudioBackground(data.studio_background);
        renderStudioBackgroundCards();
      }
    })
    .catch(() => {});
  if (typeof initAllGlidingIndicators === 'function') {
    initAllGlidingIndicators();
    renderTrimSegments();
  }

  // Check and resume running background job if page was refreshed
  try {
    if (sessionStorage.getItem('luna_update_just_completed') === '1') {
      sessionStorage.removeItem('luna_update_just_completed');
      lunaToast.add({
        type: 'success',
        title: 'Update complete',
        description: 'Luna has been updated to the latest version.',
        timeout: 3000,
      });
    }
    const savedJobId = localStorage.getItem('luna_active_job_id');
    if (savedJobId) {
      checkAndResumeSavedJob(savedJobId);
    }
  } catch (e) {}
});
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    updateTabsPill(true);
    if (typeof updateVaultPlatformUnderline === 'function') updateVaultPlatformUnderline(true);
  });
}
setTimeout(() => {
  updateTabsPill(true);
  if (typeof syncVaultModeDropdownOptions === 'function') syncVaultModeDropdownOptions();
  if (typeof updateVaultPlatformUnderline === 'function') updateVaultPlatformUnderline(true);
  const platTabs = document.getElementById('vaultPlatformTabs');
  if (platTabs) {
    platTabs.addEventListener('keydown', e => {
      const tabs = Array.from(platTabs.querySelectorAll('[role="tab"]'));
      const idx = tabs.indexOf(document.activeElement);
      if (idx === -1) return;
      let nextIdx = null;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = tabs.length - 1;
      if (nextIdx !== null) {
        e.preventDefault();
        tabs[nextIdx].focus();
        tabs[nextIdx].click();
      }
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllDropdowns(null);
  });
  if (typeof initAllGlidingIndicators === 'function') {
    initAllGlidingIndicators();
  }
}, 0);

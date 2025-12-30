// music-player.js
// Adds "Start Music" button in header + long-press popover controls
// Plays files from /music as 1.*, 2.*, 3.* ... in order.

(() => {
  const BTN_ID = 'musicNavBtn';

  const STORAGE = {
    enabled: 'batoot_music_enabled_v1',
    track: 'batoot_music_track_v1'
  };

  const EXTENSIONS = ['mp3', 'm4a', 'wav', 'ogg'];
  const LONG_PRESS_MS = 550;
  const SEEK_STEP = 10; // seconds

  const state = {
    enabled: false,
    track: 1,
    popoverOpen: false,
    longPressed: false,
    pressTimer: null,
    ui: {
      popover: null,
      trackEl: null,
      nowEl: null,
      durEl: null,
      rangeEl: null,
      prevTrackBtn: null,
      nextTrackBtn: null,
      backBtn: null,
      fwdBtn: null
    }
  };

  const audio = new Audio();
  audio.preload = 'auto';

  function safeShowAlert(msg, type = 'info') {
    try {
      if (typeof window.showAlert === 'function') window.showAlert(msg, type);
    } catch (_) {}
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function isPlaying() {
    return state.enabled && !audio.paused && !audio.ended;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE.enabled, state.enabled ? '1' : '0');
      localStorage.setItem(STORAGE.track, String(state.track));
    } catch (_) {}
  }

  function readPersisted() {
    try {
      state.enabled = localStorage.getItem(STORAGE.enabled) === '1';
      const t = parseInt(localStorage.getItem(STORAGE.track) || '1', 10);
      state.track = Number.isFinite(t) && t > 0 ? t : 1;
    } catch (_) {}
  }

  function setBtnLabel() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;

    btn.classList.toggle('active', state.enabled);
    btn.setAttribute('aria-pressed', String(state.enabled));
    btn.innerHTML = state.enabled
      ? '<i class="fas fa-music"></i> Stop Music'
      : '<i class="fas fa-music"></i> Start Music';
  }

  function updatePopoverUI() {
    const { trackEl, nowEl, durEl, rangeEl } = state.ui;
    if (trackEl) trackEl.textContent = `Track #${state.track}`;
    const dur = Number(audio.duration);
    const cur = Number(audio.currentTime);

    if (nowEl) nowEl.textContent = formatTime(cur);
    if (durEl) durEl.textContent = Number.isFinite(dur) ? formatTime(dur) : '--:--';

    if (rangeEl) {
      const max = Number.isFinite(dur) && dur > 0 ? dur : 0;
      rangeEl.max = String(max);
      rangeEl.value = String(Number.isFinite(cur) ? Math.min(cur, max || cur) : 0);
      rangeEl.disabled = !(Number.isFinite(dur) && dur > 0);
    }
  }

  function positionPopover() {
    const btn = document.getElementById(BTN_ID);
    const pop = state.ui.popover;
    if (!btn || !pop) return;

    const r = btn.getBoundingClientRect();
    const margin = 10;
    const popW = pop.offsetWidth || 320;

    // RTL: align right edge with button right edge
    const left = Math.max(margin, Math.min(window.innerWidth - popW - margin, r.right - popW));
    const top = Math.min(window.innerHeight - pop.offsetHeight - margin, r.bottom + 10);

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function openPopover() {
    const pop = state.ui.popover;
    if (!pop) return;
    state.popoverOpen = true;
    pop.classList.add('open');
    positionPopover();
    updatePopoverUI();
  }

  function closePopover() {
    const pop = state.ui.popover;
    if (!pop) return;
    state.popoverOpen = false;
    pop.classList.remove('open');
  }

  function buildPopover() {
    const pop = document.createElement('div');
    pop.className = 'music-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Music controls');

    pop.innerHTML = `
      <div class="music-head">
        <div class="music-title" id="musicTrackTitle">Track #1</div>
        <button class="music-mini-btn music-close" type="button" aria-label="close">
          <i class="fas fa-xmark"></i>
        </button>
      </div>

      <div class="music-row music-track-controls">
        <button class="music-mini-btn" type="button" data-action="prevTrack" title="Previous track">
          <i class="fas fa-backward-step"></i>
        </button>
        <button class="music-mini-btn" type="button" data-action="nextTrack" title="Next track">
          <i class="fas fa-forward-step"></i>
        </button>
        <div class="music-hint">ضغطه طويلة لفتح التحكم 🎵</div>
      </div>

      <div class="music-row music-seek-row">
        <span class="music-time" id="musicNow">00:00</span>
        <input class="music-range" id="musicSeek" type="range" min="0" max="0" value="0" step="1" disabled />
        <span class="music-time" id="musicDur">--:--</span>
      </div>

      <div class="music-row music-seek-controls">
        <button class="music-mini-btn" type="button" data-action="back" title="-10s">
          <i class="fas fa-rotate-left"></i> <span class="music-step">10</span>
        </button>
        <button class="music-mini-btn" type="button" data-action="forward" title="+10s">
          <i class="fas fa-rotate-right"></i> <span class="music-step">10</span>
        </button>
      </div>
    `;

    document.body.appendChild(pop);

    state.ui.popover = pop;
    state.ui.trackEl = pop.querySelector('#musicTrackTitle');
    state.ui.nowEl = pop.querySelector('#musicNow');
    state.ui.durEl = pop.querySelector('#musicDur');
    state.ui.rangeEl = pop.querySelector('#musicSeek');

    const closeBtn = pop.querySelector('.music-close');
    closeBtn?.addEventListener('click', closePopover);

    pop.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');

      if (action === 'prevTrack') {
        if (state.track > 1) playTrack(state.track - 1);
      } else if (action === 'nextTrack') {
        playTrack(state.track + 1);
      } else if (action === 'back') {
        audio.currentTime = Math.max(0, (audio.currentTime || 0) - SEEK_STEP);
      } else if (action === 'forward') {
        const dur = Number(audio.duration);
        const target = (audio.currentTime || 0) + SEEK_STEP;
        audio.currentTime = Number.isFinite(dur) && dur > 0 ? Math.min(dur, target) : target;
      }
      updatePopoverUI();
    });

    const range = state.ui.rangeEl;
    if (range) {
      range.addEventListener('input', () => {
        // just UI update while dragging
        const val = Number(range.value);
        if (state.ui.nowEl) state.ui.nowEl.textContent = formatTime(val);
      });
      range.addEventListener('change', () => {
        const val = Number(range.value);
        if (Number.isFinite(val)) audio.currentTime = Math.max(0, val);
      });
    }

    window.addEventListener('resize', () => {
      if (state.popoverOpen) positionPopover();
    });
    window.addEventListener('scroll', () => {
      if (state.popoverOpen) positionPopover();
    }, true);
  }

  function resolveTrackUrl(trackNumber) {
    // Try extensions one by one by loading metadata (works even without fetch/HEAD).
    return new Promise((resolve) => {
      let idx = 0;

      const tryNext = () => {
        if (idx >= EXTENSIONS.length) {
          resolve(null);
          return;
        }
        const ext = EXTENSIONS[idx++];
        const url = `music/${trackNumber}.${ext}`;

        const probe = new Audio();
        probe.preload = 'metadata';
        const cleanup = () => {
          probe.onloadedmetadata = null;
          probe.onerror = null;
          // some browsers keep downloading; stop it
          try { probe.src = ''; } catch (_) {}
        };

        const timer = setTimeout(() => {
          cleanup();
          tryNext();
        }, 1800);

        probe.onloadedmetadata = () => {
          clearTimeout(timer);
          cleanup();
          resolve(url);
        };
        probe.onerror = () => {
          clearTimeout(timer);
          cleanup();
          tryNext();
        };

        probe.src = url;
        // explicit load helps in some browsers
        try { probe.load(); } catch (_) {}
      };

      tryNext();
    });
  }

  async function playTrack(trackNumber) {
    state.track = Math.max(1, parseInt(trackNumber, 10) || 1);
    persist();
    setBtnLabel();
    updatePopoverUI();

    const url = await resolveTrackUrl(state.track);
    if (!url) {
      // If track not found: skip forward a bit, but don't loop forever if folder is empty.
      let skipped = 0;
      let next = state.track + 1;
      while (skipped < 25) {
        const u = await resolveTrackUrl(next);
        if (u) {
          state.track = next;
          persist();
          audio.src = u;
          break;
        }
        next++;
        skipped++;
      }

      if (!audio.src) {
        safeShowAlert('مش لاقي ملفات أغاني في فولدر music (مثلاً: music/1.mp3).', 'error');
        stopMusic();
        return;
      }
    } else {
      audio.src = url;
    }

    try {
      await audio.play();
      updatePopoverUI();
    } catch (e) {
      // Autoplay policy: user needs to press the button (this happens on click anyway)
      safeShowAlert('اضغط مرة تانية على زر Start Music عشان المتصفح يسمح بتشغيل الصوت.', 'info');
    }
  }

  function startMusic() {
    state.enabled = true;
    persist();
    setBtnLabel();
    playTrack(state.track);
  }

  function stopMusic() {
    state.enabled = false;
    persist();
    setBtnLabel();
    try { audio.pause(); } catch (_) {}
    closePopover();
  }

  function toggleMusic() {
    if (state.enabled) stopMusic();
    else startMusic();
  }

  function bindLongPress(btn) {
    const clearTimer = () => {
      if (state.pressTimer) {
        clearTimeout(state.pressTimer);
        state.pressTimer = null;
      }
    };

    btn.addEventListener('pointerdown', () => {
      state.longPressed = false;
      clearTimer();
      state.pressTimer = setTimeout(() => {
        state.longPressed = true;
        if (!state.ui.popover) buildPopover();
        openPopover();
      }, LONG_PRESS_MS);
    });

    const onUp = () => {
      clearTimer();
      if (!state.longPressed) toggleMusic();
    };

    btn.addEventListener('pointerup', onUp);
    btn.addEventListener('pointerleave', clearTimer);
    btn.addEventListener('pointercancel', clearTimer);
  }

  function interceptLinksWhilePlaying() {
    // If music is ON, open any link in a new tab so the main page stays alive and the music doesn't stop.
    document.addEventListener('click', (e) => {
      if (!state.enabled) return;

      const a = e.target.closest('a[href]');
      if (!a) return;

      const raw = (a.getAttribute('href') || '').trim();
      if (!raw) return;

      // allow in-page anchors & special schemes
      if (raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return;

      // allow explicitly
      if (a.dataset && a.dataset.allowSameTab === '1') return;

      e.preventDefault();
      e.stopPropagation();

      // open new tab (keeps music running here)
      const url = a.href;
      window.open(url, '_blank', 'noopener');

      safeShowAlert('فتحتها في تبويب جديد — سيب الصفحة الرئيسية مفتوحة عشان الأغاني تفضل شغالة 🎵', 'info');
    }, true);
  }

  function wireAudioEvents() {
    audio.addEventListener('timeupdate', updatePopoverUI);
    audio.addEventListener('loadedmetadata', updatePopoverUI);
    audio.addEventListener('ended', () => {
      if (!state.enabled) return;
      playTrack(state.track + 1);
    });
  }

  function init() {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;

    readPersisted();
    setBtnLabel();
    wireAudioEvents();
    interceptLinksWhilePlaying();
    bindLongPress(btn);

    // close popover when clicking outside
    document.addEventListener('pointerdown', (e) => {
      if (!state.popoverOpen) return;
      const pop = state.ui.popover;
      if (!pop) return;
      if (pop.contains(e.target)) return;
      if (btn.contains(e.target)) return;
      closePopover();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // expose minimal debug hooks if needed
  window.__batootMusic = {
    start: startMusic,
    stop: stopMusic,
    next: () => playTrack(state.track + 1),
    prev: () => state.track > 1 && playTrack(state.track - 1),
    audio
  };
})();

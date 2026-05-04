/* Soundboard — static PWA. No dependencies. */
(function () {
    'use strict';

    const SOUNDS_DIR = 'Sounds';
    const MANIFEST_URL = 'sounds.json';

    /** @typedef {{ file: string, group: string, label: string }} SoundEntry */

    /** @type {SoundEntry[]} */
    let allSounds = [];
    /** @type {string} */
    let activeGroup = '__all__';
    /** @type {string} */
    let searchTerm = '';

    /** Tracks active <audio> elements by sound key so we can stop them. */
    const active = new Map(); // key -> Set<HTMLAudioElement>

    // ── DOM refs ────────────────────────────────────────────────────
    const board = document.getElementById('board');
    const emptyState = document.getElementById('empty-state');
    const searchInput = document.getElementById('search-input');
    const groupChips = document.getElementById('group-chips');
    const stopAllBtn = document.getElementById('stop-all-btn');
    const themeBtn = document.getElementById('theme-toggle-btn');
    const statusEl = document.getElementById('status');
    const countEl = document.getElementById('count');
    const muteBtn = document.getElementById('mute-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');
    const volumeRow = volumeSlider ? volumeSlider.closest('.volume-row') : null;

    // ── Volume / mute ───────────────────────────────────────────────
    /** 0..1; the *intended* volume even when muted. */
    let volume = 0.8;
    let muted = false;

    function loadVolumeState() {
        try {
            const v = parseFloat(localStorage.getItem('sb_volume'));
            if (!isNaN(v)) volume = Math.max(0, Math.min(1, v));
            muted = localStorage.getItem('sb_muted') === '1';
        } catch (_) { }
    }
    function saveVolumeState() {
        try {
            localStorage.setItem('sb_volume', String(volume));
            localStorage.setItem('sb_muted', muted ? '1' : '0');
        } catch (_) { }
    }

    function effectiveVolume() {
        return muted ? 0 : volume;
    }

    function pickMuteIcon() {
        if (muted || volume === 0) return '🔇';
        if (volume < 0.34) return '🔈';
        if (volume < 0.67) return '🔉';
        return '🔊';
    }

    function applyVolumeToAllPlaying() {
        const v = effectiveVolume();
        for (const set of active.values()) {
            for (const a of set) {
                try {
                    a.volume = v;
                    a.muted = muted;
                } catch (_) { }
            }
        }
    }

    function syncVolumeUI() {
        if (!volumeSlider) return;
        const pct = Math.round(volume * 100);
        volumeSlider.value = String(pct);
        volumeSlider.style.setProperty('--vol-pct', pct + '%');
        if (volumeValue) volumeValue.textContent = muted ? 'Muted' : pct + '%';
        if (muteBtn) {
            muteBtn.textContent = pickMuteIcon();
            muteBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
            muteBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
        }
        if (volumeRow) volumeRow.classList.toggle('is-muted', muted);
    }

    function setVolume(pct) {
        volume = Math.max(0, Math.min(1, pct / 100));
        // Tweaking the slider while muted should unmute (intuitive behavior).
        if (muted && volume > 0) muted = false;
        applyVolumeToAllPlaying();
        syncVolumeUI();
        saveVolumeState();
    }

    function toggleMute() {
        // If volume is 0 and the user hits unmute, bring them back to a sane level.
        if (muted && volume === 0) volume = 0.8;
        muted = !muted;
        applyVolumeToAllPlaying();
        syncVolumeUI();
        saveVolumeState();
    }

    loadVolumeState();
    syncVolumeUI();
    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => setVolume(parseFloat(volumeSlider.value)));
    }
    if (muteBtn) {
        muteBtn.addEventListener('click', toggleMute);
    }

    // ── Theme ───────────────────────────────────────────────────────
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem('sb_theme', theme);
        } catch (_) { }
    }
    (function initTheme() {
        let theme = 'dark';
        try {
            theme = localStorage.getItem('sb_theme') || 'dark';
        } catch (_) { }
        applyTheme(theme);
    })();
    themeBtn.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
    });

    // ── Helpers ─────────────────────────────────────────────────────
    function setStatus(text) {
        statusEl.textContent = text || '';
    }

    function setCount(visible, total) {
        if (total === 0) {
            countEl.textContent = '';
        } else if (visible === total) {
            countEl.textContent = `${total} sound${total === 1 ? '' : 's'}`;
        } else {
            countEl.textContent = `${visible} of ${total}`;
        }
    }

    /**
     * Normalize a manifest entry. Accepts either:
     *   - legacy string filename:    "Effect-Big_Bang.mp3"
     *   - new object form:           { path: "Andor/B2-Casa.mp3", source: "Andor" }
     *
     * Returns:
     *   {
     *     path:     "Andor/B2-Casa.mp3",   // URL-relative to SOUNDS_DIR
     *     group:    "Andor",               // section heading (folder name)
     *     subLabel: "B2",                  // small caption above the title
     *     label:    "Casa",                // main button text
     *   }
     */
    function parseFile(entry) {
        const prettify = (s) => String(s || '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

        let path, sourceFolder;
        if (typeof entry === 'string') {
            path = entry;
            sourceFolder = null;
        } else if (entry && typeof entry === 'object') {
            path = entry.path || entry.file || '';
            sourceFolder = entry.source || null;
        } else {
            path = '';
        }

        // Get just the file name (no folders, no extension).
        const lastSlash = path.lastIndexOf('/');
        const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
        const base = fileName.replace(/\.[^.]+$/, '');

        // Split filename on the first "-" → subLabel + label.
        const dashIdx = base.indexOf('-');
        let subLabelRaw = '';
        let labelRaw = base;
        if (dashIdx > 0) {
            subLabelRaw = base.slice(0, dashIdx);
            labelRaw = base.slice(dashIdx + 1);
        }

        // Group = source folder when present; otherwise fall back to the
        // legacy "prefix as group" behavior so flat layouts still work.
        let group;
        if (sourceFolder) {
            group = prettify(sourceFolder);
        } else if (subLabelRaw) {
            group = prettify(subLabelRaw);
            subLabelRaw = ''; // avoid duplicating the group on the button
        } else {
            group = 'Misc';
        }

        const label = prettify(labelRaw) || prettify(subLabelRaw) || prettify(group);

        return {
            path,
            group,
            subLabel: prettify(subLabelRaw),
            label,
        };
    }

    function groupedSorted(sounds) {
        const map = new Map();
        for (const s of sounds) {
            if (!map.has(s.group)) map.set(s.group, []);
            map.get(s.group).push(s);
        }
        for (const list of map.values()) {
            list.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
        }
        return new Map(
            [...map.entries()].sort((a, b) =>
                a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })
            )
        );
    }

    function matchesFilter(s) {
        if (activeGroup !== '__all__' && s.group !== activeGroup) return false;
        if (!searchTerm) return true;
        const hay = (s.group + ' ' + (s.subLabel || '') + ' ' + s.label).toLowerCase();
        return hay.includes(searchTerm);
    }

    // ── Playback ────────────────────────────────────────────────────
    function play(sound, btn) {
        // Encode each path segment but keep the slashes between them.
        const url = SOUNDS_DIR + '/' + sound.path.split('/').map(encodeURIComponent).join('/');
        const key = sound.path;
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.volume = effectiveVolume();
        audio.muted = muted;
        // Allow several overlapping plays; mobile browsers throttle this
        // implicitly so we don't need a hard cap.
        audio.addEventListener(
            'ended',
            () => {
                forget(key, audio, btn);
            },
            { once: true }
        );
        audio.addEventListener(
            'error',
            (ev) => {
                console.error('Audio error', sound.path, ev);
                setStatus('Error loading: ' + sound.path);
                forget(key, audio, btn);
            },
            { once: true }
        );

        if (!active.has(key)) active.set(key, new Set());
        active.get(key).add(audio);

        btn.classList.add('playing');
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch((err) => {
                console.warn('Play blocked or failed:', err);
                setStatus('Tap a button to enable audio');
                forget(key, audio, btn);
            });
        }
    }

    function forget(key, audio, btn) {
        const set = active.get(key);
        if (set) {
            set.delete(audio);
            if (set.size === 0) {
                active.delete(key);
                if (btn) btn.classList.remove('playing');
            }
        }
        try {
            audio.src = '';
        } catch (_) { }
    }

    function stopAll() {
        for (const [, set] of active) {
            for (const a of set) {
                try {
                    a.pause();
                    a.currentTime = 0;
                } catch (_) { }
            }
        }
        active.clear();
        document.querySelectorAll('.sound-btn.playing').forEach((el) => el.classList.remove('playing'));
    }

    stopAllBtn.addEventListener('click', stopAll);

    // ── Render ──────────────────────────────────────────────────────
    function render() {
        const visible = allSounds.filter(matchesFilter);
        setCount(visible.length, allSounds.length);

        // Wipe everything in the board except the empty-state element.
        board.querySelectorAll('.group').forEach((g) => g.remove());

        if (allSounds.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }
        emptyState.classList.add('hidden');

        if (visible.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = '<h2>No matches</h2><p>Try a different filter.</p>';
            empty.classList.add('group'); // so we wipe it on next render
            board.appendChild(empty);
            return;
        }

        const groups = groupedSorted(visible);
        const frag = document.createDocumentFragment();

        for (const [groupName, items] of groups) {
            const section = document.createElement('section');
            section.className = 'group';

            const h = document.createElement('h2');
            h.className = 'group-title';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = groupName;
            const countSpan = document.createElement('span');
            countSpan.className = 'count';
            countSpan.textContent = items.length;
            h.append(titleSpan, countSpan);
            section.appendChild(h);

            const grid = document.createElement('div');
            grid.className = 'grid';

            for (const s of items) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'sound-btn';
                if (s.subLabel) {
                    const sub = document.createElement('span');
                    sub.className = 'sound-sub';
                    sub.textContent = s.subLabel;
                    btn.appendChild(sub);
                }
                const main = document.createElement('span');
                main.className = 'sound-label';
                main.textContent = s.label;
                btn.appendChild(main);
                btn.title = s.subLabel
                    ? `${s.group} — ${s.subLabel} — ${s.label}`
                    : `${s.group} — ${s.label}`;
                btn.addEventListener('click', () => play(s, btn));
                grid.appendChild(btn);
            }

            section.appendChild(grid);
            frag.appendChild(section);
        }

        board.appendChild(frag);
    }

    function renderChips() {
        const groups = [...new Set(allSounds.map((s) => s.group))].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        );

        groupChips.innerHTML = '';

        const allChip = document.createElement('button');
        allChip.type = 'button';
        allChip.className = 'chip';
        allChip.textContent = `All (${allSounds.length})`;
        allChip.setAttribute('aria-pressed', activeGroup === '__all__' ? 'true' : 'false');
        allChip.addEventListener('click', () => {
            activeGroup = '__all__';
            updateChipPressed();
            render();
        });
        groupChips.appendChild(allChip);

        for (const g of groups) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            const count = allSounds.filter((s) => s.group === g).length;
            chip.textContent = `${g} (${count})`;
            chip.dataset.group = g;
            chip.setAttribute('aria-pressed', activeGroup === g ? 'true' : 'false');
            chip.addEventListener('click', () => {
                activeGroup = g;
                updateChipPressed();
                render();
            });
            groupChips.appendChild(chip);
        }
    }

    function updateChipPressed() {
        groupChips.querySelectorAll('.chip').forEach((chip) => {
            const isAll = !chip.dataset.group;
            const pressed = isAll ? activeGroup === '__all__' : chip.dataset.group === activeGroup;
            chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        });
    }

    // ── Search ──────────────────────────────────────────────────────
    let searchDebounce;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            searchTerm = searchInput.value.trim().toLowerCase();
            render();
        }, 80);
    });
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            searchTerm = '';
            render();
        }
    });

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        // Skip when the user is typing in the search box.
        if (document.activeElement === searchInput) return;
        // Skip combo keys so we don't fight browser shortcuts.
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.key === 'Escape') {
            stopAll();
        } else if (e.key === 'm' || e.key === 'M') {
            toggleMute();
        } else if (e.key === 'ArrowUp') {
            setVolume(Math.round(volume * 100) + 5);
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            setVolume(Math.round(volume * 100) - 5);
            e.preventDefault();
        }
    });

    // ── Manifest load ───────────────────────────────────────────────
    async function loadManifest() {
        setStatus('Loading sounds…');
        try {
            const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const files = Array.isArray(data) ? data : data.files || [];
            allSounds = files.map(parseFile);
            renderChips();
            render();
            setStatus(allSounds.length === 0 ? 'No sounds found.' : 'Ready.');
        } catch (err) {
            console.warn('Could not load sounds.json — falling back to empty list.', err);
            allSounds = [];
            renderChips();
            render();
            setStatus('No manifest found. Run build_manifest.py.');
        }
    }

    loadManifest();

    // ── Service worker (PWA, optional) ──────────────────────────────
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('service-worker.js').catch(() => {
                // Fine — site still works without offline.
            });
        });
    }
})();

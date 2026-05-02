(() => {
  'use strict';

  const LOG = () => {};

  // ── State ──────────────────────────────────────────────────────────────────
  let dropdown       = null;
  let activeEl       = null;
  let matchStart     = -1;
  let matchEnd       = -1;
  let selIdx         = 0;
  let matches        = [];
  let commands       = {};
  let suppressedQuery = null;  // query that was dismissed via Escape — don't reopen for same token

  // ── Load commands ──────────────────────────────────────────────────────────
  chrome.storage.sync.get('commands', (res) => {
    commands = res.commands || {};
    LOG('commands loaded:', Object.keys(commands));
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.commands) {
      commands = changes.commands.newValue || {};
      LOG('commands updated:', Object.keys(commands));
    }
  });

  // ── Shadow DOM helper ──────────────────────────────────────────────────────
  // Events that cross shadow boundaries have their target retargeted to the
  // host custom element. We walk composedPath() to find the real input.
  function getActualTarget(e) {
    if (!e.composedPath) return e.target;
    for (const node of e.composedPath()) {
      if (node instanceof Element && isEditable(node)) return node;
    }
    return e.target;
  }

  // ── Slash detection ────────────────────────────────────────────────────────
  function getQuery(el) {
    let before = '';

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      let start = el.value.length;
      try { start = el.selectionStart ?? start; } catch (_) { /* types like email/number may throw */ }
      before = el.value.slice(0, start);
    } else if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return null;
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      // walk up to find the contenteditable root
      const root = el.isContentEditable ? el : el.closest('[contenteditable]');
      if (!root) return null;
      const pre = document.createRange();
      try {
        pre.selectNodeContents(root);
        pre.setEnd(range.startContainer, range.startOffset);
        before = pre.toString();
      } catch {
        return null;
      }
    }

    // slash must be at start or after whitespace
    if (!/(?:^|\s)\/[\w]*$/.test(before)) return null;

    const slashIdx = before.lastIndexOf('/');
    const query    = before.slice(slashIdx + 1).toLowerCase();
    return { query, slashIndex: slashIdx, endIndex: before.length };
  }

  // ── Cursor coords (mirror-div) ─────────────────────────────────────────────
  let _mirrorDiv = null;
  let _mirrorSpan = null;

  function getCoords(el) {
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return fallbackCoords(el);
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      const rects = range.getClientRects();
      if (rects.length) return { x: rects[0].left, y: rects[0].bottom + 4 };
      return fallbackCoords(el);
    }

    const cs   = window.getComputedStyle(el);
    const isIn = el.tagName === 'INPUT';
    const cur  = el.selectionStart ?? 0;

    // Re-use cached mirror elements to avoid repeated DOM creation.
    // Re-create if the SPA removed it from the DOM.
    if (!_mirrorDiv || !_mirrorDiv.isConnected) {
      _mirrorDiv = document.createElement('div');
      _mirrorSpan = document.createElement('span');
      _mirrorSpan.textContent = '​';
      _mirrorDiv.appendChild(_mirrorSpan);
      _mirrorDiv.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;z-index:-1;overflow:hidden;';
      document.body.appendChild(_mirrorDiv);
    }

    const m = _mirrorDiv;
    const sp = _mirrorSpan;

    const COPY = ['boxSizing','width','height','paddingTop','paddingRight',
      'paddingBottom','paddingLeft','borderTopWidth','borderRightWidth',
      'borderBottomWidth','borderLeftWidth','fontStyle','fontVariant',
      'fontWeight','fontSize','fontFamily','lineHeight','letterSpacing',
      'wordSpacing','textAlign','textTransform','textIndent','direction'];
    COPY.forEach(p => (m.style[p] = cs[p]));
    m.style.whiteSpace = isIn ? 'nowrap' : 'pre-wrap';
    m.textContent = el.value.slice(0, cur);
    m.appendChild(sp);  // re-append since textContent wiped it

    const er = el.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    const sr = sp.getBoundingClientRect();

    return {
      x: er.left + (sr.left - mr.left) - el.scrollLeft,
      y: er.top  + (sr.top  - mr.top)  - el.scrollTop + parseFloat(cs.lineHeight || cs.fontSize),
    };
  }

  function fallbackCoords(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  }

  // ── Dropdown build/destroy ─────────────────────────────────────────────────
  function buildDropdown(items, coords) {
    destroyDropdown();
    selIdx  = 0;
    matches = items;

    dropdown = document.createElement('div');
    dropdown.id = 'slashfill-dropdown';

    renderItems();
    document.body.appendChild(dropdown);
    placeDropdown(coords);

    const d = dropdown;
    requestAnimationFrame(() => d.classList.add('sf-visible'));
  }

  function renderItems() {
    dropdown.innerHTML = '';
    matches.forEach((cmd, i) => {
      const row = document.createElement('div');
      row.className = 'sf-item' + (i === selIdx ? ' sf-selected' : '');

      const k = document.createElement('span');
      k.className = 'sf-key';
      k.textContent = '/' + cmd.key;

      const v = document.createElement('span');
      v.className = 'sf-val';
      v.textContent = cmd.value;

      row.append(k, v);
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selIdx = i;
        insertSelected();
      });
      dropdown.appendChild(row);
    });

    const hint = document.createElement('div');
    hint.className = 'sf-hint';
    hint.innerHTML = '<kbd>↑↓</kbd> navigate &nbsp;<kbd>↵</kbd> insert &nbsp;<kbd>esc</kbd> dismiss';
    dropdown.appendChild(hint);
  }

  function placeDropdown(coords) {
    if (!dropdown) return;
    const pad = 8, vw = innerWidth, vh = innerHeight;
    dropdown.style.left = '-9999px';
    dropdown.style.top  = '-9999px';
    const dw = dropdown.offsetWidth;
    const dh = dropdown.offsetHeight;
    const cx = coords?.x ?? 20;
    const cy = coords?.y ?? 100;
    let x = Math.min(cx, vw - dw - pad);
    let y = cy + pad;
    if (y + dh > vh - pad) y = cy - dh - pad;
    dropdown.style.left = Math.max(x, pad) + 'px';
    dropdown.style.top  = y + 'px';
  }

  function destroyDropdown() {
    if (!dropdown) return;
    const d = dropdown;
    d.classList.remove('sf-visible');
    setTimeout(() => d.remove(), 150);
    dropdown = null;
    matches = [];
    matchStart = matchEnd = -1;
  }

  // ── Core handler ───────────────────────────────────────────────────────────
  function handle(el) {
    if (!el || !isEditable(el)) return;
    activeEl = el;

    const r = getQuery(el);
    LOG('handle:', el.tagName, el.type ?? '', '| query:', r);

    if (!r) { destroyDropdown(); suppressedQuery = null; return; }

    // User dismissed this exact token via Escape — keep it closed until they change the query
    if (suppressedQuery !== null) {
      if (r.query === suppressedQuery) return;
      suppressedQuery = null;  // query changed, lift suppression
    }

    matchStart = r.slashIndex;
    matchEnd   = r.endIndex;

    const hits = Object.entries(commands)
      .filter(([k]) => k.startsWith(r.query))
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(0, 8);

    LOG('hits:', hits.map(h => h.key));

    if (!hits.length) { destroyDropdown(); return; }

    buildDropdown(hits, getCoords(el));
  }

  // ── Insertion ──────────────────────────────────────────────────────────────
  function insertSelected() {
    if (!matches.length || !activeEl) return;
    const cmdValue = matches[selIdx].value;

    // Destroy first so our own dispatched 'input' event doesn't re-trigger handle()
    suppressedQuery = null;
    destroyDropdown();

    if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
      const val    = activeEl.value;
      const cursor = activeEl.selectionStart;   // position right before Enter was pressed

      LOG('insert | val:', JSON.stringify(val), '| cursor:', cursor, '| cmd:', cmdValue);

      // Walk backwards from cursor to find the slash
      let slashPos = -1;
      for (let i = cursor - 1; i >= 0; i--) {
        if (val[i] === '/') { slashPos = i; break; }
        if (val[i] === ' ' || val[i] === '\n') break;   // stop at whitespace
      }

      LOG('insert | slashPos:', slashPos);

      if (slashPos === -1) return;

      activeEl.focus();

      // For standard form inputs, execCommand is unreliable (especially for
      // type="email", "number", "tel" where browsers silently ignore it).
      // We use direct value assignment + native setter trick for React/Vue/Angular.
      activeEl.value = val.slice(0, slashPos) + cmdValue + val.slice(cursor);
      activeEl.setSelectionRange(slashPos + cmdValue.length, slashPos + cmdValue.length);

      // Force React/Vue/Angular controlled component updates via native setter
      const proto = activeEl instanceof HTMLInputElement ? window.HTMLInputElement.prototype
                  : activeEl instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
                  : null;
      if (proto) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(activeEl, activeEl.value);
        }
      }

      activeEl.dispatchEvent(new Event('input',  { bubbles: true }));
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));

      LOG('insert | result:', JSON.stringify(activeEl.value));

    } else if (activeEl.isContentEditable) {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range  = sel.getRangeAt(0);
      const node   = range.startContainer;
      const offset = range.startOffset;
      if (node.nodeType === Node.TEXT_NODE) {
        const txt  = node.textContent;
        let sPos   = -1;
        for (let i = offset - 1; i >= 0; i--) {
          if (txt[i] === '/') { sPos = i; break; }
          if (txt[i] === ' ' || txt[i] === '\n') break;
        }
        if (sPos !== -1) {
          node.textContent = txt.slice(0, sPos) + cmdValue + txt.slice(offset);
          const nr = document.createRange();
          nr.setStart(node, sPos + cmdValue.length);
          nr.collapse(true);
          sel.removeAllRanges();
          sel.addRange(nr);
          activeEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
        }
      }
    }
  }

  // ── isEditable ─────────────────────────────────────────────────────────────
  function isEditable(el) {
    if (!el || el.tagName === 'BODY') return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      return ['', 'text', 'search', 'url', 'email', 'tel'].includes((el.type || '').toLowerCase());
    }
    return !!el.isContentEditable;
  }

  // ── Event wiring ───────────────────────────────────────────────────────────
  let inputSeenThisCycle = false;

  document.addEventListener('input', (e) => {
    inputSeenThisCycle = true;
    handle(getActualTarget(e));
  }, true);

  document.addEventListener('keyup', (e) => {
    if (inputSeenThisCycle) { inputSeenThisCycle = false; return; }
    if (['Control','Alt','Meta','Shift','CapsLock','Tab',
         'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Escape'].includes(e.key)) return;
    handle(getActualTarget(e));
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!dropdown) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); selIdx = (selIdx + 1) % matches.length; renderItems(); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); selIdx = (selIdx - 1 + matches.length) % matches.length; renderItems(); }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertSelected(); }
    if (e.key === 'Escape') {
      e.preventDefault();
      const r = activeEl ? getQuery(activeEl) : null;
      suppressedQuery = r ? r.query : null;
      destroyDropdown();
    }
  }, true);

  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!dropdown?.contains(document.activeElement)) destroyDropdown(); }, 150);
  }, true);

  // ── Save-from-context-menu modal ───────────────────────────────────────────
  let saveModal = null;

  function showSaveModal(value) {
    destroySaveModal();

    const overlay = document.createElement('div');
    overlay.id = 'slashfill-save-overlay';

    const modal = document.createElement('div');
    modal.id = 'slashfill-save-modal';

    const title = document.createElement('div');
    title.className = 'sfm-title';
    title.textContent = 'Save as slash command';

    const preview = document.createElement('div');
    preview.className = 'sfm-preview';
    preview.textContent = value;

    const inputRow = document.createElement('div');
    inputRow.className = 'sfm-input-row';

    const prefix = document.createElement('span');
    prefix.className = 'sfm-prefix';
    prefix.textContent = '/';

    const input = document.createElement('input');
    input.className = 'sfm-input';
    input.type = 'text';
    input.placeholder = 'command';
    input.autocomplete = 'off';
    input.spellcheck = false;

    const errorMsg = document.createElement('div');
    errorMsg.className = 'sfm-error-msg';
    errorMsg.textContent = 'Letters, numbers, _ and - only.';

    inputRow.append(prefix, input);

    const hint = document.createElement('div');
    hint.className = 'sfm-hint';
    hint.innerHTML = '<kbd>↵</kbd> save &nbsp;<kbd>esc</kbd> cancel';

    modal.append(title, preview, inputRow, errorMsg, hint);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    saveModal = overlay;

    requestAnimationFrame(() => overlay.classList.add('sfm-visible'));
    input.focus();

    function submit() {
      const key = input.value.trim().replace(/^\/+/, '').replace(/\s+/g, '_');
      if (!key || !/^[\w-]+$/.test(key)) {
        input.classList.add('sfm-error');
        errorMsg.classList.add('sfm-error-visible');
        input.focus();
        return;
      }
      chrome.storage.sync.get('commands', (res) => {
        const cmds = res.commands || {};
        cmds[key] = value;
        chrome.storage.sync.set({ commands: cmds }, destroySaveModal);
      });
    }

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      input.classList.remove('sfm-error');
      errorMsg.classList.remove('sfm-error-visible');
      if (e.key === 'Enter')  { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { e.preventDefault(); destroySaveModal(); }
    }, true);

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) destroySaveModal();
    });
  }

  function destroySaveModal() {
    if (!saveModal) return;
    const m = saveModal;
    m.classList.remove('sfm-visible');
    setTimeout(() => m.remove(), 150);
    saveModal = null;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'slashfill-save') showSaveModal(msg.value);
  });

})();

(() => {
  'use strict';

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const mainView   = document.getElementById('mainView');
  const formView   = document.getElementById('formView');
  const listWrap   = document.getElementById('listWrap');
  const countBadge = document.getElementById('countBadge');
  const searchInput = document.getElementById('searchInput');
  const btnAdd     = document.getElementById('btnAdd');
  const btnBack    = document.getElementById('btnBack');
  const btnCancel  = document.getElementById('btnCancel');
  const btnSave    = document.getElementById('btnSave');
  const formTitle  = document.getElementById('formTitle');
  const keyInput   = document.getElementById('keyInput');
  const valInput   = document.getElementById('valInput');
  const keyError   = document.getElementById('keyError');
  const valError   = document.getElementById('valError');

  // ── State ──────────────────────────────────────────────────────────────────
  let commands = {};      // { key: value }
  let editingKey = null;  // null = add mode, string = edit mode
  let searchQuery = '';

  // ── Storage helpers ────────────────────────────────────────────────────────
  function load() {
    chrome.storage.sync.get('commands', (res) => {
      commands = res.commands || {};
      render();
      updateCount();
    });
  }

  function save(cb) {
    chrome.storage.sync.set({ commands }, () => {
      if (cb) cb();
    });
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  function render() {
    const q = searchQuery.toLowerCase();
    const entries = Object.entries(commands)
      .filter(([k, v]) => !q || k.toLowerCase().includes(q) || v.toLowerCase().includes(q))
      .sort(([a], [b]) => a.localeCompare(b));

    listWrap.innerHTML = '';

    if (Object.keys(commands).length === 0) {
      listWrap.appendChild(buildEmptyState());
      return;
    }

    if (entries.length === 0) {
      const el = document.createElement('div');
      el.className = 'no-results';
      el.textContent = 'No commands match "' + searchQuery + '"';
      listWrap.appendChild(el);
      return;
    }

    entries.forEach(([key, value], i) => {
      const item = buildItem(key, value, i);
      listWrap.appendChild(item);
    });
  }

  function buildItem(key, value, index) {
    const div = document.createElement('div');
    div.className = 'cmd-item';
    div.style.animationDelay = (index * 30) + 'ms';

    const keyEl = document.createElement('span');
    keyEl.className = 'item-key';
    keyEl.textContent = '/' + key;

    const valEl = document.createElement('span');
    valEl.className = 'item-val';
    valEl.textContent = value;
    valEl.title = value;

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-icon';
    btnEdit.title = 'Edit';
    btnEdit.innerHTML = iconEdit();
    btnEdit.addEventListener('click', () => openForm(key));

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-icon danger';
    btnDel.title = 'Delete';
    btnDel.innerHTML = iconTrash();
    btnDel.addEventListener('click', () => deleteCommand(key));

    actions.append(btnEdit, btnDel);
    div.append(keyEl, valEl, actions);
    return div;
  }

  function buildEmptyState() {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `
      <div class="empty-mark">/</div>
      <h3>No commands yet</h3>
      <p>Save shortcuts for anything you type often — links, bios, emails, templates.</p>
      <div class="example-pills">
        <span class="pill">/github</span>
        <span class="pill">/email</span>
        <span class="pill">/linkedin</span>
        <span class="pill">/bio</span>
        <span class="pill">/phone</span>
      </div>
    `;
    return div;
  }

  function updateCount() {
    const n = Object.keys(commands).length;
    countBadge.textContent = n;
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  function openForm(editKey) {
    editingKey = editKey ?? null;
    formTitle.textContent = editKey ? 'Edit Command' : 'New Command';

    keyInput.value = editKey ?? '';
    valInput.value = editKey ? (commands[editKey] ?? '') : '';

    keyError.classList.remove('visible');
    valError.classList.remove('visible');

    mainView.classList.add('hidden');
    formView.classList.add('active');

    keyInput.focus();
    if (editKey) keyInput.select();
  }

  function closeForm() {
    formView.classList.remove('active');
    mainView.classList.remove('hidden');
    editingKey = null;
    searchInput.focus();
  }

  function submitForm() {
    const rawKey = keyInput.value.trim().replace(/^\/+/, '').replace(/\s+/g, '_');
    const value = valInput.value.trim();

    let valid = true;

    if (!rawKey || !/^[\w-]+$/.test(rawKey)) {
      keyError.classList.add('visible');
      valid = false;
    } else {
      keyError.classList.remove('visible');
    }

    if (!value) {
      valError.classList.add('visible');
      valid = false;
    } else {
      valError.classList.remove('visible');
    }

    if (!valid) return;

    // If renaming, remove old key
    if (editingKey && editingKey !== rawKey) {
      delete commands[editingKey];
    }

    commands[rawKey] = value;
    save(() => {
      render();
      updateCount();
      closeForm();
    });
  }

  function deleteCommand(key) {
    delete commands[key];
    save(() => {
      render();
      updateCount();
    });
  }

  // ── Context menu pending save ──────────────────────────────────────────────
  function checkPendingSave() {
    chrome.storage.session.get('pendingSave', (res) => {
      if (res.pendingSave) {
        chrome.storage.session.remove('pendingSave');
        openForm(null);
        valInput.value = res.pendingSave;
        keyInput.focus();
      }
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  btnAdd.addEventListener('click', () => openForm(null));
  btnBack.addEventListener('click', closeForm);
  btnCancel.addEventListener('click', closeForm);
  btnSave.addEventListener('click', submitForm);

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    render();
  });

  keyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); valInput.focus(); }
    if (e.key === 'Escape') closeForm();
  });

  valInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitForm(); }
    if (e.key === 'Escape') closeForm();
  });

  // Strip slash prefix as user types
  keyInput.addEventListener('input', () => {
    const v = keyInput.value.replace(/^\/+/, '');
    if (v !== keyInput.value) keyInput.value = v;
  });

  // ── SVG icons ──────────────────────────────────────────────────────────────
  function iconEdit() {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 2l3 3-8 8H3v-3l8-8z"/>
    </svg>`;
  }

  function iconTrash() {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="2 4 14 4"/><path d="M5 4V2h6v2"/><path d="M6 7v5M10 7v5"/><path d="M3 4l1 10h8l1-10"/>
    </svg>`;
  }

  function iconZap() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>`;
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  load();
  checkPendingSave();
})();

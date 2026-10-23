/* =====================================================================
   SISTec Online Examination Portal - script.js
   Vanilla JavaScript only. No backend, no libraries.
   Storage: LocalStorage (details, answers, status, deadline)
            IndexedDB    (photographs of handwritten answers)
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Settings (read from questions.js)
  ------------------------------------------------------------------ */
  const CFG = window.EXAM_CONFIG || {};
  const QS = Array.isArray(window.QUESTIONS) ? window.QUESTIONS : [];
  const DUR = CFG.duration || {};
  const DURATION_MS =
    (((DUR.hours || 0) * 3600) + ((DUR.minutes || 0) * 60) + (DUR.seconds || 0)) * 1000 || 90 * 60 * 1000;
  const WARN_MS = (CFG.warnAtSeconds || 300) * 1000;
  const URGENT_MS = (CFG.urgentAtSeconds || 60) * 1000;
  const MAX_MB = CFG.maxFileSizeMB || 8;
  const MAX_PHOTOS = CFG.maxPhotosPerQuestion || 10;
  const NEG = Number(CFG.negativeMarks) || 0;

  const STORE_KEY = 'sistec_exam_state_v1';
  const DB_NAME = 'sistec_exam_photos';
  const DB_STORE = 'photos';
  const OK_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const OK_EXT = ['jpg', 'jpeg', 'png', 'webp'];
  const SIG = QS.map(function (q) { return q.id; }).join('|');

  const STATUS_LABEL = {
    'not-visited': 'Not Visited',
    'answered': 'Answered',
    'unanswered': 'Visited but Unanswered',
    'review': 'Marked for Review',
    'answered-review': 'Answered and Marked for Review'
  };
  const STATUS_ORDER = ['not-visited', 'answered', 'unanswered', 'review', 'answered-review'];

  /* ------------------------------------------------------------------
     2. Small helpers
  ------------------------------------------------------------------ */
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  // Escape text, then turn `code` into <code>code</code> and newlines into <br>
  const fmt = function (s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
  };
  const plain = function (s) { return String(s).replace(/`/g, ''); };
  const pad = function (n) { return String(n).padStart(2, '0'); };
  function clock(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return pad(Math.floor(t / 3600)) + ':' + pad(Math.floor((t % 3600) / 60)) + ':' + pad(t % 60);
  }
  function durText(ms) {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + s + ' sec';
  }
  function num(n) { return String(+Number(n).toFixed(2)); }
  function truncate(s, n) { s = plain(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function toast(msg, type, ms) {
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 320);
    }, ms || 3500);
  }

  /* ------------------------------------------------------------------
     3. Application state (saved in LocalStorage)
  ------------------------------------------------------------------ */
  function freshState() {
    return {
      v: 1, sig: SIG,
      student: null,
      started: false, startedAt: 0, deadline: 0,
      current: 0,
      answers: {},   // questionId -> chosen option index
      visited: {},   // questionId -> true
      review: {},    // questionId -> true
      submitted: false, submittedAt: 0, auto: false,
      result: null
    };
  }
  let S = freshState();
  let photos = {};       // questionId -> [photo records]  (blobs kept in memory for display)
  const urlCache = {};   // photo id -> object URL
  let storageWarned = false;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(S));
    } catch (e) {
      if (!storageWarned) {
        storageWarned = true;
        toast('Browser storage is unavailable. Your progress will not survive a page refresh.', 'warn', 7000);
      }
    }
  }
  function clearState() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------
     4. IndexedDB for photographs (falls back to memory if unavailable)
  ------------------------------------------------------------------ */
  const PhotoDB = (function () {
    let db = null, useMem = false, mem = [], seq = 1;

    function open() {
      return new Promise(function (resolve) {
        if (!window.indexedDB) { useMem = true; return resolve(); }
        let req;
        try { req = indexedDB.open(DB_NAME, 1); } catch (e) { useMem = true; return resolve(); }
        req.onupgradeneeded = function () {
          const d = req.result;
          if (!d.objectStoreNames.contains(DB_STORE)) {
            const st = d.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
            st.createIndex('qid', 'qid', { unique: false });
          }
        };
        req.onsuccess = function () { db = req.result; resolve(); };
        req.onerror = function () { useMem = true; resolve(); };
        req.onblocked = function () { useMem = true; resolve(); };
      });
    }
    function run(mode, fn) {
      return new Promise(function (resolve, reject) {
        let tx, out;
        try {
          tx = db.transaction(DB_STORE, mode);
          const r = fn(tx.objectStore(DB_STORE));
          if (r) r.onsuccess = function () { out = r.result; };
        } catch (e) { return reject(e); }
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Storage aborted')); };
      });
    }
    return {
      open: open,
      isMemory: function () { return useMem; },
      add: function (rec) {
        if (useMem) { rec.id = seq++; mem.push(rec); return Promise.resolve(rec.id); }
        return run('readwrite', function (st) { return st.add(rec); });
      },
      put: function (rec) {
        if (useMem) {
          const i = mem.findIndex(function (m) { return m.id === rec.id; });
          if (i >= 0) mem[i] = rec;
          return Promise.resolve();
        }
        return run('readwrite', function (st) { return st.put(rec); });
      },
      remove: function (id) {
        if (useMem) { mem = mem.filter(function (m) { return m.id !== id; }); return Promise.resolve(); }
        return run('readwrite', function (st) { return st.delete(id); });
      },
      all: function () {
        if (useMem) return Promise.resolve(mem.slice());
        return run('readonly', function (st) { return st.getAll(); }).then(function (r) { return r || []; });
      },
      clear: function () {
        if (useMem) { mem = []; return Promise.resolve(); }
        return run('readwrite', function (st) { return st.clear(); }).catch(function () { /* ignore */ });
      }
    };
  })();

  function urlFor(rec) {
    if (!urlCache[rec.id]) urlCache[rec.id] = URL.createObjectURL(rec.blob);
    return urlCache[rec.id];
  }
  function revokeUrl(id) {
    if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; }
  }
  function sortPhotos(qid) {
    if (photos[qid]) photos[qid].sort(function (a, b) { return (a.pageNo - b.pageNo) || (a.addedAt - b.addedAt); });
  }
  async function loadPhotos() {
    photos = {};
    let all = [];
    try { all = await PhotoDB.all(); } catch (e) { toast('Could not read saved photographs from browser storage.', 'warn', 6000); }
    const valid = {};
    QS.forEach(function (q) { if (q.type === 'theory') valid[q.id] = true; });
    all.forEach(function (r) {
      if (!valid[r.qid]) return;
      (photos[r.qid] = photos[r.qid] || []).push(r);
    });
    Object.keys(photos).forEach(sortPhotos);
  }
  function photoCount(qid) { return (photos[qid] || []).length; }

  /* ------------------------------------------------------------------
     5. Question status helpers
  ------------------------------------------------------------------ */
  function isAnswered(q) {
    return q.type === 'mcq' ? S.answers[q.id] !== undefined : photoCount(q.id) > 0;
  }
  function statusOf(q) {
    const a = isAnswered(q), r = !!S.review[q.id], v = !!S.visited[q.id];
    if (a && r) return 'answered-review';
    if (r) return 'review';
    if (a) return 'answered';
    if (v) return 'unanswered';
    return 'not-visited';
  }
  function tally() {
    const c = {};
    STATUS_ORDER.forEach(function (k) { c[k] = 0; });
    let answered = 0;
    QS.forEach(function (q) { c[statusOf(q)]++; if (isAnswered(q)) answered++; });
    return {
      c: c, answered: answered, unanswered: QS.length - answered,
      marked: QS.filter(function (q) { return S.review[q.id]; }).length
    };
  }

  /* ------------------------------------------------------------------
     6. Modal system
  ------------------------------------------------------------------ */
  let modalResolve = null, modalDismissible = true;

  function openModal(o) {
    if (modalResolve) { const r = modalResolve; modalResolve = null; r(undefined); }
    return new Promise(function (resolve) {
      modalResolve = resolve;
      modalDismissible = o.dismissible !== false;
      $('modalIcon').textContent = o.icon || '';
      $('modalTitle').textContent = o.title || '';
      $('modalBody').innerHTML = o.html || '';
      const acts = $('modalActions');
      acts.innerHTML = '';
      (o.actions || [{ label: 'OK', value: true, cls: 'btn-primary' }]).forEach(function (a) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (a.cls || 'btn-outline');
        b.textContent = a.label;
        if (a.id) b.id = a.id;
        if (a.disabled) b.disabled = true;
        b.addEventListener('click', function () { closeModal(a.value); });
        acts.appendChild(b);
      });
      $('modal').classList.add('open');
      document.body.classList.add('modal-open');
      if (o.onOpen) o.onOpen();
      const first = acts.querySelector('button:not(:disabled)');
      if (first && !o.noFocus) first.focus();
    });
  }
  function closeModal(value) {
    $('modal').classList.remove('open');
    document.body.classList.remove('modal-open');
    if (modalResolve) { const r = modalResolve; modalResolve = null; r(value); }
  }
  async function confirmBox(title, html, okLabel, icon) {
    const v = await openModal({
      icon: icon || '❓', title: title, html: html,
      actions: [
        { label: 'Cancel', value: false, cls: 'btn-outline' },
        { label: okLabel || 'Yes', value: true, cls: 'btn-primary' }
      ]
    });
    return v === true;
  }

  /* ------------------------------------------------------------------
     7. Screens
  ------------------------------------------------------------------ */
  function showScreen(name) {
    document.body.dataset.screen = name;
    ['landing', 'exam', 'result'].forEach(function (k) {
      $('screen-' + k).classList.toggle('active', k === name);
    });
    if (name !== 'exam') document.title = 'SISTec Online Examination Portal';
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------
     8. Landing page
  ------------------------------------------------------------------ */
  function setupLanding() {
    const mcq = QS.filter(function (q) { return q.type === 'mcq'; }).length;
    const th = QS.filter(function (q) { return q.type === 'theory'; }).length;
    const total = QS.reduce(function (s, q) { return s + q.marks; }, 0);
    $('heroChips').innerHTML =
      '<li><b>' + QS.length + '</b>Questions</li>' +
      '<li><b>' + mcq + ' + ' + th + '</b>MCQ + Theory</li>' +
      '<li><b>' + durText(DURATION_MS).replace(' 0 sec', '') + '</b>Duration</li>' +
      '<li><b>' + total + '</b>Total marks</li>';
    $('sSubject').value = CFG.defaultSubject || '';
    $('sTest').value = CFG.defaultTestName || '';
  }

  function readForm() {
    return {
      name: $('sName').value.trim().replace(/\s+/g, ' '),
      roll: $('sRoll').value.trim().toUpperCase(),
      branch: $('sBranch').value,
      semester: $('sSem').value,
      subject: $('sSubject').value.trim(),
      test: $('sTest').value.trim()
    };
  }
  function validate(d) {
    const errs = {};
    if (!/^[A-Za-z][A-Za-z .'\-]{2,59}$/.test(d.name)) errs.Name = 'Enter your full name (letters only, at least 3 characters).';
    if (!/^[A-Za-z0-9\-\/]{4,20}$/.test(d.roll)) errs.Roll = 'Enter a valid roll number (4 to 20 letters or digits).';
    if (!d.branch) errs.Branch = 'Please select your branch.';
    if (!d.semester) errs.Sem = 'Please select your semester.';
    if (d.subject.length < 2) errs.Subject = 'Subject name is required.';
    if (d.test.length < 2) errs.Test = 'Test name is required.';
    ['Name', 'Roll', 'Branch', 'Sem', 'Subject', 'Test'].forEach(function (k) {
      const f = $('f' + k);
      f.classList.remove('invalid');
      $('e' + k).textContent = '';
      if (errs[k]) {
        void f.offsetWidth;
        f.classList.add('invalid');
        $('e' + k).textContent = errs[k];
      }
    });
    const first = Object.keys(errs)[0];
    if (first) {
      const inp = $('f' + first).querySelector('input,select');
      if (inp) inp.focus();
    }
    return !first;
  }

  function showInstructions() {
    const mcq = QS.filter(function (q) { return q.type === 'mcq'; }).length;
    const th = QS.filter(function (q) { return q.type === 'theory'; }).length;
    const html =
      '<ul class="instr">' +
      '<li>Total time: <b>' + durText(DURATION_MS).replace(' 0 sec', '') + '</b>. The timer starts as soon as you press <b>I Agree</b> and keeps running even if you refresh the page.</li>' +
      '<li>The test has <b>' + mcq + ' MCQs</b> and <b>' + th + ' theory questions</b>. Correct answers are not shown during the test.</li>' +
      '<li>You can change MCQ answers, use <b>Clear Answer</b>, or <b>Mark for Review</b> at any time before submitting.</li>' +
      '<li>For theory questions, write on paper and <b>upload photographs</b> of your pages (JPG, PNG or WebP, up to ' + MAX_MB + ' MB each, ' + MAX_PHOTOS + ' photos per question). Number the pages clearly.</li>' +
      '<li>Photographs are saved <b>only in this browser</b>. They are not sent to your teacher or any server. Follow your teacher\'s instructions for sharing your result.</li>' +
      '<li>When time runs out, the test is <b>submitted automatically</b>. After submission nothing can be changed.</li>' +
      '<li>Do not clear browser data or switch browsers/devices during the exam.</li>' +
      '</ul>' +
      '<label class="agree"><input type="checkbox" id="agreeChk"> I have read the instructions and agree to follow them.</label>';
    return openModal({
      icon: '📋', title: 'Examination Instructions', html: html,
      actions: [
        { label: 'Cancel', value: false, cls: 'btn-ghost' },
        { label: 'I Agree - Begin Test', value: true, cls: 'btn-primary', id: 'btnAgree', disabled: true }
      ],
      noFocus: true,
      onOpen: function () {
        $('agreeChk').addEventListener('change', function (e) { $('btnAgree').disabled = !e.target.checked; });
      }
    });
  }

  async function onStart(e) {
    e.preventDefault();
    if (!QS.length) { toast('No questions found. Check questions.js.', 'bad', 6000); return; }
    const d = readForm();
    if (!validate(d)) return;
    const ok = await showInstructions();
    if (ok !== true) return;
    await beginExam(d);
  }

  async function beginExam(d) {
    await PhotoDB.clear();
    photos = {};
    Object.keys(urlCache).forEach(function (k) { revokeUrl(k); });
    S = freshState();
    S.student = d;
    S.started = true;
    S.startedAt = Date.now();
    S.deadline = S.startedAt + DURATION_MS;
    saveState();
    if (PhotoDB.isMemory()) toast('Photo storage (IndexedDB) is unavailable here. Photos will be lost if you refresh.', 'warn', 8000);
    showExam();
  }

  /* ------------------------------------------------------------------
     9. Exam screen
  ------------------------------------------------------------------ */
  function showExam() {
    $('hdrStudent').innerHTML = '<b>' + esc(S.student.name) + '</b><span>' + esc(S.student.roll) + '</span>';
    showScreen('exam');
    if (S.current < 0 || S.current >= QS.length) S.current = 0;
    renderQuestion(0);
    startTimer();
  }

  function theoryHTML(q) {
    return '' +
      '<div class="local-note"><span aria-hidden="true">ℹ️</span><div>Photographs are saved <b>only in this browser on this device</b>. They are <b>not uploaded</b> to a teacher or a server.</div></div>' +
      '<div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload photographs of your handwritten answer">' +
      '<div class="dz-icon" aria-hidden="true">📷</div>' +
      '<p><strong>Drag &amp; drop</strong> photos of your handwritten answer here</p>' +
      '<p class="tiny muted">JPG, JPEG, PNG or WebP · up to ' + MAX_MB + ' MB each · up to ' + MAX_PHOTOS + ' photos</p>' +
      '<div class="dz-actions">' +
      '<button type="button" class="btn btn-primary" data-act="pick">⬆ Upload Photo</button>' +
      '<button type="button" class="btn btn-outline" data-act="camera">📸 Use Camera</button>' +
      '</div></div>' +
      '<div class="upload-msg" id="uploadMsg" role="status"></div>' +
      '<div class="photo-head"><h3>Your handwritten pages</h3><span class="tiny muted" id="photoCount"></span></div>' +
      '<div class="photo-grid" id="photoGrid"></div>';
  }

  function renderQuestion(dir) {
    const q = QS[S.current];
    S.visited[q.id] = true;
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    let body;
    if (q.type === 'mcq') {
      body = '<div class="options" role="radiogroup" aria-label="Answer options">' +
        q.options.map(function (o, i) {
          const sel = S.answers[q.id] === i;
          return '<label class="opt' + (sel ? ' selected' : '') + '">' +
            '<input type="radio" name="opt" value="' + i + '"' + (sel ? ' checked' : '') + '>' +
            '<span class="opt-key">' + letters[i] + '</span>' +
            '<span class="opt-text">' + fmt(o) + '</span>' +
            '<span class="opt-check" aria-hidden="true">✓</span></label>';
        }).join('') + '</div>';
    } else {
      body = theoryHTML(q);
    }
    const marksTxt = q.marks + (q.marks === 1 ? ' Mark' : ' Marks') + (q.type === 'mcq' && NEG ? ' (−' + NEG + ' for wrong)' : '');
    const card = $('qCard');
    card.innerHTML =
      '<div class="q-head"><span class="q-num">Question ' + (S.current + 1) + ' <small>of ' + QS.length + '</small></span>' +
      '<span class="q-badges"><span class="badge ' + q.type + '">' + (q.type === 'mcq' ? 'MCQ' : 'Theory · Photo answer') + '</span>' +
      '<span class="badge marks">' + marksTxt + '</span>' +
      '<span class="badge rev" id="revBadge"' + (S.review[q.id] ? '' : ' hidden') + '>⚑ Marked for review</span></span></div>' +
      '<h2 class="q-text">' + fmt(q.text) + '</h2>' + body;
    card.classList.remove('in-right', 'in-left');
    void card.offsetWidth;
    card.classList.add(dir < 0 ? 'in-left' : 'in-right');
    if (q.type === 'theory') renderPhotos(q.id);
    refresh();
    saveState();
  }

  function refresh() {
    const q = QS[S.current];
    renderPalette();
    const t = tally();
    const pct = QS.length ? Math.round((t.answered / QS.length) * 100) : 0;
    $('progText').textContent = t.answered + ' of ' + QS.length + ' answered';
    $('progPct').textContent = pct + '%';
    $('progBar').style.width = pct + '%';
    $('progressBox').setAttribute('aria-valuenow', pct);
    $('btnPrev').disabled = S.current === 0;
    $('btnNext').textContent = S.current === QS.length - 1 ? 'Finish ✔' : 'Next →';
    const rv = !!S.review[q.id];
    $('btnReview').classList.toggle('on', rv);
    $('btnReview').textContent = rv ? '⚑ Unmark Review' : '⚑ Mark for Review';
    $('btnClear').disabled = !isAnswered(q);
    const rb = $('revBadge');
    if (rb) rb.hidden = !rv;
    $('legend').innerHTML = STATUS_ORDER.map(function (k) {
      return '<div class="lg" data-k="' + k + '"><i class="' + k + '"></i><span>' + STATUS_LABEL[k] + '</span><b>' + t.c[k] + '</b></div>';
    }).join('');
  }

  function renderPalette() {
    const secs = [['mcq', 'Section A · MCQ'], ['theory', 'Section B · Theory (photo answers)']];
    let html = '';
    secs.forEach(function (sec) {
      const items = [];
      QS.forEach(function (q, i) { if (q.type === sec[0]) items.push([q, i]); });
      if (!items.length) return;
      html += '<h4 class="pal-title">' + sec[1] + '</h4><div class="pal-grid">' +
        items.map(function (x) {
          const s = statusOf(x[0]), i = x[1];
          return '<button type="button" class="pal ' + s + (i === S.current ? ' current' : '') + '" data-i="' + i +
            '" aria-label="Question ' + (i + 1) + ': ' + STATUS_LABEL[s] + '" title="Q' + (i + 1) + ' - ' + STATUS_LABEL[s] + '">' + (i + 1) + '</button>';
        }).join('') + '</div>';
    });
    $('palette').innerHTML = html;
  }

  function go(i, fromPalette) {
    if (S.submitted || i < 0 || i >= QS.length || i === S.current) return;
    const dir = i > S.current ? 1 : -1;
    S.current = i;
    renderQuestion(dir);
    if (fromPalette && window.innerWidth <= 960) $('examMain').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectOption(i, label) {
    if (S.submitted) return;
    const q = QS[S.current];
    S.answers[q.id] = i;
    $('qCard').querySelectorAll('.opt').forEach(function (l, k) { l.classList.toggle('selected', k === i); });
    label.classList.remove('pop');
    void label.offsetWidth;
    label.classList.add('pop');
    refresh();
    saveState();
  }

  async function clearAnswer() {
    if (S.submitted) return;
    const q = QS[S.current];
    if (q.type === 'mcq') {
      delete S.answers[q.id];
      $('qCard').querySelectorAll('.opt').forEach(function (l) { l.classList.remove('selected'); l.querySelector('input').checked = false; });
      refresh();
      saveState();
    } else {
      const n = photoCount(q.id);
      if (!n) return;
      const ok = await confirmBox('Remove all photos?', '<p>This will remove all <b>' + n + '</b> photo(s) from this theory question.</p>', 'Remove all', '🗑');
      if (!ok || S.submitted) return;
      const list = (photos[q.id] || []).slice();
      for (let k = 0; k < list.length; k++) {
        try { await PhotoDB.remove(list[k].id); } catch (e) { /* ignore */ }
        revokeUrl(list[k].id);
      }
      photos[q.id] = [];
      renderPhotos(q.id);
      refresh();
      toast('All photos removed.', '');
    }
  }

  function toggleReview() {
    if (S.submitted) return;
    const q = QS[S.current];
    if (S.review[q.id]) delete S.review[q.id]; else S.review[q.id] = true;
    refresh();
    saveState();
  }

  /* ------------------------------------------------------------------
     10. Theory photo upload
  ------------------------------------------------------------------ */
  function validateFile(f) {
    const ext = (f.name && f.name.indexOf('.') > -1 ? f.name.split('.').pop() : '').toLowerCase();
    const type = (f.type || '').toLowerCase();
    const typeOk = type ? OK_TYPES.indexOf(type) > -1 : OK_EXT.indexOf(ext) > -1;
    if (!typeOk) return 'Only JPG, JPEG, PNG and WebP images are allowed.';
    if (!f.size) return 'The file is empty.';
    if (f.size > MAX_MB * 1024 * 1024) return 'File is too large (' + (f.size / 1048576).toFixed(1) + ' MB). Maximum is ' + MAX_MB + ' MB.';
    return null;
  }
  function showUploadMsg(errors, added) {
    const box = $('uploadMsg');
    if (!box) return;
    let html = '';
    if (added) html += '<div class="good">✓ ' + added + ' photo' + (added > 1 ? 's' : '') + ' added.</div>';
    errors.forEach(function (m) { html += '<div class="bad">✕ ' + esc(m) + '</div>'; });
    box.innerHTML = html;
  }

  async function addPhotos(qid, fileList) {
    if (S.submitted) return;
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    const list = photos[qid] || (photos[qid] = []);
    const errors = [];
    let added = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (list.length >= MAX_PHOTOS) { errors.push('Maximum ' + MAX_PHOTOS + ' photos allowed for one question.'); break; }
      const err = validateFile(f);
      if (err) { errors.push((f.name || 'Photo') + ': ' + err); continue; }
      const maxPage = list.reduce(function (m, r) { return Math.max(m, r.pageNo); }, 0);
      const rec = { qid: qid, pageNo: Math.min(99, maxPage + 1), name: f.name || 'photo', type: f.type, size: f.size, blob: f, addedAt: Date.now() };
      try {
        const id = await PhotoDB.add(rec);
        rec.id = id;
        list.push(rec);
        added++;
      } catch (e) {
        errors.push((f.name || 'Photo') + ': could not be saved. Browser storage may be full.');
      }
    }
    sortPhotos(qid);
    if (QS[S.current] && QS[S.current].id === qid) {
      renderPhotos(qid);
      showUploadMsg(errors, added);
    }
    refresh();
    if (errors.length) toast(errors[0], 'bad', 5000);
  }

  function renderPhotos(qid) {
    const grid = $('photoGrid');
    if (!grid) return;
    const list = photos[qid] || [];
    const cnt = $('photoCount');
    if (!list.length) {
      grid.innerHTML = '<div class="empty-photos">No photos uploaded yet. Photograph each page of your handwritten answer and upload it here.</div>';
      cnt.textContent = '0 / ' + MAX_PHOTOS + ' photos';
      return;
    }
    const pages = list.map(function (r) { return r.pageNo; });
    const dup = pages.some(function (p, i) { return pages.indexOf(p) !== i; });
    cnt.textContent = list.length + ' / ' + MAX_PHOTOS + ' photos' + (dup ? ' · ⚠ two photos share a page number' : '');
    grid.innerHTML = list.map(function (r) {
      const u = urlFor(r);
      return '<figure class="photo" data-id="' + r.id + '">' +
        '<a href="' + u + '" target="_blank" rel="noopener" title="Open full size"><img src="' + u + '" alt="Handwritten answer, page ' + r.pageNo + '"></a>' +
        '<figcaption><label>Page no. <input type="number" min="1" max="99" value="' + r.pageNo + '" data-act="page" aria-label="Page number"></label>' +
        '<div class="photo-btns"><button type="button" class="btn btn-outline" data-act="replace">Replace</button>' +
        '<button type="button" class="btn btn-danger-o" data-act="remove">Remove</button></div></figcaption></figure>';
    }).join('');
  }

  let replaceTarget = null;
  function startReplace(id) { replaceTarget = id; $('replaceInput').click(); }

  async function doReplace(file) {
    const q = QS[S.current];
    const rec = (photos[q.id] || []).find(function (r) { return r.id === replaceTarget; });
    replaceTarget = null;
    if (!rec || !file || S.submitted) return;
    const err = validateFile(file);
    if (err) { showUploadMsg([file.name + ': ' + err], 0); toast(err, 'bad', 5000); return; }
    const old = { blob: rec.blob, name: rec.name, type: rec.type, size: rec.size };
    rec.blob = file; rec.name = file.name || rec.name; rec.type = file.type; rec.size = file.size;
    try {
      await PhotoDB.put(rec);
    } catch (e) {
      Object.assign(rec, old);
      toast('Could not replace the photo. Browser storage may be full.', 'bad', 5000);
      return;
    }
    revokeUrl(rec.id);
    renderPhotos(q.id);
    showUploadMsg([], 0);
    toast('Photo replaced.', 'ok');
  }

  async function removePhoto(id) {
    const q = QS[S.current];
    const ok = await confirmBox('Remove this photo?', '<p>This photograph will be deleted from this browser.</p>', 'Remove', '🗑');
    if (!ok || S.submitted) return;
    try { await PhotoDB.remove(id); } catch (e) { /* ignore */ }
    revokeUrl(id);
    photos[q.id] = (photos[q.id] || []).filter(function (r) { return r.id !== id; });
    renderPhotos(q.id);
    refresh();
  }

  async function changePageNo(id, input) {
    const q = QS[S.current];
    const rec = (photos[q.id] || []).find(function (r) { return r.id === id; });
    if (!rec) return;
    const v = parseInt(input.value, 10);
    if (!(v >= 1 && v <= 99)) { input.value = rec.pageNo; toast('Page number must be between 1 and 99.', 'warn'); return; }
    rec.pageNo = v;
    try { await PhotoDB.put(rec); } catch (e) { toast('Could not save the page number.', 'warn'); }
    sortPhotos(q.id);
    renderPhotos(q.id);
  }

  /* ------------------------------------------------------------------
     11. Timer
  ------------------------------------------------------------------ */
  let timerId = null;
  const flags = { warn: false, urgent: false };

  function startTimer() {
    stopTimer();
    flags.warn = false; flags.urgent = false;
    tick();
    timerId = setInterval(tick, 500);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function setTimerUI(rem) {
    $('timerText').textContent = clock(rem);
    const el = $('timer');
    el.classList.toggle('urgent', rem <= URGENT_MS);
    el.classList.toggle('warn', rem <= WARN_MS && rem > URGENT_MS);
    if (document.body.dataset.screen === 'exam') document.title = clock(rem) + ' · SISTec Exam';
  }
  function tick() {
    if (!S.started || S.submitted) return;
    const rem = S.deadline - Date.now();
    if (rem <= 0) {
      stopTimer();
      setTimerUI(0);
      finalize(true);
      return;
    }
    setTimerUI(rem);
    if (rem <= URGENT_MS) {
      if (!flags.urgent) {
        flags.urgent = true; flags.warn = true;
        toast('⚠ Only ' + Math.round(URGENT_MS / 1000) + ' seconds left! The test will be submitted automatically at 00:00:00.', 'bad', 8000);
      }
    } else if (rem <= WARN_MS && !flags.warn) {
      flags.warn = true;
      toast('⏳ ' + Math.round(WARN_MS / 60000) + ' minutes remaining. Please review your answers and submit.', 'warn', 6000);
    }
  }

  /* ------------------------------------------------------------------
     12. Submission
  ------------------------------------------------------------------ */
  function openSubmit() {
    if (S.submitted) return;
    const t = tally();
    const theory = QS.filter(function (q) { return q.type === 'theory'; });
    const withP = theory.filter(function (q) { return photoCount(q.id) > 0; }).length;
    const rem = Math.max(0, S.deadline - Date.now());
    let html =
      '<div class="sum-grid">' +
      '<div class="sum"><span>Total questions</span><b>' + QS.length + '</b></div>' +
      '<div class="sum ok"><span>Answered</span><b>' + t.answered + '</b></div>' +
      '<div class="sum bad"><span>Unanswered</span><b>' + t.unanswered + '</b></div>' +
      '<div class="sum rev"><span>Marked for review</span><b>' + t.marked + '</b></div>' +
      '<div class="sum ok"><span>Theory with photos</span><b>' + withP + '</b></div>' +
      '<div class="sum bad"><span>Theory without photos</span><b>' + (theory.length - withP) + '</b></div>' +
      '<div class="sum time wide"><span>⏱ Remaining time</span><b>' + clock(rem) + '</b></div>' +
      '</div>';
    if (t.unanswered > 0) html += '<div class="warn-line">You still have <b>' + t.unanswered + '</b> unanswered question(s). You cannot change anything after submitting.</div>';
    else html += '<p class="tiny muted">You cannot change any answer after final submission.</p>';
    openModal({
      icon: '📝', title: 'Submit your answers?', html: html,
      actions: [
        { label: '↩ Return to Test', value: 'return', cls: 'btn-outline' },
        { label: 'Submit Final Answers', value: 'submit', cls: 'btn-submit' }
      ]
    }).then(function (v) { if (v === 'submit') finalize(false); });
  }

  function computeResult() {
    let attempted = 0, mcqAttempted = 0, correct = 0, wrong = 0, score = 0, maxObj = 0;
    let mcqTotal = 0, theoryTotal = 0, theorySubmitted = 0, theoryMax = 0;
    QS.forEach(function (q) {
      if (q.type === 'mcq') {
        mcqTotal++;
        maxObj += q.marks;
        const a = S.answers[q.id];
        if (a !== undefined && a !== null) {
          attempted++; mcqAttempted++;
          if (a === q.correct) { correct++; score += q.marks; } else { wrong++; score -= NEG; }
        }
      } else {
        theoryTotal++;
        theoryMax += q.marks;
        if (photoCount(q.id) > 0) { theorySubmitted++; attempted++; }
      }
    });
    const end = Math.min(S.submittedAt || Date.now(), S.deadline);
    return {
      total: QS.length, attempted: attempted, mcqTotal: mcqTotal, mcqAttempted: mcqAttempted,
      correct: correct, wrong: wrong, score: score, maxObj: maxObj,
      pct: maxObj ? (score / maxObj) * 100 : 0,
      theoryTotal: theoryTotal, theorySubmitted: theorySubmitted, theoryMax: theoryMax,
      timeTaken: Math.max(0, end - S.startedAt)
    };
  }

  async function finalize(auto) {
    if (S.submitted) return;
    S.submitted = true;
    S.submittedAt = Date.now();
    S.auto = !!auto;
    S.result = computeResult();
    saveState();
    stopTimer();
    closeModal(undefined);
    if (auto) {
      await openModal({
        icon: '⏰', title: "Time's up!",
        html: '<p>The examination time is over. Your answers have been <b>submitted automatically</b>.</p>',
        actions: [{ label: 'View Result', value: true, cls: 'btn-primary' }],
        dismissible: false
      });
    }
    showResult(true);
  }

  /* ------------------------------------------------------------------
     13. Result dashboard
  ------------------------------------------------------------------ */
  function animateNumber(el, to, decimals) {
    const start = performance.now(), dur = 1200;
    function step(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (to * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step); else el.textContent = num(to);
    }
    requestAnimationFrame(step);
  }

  function celebrate() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = $('confetti');
    const colors = ['#4f46e5', '#7c3aed', '#06b6d4', '#f59e0b', '#16a34a', '#e11d48', '#ec4899'];
    box.innerHTML = '';
    for (let i = 0; i < 55; i++) {
      const c = document.createElement('span');
      c.className = 'confetto';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (2.4 + Math.random() * 2.4) + 's';
      c.style.animationDelay = (Math.random() * 0.8) + 's';
      c.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      box.appendChild(c);
    }
    setTimeout(function () { box.innerHTML = ''; }, 7000);
  }

  function showResult(first) {
    stopTimer();
    const r = S.result || computeResult();
    const st = S.student || {};
    const pct = r.pct;
    const msg = pct >= 80 ? 'Outstanding work! 🎉' : pct >= 60 ? 'Well done! 👏' : pct >= 40 ? 'Good effort! 👍' : 'Keep practising! 💪';
    const kv = function (k, v) { return '<div class="kv"><span>' + k + '</span><strong>' + v + '</strong></div>'; };
    const stat = function (cls, v, label) { return '<div class="stat ' + cls + '"><b>' + v + '</b><span>' + label + '</span></div>'; };
    const L = ['A', 'B', 'C', 'D', 'E', 'F'];

    let mcqRows = '';
    let theoryRows = '';
    QS.forEach(function (q, i) {
      if (q.type === 'mcq') {
        const a = S.answers[q.id];
        const has = a !== undefined && a !== null;
        const ok = has && a === q.correct;
        mcqRows += '<tr><td>' + (i + 1) + '</td><td>' + esc(truncate(q.text, 90)) + '</td><td>' + (has ? L[a] : '—') + '</td><td>' + L[q.correct] + '</td><td>' +
          (!has ? '<span class="tag na">Not attempted</span>' : ok ? '<span class="tag ok">Correct</span>' : '<span class="tag bad">Incorrect</span>') + '</td></tr>';
      } else {
        const n = photoCount(q.id);
        theoryRows += '<tr><td>' + (i + 1) + '</td><td>' + esc(truncate(q.text, 90)) + '</td><td>' + n + '</td><td>' +
          (n ? '<span class="tag pend">Awaiting evaluation</span>' : '<span class="tag na">No photos submitted</span>') +
          '</td><td>Pending / ' + q.marks + '</td></tr>';
      }
    });

    $('resultRoot').innerHTML =
      '<div class="only-print"><h1>SISTec - Online Examination Result</h1></div>' +
      '<div class="result-hero">' +
      '<svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="52"/><circle class="ring-fg" id="ringFg" cx="60" cy="60" r="52" stroke-dasharray="326.73" stroke-dashoffset="326.73"/><text x="60" y="67" text-anchor="middle">' + pct.toFixed(1) + '%</text></svg>' +
      '<div class="hero-text"><h1>' + (S.auto ? "Time's up - submitted automatically" : msg) + '</h1>' +
      '<p>' + esc(st.name || '') + ' · Roll No. ' + esc(st.roll || '') + '</p>' +
      '<div class="hero-score">MCQ Score: <span id="scoreNum">0</span> / ' + num(r.maxObj) + '</div>' +
      '<p>Theory marks: <b>pending evaluation</b> (out of ' + num(r.theoryMax) + ')</p></div></div>' +

      '<div class="card rcard"><h3>Student &amp; Examination Details</h3><div class="kv-grid">' +
      kv('Student name', esc(st.name)) + kv('Roll number', esc(st.roll)) +
      kv('Branch', esc(st.branch)) + kv('Semester', esc(st.semester)) +
      kv('Subject', esc(st.subject)) + kv('Test name', esc(st.test)) +
      kv('Submission time', esc(new Date(S.submittedAt).toLocaleString())) +
      kv('Time taken', durText(r.timeTaken)) +
      kv('Submission type', S.auto ? 'Automatic (time over)' : 'Manual') +
      '</div></div>' +

      '<div class="stat-grid">' +
      stat('', r.total, 'Total questions') +
      stat('cyan', r.attempted, 'Attempted questions') +
      stat('ok', r.correct, 'Correct MCQ answers') +
      stat('bad', r.wrong, 'Incorrect MCQ answers') +
      stat('', num(r.score), 'MCQ score') +
      stat('', num(r.maxObj), 'Maximum objective marks') +
      stat('ok', pct.toFixed(2) + '%', 'Percentage (objective)') +
      stat('warn', r.theorySubmitted + ' / ' + r.theoryTotal, 'Theory answers submitted') +
      stat('rev', r.theorySubmitted, 'Theory awaiting evaluation') +
      '</div>' +

      '<div class="card rcard"><h3>Theory Answers</h3>' +
      '<p class="tiny muted">Marks are not awarded automatically for uploaded photographs. A teacher must evaluate your handwritten answers.</p>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Q.</th><th>Question</th><th>Photos</th><th>Status</th><th>Marks</th></tr></thead><tbody>' + theoryRows + '</tbody></table></div></div>' +

      '<details class="card rcard"><summary>MCQ answer review</summary><div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Q.</th><th>Question</th><th>Your answer</th><th>Correct</th><th>Result</th></tr></thead><tbody>' + mcqRows + '</tbody></table></div></details>' +

      '<div class="notice info"><span class="notice-ico" aria-hidden="true">ℹ️</span><div><strong>Nothing has been sent to your teacher.</strong> ' +
      'This result and your photographs are stored only in this browser on this device. Use <b>Print Result</b> (you can save it as a PDF) or take a screenshot, and submit it as instructed by your teacher.' +
      (PhotoDB.isMemory() ? ' <b>Note:</b> photo storage was unavailable in this browser, so photographs were kept in memory only.' : '') +
      '</div></div>' +

      '<div class="result-actions no-print">' +
      '<button type="button" class="btn btn-primary" id="btnPrint">🖨 Print Result</button>' +
      '<button type="button" class="btn btn-outline" id="btnNew">↺ Start New Attempt</button></div>';

    $('btnPrint').addEventListener('click', function () { window.print(); });
    $('btnNew').addEventListener('click', newAttempt);
    showScreen('result');

    setTimeout(function () {
      const ring = $('ringFg');
      if (ring) ring.style.strokeDashoffset = String(326.73 * (1 - Math.max(0, Math.min(100, pct)) / 100));
    }, 80);
    const sn = $('scoreNum');
    if (first) { animateNumber(sn, r.score, 1); celebrate(); } else { sn.textContent = num(r.score); }
  }

  async function newAttempt() {
    const ok = await confirmBox('Start a new attempt?',
      '<p>This will <b>erase</b> your current result, answers and uploaded photographs from this browser. Make sure you have printed or saved your result first.</p>',
      'Erase & start new', '⚠️');
    if (!ok) return;
    stopTimer();
    clearState();
    await PhotoDB.clear();
    Object.keys(urlCache).forEach(function (k) { revokeUrl(k); });
    photos = {};
    S = freshState();
    $('studentForm').reset();
    setupLanding();
    showScreen('landing');
    toast('Ready for a new attempt.', 'ok');
  }

  /* ------------------------------------------------------------------
     14. Event wiring
  ------------------------------------------------------------------ */
  function bind() {
    $('studentForm').addEventListener('submit', onStart);
    $('studentForm').addEventListener('input', function (e) {
      const f = e.target.closest('.field');
      if (f) f.classList.remove('invalid');
    });

    $('btnPrev').addEventListener('click', function () { go(S.current - 1); });
    $('btnNext').addEventListener('click', function () {
      if (S.current === QS.length - 1) openSubmit(); else go(S.current + 1);
    });
    $('btnClear').addEventListener('click', clearAnswer);
    $('btnReview').addEventListener('click', toggleReview);
    $('btnSubmit').addEventListener('click', openSubmit);
    $('btnJump').addEventListener('click', function () { $('palettePanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('palette').addEventListener('click', function (e) {
      const b = e.target.closest('.pal');
      if (b) go(Number(b.dataset.i), true);
    });

    const card = $('qCard');
    card.addEventListener('change', function (e) {
      const t = e.target;
      if (t.name === 'opt') {
        selectOption(Number(t.value), t.closest('.opt'));
      } else if (t.dataset && t.dataset.act === 'page') {
        changePageNo(Number(t.closest('.photo').dataset.id), t);
      }
    });
    function openPicker() { if (!S.submitted) $('fileInput').click(); }
    card.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-act]');
      if (btn) {
        const act = btn.dataset.act;
        if (act === 'pick') openPicker();
        else if (act === 'camera') { if (!S.submitted) $('camInput').click(); }
        else if (act === 'replace') startReplace(Number(btn.closest('.photo').dataset.id));
        else if (act === 'remove') removePhoto(Number(btn.closest('.photo').dataset.id));
        return;
      }
      if (e.target.closest('#dropzone')) openPicker();
    });
    card.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'dropzone') { e.preventDefault(); openPicker(); }
    });
    card.addEventListener('dragover', function (e) {
      const dz = e.target.closest('#dropzone');
      if (dz) { e.preventDefault(); dz.classList.add('drag'); }
    });
    card.addEventListener('dragleave', function (e) {
      const dz = e.target.closest('#dropzone');
      if (dz && !dz.contains(e.relatedTarget)) dz.classList.remove('drag');
    });
    card.addEventListener('drop', function (e) {
      const dz = e.target.closest('#dropzone');
      if (dz) {
        e.preventDefault();
        dz.classList.remove('drag');
        addPhotos(QS[S.current].id, e.dataTransfer.files);
      }
    });
    // Stop the browser from navigating away if a file is dropped outside the drop area
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    $('fileInput').addEventListener('change', function (e) {
      const files = Array.prototype.slice.call(e.target.files);
      e.target.value = '';
      addPhotos(QS[S.current].id, files);
    });
    $('camInput').addEventListener('change', function (e) {
      const files = Array.prototype.slice.call(e.target.files);
      e.target.value = '';
      addPhotos(QS[S.current].id, files);
    });
    $('replaceInput').addEventListener('change', function (e) {
      const f = e.target.files[0];
      e.target.value = '';
      doReplace(f);
    });

    $('modal').addEventListener('click', function (e) {
      if (e.target.id === 'modal' && modalDismissible) closeModal(undefined);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('modal').classList.contains('open') && modalDismissible) closeModal(undefined);
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
    window.addEventListener('beforeprint', function () {
      document.querySelectorAll('#screen-result details').forEach(function (d) { d.open = true; });
    });
  }

  /* ------------------------------------------------------------------
     15. Start-up (restores an exam after a refresh)
  ------------------------------------------------------------------ */
  async function init() {
    setupLanding();
    bind();
    await PhotoDB.open();

    const saved = loadState();
    if (saved && saved.v === 1 && saved.sig === SIG) {
      S = Object.assign(freshState(), saved);
      await loadPhotos();
      if (S.submitted) { showResult(false); return; }
      if (S.started && S.student) {
        if (Date.now() >= S.deadline) { await finalize(true); return; }
        toast('Welcome back! Your exam has been restored. The timer kept running.', 'ok', 5000);
        showExam();
        return;
      }
      S = freshState();
    } else if (saved) {
      // Questions were changed since the saved attempt: discard the old attempt
      clearState();
      await PhotoDB.clear();
      toast('The question paper was updated, so the previous saved attempt was cleared.', 'warn', 6000);
    }
    showScreen('landing');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

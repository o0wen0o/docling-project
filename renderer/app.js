'use strict';

// ── i18n ─────────────────────────────────────────────────────────────────────
const STRINGS = {
  en: {
    title:            'Docling Document Converter',
    connecting:       'Starting backend…',
    'setup.title':    'One-time setup',
    'setup.lead':     'Before first use, the app needs to install its document-processing engine. This downloads ~700 MB and runs once. Internet connection required.',
    'setup.missing':  'Components to install:',
    'setup.install':  'Install & Continue',
    'setup.pyinfo':   (ver) => `Using system Python ${ver}.`,
    'python.title':   'Python required',
    'python.none':    'This app needs Python 3.10 or newer, but none was found on your system. Install it, then re-check.',
    'python.old':     (ver) => `Found Python ${ver}, but this app needs 3.10 or newer. Install a newer version, then re-check.`,
    'python.step1':   'Download Python 3.10 or newer from <code>python.org/downloads</code>',
    'python.step2':   'During install, tick <strong>"Add Python to PATH."</strong>',
    'python.step3':   'Quit and reopen this app (or click Re-check below).',
    'python.recheck': 'Re-check',
    'setup.installing':'Installing… you can watch progress below.',
    'setup.failed':   (msg) => `Setup failed: ${msg}`,
    'setup.retry':    'Retry',
    'hero.title':     'Docling Document Converter',
    'hero.subtitle':  'Convert PDF / Word / PPT / Excel / HTML / Images to clean Markdown (JSON optional).',
    'step.upload':    'Upload Files',
    'step.options':   'Options',
    'step.results':   'Results',
    'device.label':   'Compute Device',
    'device.hint':    'Auto-detected after backend connects',
    'ocr.hint':       'Required for scanned / image-based PDFs',
    'tables.label':   'Table Structure Recognition',
    'tables.hint':    'Restore table row/column structure',
    'json.label':     'Also export JSON',
    'json.hint':      'Structured data for further processing',
    'run.btn':        'Start Conversion',
    'cancel.btn':     'Cancel',
    'tab.preview':    'Preview',
    'tab.details':    'Details',
    'th.status':      'Status',
    'th.file':        'File',
    'th.output':      'Output',
    'dl.title':       'Download Results',
    'dl.all.btn':     'Download All as ZIP',
    'footer.formats': 'Supported formats:',
    'footer.note':    'First run downloads models (internet required). Results saved in <code>output/</code>.',
    'dropzone.aria':  'File upload area, drag & drop or click to select',
    'fileinput.aria': 'Select files',
    'picker.aria':    'Select file to preview',
    'preview.empty':  'Upload files and click “Start Conversion”<br>Converted Markdown will appear here.',
    'packing':        'Packing…',
    'unavailable':    '(unavailable)',
    'auto.label':     'Auto Detect',
    'device.error':   'Unable to get device info',
    'detected':       (label) => `Detected: ${label}`,
    'init.status':    (label) => `Initializing converter · ${label}`,
    'converting':     (i, total, ok, fail) => `Converting · ${i}/${total} · OK: ${ok} Failed: ${fail}`,
    'cancelled':      'Conversion cancelled.',
    'no.files':       'Please upload files before starting conversion.',
    'not.ready':      'Backend not ready yet, please wait.',
    'conv.error':     (msg) => `Conversion error: ${msg}`,
    'ready':          'Ready — select files then click “Start Conversion”.',
    'dl.error':       (msg) => `Download failed: ${msg}`,
    'upload.error':   (code, text) => `Upload failed (${code}): ${text}`,
    'dl.http.error':  (code) => `Download failed (${code})`,
    'pack.error':     (code) => `Packing failed (${code})`,
    'batch.error':    (msg) => `Batch download failed: ${msg}`,
    'backend.error':  (msg) => `Backend connection failed: ${msg}`,
    'sse.error':      'Connection to backend lost. Python process may have crashed — restart the app.',
    'files.selected': (n) => `Selected ${n} file(s) — click “Start Conversion” to continue.`,
  },
  zh: {
    title:            'Docling 文档转换器',
    connecting:       '正在启动后端…',
    'setup.title':    '首次安装',
    'setup.lead':     '首次使用前，应用会把文档处理引擎安装到独立环境中。需下载数百 MB，仅运行一次，需联网。',
    'setup.missing':  '待安装组件：',
    'setup.install':  '安装并继续',
    'setup.pyinfo':   (ver) => `使用系统 Python ${ver}。`,
    'python.title':   '需要 Python',
    'python.none':    '本应用需要 Python 3.10 或更高版本，但系统中未找到。请先安装，然后重新检测。',
    'python.old':     (ver) => `检测到 Python ${ver}，但本应用需要 3.10 或更高版本。请安装更新版本后重新检测。`,
    'python.step1':   '从 <code>python.org/downloads</code> 下载 Python 3.10 或更高版本',
    'python.step2':   '安装时勾选 <strong>“Add Python to PATH”（加入 PATH）</strong>。',
    'python.step3':   '退出并重新打开本应用（或点击下方「重新检测」）。',
    'python.recheck': '重新检测',
    'setup.installing':'正在安装…可在下方查看进度。',
    'setup.failed':   (msg) => `安装失败：${msg}`,
    'setup.retry':    '重试',
    'hero.title':     'Docling 文档转换器',
    'hero.subtitle':  '把 PDF / Word / PPT / Excel / HTML / 图片 转成干净的 Markdown（可选 JSON）。',
    'step.upload':    '上传文件',
    'step.options':   '选项',
    'step.results':   '结果',
    'device.label':   '计算设备',
    'device.hint':    '连接后端后自动检测',
    'ocr.hint':       '扫描件 / 图片型 PDF 需要',
    'tables.label':   '表格结构识别',
    'tables.hint':    '还原表格行列结构',
    'json.label':     '同时导出 JSON',
    'json.hint':      '结构化数据，便于二次处理',
    'run.btn':        '开始转换',
    'cancel.btn':     '取消转换',
    'tab.preview':    '预览',
    'tab.details':    '结果明细',
    'th.status':      '状态',
    'th.file':        '文件',
    'th.output':      '输出',
    'dl.title':       '下载结果',
    'dl.all.btn':     '全部下载 ZIP',
    'footer.formats': '支持格式：',
    'footer.note':    '首次运行会下载模型，需联网。结果保存在 <code>output/</code>。',
    'dropzone.aria':  '文件上传区域，可拖放或点击选择',
    'fileinput.aria': '选择文件',
    'picker.aria':    '选择要预览的文件',
    'preview.empty':  '上传文件并点击「开始转换」<br>转换出的 Markdown 会显示在这里。',
    'packing':        '打包中…',
    'unavailable':    '（不可用）',
    'auto.label':     '自动检测',
    'device.error':   '无法获取设备信息',
    'detected':       (label) => `已检测：${label}`,
    'init.status':    (label) => `初始化转换器 · ${label}`,
    'converting':     (i, total, ok, fail) => `转换中 · ${i}/${total} · 成功 ${ok} 失败 ${fail}`,
    'cancelled':      '已取消转换。',
    'no.files':       '请先上传文件，再点击转换。',
    'not.ready':      '后端尚未就绪，请稍候。',
    'conv.error':     (msg) => `转换出错：${msg}`,
    'ready':          '等待上传 — 选好文件后点「开始转换」。',
    'dl.error':       (msg) => `下载失败：${msg}`,
    'upload.error':   (code, text) => `上传失败 (${code}): ${text}`,
    'dl.http.error':  (code) => `下载失败 (${code})`,
    'pack.error':     (code) => `打包失败 (${code})`,
    'batch.error':    (msg) => `批量下载失败：${msg}`,
    'backend.error':  (msg) => `后端连接失败：${msg}`,
    'sse.error':      '与后端的连接中断。Python 进程可能已崩溃，请重启应用。',
    'files.selected': (n) => `已选择 ${n} 个文件 — 点「开始转换」继续。`,
  },
};

let lang = localStorage.getItem('docling-lang') || 'en';

function t(key, ...args) {
  const val = (STRINGS[lang] || STRINGS.en)[key] ?? STRINGS.en[key] ?? key;
  return typeof val === 'function' ? val(...args) : val;
}

function applyI18n() {
  document.title = t('title');
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  if (!Object.keys(state.mdByName).length) showEmptyPreview();
  // Re-render dynamic setup text if the setup screen is currently showing.
  if (lastSetupPayload && els.setup && !els.setup.classList.contains('hidden')) {
    showSetup(lastSetupPayload);
  }
}

// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  files: [],
  mdByName: {},        // label → markdown text
  downloadFiles: [],   // filenames available for download
  activeTab: 'preview',
  isRunning: false,
  baseUrl: null,
  currentJobId: null,
  currentEventSource: null,
};

// ── DOM refs ───────────────────────────────────────────────────────────────────
const els = {
  connecting:    document.getElementById('dl-connecting'),
  connectingMsg: document.getElementById('dl-connecting-msg'),
  setup:         document.getElementById('dl-setup'),
  setupLead:     document.getElementById('dl-setup-lead'),
  setupPython:   document.getElementById('dl-setup-python'),
  setupPythonMsg:document.getElementById('dl-setup-python-msg'),
  setupRecheck:  document.getElementById('dl-setup-recheck'),
  setupDeps:     document.getElementById('dl-setup-deps'),
  setupList:     document.getElementById('dl-setup-list'),
  setupPyInfo:   document.getElementById('dl-setup-pyinfo'),
  setupInstall:  document.getElementById('dl-setup-install'),
  setupProgress: document.getElementById('dl-setup-progress'),
  setupLog:      document.getElementById('dl-setup-log'),
  setupError:    document.getElementById('dl-setup-error'),
  langBtn:       document.getElementById('lang-btn'),
  dropzone:      document.getElementById('dropzone'),
  fileInput:     document.getElementById('file-input'),
  fileList:      document.getElementById('file-list'),
  deviceSelect:  document.getElementById('device-select'),
  deviceHint:    document.getElementById('device-hint'),
  doOcr:         document.getElementById('do-ocr'),
  doTables:      document.getElementById('do-tables'),
  wantJson:      document.getElementById('want-json'),
  runBtn:        document.getElementById('run-btn'),
  cancelBtn:     document.getElementById('cancel-btn'),
  statusWrap:    document.getElementById('status-wrap'),
  previewPicker: document.getElementById('preview-picker'),
  previewContent:document.getElementById('preview-content'),
  resultsBody:   document.getElementById('results-body'),
  downloads:       document.getElementById('dl-downloads'),
  downloadList:    document.getElementById('download-list'),
  downloadAllBtn:  document.getElementById('download-all-btn'),
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── Status pill ────────────────────────────────────────────────────────────────
const STATUS_ICON = {
  idle:    ICONS.info,
  running: ICONS.spin,
  done:    ICONS.check,
  warn:    ICONS.warn,
  error:   ICONS.error,
};

function setStatus(kind, text) {
  const icon = STATUS_ICON[kind] || ICONS.info;
  els.statusWrap.innerHTML =
    `<div class="dl-status" data-kind="${kind}">${icon}<span>${text}</span></div>`;
}

// ── File list ──────────────────────────────────────────────────────────────────
function renderFileList() {
  els.fileList.innerHTML = '';
  state.files.forEach((f) => {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="file-name">${f.name}</span><span class="file-size">${fmtSize(f.size)}</span>`;
    els.fileList.appendChild(li);
  });
}

function setFiles(fileList) {
  state.files = Array.from(fileList);
  renderFileList();
  if (state.files.length) {
    setStatus('idle', t('files.selected', state.files.length));
  }
}

// ── Dropzone ───────────────────────────────────────────────────────────────────
function setupDropzone() {
  const { dropzone, fileInput } = els;

  dropzone.addEventListener('click', (e) => {
    if (e.target !== fileInput) fileInput.click();
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) setFiles(fileInput.files);
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  });

  dropzone.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('drag-over');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) setFiles(e.dataTransfer.files);
  });
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
function switchTab(name) {
  state.activeTab = name;
  document.querySelectorAll('.dl-tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active);
  });
  document.querySelectorAll('.dl-tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.tab === name);
  });
}

// ── Results table ──────────────────────────────────────────────────────────────
function clearResults() {
  els.resultsBody.innerHTML = '';
  els.previewPicker.innerHTML = '';
  els.previewPicker.style.display = 'none';
  els.downloads.style.display = 'none';
  els.downloadList.innerHTML = '';
  state.mdByName = {};
  state.downloadFiles = [];
  showEmptyPreview();
}

function addResultRow([status, file, output]) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${status}</td><td>${file}</td><td>${output}</td>`;
  els.resultsBody.appendChild(tr);
}

// ── Preview ────────────────────────────────────────────────────────────────────
function showEmptyPreview() {
  els.previewContent.innerHTML = `
    <div class="dl-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>
      </svg>
      <p>${t('preview.empty')}</p>
    </div>`;
}

function renderMarkdown(md) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dl-md-body';
  wrapper.innerHTML = marked.parse(md);
  return wrapper;
}

function selectPreview(label) {
  state.selectedPreview = label;
  const md = state.mdByName[label];
  if (!md) { showEmptyPreview(); return; }
  els.previewContent.innerHTML = '';
  els.previewContent.appendChild(renderMarkdown(md));
}

function addPreviewChoice(label, md) {
  state.mdByName[label] = md;
  const opt = document.createElement('option');
  opt.value = label;
  opt.textContent = label;
  els.previewPicker.appendChild(opt);
  els.previewPicker.style.display = '';
  if (Object.keys(state.mdByName).length === 1) {
    els.previewPicker.value = label;
    selectPreview(label);
  }
}

// ── Downloads ──────────────────────────────────────────────────────────────────
const DL_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

function resetDownloadAllBtn() {
  els.downloadAllBtn.disabled = false;
  els.downloadAllBtn.innerHTML = `${DL_SVG}<span data-i18n="dl.all.btn">${t('dl.all.btn')}</span>`;
}

function addDownload(filename) {
  state.downloadFiles.push(filename);
  els.downloads.style.display = '';
  const li = document.createElement('li');
  li.innerHTML =
    `<a class="dl-download-link" data-file="${filename}" href="#">` +
    `${ICONS.download}<span>${filename}</span></a>`;
  els.downloadList.appendChild(li);
}

async function downloadFile(filename) {
  const url = `${state.baseUrl}/download/${encodeURIComponent(filename)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(t('dl.http.error', resp.status));
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

async function downloadAll() {
  if (!state.downloadFiles.length) return;
  els.downloadAllBtn.disabled = true;
  els.downloadAllBtn.textContent = t('packing');
  try {
    const resp = await fetch(`${state.baseUrl}/download-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: state.downloadFiles }),
    });
    if (!resp.ok) throw new Error(t('pack.error', resp.status));
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = 'docling-results.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    setStatus('error', t('batch.error', err.message));
  } finally {
    resetDownloadAllBtn();
  }
}

// ── Device options ─────────────────────────────────────────────────────────────
async function loadDeviceOptions() {
  try {
    const resp = await fetch(`${state.baseUrl}/device`);
    const { auto_label, options } = await resp.json();
    els.deviceSelect.innerHTML = '';
    options.forEach(({ key, label, available }) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = available ? label : `${label} ${t('unavailable')}`;
      opt.disabled = !available;
      els.deviceSelect.appendChild(opt);
    });
    els.deviceHint.textContent = t('detected', auto_label);
  } catch {
    // Fallback options if /device fails
    els.deviceSelect.innerHTML = '';
    [['auto', t('auto.label')], ['xpu', 'Intel GPU (XPU)'], ['cuda', 'NVIDIA GPU (CUDA)'], ['cpu', 'CPU']]
      .forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        els.deviceSelect.appendChild(opt);
      });
    els.deviceHint.textContent = t('device.error');
  }
}

// ── SSE event handler ──────────────────────────────────────────────────────────
function handleSseEvent(ev, resolve, reject, es) {
  switch (ev.type) {
    case 'init':
      setStatus('running', t('init.status', ev.dev_label));
      break;

    case 'file_done': {
      const { index, total, ok, fail, name, label, md, out_files, row } = ev;
      setStatus('running', t('converting', index + 1, total, ok, fail));
      addResultRow(row);
      if (label && md) {
        addPreviewChoice(label, md);
        switchTab('preview');
      }
      if (out_files && out_files.length) {
        out_files.forEach((f) => addDownload(f));
      }
      break;
    }

    case 'done':
      es.close();
      state.currentEventSource = null;
      state.currentJobId = null;
      setStatus(ev.status_kind, ev.summary);
      resolve();
      break;

    case 'error':
      es.close();
      state.currentEventSource = null;
      state.currentJobId = null;
      setStatus('error', ev.message);
      reject(new Error(ev.message));
      break;
  }
}

// ── Real conversion ────────────────────────────────────────────────────────────
function realConversion(files, device, doOcr, doTables, wantJson) {
  return new Promise(async (resolve, reject) => {
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('device', device);
      fd.append('do_ocr', String(doOcr));
      fd.append('do_tables', String(doTables));
      fd.append('want_json', String(wantJson));

      const resp = await fetch(`${state.baseUrl}/convert`, { method: 'POST', body: fd });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(t('upload.error', resp.status, text));
      }
      const { job_id } = await resp.json();
      state.currentJobId = job_id;

      const es = new EventSource(`${state.baseUrl}/convert/${job_id}/events`);
      state.currentEventSource = es;

      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          handleSseEvent(ev, resolve, reject, es);
        } catch (parseErr) {
          // Ignore malformed SSE frames
        }
      };

      es.onerror = () => {
        if (state.currentEventSource === es) {
          es.close();
          state.currentEventSource = null;
          state.currentJobId = null;
          reject(new Error(t('sse.error')));
        }
      };
    } catch (err) {
      reject(err);
    }
  });
}

// ── Cancel ─────────────────────────────────────────────────────────────────────
async function cancelConversion() {
  if (state.currentEventSource) {
    state.currentEventSource.close();
    state.currentEventSource = null;
  }
  const jobId = state.currentJobId;
  state.currentJobId = null;
  if (jobId) {
    try {
      await fetch(`${state.baseUrl}/convert/${jobId}`, { method: 'DELETE' });
    } catch { /* ignore — backend may be gone */ }
  }
  setStatus('warn', t('cancelled'));
  state.isRunning = false;
  els.runBtn.disabled = false;
  els.cancelBtn.style.display = 'none';
}

// ── Convert handler ────────────────────────────────────────────────────────────
async function handleConvert() {
  if (state.isRunning) return;
  if (!state.files.length) {
    setStatus('idle', t('no.files'));
    return;
  }
  if (!state.baseUrl) {
    setStatus('error', t('not.ready'));
    return;
  }

  state.isRunning = true;
  els.runBtn.disabled = true;
  els.cancelBtn.style.display = '';
  clearResults();

  const device   = els.deviceSelect.value;
  const doOcr    = els.doOcr.checked;
  const doTables = els.doTables.checked;
  const wantJson = els.wantJson.checked;

  try {
    await realConversion(state.files, device, doOcr, doTables, wantJson);
  } catch (err) {
    if (state.isRunning) { // not cancelled
      setStatus('error', t('conv.error', err.message));
    }
  } finally {
    state.isRunning = false;
    els.runBtn.disabled = false;
    els.cancelBtn.style.display = 'none';
  }
}

// ── Language toggle ────────────────────────────────────────────────────────────
function toggleLang() {
  lang = lang === 'en' ? 'zh' : 'en';
  localStorage.setItem('docling-lang', lang);
  els.langBtn.textContent = lang === 'en' ? '中文' : 'English';
  applyI18n();
}

// ── Setup screen ─────────────────────────────────────────────────────────────
let lastSetupPayload = null;

function showSetup(payload) {
  lastSetupPayload = payload || {};
  els.connecting.classList.add('hidden');
  els.setupError.classList.add('hidden');

  const canInstall = payload && payload.canInstall;
  const py = (payload && payload.python) || null;

  if (!canInstall) {
    // Python missing or too old — user must install it; no install button.
    els.setupPython.classList.remove('hidden');
    els.setupDeps.classList.add('hidden');
    els.setupLead.classList.add('hidden');
    els.setupProgress.classList.add('hidden');
    els.setupPythonMsg.textContent = (py && py.reason === 'too-old')
      ? t('python.old', py.version || '?')
      : t('python.none');
  } else {
    // Python OK, dependencies missing — offer the install button.
    els.setupPython.classList.add('hidden');
    els.setupDeps.classList.remove('hidden');
    els.setupLead.classList.remove('hidden');

    const missing = (payload && payload.missing) || [];
    els.setupList.innerHTML = missing.length
      ? missing.map((m) => `<li>${m.label}</li>`).join('')
      : '<li>Docling document engine</li>';
    els.setupPyInfo.textContent = py && py.version ? t('setup.pyinfo', py.version) : '';
  }

  els.setup.classList.remove('hidden');
}

// Re-check button on the python-missing screen: ask main to re-evaluate.
async function recheckSetup() {
  els.setupRecheck.disabled = true;
  try {
    await window.electronAPI.rendererReady(); // re-runs evaluateAndProceed in main
  } finally {
    els.setupRecheck.disabled = false;
  }
}

async function runInstall() {
  els.setupError.classList.add('hidden');
  els.setupInstall.disabled = true;
  els.setupProgress.classList.remove('hidden');
  els.setupLog.textContent = '';
  try {
    await window.electronAPI.installDeps();
    // Success path continues via onBackendReady; failures via onInstallFailed.
  } catch (err) {
    showInstallError(err.message);
  }
}

function showInstallError(message) {
  els.setupError.textContent = t('setup.failed', message);
  els.setupError.classList.remove('hidden');
  els.setupInstall.disabled = false;
  els.setupInstall.textContent = t('setup.retry');
}

function appendLog(text) {
  els.setupLog.textContent += text;
  els.setupLog.scrollTop = els.setupLog.scrollHeight;
}

// ── Backend ready → reveal converter ─────────────────────────────────────────
async function proceedWithBackend(baseUrl) {
  state.baseUrl = baseUrl;

  // Tighten CSP connect-src to actual API origin now that we know it
  const origin = new URL(state.baseUrl).origin;
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (cspMeta) {
    cspMeta.setAttribute('content',
      `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src ${origin};`
    );
  }

  await loadDeviceOptions();

  els.setup.classList.add('hidden');
  els.connecting.classList.add('hidden');
  setStatus('idle', t('ready'));
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  setupDropzone();

  // Language toggle
  els.langBtn.textContent = lang === 'en' ? '中文' : 'English';
  els.langBtn.addEventListener('click', toggleLang);
  applyI18n();

  // Static UI listeners (safe to wire before backend is up)
  document.querySelectorAll('.dl-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  els.previewPicker.addEventListener('change', () => selectPreview(els.previewPicker.value));
  els.runBtn.addEventListener('click', handleConvert);
  els.cancelBtn.addEventListener('click', cancelConversion);
  els.downloadList.addEventListener('click', async (e) => {
    const a = e.target.closest('.dl-download-link');
    if (!a) return;
    e.preventDefault();
    try {
      await downloadFile(a.dataset.file);
    } catch (err) {
      setStatus('error', t('dl.error', err.message));
    }
  });
  els.downloadAllBtn.addEventListener('click', downloadAll);
  els.setupInstall.addEventListener('click', runInstall);
  els.setupRecheck.addEventListener('click', recheckSetup);

  if (window.electronAPI) {
    // Register lifecycle event handlers, then tell main we're ready.
    window.electronAPI.onSetupNeeded((p) => showSetup(p));
    window.electronAPI.onStatus((p) => {
      if (p && p.phase === 'starting') {
        els.setup.classList.add('hidden');
        els.connectingMsg.textContent = t('connecting');
        els.connecting.classList.remove('hidden');
      }
    });
    window.electronAPI.onInstallLog((text) => appendLog(text));
    window.electronAPI.onInstallFailed((p) => showInstallError(p.message));
    window.electronAPI.onBackendReady((p) => proceedWithBackend(p.baseUrl));
    window.electronAPI.onBackendError((p) => {
      els.connecting.innerHTML =
        `<p style="color:#ef4444">${t('backend.error', p.message)}</p>`;
    });
    await window.electronAPI.rendererReady();
  } else {
    // Browser dev fallback: read backend URL from query string ?api=http://...
    const params = new URLSearchParams(window.location.search);
    await proceedWithBackend(params.get('api') || 'http://127.0.0.1:8000');
  }
}

init();

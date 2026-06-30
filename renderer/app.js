'use strict';

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
    setStatus('idle', `已选择 ${state.files.length} 个文件 — 点「开始转换」继续。`);
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
      <p>上传文件并点击「开始转换」<br>转换出的 Markdown 会显示在这里。</p>
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
  if (!resp.ok) throw new Error(`下载失败 (${resp.status})`);
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
  els.downloadAllBtn.textContent = '打包中…';
  try {
    const resp = await fetch(`${state.baseUrl}/download-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames: state.downloadFiles }),
    });
    if (!resp.ok) throw new Error(`打包失败 (${resp.status})`);
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
    setStatus('error', `批量下载失败：${err.message}`);
  } finally {
    els.downloadAllBtn.disabled = false;
    els.downloadAllBtn.innerHTML =
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>全部下载 ZIP`;
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
      opt.textContent = available ? label : `${label} （不可用）`;
      opt.disabled = !available;
      els.deviceSelect.appendChild(opt);
    });
    els.deviceHint.textContent = `已检测：${auto_label}`;
  } catch {
    // Fallback options if /device fails
    els.deviceSelect.innerHTML = '';
    [['auto', '自动检测'], ['xpu', 'Intel GPU (XPU)'], ['cuda', 'NVIDIA GPU (CUDA)'], ['cpu', 'CPU']]
      .forEach(([value, label]) => {
        const opt = document.createElement('option');
        opt.value = value; opt.textContent = label;
        els.deviceSelect.appendChild(opt);
      });
    els.deviceHint.textContent = '无法获取设备信息';
  }
}

// ── SSE event handler ──────────────────────────────────────────────────────────
function handleSseEvent(ev, resolve, reject, es) {
  switch (ev.type) {
    case 'init':
      setStatus('running', `初始化转换器 · ${ev.dev_label}`);
      break;

    case 'file_done': {
      const { index, total, ok, fail, name, label, md, out_files, row } = ev;
      setStatus('running', `转换中 · ${index + 1}/${total} · 成功 ${ok} 失败 ${fail}`);
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
        throw new Error(`上传失败 (${resp.status}): ${text}`);
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
          reject(new Error('与后端的连接中断。Python 进程可能已崩溃，请重启应用。'));
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
  setStatus('warn', '已取消转换。');
  state.isRunning = false;
  els.runBtn.disabled = false;
  els.cancelBtn.style.display = 'none';
}

// ── Convert handler ────────────────────────────────────────────────────────────
async function handleConvert() {
  if (state.isRunning) return;
  if (!state.files.length) {
    setStatus('idle', '请先上传文件，再点击转换。');
    return;
  }
  if (!state.baseUrl) {
    setStatus('error', '后端尚未就绪，请稍候。');
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
      setStatus('error', `转换出错：${err.message}`);
    }
  } finally {
    state.isRunning = false;
    els.runBtn.disabled = false;
    els.cancelBtn.style.display = 'none';
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  setupDropzone();

  // Wait for Electron to hand us the backend URL via IPC
  if (window.electronAPI) {
    try {
      state.baseUrl = await window.electronAPI.getBaseUrl();
    } catch (err) {
      els.connecting.innerHTML =
        `<p style="color:#ef4444">后端连接失败：${err.message}</p>`;
      return;
    }
  } else {
    // Dev fallback: read from query string ?api=http://...
    const params = new URLSearchParams(window.location.search);
    state.baseUrl = params.get('api') || 'http://127.0.0.1:8000';
  }

  // Tighten CSP connect-src to actual API origin now that we know it
  const origin = new URL(state.baseUrl).origin;
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (cspMeta) {
    cspMeta.setAttribute('content',
      `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src ${origin};`
    );
  }

  // Fetch device options from real backend
  await loadDeviceOptions();

  // Hide connecting overlay
  els.connecting.classList.add('hidden');

  setStatus('idle', '等待上传 — 选好文件后点「开始转换」。');

  // Tab nav
  document.querySelectorAll('.dl-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Preview picker
  els.previewPicker.addEventListener('change', () => selectPreview(els.previewPicker.value));

  // Convert + cancel buttons
  els.runBtn.addEventListener('click', handleConvert);
  els.cancelBtn.addEventListener('click', cancelConversion);

  // Individual download links
  els.downloadList.addEventListener('click', async (e) => {
    const a = e.target.closest('.dl-download-link');
    if (!a) return;
    e.preventDefault();
    try {
      await downloadFile(a.dataset.file);
    } catch (err) {
      setStatus('error', `下载失败：${err.message}`);
    }
  });

  // Batch download all as ZIP
  els.downloadAllBtn.addEventListener('click', downloadAll);
}

init();

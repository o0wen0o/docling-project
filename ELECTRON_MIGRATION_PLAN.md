# Electron Migration Plan — Docling Converter (Path B: Full Rewrite)

Migrate the current **Gradio** web UI to a native **Electron** desktop app, keeping
**Docling + torch (XPU/CUDA/CPU)** as a headless **Python** backend.

- **Frontend:** Electron (Chromium + Node) — rebuilt UI in HTML/CSS/JS.
- **Backend:** Python FastAPI service wrapping the existing `convert()` logic.
- **Transport:** local HTTP on a random free port + **SSE** (Server-Sent Events) for streaming progress (maps cleanly to Gradio's `yield`-based progress).

> **Why this shape:** Docling/torch cannot run in JS. The Python conversion core stays.
> Electron only replaces the *presentation layer* and becomes the process supervisor.

---

## Architecture (target)

```
docling-project/
├─ backend/                  # Python service (was app.py)
│  ├─ server.py              # FastAPI app: /device, /convert (SSE), /download
│  ├─ converter.py           # extracted: cache, device detect, convert core
│  └─ requirements.txt       # backend-only deps (no gradio)
├─ electron/
│  ├─ main.js                # main process: spawn python, window, lifecycle
│  ├─ preload.js             # contextBridge — safe IPC surface
│  └─ python-bridge.js       # spawn + free-port + readiness handshake
├─ renderer/                 # the UI (served as static files inside Electron)
│  ├─ index.html
│  ├─ styles.css             # port of current CSS
│  ├─ app.js                 # upload, SSE client, preview, download, state
│  └─ icons.js               # the Lucide SVGs from app.py
├─ package.json              # electron + electron-builder config
└─ (app.py kept until parity confirmed, then removed)
```

**Runtime flow**
1. Electron `main.js` boots → spawns Python `server.py`.
2. Python picks a **free port**, starts uvicorn, prints `READY <port>` to stdout.
3. `main.js` reads the port, loads `renderer/index.html`, injects `http://127.0.0.1:<port>` as the API base.
4. Renderer calls REST + opens an `EventSource` for live progress.
5. On quit, `main.js` sends SIGTERM → Python clears converter cache + frees GPU memory (reuse existing `_shutdown`).

---

## Key decisions (lock these in Phase 0)

| Decision | Recommendation | Note |
|---|---|---|
| UI framework | **Vanilla JS + `marked`** for markdown | One screen; avoids build step + fattens packaging less. React is optional if you expect growth. |
| Backend framework | **FastAPI + uvicorn** | Native SSE/async; clean file uploads. |
| Progress transport | **SSE** | One-way server→client stream = exact fit for `yield`. WebSocket is overkill. |
| Port | **Random free port**, handshake via stdout | Never hardcode 7860; avoids clashes. |
| Python in package | **PyInstaller one-folder** (Phase 6) | torch+xpu is the hard part; one-folder beats one-file for big native libs. |
| Models | **Download on first run** → store in user-data dir | Keeps installer smaller; same as today. |

---

## Phase 0 — Prep & scaffold
**Goal:** repo skeleton + decisions locked, nothing functional yet.

- [ ] Create `backend/`, `electron/`, `renderer/` dirs per layout above.
- [ ] `npm init` → add `electron` as devDependency. Add `start` script.
- [ ] Split `requirements.txt`: backend deps drop `gradio`, add `fastapi`, `uvicorn[standard]`, `python-multipart`.
- [ ] Decide vanilla vs React (default: vanilla). Decide markdown lib (`marked`).
- [ ] Add `.gitignore` entries: `node_modules/`, `dist/`, `build/`.

**Done when:** `npm start` opens a blank Electron window; `python backend/server.py` runs (even if empty).

---

## Phase 1 — Backend service (no Electron yet)
**Goal:** the conversion core runs as an HTTP service, testable with curl/browser.

- [ ] **Extract** from `app.py` into `backend/converter.py` (pure logic, no Gradio):
  - `_CONVERTER_CACHE` + `_CACHE_MAX` LRU
  - `has_xpu`, `_free_device_memory`, `device_info`, `DEVICE_MAP`, `resolve_device`, `get_converter`
  - A `run_conversion(files, device, do_ocr, do_tables, want_json)` **generator** yielding progress dicts (refactor of `convert()` — return plain dicts instead of Gradio tuples).
- [ ] **`backend/server.py`** (FastAPI):
  - `GET /device` → `{device, label}` (auto-detected default + available options).
  - `POST /convert` → accepts multipart files + options; returns a **job id**.
  - `GET /convert/{job_id}/events` → **SSE** stream of progress events:
    `init`, `progress {i,total,name,ok,fail}`, `file_done {label, md, row}`, `done {summary, outputs}`, `error`.
  - `GET /download/{filename}` → serves files from `output/`.
  - Free-port picker + print `READY <port>` then start uvicorn.
- [ ] Reuse SIGTERM/`KeyboardInterrupt` shutdown → `cache.clear()` + `_free_device_memory()`.
- [ ] Preserve current behavior: per-file markdown kept (dedup labels), partial-success handling, skipped unsupported files, `output/` writes.

**Done when:** `curl -F file=@sample.pdf .../convert` returns a job id, and the SSE endpoint streams progress to `done` with markdown in the payload. Files land in `output/`.

---

## Phase 2 — Electron shell + Python supervisor
**Goal:** Electron owns the Python lifecycle; window loads a placeholder.

- [ ] **`electron/python-bridge.js`**: spawn `python backend/server.py` (dev) ; capture stdout; resolve a promise when `READY <port>` seen; reject on early exit.
- [ ] **`electron/main.js`**: on `app.ready` → start bridge → create `BrowserWindow` (contextIsolation **on**, nodeIntegration **off**) → load `renderer/index.html` → pass API base via query string or `additionalArguments`.
- [ ] **`electron/preload.js`**: `contextBridge.exposeInMainWorld('api', { baseUrl, ... })`.
- [ ] Lifecycle: on `window-all-closed` / `before-quit` → SIGTERM the Python child, wait, then exit. Handle Python crash → show error dialog.
- [ ] Strict **CSP** in `index.html`; only allow `connect-src` to the local API origin.

**Done when:** launching Electron starts Python automatically, window confirms "backend ready on port N", and quitting kills Python (verify no orphan `python` in Task Manager).

---

## Phase 3 — Frontend UI (static, no backend wiring)
**Goal:** visual parity with the current Gradio screen, using mock data.

- [ ] Port layout: hero (logo SVG + title), two-column shell (inputs left / sticky results right), footer hint.
- [ ] Port **`renderer/styles.css`** from the `CSS` string in `app.py` (cards, status pill, CTA, dropzone hover, spinner, `prefers-reduced-motion`, mobile stack at 860px).
- [ ] Port the Lucide SVG `_ICON` set into `renderer/icons.js`.
- [ ] Build controls: file dropzone (drag+click, multi), device `<select>`, 3 checkboxes (OCR / tables / JSON), primary "开始转换" button, status pill, results tabs (Preview / Details), preview file picker `<select>`, download list.
- [ ] Wire interactivity with **mock** data (fake progress + fake markdown) so the UI feels real.

**Done when:** UI looks like the current app, tab switching + preview picker + status states all work against mock data. No Python calls yet.

---

## Phase 4 — Wire frontend ↔ backend ✅
**Goal:** real conversions end-to-end.

- [x] On load: `GET /device` → populate device dropdown + "auto-detected" hint.
- [x] On convert click: upload selected files via `POST /convert` (FormData) → get job id.
- [x] Open `EventSource` on the events endpoint:
  - `init` → status pill "running".
  - `file_done` → append row to Details table, add label to preview picker, set preview if first.
  - `done` → final status (done/warn/error), reveal download list.
- [x] Markdown preview rendered via `marked` (vendored `marked.umd.js`).
- [x] Download buttons: fetch blob from `GET /download/{file}` → trigger browser download.
- [x] Preview picker `change` → swap rendered markdown (data held in `state.mdByName`).

**Done when:** drag in a PDF → live progress → markdown preview → switch files → download .md/.json. Matches `app.py` behavior 1:1.

---

## Phase 5 — Parity polish & hardening ✅
**Goal:** close the gaps Gradio gave for free.

- [x] Error/empty states: all-unsupported → `error` event from converter; partial-success → `warn` from `done`; wording mirrors `app.py`.
- [x] Device labels incl. GPU name string — `converter.py` `device_info()` already returns full names (e.g. "Intel GPU (XPU) · Intel Arc A770").
- [x] Cancel button → close `EventSource` + `DELETE /convert/{id}` → GPU freed via LRU/eviction on next job.
- [x] A11y: `focus-visible` rings in CSS, `aria-*` on tabs/dropzone, keyboard nav on dropzone (Enter/Space).
- [x] Connecting overlay (`#dl-connecting`) shown until `electronAPI.getBaseUrl()` resolves + `/device` fetched.
- [x] Backend-crash recovery: `es.onerror` → close source, reject promise → error status shown; CSP tightened at runtime.

**Done when:** every state in the old UI has a faithful equivalent; killing Python mid-job surfaces a clean error, not a hang.

---

## Phase 6 — Packaging & distribution (the hard part) ✅ (partial)
**Goal:** one installer; no system Python required.

- [x] **electron-builder** configured: `package.json` `build` section — NSIS target, `extraResources` for PyInstaller output at `backend-dist/`.
- [x] In packaged mode, `python-bridge.js` launches `server.exe` (via `app.isPackaged`); dev launches `.venv` Python.
- [x] Models + `output/` → `app.getPath('userData')` set via `DOCLING_OUT_DIR` + `HF_HOME` env vars injected by `main.js`; `server.py` reads `DOCLING_OUT_DIR` to override `OUT_DIR`.
- [ ] **PyInstaller** the backend (one-folder) — run on target machine with XPU deps installed:
  ```powershell
  .venv\Scripts\python.exe -m pip install pyinstaller
  .venv\Scripts\pyinstaller --onedir --name server --distpath backend-dist `
    --hidden-import docling --hidden-import transformers `
    backend/server.py
  ```
  Test `backend-dist\server\server.exe` standalone first (expect `READY <port>`).
- [ ] First-run UX: model download surfaces via `init` event progress — already visible in status pill.
- [ ] Build & sanity-check installer size (expect multi-GB from torch).

**Done when:** installer runs on a clean Windows box with no Python/torch installed, converts a PDF on GPU, and survives a reboot.

---

## Phase 7 — QA, cleanup, cutover ✅ (partial)
- [ ] Side-by-side: same inputs through old `app.py` vs new Electron app → diff the markdown/JSON output.
- [ ] Test matrix: XPU / CUDA / CPU; OCR on/off; tables on/off; multi-file; unsupported mix; huge PDF (page-batch path).
- [ ] Verify no orphan processes, no GPU memory leak across many conversions (LRU eviction still frees).
- [x] Update `README.md` — Electron build/run/package instructions added.
- [ ] Remove `app.py` + `gradio` dep once parity signed off. Keep `convert.py` as CLI.

---

## Risk register
| Risk | Impact | Mitigation |
|---|---|---|
| PyInstaller + torch-xpu bundling fails | High — blocks distribution | Spike this **early** (do a Phase-6 smoke test right after Phase 1). Fallback: ship embedded Python + venv instead of freezing. |
| Bundle size (multi-GB) | Medium | Accept, or offer CPU-only build variant. |
| SSE through Electron/Chromium quirks | Low | Standard `EventSource`; fallback to polling if needed. |
| First-run model download UX | Medium | Show progress; cache in userData. |
| GPU memory leaks across jobs | Medium | Reuse existing LRU + `_free_device_memory`; verify in Phase 7. |

## Effort estimate
~1–2 weeks focused. Phases 1–5 are bounded UI/glue work. **Phase 6 (packaging) is the wildcard** — could be a day or could eat several. De-risk it early with a smoke test.

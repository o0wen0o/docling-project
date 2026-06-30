# docling-project

把 PDF / Word / PPT / Excel / HTML / 图片 转成干净的 Markdown（可选 JSON），基于 [Docling](https://github.com/docling-project/docling)。

三种用法：
- **Electron 桌面应用**（主推）— 原生窗口，实时进度，无需浏览器。
- **命令行** `convert.py`
- **Gradio Web UI** `app.py`（保留，待确认功能对等后移除）

---

## 环境要求

- Python 3.13
- Node.js 18+（运行 Electron）
- Intel GPU (XPU) 可选 — torch 装的是 `+xpu` 构建，会自动检测；无 GPU 时回退 CPU。

---

## 安装

### Python 后端

依赖装在项目内的 `.venv`，不污染全局 Python：

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

> `backend/requirements.txt` 里的 `--extra-index-url` 是为 Intel GPU 构建的 torch 服务的。

### Node / Electron

```powershell
npm install
```

---

## 运行（开发模式）

```powershell
npm start
```

Electron 自动启动 Python 后端（读取 `.venv` 中的 Python），就绪后打开桌面窗口。
首次运行会下载 Docling 模型，需联网。

结果默认保存在 `output/`（开发模式）或 `%APPDATA%\Docling Converter\output\`（打包后）。

### 仅测试后端

```powershell
.venv\Scripts\python.exe backend/server.py
```

在 stdout 看到 `READY <port>` 后，可用 curl 测试：

```bash
curl -F "files=@sample.pdf" -F "device=auto" -F "do_ocr=true" -F "do_tables=true" -F "want_json=false" http://127.0.0.1:<port>/convert
# → {"job_id": "..."}
curl -N http://127.0.0.1:<port>/convert/<job_id>/events
```

### 命令行

```powershell
.venv\Scripts\python.exe convert.py <文件或目录>       # 输出 .md
.venv\Scripts\python.exe convert.py <文件或目录> --json # 同时输出 .json
```

---

## 打包（Windows 安装程序）

### 1. 冻结 Python 后端（PyInstaller）

```powershell
.venv\Scripts\python.exe -m pip install pyinstaller
.venv\Scripts\pyinstaller --onedir --name server --distpath backend-dist `
  --hidden-import docling --hidden-import transformers `
  backend/server.py
```

> 产物在 `backend-dist/server/`，含所有依赖；体积数 GB（torch 较大）。
> 首先单独测试：`backend-dist\server\server.exe`，看到 `READY <port>` 即成功。

### 2. 打包 Electron + 后端

```powershell
npm run dist:win
```

安装包输出到 `dist/`。

---

## 架构

```
docling-project/
├─ backend/
│  ├─ server.py       FastAPI 服务：/device /convert (SSE) /download
│  ├─ converter.py    转换核心（LRU 缓存、多设备、进度生成器）
│  └─ requirements.txt
├─ electron/
│  ├─ main.js         主进程：生命周期、窗口、IPC
│  ├─ preload.js      contextBridge — 暴露 getBaseUrl()
│  └─ python-bridge.js 启动 Python、解析 READY <port>
├─ renderer/
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js          UI 逻辑：上传、SSE、预览、下载
│  ├─ icons.js        Lucide SVG
│  └─ marked.umd.js   vendored Markdown 渲染器
├─ convert.py         CLI 工具（保留）
└─ app.py             Gradio UI（保留，待移除）
```

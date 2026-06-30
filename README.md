# docling-project

把 PDF / Word / PPT / Excel / HTML / 图片 转成干净的 Markdown（可选 JSON），基于 [Docling](https://github.com/docling-project/docling)。

三种用法：
- **Electron 桌面应用**（主推）— 原生窗口，实时进度，无需浏览器。
- **命令行** `convert.py`
- **Gradio Web UI** `app.py`（保留，待确认功能对等后移除）

> 桌面应用**不内置 Python**。它使用你系统上已安装的 Python（3.10+），首次运行时把后端依赖安装到一个独立的 venv 里。启动时会自检：缺 Python 会提示先安装，缺依赖会提供一键安装。

---

## 环境要求

- **Python 3.10 或更高版本**，且加入 PATH（应用与开发模式都需要）。
  从 <https://www.python.org/downloads/> 下载，Windows 安装时务必勾选 **“Add Python to PATH”**。
- Node.js 18+（运行 / 打包 Electron）
- torch 为 **CPU 构建**（`+cpu`）。XPU/CUDA 构建会拉入无法打包的 SYCL/MKL DLL 链，故统一用 CPU。

---

## 安装（开发模式）

### 1. 确认 Python 可用

```powershell
python --version   # 应为 3.10 或更高；找不到命令则先装 Python 并加入 PATH
```

### 2. Python 后端依赖

依赖装在项目内的 `.venv`，不污染全局 Python：

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

> 这是手动建后端 venv，用于直接测试后端 / CLI。桌面应用运行时会自己在 `%APPDATA%\docling-desktop\venv` 另建一个受管 venv，互不影响。

### 3. Node / Electron

```powershell
npm install
```

---

## 运行（开发模式）

```powershell
npm start
```

启动后应用会：

1. 在 PATH 上查找系统 Python（Windows 优先用 `py -3`，否则 `python` / `python3`）并检查版本 ≥ 3.10。
2. 找不到合用的 Python → 显示「Python required」界面，列出安装步骤；用户装好后点 **Re-check**。
3. 找到 Python 但缺依赖 → 在 `%APPDATA%\docling-desktop\venv` 用系统 Python 建 venv，跑 `backend/preflight.py` 探测依赖，显示「One-time setup」界面。
4. 用户点 **Install & Continue** → 应用内 pip 安装（实时日志）→ 复检 → 启动后端。
5. 依赖齐全 → 直接进主界面。

首次转换会下载 Docling 模型，需联网。
结果保存在 `%APPDATA%\docling-desktop\output\`（`HF_HOME` 模型缓存同目录下 `models\`）。

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

## 打包（桌面安装程序）

安装包**只含 Electron 前端 + 后端源码 + `requirements.txt`**，**不含 Python 运行时、不含依赖**。
目标机器需自备 Python 3.10+；依赖在首次运行时由应用安装（应用内有界面与实时日志）。

```powershell
npm run dist:win
```

`electron-builder` 会打包前端，并把 `backend/`(仅 .py) 与 `requirements.txt` 作为 extraResources 打入。
安装包很小（依赖与 Python 运行时都不在包内）。

> 其他平台：`npm run dist:mac` / `npm run dist:linux`（需在对应系统上运行）。

### 装机用户须知

> 运行本应用前，请先安装 **Python 3.10 或更高版本** 并加入 PATH。
> 应用启动时会自检：缺 Python 会引导你去 python.org 安装，缺依赖会一键安装到独立环境。
> 首次安装依赖与首次转换均需联网。

---

## 架构

```
docling-project/
├─ backend/
│  ├─ server.py       FastAPI 服务：/device /convert (SSE) /download
│  ├─ converter.py    转换核心（LRU 缓存、多设备、进度生成器）
│  └─ preflight.py    依赖探测：打印 JSON，决定是否需要安装界面
├─ electron/
│  ├─ main.js         主进程：生命周期、窗口、IPC、安装编排
│  ├─ preload.js      contextBridge — getBaseUrl / 安装事件
│  └─ python-bridge.js 系统 Python 定位与版本检查、venv 管理、preflight、pip 安装、启动后端
├─ renderer/
│  ├─ index.html      含 Python 缺失界面 + 首次安装界面 #dl-setup
│  ├─ styles.css
│  ├─ app.js          UI 逻辑 + 安装流程（IPC 握手）
│  ├─ icons.js        Lucide SVG
│  └─ marked.umd.js   vendored Markdown 渲染器
├─ requirements.txt   后端依赖（CPU torch）
├─ convert.py         CLI 工具（保留）
└─ app.py             Gradio UI（保留，待移除）
```

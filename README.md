# docling-project

把 PDF / Word / PPT / Excel / HTML / 图片 转成干净的 Markdown（可选 JSON），基于 [Docling](https://github.com/docling-project/docling)。两种用法：命令行 `convert.py`，或 Gradio Web UI `app.py`。

## 环境要求

- Python 3.13
- Intel GPU (XPU) 可选 — torch 装的是 `+xpu` 构建，会自动检测；无 GPU 时回退 CPU。

## 安装

依赖装在项目内的 `.venv`，不污染全局 Python：

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

> `requirements.txt` 里的 `--extra-index-url https://download.pytorch.org/whl/xpu` 是为 Intel GPU 构建的 torch 服务的。去掉它会装成 CPU 版，丢失 GPU 加速。

## 运行

Web UI：

```powershell
.venv\Scripts\python.exe app.py
```

浏览器打开 http://127.0.0.1:7860。

命令行（转单个文件或整个目录）：

```powershell
.venv\Scripts\python.exe convert.py <文件或目录>      # 输出 .md
.venv\Scripts\python.exe convert.py <文件或目录> --json # 同时输出 .json
```

首次运行会下载模型，需联网。结果保存在 `output/`。

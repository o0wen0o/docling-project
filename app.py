"""Docling 文档转换 Web UI (Gradio).

启动: D:\\Python313\\python.exe app.py
浏览器: http://127.0.0.1:7860
"""
import sys
import json
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

import gradio as gr
import torch
from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat, ConversionStatus

SUPPORTED_EXT = {".pdf", ".docx", ".pptx", ".xlsx", ".html", ".md", ".png", ".jpg", ".jpeg", ".tiff"}
OUT_DIR = Path("output")
OUT_DIR.mkdir(exist_ok=True)

# 转换器按 (device, ocr, tables) 缓存，避免每次重建/重载模型
_CONVERTER_CACHE = {}


def has_xpu():
    return hasattr(torch, "xpu") and torch.xpu.is_available()


def device_info():
    """默认设备（自动检测）。"""
    if has_xpu():
        return AcceleratorDevice.XPU, f"Intel GPU (XPU): {torch.xpu.get_device_name(0)}"
    if torch.cuda.is_available():
        return AcceleratorDevice.CUDA, f"NVIDIA GPU (CUDA): {torch.cuda.get_device_name(0)}"
    return AcceleratorDevice.CPU, "CPU (未检测到 GPU，速度较慢)"


DEVICE_MAP = {
    "自动": None,
    "Intel GPU (XPU)": AcceleratorDevice.XPU,
    "NVIDIA GPU (CUDA)": AcceleratorDevice.CUDA,
    "CPU": AcceleratorDevice.CPU,
}


def resolve_device(choice):
    dev = DEVICE_MAP.get(choice)
    if dev is None:
        return device_info()
    labels = {
        AcceleratorDevice.XPU: f"Intel GPU (XPU): {torch.xpu.get_device_name(0)}" if has_xpu() else "Intel GPU (XPU)",
        AcceleratorDevice.CUDA: f"NVIDIA GPU (CUDA): {torch.cuda.get_device_name(0)}" if torch.cuda.is_available() else "NVIDIA GPU (CUDA)",
        AcceleratorDevice.CPU: "CPU",
    }
    return dev, labels[dev]


def get_converter(device, do_ocr, do_tables, page_batch):
    key = (device, do_ocr, do_tables, page_batch)
    if key not in _CONVERTER_CACHE:
        opts = PdfPipelineOptions()
        opts.do_ocr = do_ocr
        opts.do_table_structure = do_tables
        opts.accelerator_options = AcceleratorOptions(device=device)
        # 多页 PDF 在 GPU 上一次喂太多页会爆 host 内存(OOM)。缩 batch 稳阵。
        try:
            opts.page_batch_size = int(page_batch)
        except Exception:
            pass
        _CONVERTER_CACHE[key] = DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)}
        )
    return _CONVERTER_CACHE[key]


def convert(files, do_ocr, do_tables, want_json, progress=gr.Progress()):
    if not files:
        return "请先上传文件。", "", gr.update(value=None, visible=False)

    device, dev_label = device_info()
    progress(0, desc=f"初始化转换器 — {dev_label}")
    converter = get_converter(device, do_ocr, do_tables, page_batch=4)

    sources = []
    for f in files:
        p = Path(f)
        if p.suffix.lower() in SUPPORTED_EXT:
            sources.append(p)

    skipped = len(files) - len(sources)
    if not sources:
        return f"没有受支持的文件（跳过 {skipped} 个）。支持: {', '.join(sorted(SUPPORTED_EXT))}", "", gr.update(value=None, visible=False)

    log_lines = [f"设备: {dev_label}",
                 f"OCR: {'开' if do_ocr else '关'}  |  表格识别: {'开' if do_tables else '关'}  |  导出 JSON: {'是' if want_json else '否'}",
                 f"待转换 {len(sources)} 个文件" + (f"（跳过 {skipped} 个不支持）" if skipped else ""),
                 "首次运行会下载模型，需联网。", ""]

    out_files = []
    first_md = ""
    ok = fail = 0
    t0 = time.time()

    total = len(sources)
    for i, result in enumerate(converter.convert_all(sources, raises_on_error=False)):
        name = Path(result.input.file).name
        progress((i + 1) / total, desc=f"转换中 {i + 1}/{total}: {name}")
        if result.status in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            doc = result.document
            stem = Path(result.input.file).stem
            md_text = doc.export_to_markdown()
            md_path = OUT_DIR / f"{stem}.md"
            md_path.write_text(md_text, encoding="utf-8")
            out_files.append(str(md_path))
            if not first_md:
                first_md = md_text
            extra = ""
            if want_json:
                json_path = OUT_DIR / f"{stem}.json"
                json_path.write_text(
                    json.dumps(doc.export_to_dict(), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                out_files.append(str(json_path))
                extra = " + .json"
            partial = "（部分）" if result.status == ConversionStatus.PARTIAL_SUCCESS else ""
            log_lines.append(f"  ✓ {stem} → {stem}.md{extra} {partial}")
            ok += 1
        else:
            log_lines.append(f"  ✗ {name}: {result.status}")
            fail += 1

    dt = time.time() - t0
    log_lines.append("")
    log_lines.append(f"完成：成功 {ok}，失败 {fail}，用时 {dt:.1f}s")

    preview = first_md if first_md else "（无成功转换的文档可预览）"
    return "\n".join(log_lines), preview, gr.update(value=out_files, visible=bool(out_files))


_, dev_label_init = device_info()

with gr.Blocks(title="Docling 文档转换") as demo:
    gr.Markdown(
        f"""
        # 📄 Docling 文档转换器
        把 PDF / Word / PPT / Excel / HTML / 图片 转成 **Markdown**（可选 JSON）。
        当前设备: **{dev_label_init}**
        """
    )

    with gr.Row():
        with gr.Column(scale=1):
            files = gr.File(
                label="拖入或选择文件（可多选）",
                file_count="multiple",
                file_types=[f"{e}" for e in sorted(SUPPORTED_EXT)],
            )
            with gr.Accordion("选项", open=True):
                do_ocr = gr.Checkbox(value=True, label="OCR（扫描件/图片型 PDF 需要）")
                do_tables = gr.Checkbox(value=True, label="表格结构识别")
                want_json = gr.Checkbox(value=False, label="同时导出 JSON")
            run_btn = gr.Button("开始转换", variant="primary", size="lg")
            gr.Markdown(f"<small>支持格式: {', '.join(sorted(SUPPORTED_EXT))}</small>")

        with gr.Column(scale=2):
            with gr.Tab("日志"):
                log = gr.Textbox(label="转换日志", lines=14, max_lines=30)
            with gr.Tab("Markdown 预览"):
                preview = gr.Markdown(label="预览（首个成功文档）")
            downloads = gr.File(label="下载结果", visible=False, interactive=False)

    run_btn.click(
        convert,
        inputs=[files, do_ocr, do_tables, want_json],
        outputs=[log, preview, downloads],
    )

if __name__ == "__main__":
    demo.launch(server_name="127.0.0.1", server_port=7860, inbrowser=True,
                theme=gr.themes.Soft(primary_hue="indigo"))

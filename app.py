"""Docling 文档转换 Web UI (Gradio 6).

启动: .venv\\Scripts\\python.exe app.py
浏览器: http://127.0.0.1:7860
"""
import sys
import gc
import json
import time
from collections import OrderedDict
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

# 转换器按 (device, ocr, tables, batch) 缓存，避免每次重建/重载模型。
# 用 LRU 上限封顶：切设备/开关选项会建新转换器并各占一份 GPU 显存，
# 不封顶会无限堆积 → OOM。超限淘汰最旧的并归还显存。
_CONVERTER_CACHE = OrderedDict()
_CACHE_MAX = 2


def has_xpu():
    return hasattr(torch, "xpu") and torch.xpu.is_available()


def _free_device_memory():
    """淘汰转换器后，把释放的模型显存归还给驱动。"""
    try:
        gc.collect()
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            torch.xpu.empty_cache()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass  # empty_cache 尽力而为，绝不因它中断转换


def device_info():
    """默认设备（自动检测）。"""
    if has_xpu():
        return AcceleratorDevice.XPU, f"Intel GPU (XPU) · {torch.xpu.get_device_name(0)}"
    if torch.cuda.is_available():
        return AcceleratorDevice.CUDA, f"NVIDIA GPU (CUDA) · {torch.cuda.get_device_name(0)}"
    return AcceleratorDevice.CPU, "CPU · 未检测到 GPU，速度较慢"


DEVICE_MAP = {
    "自动检测": None,
    "Intel GPU (XPU)": AcceleratorDevice.XPU,
    "NVIDIA GPU (CUDA)": AcceleratorDevice.CUDA,
    "CPU": AcceleratorDevice.CPU,
}


def resolve_device(choice):
    dev = DEVICE_MAP.get(choice)
    if dev is None:
        return device_info()
    labels = {
        AcceleratorDevice.XPU: f"Intel GPU (XPU) · {torch.xpu.get_device_name(0)}" if has_xpu() else "Intel GPU (XPU)",
        AcceleratorDevice.CUDA: f"NVIDIA GPU (CUDA) · {torch.cuda.get_device_name(0)}" if torch.cuda.is_available() else "NVIDIA GPU (CUDA)",
        AcceleratorDevice.CPU: "CPU",
    }
    return dev, labels[dev]


def get_converter(device, do_ocr, do_tables, page_batch):
    key = (device, do_ocr, do_tables, page_batch)
    if key in _CONVERTER_CACHE:
        _CONVERTER_CACHE.move_to_end(key)  # 命中 → 标记为最近使用
        return _CONVERTER_CACHE[key]

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

    # 超过上限 → 淘汰最旧的，丢引用后归还显存
    while len(_CONVERTER_CACHE) > _CACHE_MAX:
        _, evicted = _CONVERTER_CACHE.popitem(last=False)
        del evicted
        _free_device_memory()

    return _CONVERTER_CACHE[key]


# ── 转换核心 ────────────────────────────────────────────────────────────────
# 关键修复：保留每个成功文档的 Markdown（不再只留第一个），
# 让预览可以按文件切换。返回的 dict 文件名 → markdown。

def convert(files, device_choice, do_ocr, do_tables, want_json, progress=gr.Progress()):
    empty_preview = gr.update(choices=[], value=None, visible=False)
    if not files:
        yield (
            _status_html("idle", "请先上传文件，再点击转换。"),
            {},
            empty_preview,
            "上传文件后，这里显示转换出的 Markdown。",
            gr.update(value=None, visible=False),
            [],
        )
        return

    device, dev_label = resolve_device(device_choice)
    progress(0, desc=f"初始化转换器 — {dev_label}")
    yield (
        _status_html("running", f"初始化转换器 · {dev_label}"),
        {}, empty_preview, "转换进行中…", gr.update(value=None, visible=False), [],
    )
    converter = get_converter(device, do_ocr, do_tables, page_batch=4)

    sources, skipped_names = [], []
    for f in files:
        p = Path(f)
        if p.suffix.lower() in SUPPORTED_EXT:
            sources.append(p)
        else:
            skipped_names.append(p.name)

    if not sources:
        yield (
            _status_html("error",
                         f"没有受支持的文件（跳过 {len(skipped_names)} 个）。"
                         f"支持：{', '.join(sorted(SUPPORTED_EXT))}"),
            {}, empty_preview,
            "没有可预览的文档。", gr.update(value=None, visible=False), [],
        )
        return

    md_by_name = {}      # 显示名 → markdown 文本（供预览切换）
    out_files = []
    ok = fail = 0
    rows = []            # 每个文件一行结果
    t0 = time.time()
    total = len(sources)

    for i, result in enumerate(converter.convert_all(sources, raises_on_error=False)):
        name = Path(result.input.file).name
        stem = Path(result.input.file).stem
        progress((i + 1) / total, desc=f"转换中 {i + 1}/{total} · {name}")

        if result.status in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            doc = result.document
            md_text = doc.export_to_markdown()
            md_path = OUT_DIR / f"{stem}.md"
            md_path.write_text(md_text, encoding="utf-8")
            out_files.append(str(md_path))

            label = f"{stem}.md"
            # 同名去重，保证下拉选项唯一
            dup = 2
            while label in md_by_name:
                label = f"{stem} ({dup}).md"
                dup += 1
            md_by_name[label] = md_text

            extra = ""
            if want_json:
                json_path = OUT_DIR / f"{stem}.json"
                json_path.write_text(
                    json.dumps(doc.export_to_dict(), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                out_files.append(str(json_path))
                extra = " + JSON"
            partial = " · 部分成功" if result.status == ConversionStatus.PARTIAL_SUCCESS else ""
            rows.append([f"✓ 成功{partial}", name, f"{stem}.md{extra}"])
            ok += 1
        else:
            rows.append([f"✗ 失败", name, str(result.status)])
            fail += 1

        # 流式更新：每完成一个就刷新进度状态
        running_label = list(md_by_name.keys())
        yield (
            _status_html("running", f"转换中 · 已完成 {i + 1}/{total} · 成功 {ok} 失败 {fail}"),
            md_by_name,
            gr.update(choices=running_label, value=running_label[0] if running_label else None,
                      visible=bool(running_label)),
            (md_by_name[running_label[0]] if running_label else "转换进行中…"),
            gr.update(value=out_files or None, visible=bool(out_files)),
            list(rows),
        )

    dt = time.time() - t0
    choices = list(md_by_name.keys())
    skipped_note = f" · 跳过 {len(skipped_names)} 个不支持" if skipped_names else ""

    if ok and not fail:
        status = _status_html("done", f"完成 · 成功 {ok} 个 · 用时 {dt:.1f}s{skipped_note}")
    elif ok and fail:
        status = _status_html("warn", f"部分完成 · 成功 {ok}，失败 {fail} · 用时 {dt:.1f}s{skipped_note}")
    else:
        status = _status_html("error", f"全部失败 · {fail} 个 · 用时 {dt:.1f}s{skipped_note}")

    first = choices[0] if choices else None
    yield (
        status,
        md_by_name,
        gr.update(choices=choices, value=first, visible=bool(choices)),
        (md_by_name[first] if first else "（无成功转换的文档可预览）"),
        gr.update(value=out_files or None, visible=bool(out_files)),
        list(rows),
    )


def pick_preview(name, md_by_name):
    """切换预览文件 → 返回对应 Markdown。"""
    if not md_by_name or not name or name not in md_by_name:
        return "（无可预览内容）"
    return md_by_name[name]


# ── 状态条 HTML ──────────────────────────────────────────────────────────────
def _status_html(kind, text):
    # 文字用较深色阶（700）确保浅底上对比 ≥4.5:1；底色仍用同色 12% 淡色 tint
    palette = {
        "idle":    ("var(--body-text-color-subdued)", "rgba(148,163,184,.15)", _ICON["info"]),
        "running": ("#1D4ED8", "rgba(37,99,235,.12)", _ICON["spin"]),
        "done":    ("#15803D", "rgba(22,163,74,.12)", _ICON["check"]),
        "warn":    ("#B45309", "rgba(217,119,6,.12)", _ICON["warn"]),
        "error":   ("#B91C1C", "rgba(220,38,38,.12)", _ICON["error"]),
    }
    color, bg, icon = palette.get(kind, palette["idle"])
    return (
        f'<div class="dl-status" style="color:{color};background:{bg};">'
        f'{icon}<span>{text}</span></div>'
    )


# Lucide 风格 SVG（无 emoji 图标）
_ICON = {
    "info":  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    "check": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    "warn":  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
    "error": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    "spin":  '<svg class="dl-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
    "logo":  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
}

_, dev_label_init = device_info()

CSS = """
:root, .gradio-container { --dl-font: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --dl-cta:#F97316; --dl-cta-hover:#EA580C; }

/* Single-column wizard: outer cap stays wide, content column is narrow + centered */
.gradio-container { font-family: var(--dl-font) !important; max-width: 1180px !important; margin: 0 auto !important; }
#dl-wrap { max-width: 760px; margin: 0 auto; width: 100%; }

/* Visible focus rings for keyboard nav (a11y) */
.gradio-container :focus-visible { outline: 2px solid var(--primary-500) !important;
  outline-offset: 2px; border-radius: 6px; }

/* Hero header — centered */
.dl-hero { display:flex; flex-direction:column; align-items:center; text-align:center;
  gap:12px; padding: 14px 2px 4px; }
.dl-hero .dl-logo { display:flex; align-items:center; justify-content:center; width:60px; height:60px;
  border-radius:18px; background:linear-gradient(135deg,#4f46e5,#2563eb); color:#fff;
  box-shadow:0 8px 22px rgba(37,99,235,.30); flex:0 0 auto; }
.dl-hero h1 { margin:0; font-size:2rem; font-weight:700; letter-spacing:-.025em; line-height:1.12; }
.dl-hero p  { margin:0; font-size:1rem; color:var(--body-text-color-subdued); max-width:46ch; }
.dl-chip { display:inline-flex; align-items:center; gap:6px; font-size:.78rem; font-weight:500;
  padding:4px 12px; border-radius:999px; background:var(--neutral-100);
  color:var(--body-text-color); border:1px solid var(--border-color-primary); }
.dl-chip svg { color:#16A34A; }

/* Status bar — pill, centered, with entrance fade */
.dl-status { display:inline-flex; align-items:center; gap:9px; font-size:.9rem; font-weight:600;
  padding:11px 16px; border-radius:12px; line-height:1.3; animation: dl-fade-in .25s ease both; }
.dl-status svg { flex:0 0 auto; }
.dl-status-wrap, .dl-status-wrap > div { display:flex; justify-content:center; padding:2px 0; }
.dl-spin { animation: dl-rot .9s linear infinite; transform-origin:center; }
@keyframes dl-rot { to { transform: rotate(360deg); } }
@keyframes dl-fade-in { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform:none; } }

/* Sections — flat: gr.Group already draws the single unified frame.
   No extra border/bg here, else每段双层边框 (frame-in-frame). */
.dl-card { border:none !important; background:transparent !important;
  box-shadow:none !important; padding:4px 2px; }
.dl-section-title { display:flex; align-items:center; gap:8px; font-size:.82rem; font-weight:600;
  text-transform:uppercase; letter-spacing:.05em; color:var(--body-text-color-subdued);
  margin:14px 2px 8px; }
.dl-step { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px;
  border-radius:999px; background:var(--primary-500); color:#fff; font-size:.72rem; font-weight:700;
  font-feature-settings:"tnum"; flex:0 0 auto; }

/* Upload dropzone affordance */
#dl-drop { transition: border-color .2s ease, background-color .2s ease; }
#dl-drop:hover { border-color: var(--primary-400) !important; }

/* Primary CTA — orange, full-width, tactile */
button.dl-run { font-weight:700 !important; letter-spacing:.01em; cursor:pointer;
  background: var(--dl-cta) !important; border-color: var(--dl-cta) !important; color:#fff !important;
  box-shadow: 0 4px 14px rgba(249,115,22,.30) !important;
  transition: transform .15s ease, box-shadow .2s ease, background-color .15s ease; }
button.dl-run:hover { background: var(--dl-cta-hover) !important; border-color: var(--dl-cta-hover) !important;
  transform: translateY(-1px); box-shadow: 0 6px 18px rgba(249,115,22,.38) !important; }
button.dl-run:active { transform: translateY(0); box-shadow: 0 2px 8px rgba(249,115,22,.30) !important; }

/* Footer hint */
.dl-foot { font-size:.78rem; color:var(--body-text-color-subdued); padding:2px 4px; line-height:1.6;
  text-align:center; }
.dl-foot code { font-size:.74rem; }

/* Empty-state preview placeholder */
.dl-empty { display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center;
  color:var(--body-text-color-subdued); padding:48px 16px; }
.dl-empty svg { opacity:.5; }

/* Reduced motion — kill all transitions/animations */
@media (prefers-reduced-motion: reduce) {
  .dl-spin { animation: none; }
  .dl-card, .dl-run, .dl-status, #dl-drop { transition: none !important; animation: none !important; }
}
"""

theme = gr.themes.Soft(
    primary_hue="indigo",
    secondary_hue="blue",
    neutral_hue="slate",
    font=[gr.themes.GoogleFont("Inter"), "ui-sans-serif", "system-ui", "sans-serif"],
    radius_size="lg",
).set(
    button_primary_shadow="0 4px 14px rgba(37,99,235,.25)",
    button_primary_shadow_hover="0 6px 18px rgba(37,99,235,.32)",
)

with gr.Blocks(title="Docling 文档转换") as demo:
    md_state = gr.State({})   # 文件名 → markdown，供预览切换

    # ── 单列向导布局：上传 → 选项 → 转换 → 结果 → 下载 ──
    with gr.Column(elem_id="dl-wrap"):
        # 顶部 Hero（居中），含自动检测到的设备 chip
        gr.HTML(
            f'<div class="dl-hero">'
            f'  <div class="dl-logo">{_ICON["logo"]}</div>'
            f'  <div>'
            f'    <h1>Docling 文档转换器</h1>'
            f'    <p>把 PDF / Word / PPT / Excel / HTML / 图片 转成干净的 Markdown（可选 JSON）。</p>'
            f'  </div>'
            f'</div>'
        )

        # 步骤 ① 上传
        with gr.Group(elem_classes="dl-card"):
            gr.HTML('<div class="dl-section-title"><span class="dl-step">1</span> 上传文件</div>')
            files = gr.File(
                label="拖入或点击选择（可多选）",
                file_count="multiple",
                file_types=[f"{e}" for e in sorted(SUPPORTED_EXT)],
                height=180,
                elem_id="dl-drop",
            )

        # 步骤 ② 选项
        with gr.Group(elem_classes="dl-card"):
            gr.HTML('<div class="dl-section-title"><span class="dl-step">2</span> 选项</div>')
            device_choice = gr.Dropdown(
                choices=list(DEVICE_MAP.keys()),
                value="自动检测",
                label="计算设备",
                info=f"当前自动检测到：{dev_label_init}",
            )
            with gr.Row():
                do_ocr = gr.Checkbox(value=True, label="OCR",
                                     info="扫描件 / 图片型 PDF 需要")
                do_tables = gr.Checkbox(value=True, label="表格结构识别",
                                        info="还原表格行列结构")
                want_json = gr.Checkbox(value=False, label="同时导出 JSON",
                                        info="结构化数据，便于二次处理")

        # 主 CTA（橙色、全宽、唯一主操作）
        run_btn = gr.Button("开始转换", variant="primary", size="lg",
                            elem_classes="dl-run")

        # 状态条（居中 pill）
        status = gr.HTML(
            _status_html("idle", "等待上传 — 选好文件后点「开始转换」。"),
            elem_classes="dl-status-wrap",
        )

        # 步骤 ③ 结果（预览 / 明细）
        with gr.Group(elem_classes="dl-card"):
            gr.HTML('<div class="dl-section-title"><span class="dl-step">3</span> 结果</div>')
            with gr.Tabs():
                with gr.Tab("预览"):
                    preview_picker = gr.Dropdown(
                        label="选择要预览的文件",
                        choices=[], value=None, visible=False,
                        interactive=True, filterable=True,
                    )
                    preview = gr.Markdown(
                        f'<div class="dl-empty">{_ICON["logo"]}'
                        f'<div>上传文件并点击「开始转换」<br>转换出的 Markdown 会显示在这里。</div></div>',
                        height=460,
                        max_height=560,
                        line_breaks=True,
                    )
                with gr.Tab("结果明细"):
                    results = gr.Dataframe(
                        headers=["状态", "文件", "输出"],
                        datatype=["str", "str", "str"],
                        column_count=(3, "fixed"),
                        wrap=True,
                        interactive=False,
                        max_height=460,
                        value=[],
                    )

        # 下载区（有结果才显示）
        downloads = gr.File(label="下载结果", visible=False, interactive=False)

        # 底部说明
        gr.HTML(
            '<div class="dl-foot">支持格式：'
            + ' '.join(f'<code>{e}</code>' for e in sorted(SUPPORTED_EXT))
            + '<br>首次运行会下载模型，需联网。结果保存在 <code>output/</code>。</div>'
        )

    # 事件：转换（流式 yield）
    run_btn.click(
        convert,
        inputs=[files, device_choice, do_ocr, do_tables, want_json],
        outputs=[status, md_state, preview_picker, preview, downloads, results],
    )

    # 事件：切换预览文件
    preview_picker.change(
        pick_preview,
        inputs=[preview_picker, md_state],
        outputs=[preview],
    )

if __name__ == "__main__":
    import signal

    def _shutdown(*_):
        _CONVERTER_CACHE.clear()
        _free_device_memory()
        try:
            demo.close()
        finally:
            sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    try:
        demo.launch(server_name="127.0.0.1", server_port=7860, inbrowser=True, theme=theme, css=CSS)
    except KeyboardInterrupt:
        _shutdown()

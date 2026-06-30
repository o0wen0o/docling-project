"""Docling conversion core — no Gradio, yields plain dicts for SSE."""
import sys
import gc
import json
import time
from collections import OrderedDict
from pathlib import Path
from typing import Generator

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

import torch
from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat, ConversionStatus

SUPPORTED_EXT = {".pdf", ".docx", ".pptx", ".xlsx", ".html", ".md", ".png", ".jpg", ".jpeg", ".tiff"}
OUT_DIR = Path("output")
OUT_DIR.mkdir(exist_ok=True)

_CONVERTER_CACHE: OrderedDict = OrderedDict()
_CACHE_MAX = 2


def has_xpu() -> bool:
    return hasattr(torch, "xpu") and torch.xpu.is_available()


def _free_device_memory():
    try:
        gc.collect()
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            torch.xpu.empty_cache()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def device_info():
    if has_xpu():
        return AcceleratorDevice.XPU, f"Intel GPU (XPU) · {torch.xpu.get_device_name(0)}"
    if torch.cuda.is_available():
        return AcceleratorDevice.CUDA, f"NVIDIA GPU (CUDA) · {torch.cuda.get_device_name(0)}"
    return AcceleratorDevice.CPU, "CPU · 未检测到 GPU，速度较慢"


DEVICE_MAP = {
    "auto": None,
    "xpu": AcceleratorDevice.XPU,
    "cuda": AcceleratorDevice.CUDA,
    "cpu": AcceleratorDevice.CPU,
}

DEVICE_LABELS = {
    "auto": "自动检测",
    "xpu": "Intel GPU (XPU)",
    "cuda": "NVIDIA GPU (CUDA)",
    "cpu": "CPU",
}


def resolve_device(choice: str):
    dev = DEVICE_MAP.get(choice)
    if dev is None:
        return device_info()
    labels = {
        AcceleratorDevice.XPU: f"Intel GPU (XPU) · {torch.xpu.get_device_name(0)}" if has_xpu() else "Intel GPU (XPU)",
        AcceleratorDevice.CUDA: f"NVIDIA GPU (CUDA) · {torch.cuda.get_device_name(0)}" if torch.cuda.is_available() else "NVIDIA GPU (CUDA)",
        AcceleratorDevice.CPU: "CPU",
    }
    return dev, labels[dev]


def get_converter(device, do_ocr: bool, do_tables: bool, page_batch: int = 4):
    key = (device, do_ocr, do_tables, page_batch)
    if key in _CONVERTER_CACHE:
        _CONVERTER_CACHE.move_to_end(key)
        return _CONVERTER_CACHE[key]

    opts = PdfPipelineOptions()
    opts.do_ocr = do_ocr
    opts.do_table_structure = do_tables
    opts.accelerator_options = AcceleratorOptions(device=device)
    try:
        opts.page_batch_size = int(page_batch)
    except Exception:
        pass

    _CONVERTER_CACHE[key] = DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)}
    )

    while len(_CONVERTER_CACHE) > _CACHE_MAX:
        _, evicted = _CONVERTER_CACHE.popitem(last=False)
        del evicted
        _free_device_memory()

    return _CONVERTER_CACHE[key]


def run_conversion(
    file_paths: list,
    device_choice: str,
    do_ocr: bool,
    do_tables: bool,
    want_json: bool,
) -> Generator[dict, None, None]:
    """Synchronous generator yielding progress dicts consumed by the SSE layer."""
    device, dev_label = resolve_device(device_choice)
    yield {"type": "init", "dev_label": dev_label}

    converter = get_converter(device, do_ocr, do_tables, page_batch=4)

    sources, skipped_names = [], []
    for p in file_paths:
        p = Path(p)
        if p.suffix.lower() in SUPPORTED_EXT:
            sources.append(p)
        else:
            skipped_names.append(p.name)

    if not sources:
        yield {
            "type": "error",
            "message": (
                f"没有受支持的文件（跳过 {len(skipped_names)} 个）。"
                f"支持：{', '.join(sorted(SUPPORTED_EXT))}"
            ),
        }
        return

    ok = fail = 0
    total = len(sources)
    t0 = time.time()
    seen_labels: set = set()

    for i, result in enumerate(converter.convert_all(sources, raises_on_error=False)):
        name = Path(result.input.file).name
        stem = Path(result.input.file).stem

        if result.status in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            doc = result.document
            md_text = doc.export_to_markdown()
            md_path = OUT_DIR / f"{stem}.md"
            md_path.write_text(md_text, encoding="utf-8")
            out_files = [md_path.name]

            # Deduplicate label (mirrors app.py logic)
            label = f"{stem}.md"
            dup = 2
            while label in seen_labels:
                label = f"{stem} ({dup}).md"
                dup += 1
            seen_labels.add(label)

            extra = ""
            if want_json:
                json_path = OUT_DIR / f"{stem}.json"
                json_path.write_text(
                    json.dumps(doc.export_to_dict(), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                out_files.append(json_path.name)
                extra = " + JSON"

            partial = " · 部分成功" if result.status == ConversionStatus.PARTIAL_SUCCESS else ""
            ok += 1
            yield {
                "type": "file_done",
                "index": i,
                "total": total,
                "ok": ok,
                "fail": fail,
                "name": name,
                "label": label,
                "md": md_text,
                "out_files": out_files,
                "row": [f"✓ 成功{partial}", name, f"{stem}.md{extra}"],
            }
        else:
            fail += 1
            yield {
                "type": "file_done",
                "index": i,
                "total": total,
                "ok": ok,
                "fail": fail,
                "name": name,
                "label": None,
                "md": None,
                "out_files": [],
                "row": ["✗ 失败", name, str(result.status)],
            }

    dt = time.time() - t0
    skipped_note = f" · 跳过 {len(skipped_names)} 个不支持" if skipped_names else ""

    if ok and not fail:
        summary = f"完成 · 成功 {ok} 个 · 用时 {dt:.1f}s{skipped_note}"
        status_kind = "done"
    elif ok and fail:
        summary = f"部分完成 · 成功 {ok}，失败 {fail} · 用时 {dt:.1f}s{skipped_note}"
        status_kind = "warn"
    else:
        summary = f"全部失败 · {fail} 个 · 用时 {dt:.1f}s{skipped_note}"
        status_kind = "error"

    yield {
        "type": "done",
        "summary": summary,
        "status_kind": status_kind,
        "ok": ok,
        "fail": fail,
        "skipped": len(skipped_names),
        "elapsed": dt,
    }


def shutdown():
    _CONVERTER_CACHE.clear()
    _free_device_memory()

"""Docling conversion core — no Gradio, yields plain dicts for SSE."""
import sys
import gc
import json
import threading
import time
from collections import OrderedDict
from pathlib import Path
from typing import Generator

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# Heavy deps (torch + the docling pipeline tree) take ~30s to import cold. We
# defer them so the server can print READY and accept the window immediately;
# ensure_loaded() pulls them in — called from a background warm thread right
# after boot, and again (as a cheap no-op, or a blocking wait) on first convert.
torch = None
AcceleratorOptions = AcceleratorDevice = None
PdfPipelineOptions = RapidOcrOptions = None
DocumentConverter = PdfFormatOption = None
InputFormat = ConversionStatus = None

_load_lock = threading.Lock()
_loaded = False


def ensure_loaded():
    """Import torch + docling once. Thread-safe; blocks concurrent callers
    until the first import finishes, then is a no-op."""
    global _loaded, torch
    global AcceleratorOptions, AcceleratorDevice, PdfPipelineOptions, RapidOcrOptions
    global DocumentConverter, PdfFormatOption, InputFormat, ConversionStatus
    if _loaded:
        return
    with _load_lock:
        if _loaded:
            return
        import torch as _torch
        from docling.datamodel.accelerator_options import (
            AcceleratorOptions as _AO, AcceleratorDevice as _AD,
        )
        from docling.datamodel.pipeline_options import (
            PdfPipelineOptions as _PPO, RapidOcrOptions as _ROO,
        )
        from docling.document_converter import (
            DocumentConverter as _DC, PdfFormatOption as _PFO,
        )
        from docling.datamodel.base_models import (
            InputFormat as _IF, ConversionStatus as _CS,
        )
        torch = _torch
        AcceleratorOptions, AcceleratorDevice = _AO, _AD
        PdfPipelineOptions, RapidOcrOptions = _PPO, _ROO
        DocumentConverter, PdfFormatOption = _DC, _PFO
        InputFormat, ConversionStatus = _IF, _CS
        _loaded = True


SUPPORTED_EXT = {".pdf", ".docx", ".pptx", ".xlsx", ".html", ".md", ".png", ".jpg", ".jpeg", ".tiff"}
OUT_DIR = Path("output")  # server.py overrides this via DOCLING_OUT_DIR before first use

_CONVERTER_CACHE: OrderedDict = OrderedDict()
_CACHE_MAX = 2


def has_xpu() -> bool:
    ensure_loaded()
    return hasattr(torch, "xpu") and torch.xpu.is_available()


def _free_device_memory():
    if torch is None:
        return
    try:
        gc.collect()
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            torch.xpu.empty_cache()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def device_info():
    ensure_loaded()
    if has_xpu():
        return AcceleratorDevice.XPU, f"Intel GPU (XPU) · {torch.xpu.get_device_name(0)}"
    if torch.cuda.is_available():
        return AcceleratorDevice.CUDA, f"NVIDIA GPU (CUDA) · {torch.cuda.get_device_name(0)}"
    return AcceleratorDevice.CPU, "CPU · No GPU detected, conversion will be slow"


def _device_map():
    # Built lazily — AcceleratorDevice is None until ensure_loaded() runs.
    return {
        "auto": None,
        "xpu": AcceleratorDevice.XPU,
        "cuda": AcceleratorDevice.CUDA,
        "cpu": AcceleratorDevice.CPU,
    }

DEVICE_LABELS = {
    "auto": "Auto Detect",
    "xpu": "Intel GPU (XPU)",
    "cuda": "NVIDIA GPU (CUDA)",
    "cpu": "CPU",
}


def resolve_device(choice: str):
    ensure_loaded()
    dev = _device_map().get(choice)
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
    # Pin the OCR engine instead of docling's OcrAutoOptions probe. Auto-probe
    # resolves against whatever rapidocr is installed; a newer rapidocr default
    # (torch + PP-OCRv6) isn't in docling 2.102.2's bundled model paths and dies
    # with "Unsupported configuration: torch.PP-OCRv6.det.small". The torch
    # backend matches the CPU torch we install (no onnxruntime) and uses the
    # PP-OCRv4 paths docling ships.
    opts.ocr_options = RapidOcrOptions(backend="torch")
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
    OUT_DIR.mkdir(parents=True, exist_ok=True)
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
                f"No supported files (skipped {len(skipped_names)})."
                f" Supported: {', '.join(sorted(SUPPORTED_EXT))}"
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

            partial = " · partial" if result.status == ConversionStatus.PARTIAL_SUCCESS else ""
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
                "row": [f"✓ OK{partial}", name, f"{stem}.md{extra}"],
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
                "row": ["✗ Failed", name, str(result.status)],
            }

    dt = time.time() - t0
    skipped_note = f" · skipped {len(skipped_names)} unsupported" if skipped_names else ""

    if ok and not fail:
        summary = f"Done · {ok} succeeded · {dt:.1f}s{skipped_note}"
        status_kind = "done"
    elif ok and fail:
        summary = f"Partial · {ok} OK, {fail} failed · {dt:.1f}s{skipped_note}"
        status_kind = "warn"
    else:
        summary = f"All failed · {fail} · {dt:.1f}s{skipped_note}"
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

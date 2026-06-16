import sys
import json
from pathlib import Path

# Windows 控制台默认 cp1252，强制 UTF-8 避免中文/✓ print 报 UnicodeEncodeError
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


def pick_device():
    if hasattr(torch, "xpu") and torch.xpu.is_available():
        print(f"使用 Intel GPU: {torch.xpu.get_device_name(0)}")
        return AcceleratorDevice.XPU
    print("警告：未检测到 Intel XPU，回退 CPU。检查显卡驱动。")
    return AcceleratorDevice.CPU


def build_converter(device):
    opts = PdfPipelineOptions()
    opts.do_ocr = True               # 处理扫描/图片型 PDF
    opts.do_table_structure = True   # 表格结构识别
    opts.accelerator_options = AcceleratorOptions(device=device)
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)}
    )


def collect_sources(arg):
    p = Path(arg)
    if p.is_dir():
        return sorted(f for f in p.iterdir() if f.suffix.lower() in SUPPORTED_EXT)
    if p.is_file():
        return [p]
    print(f"找不到：{arg}")
    sys.exit(1)


def write_outputs(result, want_json):
    doc = result.document
    stem = Path(result.input.file).stem
    Path(stem + ".md").write_text(doc.export_to_markdown(), encoding="utf-8")
    if want_json:
        Path(stem + ".json").write_text(
            json.dumps(doc.export_to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    print(f"  ✓ {stem} → {stem}.md" + (" + .json" if want_json else ""))


def main():
    argv = [a for a in sys.argv[1:] if a != "--json"]
    want_json = "--json" in sys.argv
    target = argv[0] if argv else "."

    device = pick_device()
    converter = build_converter(device)
    sources = collect_sources(target)
    print(f"待转换 {len(sources)} 个文件…（首次运行会下载模型，需联网）")

    ok = fail = 0
    for result in converter.convert_all(sources, raises_on_error=False):
        name = Path(result.input.file).name
        if result.status in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            write_outputs(result, want_json)
            ok += 1
        else:
            print(f"  ✗ {name}: {result.status}")
            fail += 1

    print(f"\n完成：成功 {ok}，失败 {fail}")


if __name__ == "__main__":
    main()

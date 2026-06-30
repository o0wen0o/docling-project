"""FastAPI backend — wraps converter.py, exposes SSE progress stream."""
import asyncio
import json
import os
import shutil
import signal
import socket
import sys
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import List

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

import torch
from converter import DEVICE_LABELS, device_info, has_xpu, run_conversion, shutdown

# Packaged mode: Electron sets DOCLING_OUT_DIR to app.getPath('userData')/output
_out_env = os.environ.get("DOCLING_OUT_DIR")
if _out_env:
    from pathlib import Path as _P
    import converter as _conv
    _conv.OUT_DIR = _P(_out_env)
    _conv.OUT_DIR.mkdir(parents=True, exist_ok=True)

from converter import OUT_DIR

app = FastAPI()

# file:// renderer origin shows as "null" — allow all since we only bind to 127.0.0.1
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_executor = ThreadPoolExecutor(max_workers=2)
_jobs: dict = {}


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/device")
def get_device():
    _, auto_label = device_info()
    options = []
    for key, label in DEVICE_LABELS.items():
        available = True
        if key == "xpu" and not has_xpu():
            available = False
        if key == "cuda" and not torch.cuda.is_available():
            available = False
        options.append({"key": key, "label": label, "available": available})
    return {"auto_label": auto_label, "options": options}


@app.post("/convert")
async def start_convert(
    files: List[UploadFile] = File(...),
    device: str = Form("auto"),
    do_ocr: bool = Form(True),
    do_tables: bool = Form(True),
    want_json: bool = Form(False),
):
    job_id = str(uuid.uuid4())
    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"docling_{job_id}_"))
    saved_paths = []
    for uf in files:
        dest = tmp_dir / (uf.filename or f"upload_{len(saved_paths)}")
        dest.write_bytes(await uf.read())
        saved_paths.append(str(dest))

    _jobs[job_id] = {"queue": queue, "tmp_dir": tmp_dir, "status": "running"}

    def _bg():
        try:
            for event in run_conversion(saved_paths, device, do_ocr, do_tables, want_json):
                asyncio.run_coroutine_threadsafe(queue.put(event), loop)
        except Exception as exc:
            asyncio.run_coroutine_threadsafe(
                queue.put({"type": "error", "message": str(exc)}), loop
            )
        finally:
            shutil.rmtree(str(tmp_dir), ignore_errors=True)
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)  # sentinel

    loop.run_in_executor(_executor, _bg)
    return {"job_id": job_id}


@app.get("/convert/{job_id}/events")
async def job_events(job_id: str):
    if job_id not in _jobs:
        async def _not_found():
            yield f"data: {json.dumps({'type': 'error', 'message': 'job not found'})}\n\n"
        return StreamingResponse(_not_found(), media_type="text/event-stream")

    queue = _jobs[job_id]["queue"]

    async def _stream():
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        finally:
            _jobs.pop(job_id, None)

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.delete("/convert/{job_id}")
async def cancel_job(job_id: str):
    _jobs.pop(job_id, None)
    return {"ok": True}


@app.get("/download/{filename}")
def download_file(filename: str):
    safe = Path(filename).name  # strip any path traversal
    path = OUT_DIR / safe
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=safe)


# ── Lifecycle ──────────────────────────────────────────────────────────────────

def _shutdown_handler(*_):
    shutdown()
    os._exit(0)


signal.signal(signal.SIGTERM, _shutdown_handler)

if __name__ == "__main__":
    import uvicorn

    port = _find_free_port()
    print(f"READY {port}", flush=True)

    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    except KeyboardInterrupt:
        shutdown()

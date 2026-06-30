# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = [], [], []

for pkg in ['docling', 'docling_core', 'transformers', 'uvicorn', 'starlette', 'fastapi']:
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hiddenimports += h

hiddenimports += [
    'anyio', 'anyio._backends._asyncio',
    'h11', 'multipart',
    'PIL', 'PIL._imaging',
    'cv2', 'numpy',
    'pydantic', 'pydantic.v1',
    'uvicorn.lifespan.on', 'uvicorn.lifespan.off',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.http.httptools_impl',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.loops.asyncio',
    'asyncio', 'concurrent.futures',
    'converter',
]

a = Analysis(
    ['server.py'],
    pathex=['.'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    excludes=['tkinter', 'matplotlib', 'IPython', 'jupyter', 'notebook', 'PyQt5', 'PyQt6'],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='server',
    debug=False,
    strip=False,
    upx=False,
    console=True,
)

coll = COLLECT(
    exe, a.binaries, a.datas,
    strip=False, upx=False,
    name='server',
)

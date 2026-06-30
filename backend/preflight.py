"""Dependency preflight probe.

Run with the target Python interpreter:  python preflight.py
Prints a single JSON line to stdout and exits 0 (all deps present) or 1
(something missing). The Electron app parses this to decide whether to start
the server or show the setup screen.

Kept deliberately import-light at module level so it can run on a bare
interpreter and still report which heavy dependency is absent.
"""
import importlib
import json
import sys

# (import name, friendly label) — order matters only for the first-missing report.
REQUIRED = [
    ("fastapi", "FastAPI"),
    ("uvicorn", "Uvicorn"),
    ("multipart", "python-multipart"),
    ("torch", "PyTorch (CPU)"),
    ("torchvision", "TorchVision"),
    ("transformers", "Transformers"),
    ("docling", "Docling"),
]


def check():
    missing = []
    errors = {}
    for mod, label in REQUIRED:
        try:
            importlib.import_module(mod)
        except Exception as exc:  # ImportError or a DLL-load OSError, etc.
            missing.append({"module": mod, "label": label, "error": str(exc)})
            errors[mod] = str(exc)
    return missing


def main():
    try:
        missing = check()
    except Exception as exc:
        print(json.dumps({"ok": False, "fatal": str(exc), "missing": []}))
        return 1

    result = {
        "ok": len(missing) == 0,
        "python": sys.version.split()[0],
        "executable": sys.executable,
        "missing": missing,
    }
    print(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())

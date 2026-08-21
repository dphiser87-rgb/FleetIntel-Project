"""Vercel Python runtime entry point — wraps the existing FastAPI app for serverless deployment.

Vercel's @vercel/python builder detects an ASGI app by looking for a module-level `app` object,
so re-exporting backend/server.py's `app` here is all that's needed; no handler function required.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from server import app  # noqa: E402,F401 — import after sys.path adjustment, re-exported for Vercel

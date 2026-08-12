from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any


WIDTH = 800
HEIGHT = 360
GLYPH_SCALE = 10
GLYPHS = {
    " ": ("00000",) * 7,
    ".": ("00000", "00000", "00000", "00000", "00000", "00110", "00110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "C": ("01111", "10000", "10000", "10000", "10000", "10000", "01111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "K": ("10001", "10010", "10100", "11000", "10100", "10010", "10001"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
}


class SmokeFailure(RuntimeError):
    pass


def _draw_text(pixels: bytearray, text: str, left: int, top: int) -> None:
    advance = 6 * GLYPH_SCALE
    for glyph_index, character in enumerate(text):
        glyph = GLYPHS[character]
        glyph_left = left + glyph_index * advance
        for row_index, row in enumerate(glyph):
            for column_index, value in enumerate(row):
                if value != "1":
                    continue
                x = glyph_left + column_index * GLYPH_SCALE
                y = top + row_index * GLYPH_SCALE
                black_row = b"\x00" * (GLYPH_SCALE * 3)
                for offset in range(GLYPH_SCALE):
                    start = ((y + offset) * WIDTH + x) * 3
                    pixels[start:start + len(black_row)] = black_row


def build_probe_image() -> bytes:
    pixels = bytearray(b"\xff" * (WIDTH * HEIGHT * 3))
    _draw_text(pixels, "FAMTRACK", 80, 60)
    _draw_text(pixels, "TOTAL 123.45", 40, 200)
    return f"P6\n{WIDTH} {HEIGHT}\n255\n".encode("ascii") + pixels


def request_json(base_url: str, path: str, *, body: bytes | None = None, content_type: str | None = None,
                 timeout: float) -> dict[str, Any]:
    headers = {"Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=body,
        headers=headers,
        method="POST" if body is not None else "GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise SmokeFailure(f"{path} returned HTTP {response.status}")
            payload = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read(512).decode("utf-8", errors="replace")
        raise SmokeFailure(f"{path} returned HTTP {exc.code}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise SmokeFailure(f"{path} failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise SmokeFailure(f"{path} did not return a JSON object")
    return payload


def validate_health(payload: dict[str, Any], *, require_engine: bool) -> None:
    if payload.get("ok") is not True:
        raise SmokeFailure("health response is not ok")
    if payload.get("concurrency") != 1:
        raise SmokeFailure("health response does not report single-flight inference")
    if require_engine and payload.get("engineLoaded") is not True:
        raise SmokeFailure("OCR engine was not loaded by inference")
    if not isinstance(payload.get("engineLoaded"), bool):
        raise SmokeFailure("health response has an invalid engineLoaded value")


def validate_inference(payload: dict[str, Any]) -> None:
    if payload.get("width") != WIDTH or payload.get("height") != HEIGHT:
        raise SmokeFailure("inference response has unexpected image dimensions")
    if payload.get("qrText") is not None and not isinstance(payload.get("qrText"), str):
        raise SmokeFailure("inference response has an invalid qrText value")
    blocks = payload.get("blocks")
    if not isinstance(blocks, list):
        raise SmokeFailure("inference response has no blocks array")
    for block in blocks:
        if not isinstance(block, dict) or not isinstance(block.get("text"), str):
            raise SmokeFailure("inference response contains an invalid text block")
        if not isinstance(block.get("confidence"), (int, float)):
            raise SmokeFailure("inference response contains an invalid confidence")
        if not isinstance(block.get("polygon"), list):
            raise SmokeFailure("inference response contains an invalid polygon")


def run() -> None:
    base_url = os.getenv("OCR_SMOKE_BASE_URL", "http://127.0.0.1:8090")
    timeout_text = os.getenv("OCR_SMOKE_TIMEOUT_SECONDS", "600")
    try:
        timeout = float(timeout_text)
    except ValueError as exc:
        raise SmokeFailure("OCR_SMOKE_TIMEOUT_SECONDS must be numeric") from exc
    if timeout <= 0:
        raise SmokeFailure("OCR_SMOKE_TIMEOUT_SECONDS must be positive")

    validate_health(request_json(base_url, "/health", timeout=timeout), require_engine=False)

    boundary = "famtrack-ocr-smoke-boundary"
    image = build_probe_image()
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="smoke.ppm"\r\n'
        "Content-Type: image/x-portable-pixmap\r\n\r\n"
    ).encode("ascii") + image + f"\r\n--{boundary}--\r\n".encode("ascii")
    inference = request_json(
        base_url,
        "/v1/ocr",
        body=body,
        content_type=f"multipart/form-data; boundary={boundary}",
        timeout=timeout,
    )
    validate_inference(inference)
    validate_health(request_json(base_url, "/health", timeout=timeout), require_engine=True)
    print(json.dumps(
        {"engineLoaded": True, "health": True, "inference": True, "ok": True},
        separators=(",", ":"),
        sort_keys=True,
    ))


if __name__ == "__main__":
    try:
        run()
    except (SmokeFailure, OSError) as exc:
        print(f"receipt-ocr smoke failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

from __future__ import annotations

import asyncio
import os
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from paddleocr import PaddleOCR

MAX_BYTES = int(os.getenv("OCR_MAX_BYTES", str(12 * 1024 * 1024)))
MAX_PIXELS = int(os.getenv("OCR_MAX_PIXELS", "40000000"))
# The sidecar is intentionally single-flight on CPU regardless of deployment input.
OCR_CONCURRENCY = 1

app = FastAPI(title="FamTrack receipt OCR", docs_url=None, redoc_url=None)
semaphore = asyncio.Semaphore(OCR_CONCURRENCY)
engine: PaddleOCR | None = None


def get_engine() -> PaddleOCR:
    global engine
    if engine is None:
        engine = PaddleOCR(
            lang=os.getenv("PADDLEOCR_LANG", "ru"),
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    return engine


def normalize_result(result: Any) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for page in result or []:
        payload = getattr(page, "json", page)
        if callable(payload):
            payload = payload()
        if isinstance(payload, str):
            continue
        if isinstance(payload, dict) and "res" in payload and isinstance(payload["res"], dict):
            payload = payload["res"]
        if isinstance(payload, dict):
            texts = payload.get("rec_texts") or []
            scores = payload.get("rec_scores") or []
            polygons = payload.get("dt_polys") or payload.get("rec_polys") or []
            for index, text in enumerate(texts):
                if not str(text).strip():
                    continue
                polygon = polygons[index] if index < len(polygons) else []
                blocks.append({
                    "text": str(text).strip(),
                    "confidence": float(scores[index]) if index < len(scores) else 0.0,
                    "polygon": np.asarray(polygon).astype(float).tolist(),
                })
            continue
        # Compatibility with PaddleOCR 2.x-shaped results.
        if isinstance(page, list):
            for line in page:
                if not isinstance(line, list) or len(line) < 2:
                    continue
                text_score = line[1]
                if not isinstance(text_score, (list, tuple)) or not text_score:
                    continue
                blocks.append({
                    "text": str(text_score[0]).strip(),
                    "confidence": float(text_score[1]) if len(text_score) > 1 else 0.0,
                    "polygon": np.asarray(line[0]).astype(float).tolist(),
                })
    return blocks


def preprocess(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
    return cv2.cvtColor(denoised, cv2.COLOR_GRAY2BGR)


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "engineLoaded": engine is not None, "concurrency": OCR_CONCURRENCY}


@app.post("/v1/ocr")
async def ocr(file: UploadFile = File(...)) -> dict[str, Any]:
    body = await file.read(MAX_BYTES + 1)
    if not body or len(body) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="image exceeds 12 MiB")
    encoded = np.frombuffer(body, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=422, detail="corrupt or unsupported image")
    height, width = image.shape[:2]
    if width * height > MAX_PIXELS:
        raise HTTPException(status_code=413, detail="image exceeds 40 MP")

    qr_text, _, _ = cv2.QRCodeDetector().detectAndDecode(image)
    prepared = preprocess(image)
    async with semaphore:
        try:
            prediction = await asyncio.to_thread(get_engine().predict, prepared)
            blocks = normalize_result(prediction)
        except Exception as exc:  # Keep provider details inside the sidecar.
            raise HTTPException(status_code=503, detail="OCR inference failed") from exc
    return {
        "width": width,
        "height": height,
        "qrText": qr_text or None,
        "blocks": blocks,
    }

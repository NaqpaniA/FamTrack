FROM python:3.10-slim-bullseye

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PADDLEOCR_LANG=ru \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OCR_CONCURRENCY=1 \
    OCR_MAX_BYTES=12582912 \
    OCR_MAX_PIXELS=40000000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY receipt-ocr/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --index-url https://pypi.org/simple -r requirements.txt \
    && pip check

COPY receipt-ocr/app.py receipt-ocr/smoke.py ./

RUN useradd --create-home --uid 10001 ocr && chown -R ocr:ocr /app
USER ocr

# Bake the Russian detector/recognizer models into the image and run a real
# inference. Unsupported CPU/runtime pairs fail before the image can activate.
RUN python -c "import cv2,numpy as np,paddle; from app import get_engine,normalize_result,preprocess; from smoke import build_probe_image; assert paddle.__version__ == '2.5.2'; image=cv2.imdecode(np.frombuffer(build_probe_image(),dtype=np.uint8),cv2.IMREAD_COLOR); assert image is not None; blocks=normalize_result(get_engine().ocr(preprocess(image),cls=False)); assert blocks, 'OCR returned no blocks'; print({'paddle':paddle.__version__,'opencv':cv2.__version__,'blocks':len(blocks)})"

EXPOSE 8090
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1", "--no-access-log"]

FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PADDLEOCR_LANG=ru \
    OCR_CONCURRENCY=1 \
    OCR_MAX_BYTES=12582912 \
    OCR_MAX_PIXELS=40000000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 \
    && rm -rf /var/lib/apt/lists/*

COPY receipt-ocr/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --index-url https://pypi.org/simple -r requirements.txt

COPY receipt-ocr/app.py ./app.py

RUN useradd --create-home --uid 10001 ocr && chown -R ocr:ocr /app
USER ocr

EXPOSE 8090
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1", "--no-access-log"]

FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    MODEL_PATH=/models/yolo11n.pt MODEL_VERSION=yolo11n-u8.4.213-t2.15.0 \
    MODEL_SHA256=0ebbc80d4a7680d14987a577cd21342b65ecfd94632bd9a8da63ae6417644ee1 \
    OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 YOLO_CONFIG_DIR=/tmp/ultralytics
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
# CPU wheels avoid downloading CUDA dependencies and do not require a GPU.
RUN pip install --no-cache-dir torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt
COPY nightwatch ./nightwatch
COPY start-api.sh .
RUN python -m nightwatch.fetch_model /models/yolo11n.pt && \
    chmod 444 /models/yolo11n.pt && chmod 755 start-api.sh && useradd --create-home worker
USER worker
EXPOSE 8000
CMD ["./start-api.sh"]

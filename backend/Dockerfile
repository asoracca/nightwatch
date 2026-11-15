FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libglib2.0-0 libgl1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY nightwatch ./nightwatch
RUN useradd --create-home worker
USER worker
EXPOSE 8000
CMD ["uvicorn", "nightwatch.api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

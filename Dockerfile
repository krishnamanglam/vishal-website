# Stage 1: build the React website
FROM node:20-alpine AS web
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python API that also serves the built website
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /build/frontend/dist /app/frontend/dist

# The database lives in /data. Mount a persistent disk/volume there.
RUN useradd --create-home app && mkdir -p /data && chown -R app /data
USER app
ENV DATA_DIR=/data
EXPOSE 8000

# One worker on purpose: SQLite database and in-memory rate limits.
# --proxy-headers makes rate limiting see the real visitor IP behind the host's proxy.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]

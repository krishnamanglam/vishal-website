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

# No disk needed: all data lives in MongoDB Atlas (set MONGODB_URI).
RUN useradd --create-home app
USER app
EXPOSE 8000

# One worker is enough for a small shop; rate limits are kept in memory.
# --proxy-headers makes rate limiting see the real visitor IP behind the host's proxy.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]


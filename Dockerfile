FROM node:24-alpine AS frontend
# Match the successful local npm environment (Node 24.22.1 / npm 11.19.1).
RUN npm install --global npm@11.19.1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    SCHOOL_DB_PATH=/var/data/school.db \
    UPLOAD_DIR=/var/data/uploads

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && mkdir -p /var/data/uploads
COPY app.py ./
COPY database.py ./
COPY storage.py ./
COPY base44/entities ./base44/entities
COPY --from=frontend /app/dist ./dist

EXPOSE 10000
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 1 --threads 4 --timeout 120 app:app"]

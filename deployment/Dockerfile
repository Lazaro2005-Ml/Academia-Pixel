FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000 ACADEMIA_DATA_DIR=/data
WORKDIR /srv/academia
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && groupadd --system academia && useradd --system --gid academia academia \
 && mkdir -p /data && chown academia:academia /data
COPY app.py ./
COPY web/ ./web/
COPY crear_docente.py ./
USER academia
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]

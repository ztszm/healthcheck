# ============================================
#  多阶段构建：Stage 1 下载模型，Stage 2 跑服务
# ============================================

# ─── Stage 1: 模型下载器（仅下载，不计入运行时依赖） ───
FROM python:3.9-slim AS model-downloader

ENV HF_ENDPOINT=https://hf-mirror.com

RUN pip install --no-cache-dir huggingface_hub

# 下载模型脚本（带重试 + 详细日志）
COPY download_model.py /tmp/download_model.py
RUN python /tmp/download_model.py

# ─── Stage 2: 运行时服务 ───
FROM python:3.9-slim

WORKDIR /app

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# pip 镜像源
RUN pip config set global.index-url https://mirrors.cloud.tencent.com/pypi/simple && \
    pip config set global.trusted-host mirrors.cloud.tencent.com

# PyTorch CPU
RUN pip install --no-cache-dir torch --extra-index-url https://download.pytorch.org/whl/cpu

# Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── 从 Stage 1 拷贝模型 ───
COPY --from=model-downloader /models /app/models

# 源代码
COPY . .

EXPOSE 80
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]

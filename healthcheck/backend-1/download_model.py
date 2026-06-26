"""Stage 1 模型下载脚本 — 带重试和详细日志"""
import os
import sys
import time

MODEL_ID = "BAAI/bge-small-zh-v1.5"
OUTPUT_DIR = "/models/bge-small-zh-v1.5"
MAX_RETRIES = 3
RETRY_DELAY = 10  # 秒

os.makedirs(OUTPUT_DIR, exist_ok=True)

print(f"[download_model] HF_ENDPOINT = {os.environ.get('HF_ENDPOINT', 'NOT SET')}")
print(f"[download_model] 目标模型: {MODEL_ID}")
print(f"[download_model] 输出目录: {OUTPUT_DIR}")

from huggingface_hub import snapshot_download

last_error = None

for attempt in range(1, MAX_RETRIES + 1):
    try:
        print(f"\n[download_model] 第 {attempt}/{MAX_RETRIES} 次尝试下载...")
        snapshot_download(
            MODEL_ID,
            local_dir=OUTPUT_DIR,
            local_dir_use_symlinks=False,
            resume_download=True,
        )
        print(f"[download_model] ✅ 下载成功！")
        
        # 列出下载的文件
        total_size = 0
        for root, dirs, files in os.walk(OUTPUT_DIR):
            for f in files:
                fp = os.path.join(root, f)
                sz = os.path.getsize(fp)
                total_size += sz
                print(f"  {f}: {sz / 1024 / 1024:.1f} MB")
        print(f"[download_model] 总计: {total_size / 1024 / 1024:.1f} MB")
        sys.exit(0)
        
    except Exception as e:
        last_error = e
        print(f"[download_model] ❌ 第 {attempt} 次失败: {type(e).__name__}: {e}")
        if attempt < MAX_RETRIES:
            print(f"[download_model] {RETRY_DELAY} 秒后重试...")
            time.sleep(RETRY_DELAY)

print(f"\n[download_model] ❌ 全部 {MAX_RETRIES} 次尝试均失败")
print(f"[download_model] 最后错误: {type(last_error).__name__}: {last_error}")
sys.exit(1)

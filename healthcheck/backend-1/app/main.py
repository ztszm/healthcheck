# backend/app/main.py
import os
import sys
import json
from pathlib import Path

# ==================== 设置 HuggingFace 镜像源 ====================
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import HTTPException
import uuid
from datetime import datetime
import httpx
from typing import List, Optional

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ==================== 配置 ====================
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY",'')
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"

# 模型配置
MODEL_NAME = 'BAAI/bge-small-zh-v1.5'
# 挂载路径优先（云托管文件存储），可通过 MODEL_PATH 环境变量自定义
MOUNT_MODEL_PATH = os.getenv("MODEL_PATH", "/mnt/models/bge-small-zh-v1.5")
LOCAL_MODEL_PATH = os.path.join(os.path.dirname(__file__), '../models', MODEL_NAME.split('/')[-1])

# ==================== 导入 RAG 依赖 ====================
RAG_AVAILABLE = False
embedder = None
kb_collection = None
_rag_initialized = False
_rag_lock = None  # 线程锁，懒加载时使用

try:
    from sentence_transformers import SentenceTransformer
    import chromadb
    import threading
    _rag_lock = threading.Lock()
    RAG_AVAILABLE = True
    print("✅ RAG 依赖加载成功（模型将在首次使用时加载）")
except ImportError as e:
    print(f"⚠️ RAG 依赖未安装: {e}")
    print("   请运行: pip install sentence-transformers chromadb")

# ==================== 加载模型（优先级：挂载卷 > 本地 > HF缓存 > 在线下载） ====================
def get_model_path() -> str:
    """获取模型路径，优先使用挂载卷"""
    # 1. 优先检查挂载卷（云托管文件存储）
    if os.path.exists(MOUNT_MODEL_PATH):
        print(f"✅ 发现挂载卷模型: {MOUNT_MODEL_PATH}")
        return MOUNT_MODEL_PATH
    
    # 2. 检查本地模型
    if os.path.exists(LOCAL_MODEL_PATH):
        print(f"✅ 发现本地模型: {LOCAL_MODEL_PATH}")
        return LOCAL_MODEL_PATH
    
    # 3. 检查 HuggingFace 缓存
    cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
    model_cache_name = f"models--{MODEL_NAME.replace('/', '--')}"
    cache_path = os.path.join(cache_dir, model_cache_name)
    
    if os.path.exists(cache_path):
        print(f"✅ 发现缓存模型: {cache_path}")
        return MODEL_NAME
    
    # 4. 在线下载（兜底方案）
    print(f"📦 未找到本地模型，将在线下载: {MODEL_NAME}")
    print(f"   提示：生产环境建议将模型文件挂载到 {MOUNT_MODEL_PATH}")
    return MODEL_NAME

def load_embedder():
    """加载 Embedding 模型"""
    global embedder
    
    try:
        model_to_load = get_model_path()
        print(f"📦 加载 Embedding 模型（可能需要 30-60 秒）...")
        embedder = SentenceTransformer(model_to_load)
        print(f"✅ 模型加载成功")
        return True
    except Exception as e:
        print(f"❌ 模型加载失败: {e}")
        return False

# ==================== 懒加载 RAG 组件 ====================
def _lazy_init_rag():
    """懒加载：首次使用时才初始化 RAG（避免启动超时/OOM）"""
    global _rag_initialized, kb_collection, embedder, RAG_AVAILABLE
    
    if _rag_initialized:
        return
    
    if not RAG_AVAILABLE:
        return
    
    with _rag_lock:
        if _rag_initialized:
            return
        
        try:
            # 加载模型（可能需要较多内存）
            if load_embedder():
                # 初始化 ChromaDB
                chroma_client = chromadb.PersistentClient(path="./../zhongyi_kb")
                kb_collection = chroma_client.get_or_create_collection(
                    name="health_knowledge",
                    metadata={
                    "hnsw:space": "cosine",
                    "dimension": 512  # 明确指定与嵌入模型匹配的维度
                    }
                )
                print("✅ RAG 组件初始化成功")
                
                # 初始化知识库数据
                init_knowledge_base()
            else:
                RAG_AVAILABLE = False
                print("⚠️ 模型加载失败，将使用 DeepSeek API 或离线建议代替 RAG")
        except MemoryError:
            print("❌ 内存不足，无法加载模型。RAG 功能不可用，将使用 DeepSeek API 代替")
            RAG_AVAILABLE = False
        except Exception as e:
            print(f"❌ RAG 初始化失败: {e}，将使用 DeepSeek API 代替")
            RAG_AVAILABLE = False
        
        _rag_initialized = True

# ==================== 内置知识库 ====================
INITIAL_KNOWLEDGE = [
    {
        "id": "doc_001",
        "text": "失眠症：入睡困难是指躺下后30分钟以上无法入睡。建议睡前1小时远离电子设备，保持卧室安静黑暗，温度控制在18-22度。",
        "category": "失眠症"
    },
    {
        "id": "doc_002",
        "text": "失眠症：夜间易醒是指夜间醒来2次以上，且难以再次入睡。建议避免睡前饮水和咖啡因，保持规律作息。",
        "category": "失眠症"
    },
    {
        "id": "doc_003",
        "text": "失眠症：早醒是指比预期早醒1小时以上。建议调整生物钟，白天适度运动，早晨接触自然光照。",
        "category": "失眠症"
    },
    {
        "id": "doc_004",
        "text": "胃痛：上腹疼痛是指肋骨下缘至肚脐之间的疼痛。建议少食多餐，避免过饱，饭后保持直立姿势。",
        "category": "胃痛"
    },
    {
        "id": "doc_005",
        "text": "胃痛：餐后加重是指进食后15-30分钟内疼痛明显加重。建议细嚼慢咽，饭后散步15分钟。",
        "category": "胃痛"
    },
    {
        "id": "doc_006",
        "text": "胃痛：反酸烧心是指胸部有烧灼感，口中有酸味。建议睡前3小时不进食，避免辛辣、酸性食物。",
        "category": "胃痛"
    },
    {
        "id": "doc_007",
        "text": "慢性头痛：单侧头痛是指疼痛主要集中在头的一侧。建议在安静、黑暗环境中休息，头部冷敷。",
        "category": "慢性头痛"
    },
    {
        "id": "doc_008",
        "text": "慢性头痛：搏动性疼痛是指与心跳同步的搏动感。建议头部冷敷，避免剧烈运动和强光刺激。",
        "category": "慢性头痛"
    },
    {
        "id": "doc_009",
        "text": "慢性头痛：畏光畏声是指对光线和声音异常敏感。建议佩戴太阳镜和降噪耳塞，在黑暗安静环境休息。",
        "category": "慢性头痛"
    },
    {
        "id": "doc_010",
        "text": "通用健康建议：保持规律作息，每天固定时间睡觉和起床，保证7-8小时睡眠。适度运动，每周至少150分钟。均衡饮食，每天摄入不少于500克蔬菜水果。",
        "category": "通用"
    },
    {
        "id": "doc_011",
        "text": "就医指引：如果症状持续超过2周，或突然加重，或伴有不明原因的体重下降、发热、剧烈疼痛，应及时就医。",
        "category": "通用"
    }
]

# ==================== 症状数据 ====================
DISEASES = [
    {"id": 1, "name": "失眠症", "desc": "难以入睡或维持睡眠", "icon": "🌙"},
    {"id": 2, "name": "胃痛", "desc": "上腹部疼痛或不适", "icon": "🤕"},
    {"id": 3, "name": "慢性头痛", "desc": "反复发作的头痛", "icon": "😵"}
]

SYMPTOMS = {
    1: [
        {"id": 101, "name": "入睡困难", "desc": "躺下后30分钟以上无法入睡"}, 
        {"id": 102, "name": "夜间易醒", "desc": "夜间醒来2次以上"}, 
        {"id": 103, "name": "早醒", "desc": "比预期早醒1小时以上"}
    ],
    2: [
        {"id": 201, "name": "上腹疼痛", "desc": "肋骨下缘至肚脐之间的疼痛"}, 
        {"id": 202, "name": "餐后加重", "desc": "进食后疼痛明显加重"}, 
        {"id": 203, "name": "反酸烧心", "desc": "胸部烧灼感，口中有酸味"}
    ],
    3: [
        {"id": 301, "name": "单侧头痛", "desc": "疼痛主要集中在头的一侧"}, 
        {"id": 302, "name": "搏动性疼痛", "desc": "与心跳同步的搏动感"}, 
        {"id": 303, "name": "畏光畏声", "desc": "对光线和声音敏感"}
    ]
}

# ==================== 初始化知识库 ====================
def init_knowledge_base():
    """初始化知识库（同步函数）"""
    if not RAG_AVAILABLE or embedder is None or kb_collection is None:
        print("⚠️ RAG 不可用，跳过知识库初始化")
        return
    
    try:
        # 检查是否已有数据
        if kb_collection.count() > 0:
            print(f"📚 知识库已有 {kb_collection.count()} 条记录，跳过初始化")
            return
        
        print("📚 正在初始化知识库...")
        texts = [doc["text"] for doc in INITIAL_KNOWLEDGE]
        embeddings = embedder.encode(texts).tolist()
        
        kb_collection.add(
            documents=texts,
            embeddings=embeddings,
            ids=[doc["id"] for doc in INITIAL_KNOWLEDGE],
            metadatas=[{"category": doc["category"]} for doc in INITIAL_KNOWLEDGE]
        )
        print(f"✅ 知识库初始化完成，共 {len(INITIAL_KNOWLEDGE)} 条记录")
    except Exception as e:
        print(f"❌ 知识库初始化失败: {e}")

# ==================== RAG 检索函数 ====================
def retrieve_knowledge(query: str, n_results: int = 5) -> str:
    """从知识库检索相关内容"""
    _lazy_init_rag()  # 懒加载
    if not RAG_AVAILABLE or embedder is None or kb_collection is None:
        return ""
    
    try:
        q_embedding = embedder.encode(query).tolist()
        results = kb_collection.query(
            query_embeddings=[q_embedding],
            n_results=n_results
        )
        
        if results['documents'] and len(results['documents'][0]) > 0:
            return "\n\n---\n".join(results['documents'][0])
        return ""
    except Exception as e:
        print(f"⚠️ 知识库检索失败: {e}")
        return ""

# ==================== 离线建议生成 ====================
def generate_offline_advice(disease_name: str, symptoms: list, knowledge_context: str = "") -> str:
    """离线生成建议"""
    advice = ""
    
    if knowledge_context:
        advice += "📚 根据健康知识库：\n\n"
        advice += knowledge_context + "\n\n"
    
    advice += "=" * 40 + "\n\n"
    advice += "【" + disease_name + "】健康指导\n\n"
    advice += "一、症状解读\n"
    advice += "您选择的症状包括：" + ", ".join(symptoms) + "。\n"
    advice += "建议您密切关注症状变化。\n\n"
    
    advice += "二、自我管理建议\n"
    advice += "1. 保持规律作息，每天7-8小时睡眠\n"
    advice += "2. 适度运动，每周至少150分钟\n"
    advice += "3. 保持良好心态，避免过度焦虑\n\n"
    
    advice += "三、饮食建议\n"
    advice += "1. 均衡饮食，多吃蔬菜水果\n"
    advice += "2. 减少油腻、辛辣、刺激性食物\n"
    advice += "3. 定时定量进餐，避免暴饮暴食\n\n"
    
    advice += "四、就医指引\n"
    advice += "如出现以下情况，建议及时就医：\n"
    advice += "- 症状持续加重或超过2周\n"
    advice += "- 影响日常生活和工作\n"
    advice += "- 伴有严重不适\n\n"
    
    advice += "五、预防措施\n"
    advice += "1. 定期体检，关注身体状况\n"
    advice += "2. 建立健康的生活习惯\n"
    advice += "3. 避免过度劳累\n\n"
    
    advice += "⚠️ 本报告仅供参考，不构成医疗建议。"
    return advice

# ==================== DeepSeek API 调用 ====================
async def call_deepseek(prompt: str) -> str:
    """调用 DeepSeek API"""
    if not DEEPSEEK_API_KEY or DEEPSEEK_API_KEY == "sk-your-api-key-here":
        print("⚠️ DeepSeek API Key 未配置")
        return None
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                DEEPSEEK_BASE_URL + "/chat/completions",
                headers={
                    "Authorization": "Bearer " + DEEPSEEK_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": "你是一位专业的健康顾问，请提供专业、温和的健康建议。"},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 2000
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"]
            else:
                print(f"❌ DeepSeek API 错误: {response.status_code}")
                return None
                
    except Exception as e:
        print(f"❌ 调用 DeepSeek API 失败: {e}")
        return None

# ==================== 使用知识库增强的 DeepSeek 调用 ====================
async def call_deepseek_with_kb(user_question: str, disease_name: str = "", symptoms: list = None) -> str:
    """使用知识库增强的 DeepSeek 调用"""
    if symptoms is None:
        symptoms = []
    
    # 1. 从知识库检索相关内容
    search_query = f"{disease_name} {' '.join(symptoms)}" if disease_name else user_question
    knowledge_context = retrieve_knowledge(search_query)
    
    # 2. 构建含知识库的 Prompt
    system_prompt = """你是一位专业的健康顾问。请基于以下知识库回答用户问题。
        如果知识库中没有相关信息，请根据你的专业知识回答，并明确告知用户。

        要求：
        1. 优先使用知识库中的专业知识
        2. 语气温和、专业、有同理心
        3. 建议要具体、可操作
        4. 如果症状严重，明确建议就医
        5. 使用中文，结构清晰
        6. 禁止给出使用药物建议"""
        

    user_prompt = f"""用户问题：{user_question}

知识库相关内容：
{knowledge_context if knowledge_context else "（知识库暂无相关内容，请根据您的专业知识回答）"}

请提供专业的健康指导。"""
    
    # 3. 调用 DeepSeek API
    result = await call_deepseek(user_prompt)
    
    # 如果 API 调用失败，使用离线建议
    if result is None and disease_name:
        return generate_offline_advice(disease_name, symptoms, knowledge_context)
    
    return result

# ==================== 多轮对话调用（追问模式） ====================
async def call_deepseek_chat(chat_history: list, disease_name: str = "", symptoms: list = None) -> str:
    """使用对话历史进行多轮对话"""
    if symptoms is None:
        symptoms = []

    if not DEEPSEEK_API_KEY or DEEPSEEK_API_KEY == "sk-your-api-key-here":
        print("⚠️ DeepSeek API Key 未配置，使用离线建议")
        return generate_offline_advice(disease_name, symptoms, "")

    # 从知识库检索相关内容
    search_query = f"{disease_name} {' '.join(symptoms)}" if disease_name else ""
    knowledge_context = retrieve_knowledge(search_query)

    # 构建 system prompt
    system_content = """你是一位专业的健康顾问。请基于以下信息回答用户的追问。

要求：
1. 结合之前生成的健康报告内容，针对用户的新问题给出具体指导
2. 优先使用知识库中的专业知识
3. 语气温和、专业、有同理心
4. 回答要具体、可操作
5. 如果症状严重，明确建议就医
6. 禁止给出使用药物建议"""

    if knowledge_context:
        system_content += f"\n\n参考知识库：\n{knowledge_context}"

    # 构建多轮消息
    messages = [{"role": "system", "content": system_content}]
    for msg in chat_history:
        # 前端用 "ai"，DeepSeek 要求 "assistant"
        role = "assistant" if msg.role == "ai" else msg.role
        messages.append({"role": role, "content": msg.content})

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                DEEPSEEK_BASE_URL + "/chat/completions",
                headers={
                    "Authorization": "Bearer " + DEEPSEEK_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "model": "deepseek-chat",
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 2000
                }
            )

            if response.status_code == 200:
                data = response.json()
                return data["choices"][0]["message"]["content"]
            else:
                print(f"❌ DeepSeek API 错误: {response.status_code}")
                return "抱歉，暂时无法回复，请稍后重试。"
    except Exception as e:
        print(f"❌ 调用 DeepSeek API 失败: {e}")
        return "抱歉，网络异常，请稍后重试。"

# ==================== API 路由 ====================
@app.get("/api/diseases")
def get_diseases():
    """获取所有疾病列表"""
    return DISEASES

@app.get("/api/diseases/{id}/symptoms")
def get_symptoms(id: int):
    """获取特定疾病的症状列表"""
    return SYMPTOMS.get(id, [])

@app.get("/api/knowledge/status")
def get_knowledge_status():
    """检查知识库状态"""
    if not RAG_AVAILABLE:
        return {
            "status": "unavailable", 
            "message": "RAG 组件未安装，请运行: pip install sentence-transformers chromadb"
        }
    
    count = kb_collection.count() if kb_collection else 0
    return {
        "status": "ready" if count > 0 else "empty",
        "count": count,
        "rag_available": RAG_AVAILABLE,
        "rag_initialized": _rag_initialized,
        "model": MODEL_NAME,
        "mount_model_exists": os.path.exists(MOUNT_MODEL_PATH),
        "mount_model_path": MOUNT_MODEL_PATH,
        "local_model_exists": os.path.exists(LOCAL_MODEL_PATH)
    }

@app.post("/api/knowledge/add")
async def add_knowledge(data: dict):
    """手动添加知识到知识库"""
    _lazy_init_rag()  # 懒加载
    if not RAG_AVAILABLE or embedder is None or kb_collection is None:
        raise HTTPException(status_code=503, detail="RAG 服务不可用")
    
    text = data.get("text")
    category = data.get("category", "通用")
    doc_id = data.get("id", "doc_" + uuid.uuid4().hex[:8])
    
    if not text:
        raise HTTPException(status_code=400, detail="内容不能为空")
    
    try:
        embedding = embedder.encode([text]).tolist()
        kb_collection.add(
            documents=[text],
            embeddings=embedding,
            ids=[doc_id],
            metadatas=[{"category": category}]
        )
        return {"status": "success", "id": doc_id, "message": "知识添加成功"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
        
from pydantic import BaseModel
from typing import List, Optional

# ==================== Pydantic 模型 ====================
class SymptomDetail(BaseModel):
    symptomId: int
    detail: str

class ChatMessage(BaseModel):
    role: str    # "user" 或 "ai"
    content: str

class ReportRequest(BaseModel):
    disease_id: int
    selected_symptom_ids: List[int]
    symptom_details: Optional[List[SymptomDetail]] = []
    chat_history: Optional[List[ChatMessage]] = []   # 追问时的对话历史

class KnowledgeAddRequest(BaseModel):
    text: str
    category: str = "通用"
    id: Optional[str] = None
@app.post("/api/reports")
async def generate_report(req: ReportRequest):
    """生成健康报告（支持首次生成 + 追问对话）"""
    disease_id = req.disease_id
    symptom_ids = req.selected_symptom_ids
    symptom_details = req.symptom_details or []
    chat_history = req.chat_history or []

    # 获取疾病信息
    disease = next((d for d in DISEASES if d["id"] == disease_id), None)
    if not disease:
        raise HTTPException(status_code=404, detail="疾病不存在")

    disease_name = disease["name"]

    # 获取症状信息
    selected_symptoms = []
    for s in SYMPTOMS.get(disease_id, []):
        if s["id"] in symptom_ids:
            selected_symptoms.append(s)

    symptom_names = [s["name"] for s in selected_symptoms]

    if not symptom_names:
        raise HTTPException(status_code=400, detail="请至少选择一个症状")

    # 构建症状详情映射
    detail_map = {item.symptomId: item.detail for item in symptom_details}

    # 构建包含详情的症状文本
    symptom_texts = []
    for s in selected_symptoms:
        text = s["name"]
        if s["id"] in detail_map and detail_map[s["id"]].strip():
            text += "（" + detail_map[s["id"]] + "）"
        symptom_texts.append(text)

    # ========== 判断是首次生成还是追问 ==========
    is_followup = len(chat_history) > 0

    if is_followup:
        # --- 追问模式：将对话历史传给 DeepSeek 做多轮对话 ---
        advice = await call_deepseek_chat(
            chat_history=chat_history,
            disease_name=disease_name,
            symptoms=symptom_names
        )
        return {
            "report_id": uuid.uuid4().hex[:8],
            "title": "健康评估报告 - " + disease_name,
            "disease": disease_name,
            "symptoms": symptom_names,
            "symptom_details": [{"symptomId": k, "detail": v} for k, v in detail_map.items()],
            "content": advice,
            "advice": advice,
            "created_at": datetime.now().isoformat(),
            "rag_used": RAG_AVAILABLE
        }

    # --- 首次报告模式 ---
    user_question = f"我患有{disease_name}，症状包括：{', '.join(symptom_texts)}。请给我健康指导。"

    advice = await call_deepseek_with_kb(
        user_question=user_question,
        disease_name=disease_name,
        symptoms=symptom_names
    )

    content = "疾病：" + disease_name + "\n\n"
    content += "选择的症状：" + ", ".join(symptom_texts) + "\n\n"
    content += "=" * 40 + "\n\n"
    content += advice + "\n\n"
    content += "【注意】 本报告仅供参考，不构成医疗建议。"

    return {
        "report_id": uuid.uuid4().hex[:8],
        "title": "健康评估报告 - " + disease_name,
        "disease": disease_name,
        "symptoms": symptom_names,
        "symptom_details": [{"symptomId": k, "detail": v} for k, v in detail_map.items()],
        "content": content,
        "advice": advice,
        "created_at": datetime.now().isoformat(),
        "rag_used": RAG_AVAILABLE
    }
@app.get("/")
@app.get("/api/health")
def health_check():
    """健康检查（不触发模型加载，快速响应）"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "rag_available": RAG_AVAILABLE,
        "rag_initialized": _rag_initialized,
        "knowledge_count": kb_collection.count() if kb_collection else 0,
        "model_loaded": embedder is not None
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
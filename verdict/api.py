# api.py (требует: pip install fastapi uvicorn pydantic)
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import verdict9 as v9
import re

app = FastAPI(title="Verdict Cognitive Core API", version="0.9.1")

class InferRequest(BaseModel):
    knowledge_base: str  # Текст .tri файла
    goal: str            # Например: "грипп(иван)"

@app.post("/infer")
def infer(req: InferRequest):
    kb = v9.KnowledgeBase()
    try:
        v9.parse_file(req.knowledge_base, kb)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга базы знаний: {str(e)}")
    
    # Парсинг цели
    m = re.match(r"([a-zA-Zа-яА-Я0-9_]+)\(([^)]*)\)", req.goal)
    if not m: 
        raise HTTPException(status_code=400, detail="Неверный формат цели. Используйте: предикат(арг1,арг2)")
    
    pred = m.group(1)
    args = tuple(a.strip() for a in m.group(2).split(",")) if m.group(2).strip() else ()
    
    # Вывод + Абдукция
    res = v9.evaluate_predicate(kb, pred, args, {})
    if res is None:
        v9.abduce(kb, pred, args)
        res = v9.evaluate_predicate(kb, pred, args, {})
        
    if res:
        val, reason = res
        return {
            "status": v9.TRIT_NAMES[val],
            "confidence": round(reason.confidence, 4),
            "complexity": reason.chain_length(),
            "xai_report": reason.generate_xai_report()
        }
    return {
        "status": "нез", 
        "confidence": 0.0,
        "complexity": 0,
        "xai_report": "Цель не достигнута (возможна абдукция или конфликт)."
    }

@app.get("/")
def root():
    return {"message": "Verdict Cognitive Core API is running."}

# Запуск: uvicorn api:app --reload
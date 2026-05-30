import os
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from engine import EducationalPipeline
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Global State
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()
active_pipeline = None
app_settings = {
    "geminiKey": os.getenv("GEMINI_API_KEY", ""),
    "openaiKey": os.getenv("OPENAI_API_KEY", ""),
    "geminiModel": "gemini-1.5-pro"
}

class SettingsUpdate(BaseModel):
    geminiKey: str = None
    openaiKey: str = None
    geminiModel: str = None

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/settings")
async def update_settings(settings: SettingsUpdate):
    if settings.geminiKey: app_settings["geminiKey"] = settings.geminiKey
    if settings.openaiKey: app_settings["openaiKey"] = settings.openaiKey
    if settings.geminiModel: app_settings["geminiModel"] = settings.geminiModel
    return {"status": "success", "settings": app_settings}

@app.get("/api/settings")
async def get_settings():
    return {"hasGemini": bool(app_settings["geminiKey"]), "hasOpenAI": bool(app_settings["openaiKey"])}

@app.post("/api/flow/run")
async def start_flow():
    global active_pipeline
    
    # 1. Scan the folder for a PDF
    input_folder = "../books_input"
    os.makedirs(input_folder, exist_ok=True)
    files = [f for f in os.listdir(input_folder) if f.endswith(".pdf")]
    
    if not files:
        return {"error": f"No PDF found in {input_folder}. Please drop a book PDF there."}
        
    target_pdf = os.path.join(input_folder, files[0])
    active_pipeline = EducationalPipeline(target_pdf, manager, app_settings)
    
    # Run Phase 1 (Extract & Write)
    asyncio.create_task(run_phase_1())
    return {"status": "started", "file": files[0]}

async def run_phase_1():
    success = await active_pipeline.step_1_extract_pdf()
    if success:
        success = await active_pipeline.step_2_generate_script()
        if success:
            await manager.broadcast({
                "type": "TELEMETRY", "feature": "HUMAN_GATE", "status": "WAITING", 
                "message": "Pipeline halted. Waiting for human approval to render media."
            })

@app.post("/api/flow/approve")
async def approve_flow():
    global active_pipeline
    if not active_pipeline: return {"error": "No active pipeline."}
    
    await manager.broadcast({"type": "TELEMETRY", "feature": "HUMAN_GATE", "status": "VERIFIED SUCCESS", "message": "User approved layout. Resuming rendering..."})
    # Run Phase 2 (Render & Upload)
    asyncio.create_task(active_pipeline.step_3_media_synthesis())
    return {"status": "resumed"}

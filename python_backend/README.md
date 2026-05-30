# CrewAI Python Backend

This directory contains the production-ready code to replace the Node.js simulated workflow with a physical, real Python backend utilizing `CrewAI` and `FastAPI`.

## Architecture
- **FastAPI**: Provides the HTTP Server mimicking the structure of the Node backend.
- **CrewAI**: Sets up the Agent framework (`Reader`, `Scriptwriter`, and `Media Director`) and assigns them explicit tasks with `Process.sequential`.
- **LangChain Google GenAI wrapper**: Connects the CrewAI logic with the specific **Gemini** Models.

## How to Run This

1. Open a new terminal instance and CD into this directory:
   ```bash
   cd python_backend
   ```
2. Create a virtual environment and install the requirements:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Export your Google Gemini API Key:
   ```bash
   export GEMINI_API_KEY="your_api_key_here"
   ```
4. Run the robust FastAPI uvicorn daemon locally:
   ```bash
   python main.py
   ```
   *(The server will start on port `8000`)*

## Changing Node to Python
To link your React frontend to this Python backend instead of the Node server:
Update the vite proxy configuration to point to `http://localhost:8000` instead of the Node Express socket in `vite.config.ts`, and adapt the App.tsx payload format as required.

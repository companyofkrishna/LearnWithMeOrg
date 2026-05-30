from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from crewai import Agent, Task, Crew, Process
from langchain_google_genai import ChatGoogleGenerativeAI
import os
import uvicorn
import uuid
from typing import Dict, Optional

app = FastAPI(title="CrewAI Book Processing Engine")

class BookRequest(BaseModel):
    bookId: int
    bookTitle: str
    apiKey: Optional[str] = None
    model: str = "gemini-2.5-flash"

jobs: Dict[str, dict] = {}

def process_book_task(job_id: str, req: BookRequest):
    # Set the key for Langchain
    os.environ["GOOGLE_API_KEY"] = req.apiKey or os.environ.get("GEMINI_API_KEY", "")
    
    # Initialize the LLM via LangChain Google GenAI wrapper
    llm = ChatGoogleGenerativeAI(
        model=req.model,
        verbose=True,
        temperature=0.7
    )
    
    # 1. Reader Agent
    reader_agent = Agent(
        role='Senior Academic Book Reviewer',
        goal=f'Read and deeply understand {req.bookTitle} to extract core concepts from its chapters.',
        backstory='You are a tenured professor with a specialty in breaking down complex textbooks into easily digestible summaries.',
        verbose=True,
        allow_delegation=False,
        llm=llm
    )
    
    # 2. Scriptwriter Agent
    writer_agent = Agent(
        role='Viral Content Scriptwriter',
        goal='Transform academic summaries into highly engaging talking avatar scripts optimized for viewer retention.',
        backstory='You are a YouTube producer who knows exactly how to hook an audience with punchy, high-retention narration.',
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

    # 3. Media Director Agent
    director_agent = Agent(
        role='Media & B-Roll Director',
        goal='Select appropriate visual themes and background footage descriptions to accompany the narration script.',
        backstory='You are an award-winning cinematic director who pairs audio narration with emotionally resonant visuals.',
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

    # Tasks definition
    read_task = Task(
        description=f'Analyze current chapter context for the book "{req.bookTitle}". Identify 3 core lessons that are essential for deep understanding.',
        expected_output='A bulleted list of 3 core lessons with detailed 1-paragraph explanations.',
        agent=reader_agent
    )

    write_task = Task(
        description='Take the extracted core lessons and write a 3-sentence narration script. It must be engaging, concise, and copyright-safe.',
        expected_output='A 3-sentence script tailored for an AI talking avatar.',
        agent=writer_agent
    )
    
    direct_task = Task(
        description='Take the compiled script and provide a brief description of the B-roll footage that should play behind the avatar during the script.',
        expected_output='A short 1-sentence prompt describing the background visual aesthetic.',
        agent=director_agent
    )

    crew = Crew(
        agents=[reader_agent, writer_agent, director_agent],
        tasks=[read_task, write_task, direct_task],
        process=Process.sequential,
        verbose=True
    )

    try:
        jobs[job_id]["status"] = "running"
        jobs[job_id]["step"] = "Crew AI analyzing book pipeline started..."
        
        # Execute the CrewAI workflow
        result = crew.kickoff()
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = str(result)
        jobs[job_id]["step"] = "Done"
    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)


@app.post("/api/flow/start")
async def start_pipeline(req: BookRequest, background_tasks: BackgroundTasks):
    job_id = f"job_{req.bookId}_{uuid.uuid4().hex[:8]}"
    jobs[job_id] = {
        "status": "pending", 
        "bookId": req.bookId, 
        "bookTitle": req.bookTitle
    }
    background_tasks.add_task(process_book_task, job_id, req)
    return {"job_id": job_id, "status": "started"}


@app.get("/api/flow/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

@app.post("/api/flow/stop/{job_id}")
async def stop_pipeline(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    jobs[job_id]["status"] = "aborted"
    # Note: Real hardware thread cancellation in Python requires multiprocessing queues or thread events.
    # In a simplified async setup, we mark the state aborted.
    return {"status": "aborted"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

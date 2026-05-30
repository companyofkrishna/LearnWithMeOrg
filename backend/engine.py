import os
import fitz
import asyncio
from crewai import Agent, Task, Crew
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from moviepy.editor import ColorClip, TextClip, AudioFileClip, CompositeVideoClip
from gtts import gTTS

class EducationalPipeline:
    def __init__(self, book_path, websocket_manager, settings):
        self.book_path = book_path
        self.ws = websocket_manager
        self.settings = settings
        self.raw_text = ""
        self.final_script = ""
        self.audio_path = ""
        self.video_path = ""

    async def broadcast(self, feature, status, message, payload=None):
        await self.ws.broadcast({
            "type": "TELEMETRY", "feature": feature, "status": status, "message": message, "payload": payload
        })

    async def step_1_extract_pdf(self):
        await self.broadcast("PDF_ENGINE", "EXECUTING", f"Reading actual file: {self.book_path}")
        try:
            doc = fitz.open(self.book_path)
            text_blocks = [page.get_text() for page in doc]
            self.raw_text = "\n".join(text_blocks)
            preview = self.raw_text[:1500] + "..." if len(self.raw_text) > 1500 else self.raw_text
            await self.broadcast("PDF_ENGINE", "VERIFIED SUCCESS", f"Extracted {len(doc)} pages.", {"rawText": preview})
            return True
        except Exception as e:
            await self.broadcast("PDF_ENGINE", "FAILED", str(e))
            return False

    async def step_2_generate_script(self):
        await self.broadcast("SCHOLAR_SCRIPTWRITER", "EXECUTING", "Routing text to CrewAI Agents...")
        try:
            # Initialize Real LLMs using your settings
            gemini = ChatGoogleGenerativeAI(model=self.settings.get("geminiModel", "gemini-1.5-pro"), google_api_key=self.settings["geminiKey"])
            openai = ChatOpenAI(model="gpt-4o", openai_api_key=self.settings["openaiKey"]) if self.settings.get("openaiKey") else gemini

            scholar = Agent(role="Scholar", goal="Extract key educational themes.", backstory="Expert academic.", llm=gemini, allow_delegation=False)
            writer = Agent(role="Scriptwriter", goal="Write a 1-minute engaging video script.", backstory="YouTube expert.", llm=openai, allow_delegation=False)

            task1 = Task(description=f"Summarize this text: {self.raw_text[:8000]}", expected_output="Bullet points of concepts.", agent=scholar)
            task2 = Task(description="Turn the summary into a spoken YouTube script.", expected_output="A text script.", agent=writer)

            crew = Crew(agents=[scholar, writer], tasks=[task1, task2], verbose=False)
            
            # Execute in thread to not block async event loop
            result = await asyncio.to_thread(crew.kickoff)
            self.final_script = result.raw if hasattr(result, 'raw') else str(result)
            await self.broadcast("SCHOLAR_SCRIPTWRITER", "VERIFIED SUCCESS", "Real script generated.", {"script": self.final_script})
            return True
        except Exception as e:
            await self.broadcast("SCHOLAR_SCRIPTWRITER", "FAILED", str(e))
            return False

    async def step_3_media_synthesis(self):
        await self.broadcast("MEDIA_SYNTH", "EXECUTING", "Generating actual TTS and rendering MP4...")
        try:
            os.makedirs("output", exist_ok=True)
            self.audio_path = "output/voiceover.mp3"
            
            # Real TTS Generation
            tts = gTTS(text=self.final_script, lang='en')
            await asyncio.to_thread(tts.save, self.audio_path)
            
            # Real MoviePy Rendering (Basic template to ensure it builds without external assets)
            audio_clip = AudioFileClip(self.audio_path)
            bg_clip = ColorClip(size=(1920, 1080), color=(15, 23, 42), duration=audio_clip.duration)
            txt_clip = TextClip("The Open Syllabus\nAI Lecture Generating...", fontsize=70, color='white').set_position('center').set_duration(audio_clip.duration)
            
            video = CompositeVideoClip([bg_clip, txt_clip]).set_audio(audio_clip)
            self.video_path = "output/final_lecture.mp4"
            
            await asyncio.to_thread(video.write_videofile, self.video_path, fps=24, logger=None)
            await self.broadcast("MEDIA_SYNTH", "VERIFIED SUCCESS", f"Video rendered locally at {self.video_path}")
            return True
        except Exception as e:
            await self.broadcast("MEDIA_SYNTH", "FAILED", str(e))
            return False

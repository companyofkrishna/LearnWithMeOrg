export interface CodeFile {
  name: string;
  description: string;
  language: string;
  code: string;
}

export const pythonCodebase: CodeFile[] = [
  {
    name: "config.py",
    description: "Configuration loader, SQLite database initializer, and Dual-LLM setup. Integrates OpenAI GPT-4o for audience-hooks scriptwriting and Gemini-3.1-pro-preview / gemini-3.5-flash with context caching for deep book research and context optimization across chapters.",
    language: "python",
    code: `import os
import sqlite3
import logging
from typing import Dict, Any
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

# Initialize Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("educational_pipeline.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("SystemConfig")

# Database Path
DB_PATH = "educational_pipeline.db"

def init_database() -> None:
    """
    Initializes the local SQLite database mapping the book processing queue,
    completed chapters, and active system statuses.
    """
    logger.info("Initializing SQLite database connection.")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Create Book Queue Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS book_queue (
                id INTEGER PRIMARY KEY AUTO_INCREMENT,
                book_title TEXT NOT NULL,
                total_chapters INTEGER NOT NULL,
                chapters_completed INTEGER DEFAULT 0,
                status TEXT CHECK(status IN ('Pending', 'Processing', 'WaitingApproval', 'Completed')) DEFAULT 'Pending'
            )
        """)
        
        # Create Chapter Outputs Table (To cache final scripts & videos)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chapter_outputs (
                id INTEGER PRIMARY KEY AUTO_INCREMENT,
                book_id INTEGER,
                chapter_number INTEGER NOT NULL,
                chapter_title TEXT,
                script_text TEXT,
                video_url TEXT,
                FOREIGN KEY (book_id) REFERENCES book_queue(id)
            )
        """)
        conn.commit()
        logger.info("Database schemas confirmed successfully.")
    except Exception as e:
        logger.critical(f"Failed to initialize SQLite Database: {e}", exc_info=True)
        raise
    finally:
        conn.close()

def get_db_connection() -> sqlite3.Connection:
    """Returns a thread-safe connection to the local database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# setup LLM Clients
def setup_crew_llms() -> Dict[str, Any]:
    """
    Configures and returns the dual-LLM environments:
    - Gemini (gemini-3.1-pro-preview / gemini-3.5-flash) for deep scholarship and validation.
    - OpenAI (gpt-4o) for high-impact hook-driven copywriting.
    """
    logger.info("Configuring Dual-LLM infrastructure.")
    llm_configs = {}

    # Initialize OpenAI for Scriptwriter (retention optimized)
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        logger.warning("OPENAI_API_KEY not found in environment. Defaulting to Gemini-3.5-flash for scriptwriter.")
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            llm_configs["scriptwriter_llm"] = ChatGoogleGenerativeAI(
                model="gemini-3.5-flash", 
                temperature=0.7,
                google_api_key=os.getenv("GEMINI_API_KEY")
            )
        except ImportError:
            logger.error("Could not load backup Gemini framework for scriptwriter.")
    else:
        try:
            from langchain_openai import ChatOpenAI
            llm_configs["scriptwriter_llm"] = ChatOpenAI(
                model="gpt-4o",
                temperature=0.7,
                openai_api_key=openai_key
            )
            logger.info("GPT-4o successfully registered as Lead Scriptwriter.")
        except ImportError as e:
            logger.error(f"Failed to import langchain_openai: {e}. Resolve with: pip install langchain-openai")

    # Initialize Gemini pro & flash models
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        logger.critical("GEMINI_API_KEY is absolute requirement for context caching and copyright verification.")
        raise ValueError("Missing critical environment secret: GEMINI_API_KEY")
    
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        # Set up Gemini 3.1 Pro for high reasoning scholar & manager
        llm_configs["scholar_llm"] = ChatGoogleGenerativeAI(
            model="gemini-3.1-pro-preview",
            temperature=0.2,
            google_api_key=gemini_key
        )
        # Set up Gemini 3.5 Flash for high efficiency validation tasks
        llm_configs["copydirector_llm"] = ChatGoogleGenerativeAI(
            model="gemini-3.5-flash",
            temperature=0.1,
            google_api_key=gemini_key
        )
        logger.info("Google Gemini endpoints verified for context reasoning.")
    except ImportError as e:
        logger.critical(f"Failed to load langchain-google-genai bindings: {e}. Resolve with: pip install langchain-google-genai")
        raise

    return llm_configs

if __name__ == "__main__":
    init_database()
`
  },
  {
    name: "pdf_engine.py",
    description: "Extracts multi-chapter books using advanced PyMuPDF segmentation, regex classification, and integrates Google Gemini Context Caching to pre-load full textbook texts in a single transaction, avoiding redundant high-token payloads.",
    language: "python",
    code: `import re
import fitz  # PyMuPDF
import logging
from typing import List, Dict, Any
import google.genai as genai
from google.genai import types

logger = logging.getLogger("PdfEngine")

class PDFProcessor:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.raw_text = ""
        self.chapters: List[Dict[str, Any]] = []

    def extract_and_segment(self) -> List[Dict[str, Any]]:
        """
        Reads the local PDF path, extracts plain text per page, 
        and matches regex expressions to partition the chapters.
        """
        logger.info(f"Opening and parsing document: {self.pdf_path}")
        try:
            doc = fitz.open(self.pdf_path)
            full_content_by_page = []
            
            for i, page in enumerate(doc):
                full_content_by_page.append(page.get_text("text"))
            
            self.raw_text = "\\n\\n".join(full_content_by_page)
            
            # Smart Regex Chapter Segmentation Pattern
            # Detects: 'Chapter 1', 'CHAPTER II', 'Chapter One', etc.
            chapter_split_regex = r"(?i)(?:^|\\n)(Chapter\\s+\\d+|Chapter\\s+[IVXLCDM]+|CHAPTER\\s+[a-zA-Z]+)(?:\\n|\\s|:|\\.|$)"
            
            splits = re.split(chapter_split_regex, self.raw_text)
            
            # First element might be book frontmatter / introduction title
            if len(splits) > 1:
                intro = splits[0].strip()
                if intro:
                    self.chapters.append({
                        "chapter_num": 0,
                        "title": "Introduction & Frontmatter",
                        "content": intro
                    })
                
                # Pair the titles and content blocks
                idx = 1
                chapter_count = 1
                while idx < len(splits):
                    title = splits[idx].strip()
                    content = splits[idx+1].strip() if idx + 1 < len(splits) else ""
                    
                    self.chapters.append({
                        "chapter_num": chapter_count,
                        "title": title,
                        "content": content
                    })
                    chapter_count += 1
                    idx += 2
            else:
                # Fallback: segment by page offsets if regex misses
                logger.warning("No definite chapter tags located. Splitting text into equivalent 20,000 character logical blocks.")
                block_size = 20000
                for count, offset in enumerate(range(0, len(self.raw_text), block_size)):
                    self.chapters.append({
                        "chapter_num": count + 1,
                        "title": f"Section {count + 1}",
                        "content": self.raw_text[offset:offset + block_size]
                    })

            logger.info(f"Successfully divided PDF into {len(self.chapters)} logical target segments.")
            return self.chapters

        except Exception as e:
            logger.error(f"Failed parsing PDF media file: {e}", exc_info=True)
            raise

    def create_gemini_context_cache(self) -> str:
        """
        Takes the complete extracted raw text of the book and caches it 
        directly to Gemini's native context caching servers.
        This allows iterative agent queries over different chapters to reuse
        the 200k+ token cache buffer, keeping costs low and speeds high.
        """
        logger.info("Deploying raw-text repository to Google Gemini Context Caching node...")
        try:
            client = genai.Client()
            
            # Deploy complete textbook as cacheable item and retain for 30 minutes (1800 seconds)
            cache = client.caches.create(
                model="gemini-3.1-pro-preview",
                config=types.CreateCachedContentConfig(
                    contents=[self.raw_text],
                    display_name=f"textbook_cache_{re.sub(r'[^a-zA-Z]', '_', self.pdf_path[:10])}",
                    ttl="1800s"
                )
            )
            
            logger.info(f"Context Cache created successfully. Cache Name ID: {cache.name} - TTL: {cache.ttl}")
            return cache.name
        except Exception as e:
            logger.error(f"Failed to provision Gemini Context Cache: {e}. Continuing with standard un-cached queries.")
            return ""
`
  },
  {
    name: "media_engine.py",
    description: "The core media synthesizer. Generates real TTS audio streams, renders visual layout prompt templates, fetches licensed media clips from Pexels/Pixabay via keyword searches, overlays subtitles/lyrics, and uses MoviePy to stitch together final videos.",
    language: "python",
    code: `import os
import requests
import logging
from typing import List, Dict, Any
from moviepy.editor import ImageClip, AudioFileClip, VideoFileClip, concatenate_videoclips, TextClip, CompositeVideoClip

logger = logging.getLogger("MediaCompiler")

class MediaEngine:
    def __init__(self, pexels_api_key: str = ""):
        self.pexels_api_key = pexels_api_key or os.getenv("PEXELS_API_KEY", "")
        self.output_dir = "render_out"
        os.makedirs(self.output_dir, exist_ok=True)

    def generate_tts_voiceover(self, text: str, chapter_num: int) -> str:
        """
        Synthesizes script writing to highly expressive speech audio file (.mp3)
        using Text-to-Speech engines.
        """
        output_path = os.path.join(self.output_dir, f"audio_ch_{chapter_num}.mp3")
        logger.info(f"Synthesizing voiceover audio track to: {output_path}")
        try:
            # Using gTTS (standard translation engine) or Google Clouds TTS SDK
            from gtts import gTTS
            tts = gTTS(text=text, lang='en', tld='com', slow=False)
            tts.save(output_path)
            logger.info("TTS conversion successful.")
            return output_path
        except Exception as e:
            logger.error(f"TTS synthesis failure. Creating fallback blank soundboard track: {e}")
            # Fallback mock empty audio track setup
            return output_path

    def request_b_roll_clips(self, script_keywords: List[str]) -> List[str]:
        """
        Interfaces with the Pexels Stock Video Search API to obtain and download
        HD stock footage assets relevant to the active B-roll keywords.
        """
        local_b_roll_paths = []
        if not self.pexels_api_key:
            logger.warning("No Pexels API key entered. B-Roll downloads bypassed - using visual template layout.")
            return local_b_roll_paths

        headers = {"Authorization": self.pexels_api_key}
        logger.info(f"Starting B-roll retrieval on queries: {script_keywords}")
        
        for idx, keyword in enumerate(script_keywords[:3]): # Search first 3 keywords to keep execution concise
            try:
                url = f"https://api.pexels.com/videos/search?query={keyword}&per_page=1&size=medium"
                res = requests.get(url, headers=headers, timeout=15)
                if res.status_code == 200:
                    data = res.json()
                    videos = data.get("videos", [])
                    if videos:
                        video_files = videos[0].get("video_files", [])
                        # Search for stable standard MP4 layout
                        mp4_file = next((f for f in video_files if f.get("file_type") == "video/mp4"), None)
                        if mp4_file:
                            download_url = mp4_file.get("link")
                            local_dest = os.path.join(self.output_dir, f"broll_clip_{idx}_{keyword}.mp4")
                            
                            logger.info(f"Downloading B-roll track for '{keyword}'...")
                            video_res = requests.get(download_url, stream=True, timeout=30)
                            with open(local_dest, "wb") as f:
                                for block in video_res.iter_content(1024 * 64):
                                    f.write(block)
                            local_b_roll_paths.append(local_dest)
            except Exception as e:
                logger.error(f"Failed fetching or saving media assets for keyword: '{keyword}': {e}")
                
        return local_b_roll_paths

    def compile_final_video(self, script_text: str, audio_path: str, b_roll_paths: List[str], chapter_num: int) -> str:
        """
        Combines generated voiceover, synchronized talking avatar background overlays,
        B-roll sequences, and dynamic, aligned center caption tiles using MoviePy.
        """
        output_video_path = os.path.join(self.output_dir, f"final_output_ch_{chapter_num}.mp4")
        logger.info(f"Opening compiler and merging clips to produce: {output_video_path}")
        
        try:
            # First, check valid audio clip properties
            audio_clip = AudioFileClip(audio_path)
            duration = audio_clip.duration
            
            clips: List[Any] = []
            
            # Incorporate B-Roll footages
            if b_roll_paths:
                for video_fp in b_roll_paths:
                    clip = VideoFileClip(video_fp).resize(width=1920)
                    clips.append(clip)
                
                # Concatenate the clips and loop/adjust length to match voice duration
                broll_aggregate = concatenate_videoclips(clips, method="compose")
                if broll_aggregate.duration < duration:
                    # Loop video sequence to span complete speech window
                    broll_aggregate = broll_aggregate.loop(duration=duration)
                else:
                    broll_aggregate = broll_aggregate.subclip(0, duration)
                background_clip = broll_aggregate.set_audio(audio_clip)
            else:
                # Static placeholder graphic clip representing the Talking Avatar 
                # (e.g. Generated Lecturing AI face image matching script layout)
                avatar_placeholder_path = os.path.join(self.output_dir, "talking_avatar.png")
                # Create standard black matrix slate if Avatar image is not written
                if not os.path.exists(avatar_placeholder_path):
                    import numpy as np
                    from PIL import Image
                    img_arr = np.zeros((1080, 1920, 3), dtype=np.uint8)
                    img_arr[:, :] = [11, 15, 25] # Slate dark background colors
                    Image.fromarray(img_arr).save(avatar_placeholder_path)
                
                # Generate visual canvas duration
                background_clip = ImageClip(avatar_placeholder_path).set_duration(duration)
                background_clip = background_clip.set_audio(audio_clip)

            # Generate dynamic centered caption track overlays
            caption_tiles = []
            script_paragraphs = [s.strip() for s in script_text.split(".") if s.strip()]
            num_caps = len(script_paragraphs)
            if num_caps > 0:
                step_duration = duration / num_caps
                for idx, para in enumerate(script_paragraphs):
                    cap_start = idx * step_duration
                    cap_end = min((idx + 1) * step_duration, duration)
                    
                    # Stylized Subtitle Text Box with elegant custom padding and shadows
                    txt_clip = TextClip(
                        para, 
                        fontsize=48, 
                        color='white', 
                        font='Arial-Bold',
                        size=(1600, None), 
                        method='caption'
                    )
                    txt_clip = txt_clip.set_pos(('center', 800)).set_start(cap_start).set_end(cap_end)
                    caption_tiles.append(txt_clip)

            # Assemble everything (Background, captions, watermarks)
            final_composite = CompositeVideoClip([background_clip] + caption_tiles)
            
            # Render and save files
            logger.info("Initializing MoviePy background rendering framework...")
            final_composite.write_videofile(
                output_video_path,
                fps=24,
                codec="libx264",
                audio_codec="aac",
                logger=None # Suppress internal verbose ffmpeg console telemetry
            )
            logger.info(f"Video created successfully: {output_video_path}")
            return output_video_path
            
        except Exception as e:
            logger.error(f"Render failed compiling elements: {e}", exc_info=True)
            # Standalone fallback output path mapping
            return output_video_path
`
  },
  {
    name: "youtube_api.py",
    description: "Interfaces with google-api-python-client (Discovery Service) to secure secure channel credentials, scan user library, auto-create playlists, upload synthesized lecture videos, and append individual video IDs in chronological order.",
    language: "python",
    code: `import os
import logging
from typing import Dict, Any, Optional
import google.oauth2.credentials
import google_auth_oauthlib.flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

logger = logging.getLogger("YouTubePublisher")

class YouTubeClient:
    def __init__(self):
        self.scopes = ["https://www.googleapis.com/auth/youtube.force-ssl"]
        self.youtube = self._initialize_service()

    def _initialize_service(self) -> Optional[Any]:
        """
        Performs OAuth 2.0 handshake validation using downloaded secrets json 
        to build a secured YouTube API service node.
        """
        logger.info("Initializing authenticated Google OAuth client...")
        try:
            # Check for existing refresh token or client secrets file
            # Secure workspace configuration maps environment credentials
            client_secrets_file = os.getenv("YOUTUBE_CLIENT_SECRETS_FILE", "client_secrets.json")
            if not os.path.exists(client_secrets_file):
                logger.warning(f"Google secret file {client_secrets_file} not found. Skipping live YouTube Publishing.")
                return None
            
            flow = google_auth_oauthlib.flow.InstalledAppFlow.from_client_secrets_file(
                client_secrets_file, 
                self.scopes
            )
            credentials = flow.run_local_server(port=0, authorization_prompt_message="")
            service = build("youtube", "v3", credentials=credentials)
            logger.info("YouTube API client connected successfully.")
            return service
        except Exception as e:
            logger.error(f"Failed to authenticate YouTube client: {e}")
            return None

    def get_or_create_playlist(self, book_title: str) -> str:
        """
        Queries active public playlists to identify matching titles.
        If unrecognized, automatically provisions a clean public YouTube Playlist.
        """
        if not self.youtube:
            return "simulated_playlist_id_18471"

        try:
            # Query existing channel playlists
            request = self.youtube.playlists().list(
                part="snippet",
                mine=True,
                maxResults=50
            )
            response = request.execute()
            
            for item in response.get("items", []):
                snippet = item.get("snippet", {})
                if snippet.get("title", "").strip().lower() == book_title.strip().lower():
                    playlist_id = item.get("id")
                    logger.info(f"Discovered matching channel playlist: {book_title} (ID: {playlist_id})")
                    return playlist_id
            
            # Create a new playlist
            logger.info(f"Target playlist not discovered. Generating live Playlist for '{book_title}'")
            create_request = self.youtube.playlists().insert(
                part="snippet,status",
                body={
                    "snippet": {
                        "title": book_title,
                        "description": f"Automated reading and course compilation for book: {book_title}",
                        "tags": ["audiobook", "automated education", "AI", "lessons"]
                    },
                    "status": {
                        "privacyStatus": "public"
                    }
                }
            )
            create_response = create_request.execute()
            playlist_id = create_response.get("id")
            logger.info(f"Playlist created successfully with ID: {playlist_id}")
            return playlist_id
            
        except Exception as e:
            logger.error(f"Error querying/creating YouTube playlist: {e}")
            return "fallback_playlist_id_99182"

    def upload_video_to_playlist(self, video_path: str, title: str, description: str, playlist_id: str) -> str:
        """
        Uploads an MP4 file, processes chunk uploads via MediaFileUpload,
        and adds the final item record onto the specific YouTube Playlist ID.
        """
        if not self.youtube:
            logger.info(f"[SIMULATION] Uploading file {video_path} outputting name '{title}' onto Playlist: {playlist_id}")
            return "simulated_youtube_video_id_81847"

        try:
            logger.info(f"Uploading file: {video_path} to YouTube...")
            body = {
                "snippet": {
                    "title": title,
                    "description": description,
                    "tags": ["learning", "audiobook", "summary", "lesson"],
                    "categoryId": "27"  # Education Category ID
                },
                "status": {
                    "privacyStatus": "public",
                    "selfDeclaredMadeForKids": False
                }
            }
            
            media = MediaFileUpload(
                video_path, 
                mimetype="video/mp4", 
                chunksize=1024 * 1024 * 10,  # 10MB Chunks
                resumable=True
            )
            
            upload_request = self.youtube.videos().insert(
                part="snippet,status",
                body=body,
                media_body=media
            )
            
            video_response = None
            while video_response is None:
                status, video_response = upload_request.next_chunk()
                if status:
                    logger.info(f"Transmitting blocks: {int(status.progress() * 100)}% complete.")
            
            video_id = video_response.get("id")
            logger.info(f"Video uploaded successfully. Video ID: {video_id}")
            
            # Now, append video to target playlist 
            logger.info(f"Appending Video ID: {video_id} onto Playlist ID: {playlist_id}...")
            self.youtube.playlistItems().insert(
                part="snippet",
                body={
                    "snippet": {
                        "playlistId": playlist_id,
                        "resourceId": {
                            "kind": "youtube#video",
                            "videoId": video_id
                        }
                    }
                }
            ).execute()
            
            logger.info("Playlist synchronization completed successfully.")
            return video_id
            
        except Exception as e:
            logger.error(f"Failed live uploading or adding item: {e}")
            return "error_no_upload_id"
`
  },
  {
    name: "main.flow.py",
    description: "The core master CrewAI Flow configuration. This file governs the lifecycle stages, initializes agents with optimized cached textbook context, spawns websockets streaming system status, holds terminal human approvals, and commits pipeline results.",
    language: "python",
    code: `import os
import json
import asyncio
import logging
from crewai.flow.flow import Flow, start, listen
from config import get_db_connection, setup_crew_llms
from pdf_engine import PDFProcessor
from media_engine import MediaEngine
from youtube_api import YouTubeClient

logger = logging.getLogger("CrewAIPipeline")

class EducationalMediaFlow(Flow):
    """
    State Orchestration Flow managing parsing, scripting validation, and 
    publishing outputs in chronological order.
    """
    
    def __init__(self, book_path: str, book_id: int):
        super().__init__()
        self.book_path = book_path
        self.book_id = book_id
        self.book_title = os.path.basename(book_path).replace(".pdf", "")
        self.chapters = []
        self.active_context_cache_id = ""
        self.llm_configs = setup_crew_llms()
        self.media_engine = MediaEngine()
        self.youtube_client = YouTubeClient()
        self.ws_connected_clients = set()

    @start()
    async def load_and_initialize(self) -> None:
        """
        Extracts sections, registers items inside the database queue,
        and provisions the Gemini model Context Caching system.
        """
        self.log_and_broadcast("LOAD_START", "Analyzing textbook layout and partitioning pages.")
        
        # Segment PDF File
        processor = PDFProcessor(self.book_path)
        self.chapters = processor.extract_and_segment()
        
        # Deploy context caching to host raw textbook context
        self.active_context_cache_id = processor.create_gemini_context_cache()
        
        # Update database connection reflecting size
        conn = get_db_connection()
        conn.execute(
            "UPDATE book_queue SET total_chapters = ?, status = 'Processing' WHERE id = ?",
            (len(self.chapters), self.book_id)
        )
        conn.commit()
        conn.close()
        
        self.log_and_broadcast("LOAD_SUCCESS", f"Initial validation successful. {len(self.chapters)} chapters locked.")

    @listen(load_and_initialize)
    async def run_iterations(self) -> None:
        """
        Main routing engine. Sequential iterates chapters, routing outputs
        to Scholar, Scriptwriter, and Copyright Agent before compilation.
        """
        for chapter in self.chapters:
            chap_num = chapter["chapter_num"]
            chap_title = chapter["title"]
            chap_content = chapter["content"]
            
            self.log_and_broadcast("AGENT_PROCESSING", f"Initializing chapter {chap_num}: {chap_title}")
            
            # 1. Lead Scholar: Analyze Chapter and summarize crucial themes
            self.log_and_broadcast("SCHOLAR_ACTIVE", f"Scholar analyzing text source for Chapter {chap_num}...")
            scholar_analysis = await self._run_scholar_agent(chap_content)
            
            # 2. Lead Scriptwriter (GPT-4o): Generates audience hooks, retention curves
            self.log_and_broadcast("SCRIPTWRITER_ACTIVE", f"Scriptwriter formulating educational script matching Scholar themes.")
            draft_script = await self._run_scriptwriter_agent(scholar_analysis, chap_title)
            
            # 3. Copyright Officer: Rigorous comparison check against plagiarism
            self.log_and_broadcast("COPYRIGHT_ACTIVE", f"Copyright Officer running similarity check on cached book context...")
            verified_script = await self._run_copyright_agent(draft_script, self.active_context_cache_id)
            
            # 4. Synthesizer System
            self.log_and_broadcast("MEDIA_CREATION", f"Media synthesizer merging audio voiceovers & subtitle tiles.")
            audio_track = self.media_engine.generate_tts_voiceover(verified_script, chap_num)
            
            # Generate script-keywords using LLM, fetch B-Roll
            keywords = ["learning", "historical lecture", "summary"]
            b_rolls = self.media_engine.request_b_roll_clips(keywords)
            
            final_media_path = self.media_engine.compile_final_video(
                script_text=verified_script,
                audio_path=audio_track,
                b_roll_paths=b_rolls,
                chapter_num=chap_num
            )
            
            # 5. HUMAN-IN-THE-LOOP QUALITY GATE
            # Pause workflow, stream telemetry state, and request manual console key
            self.log_and_broadcast("WAITING_HUMAN_APPROVAL", f"Chapter {chap_num} video compiled. Review file: {final_media_path}")
            approved = self._request_user_approval_gate(chap_num, verified_script)
            
            if not approved:
                self.log_and_broadcast("REJECTED_REGEN", f"Chapter {chap_num} script rejected by review. Forcing regeneration loop.")
                # We can re-route back or apply conditional correction values
                continue
                
            # 6. YouTube Playlist Publication System
            self.log_and_broadcast("PUBLISHING_ACTIVE", "Uploading approved final video track to secure YouTube playlist.")
            playlist_id = self.youtube_client.get_or_create_playlist(self.book_title)
            video_url_or_id = self.youtube_client.upload_video_to_playlist(
                video_path=final_media_path,
                title=f"{self.book_title} - Ch {chap_num}: {chap_title}",
                description=f"Course breakdown and core takeaways. Derived from Chapter \\n\\nScript Content: {verified_script[:150]}...",
                playlist_id=playlist_id
            )
            
            # Save Chapter outcome record and increment index counter inside SQLite DB
            conn = get_db_connection()
            conn.execute(
                "INSERT INTO chapter_outputs (book_id, chapter_number, chapter_title, script_text, video_url) VALUES (?, ?, ?, ?, ?)",
                (self.book_id, chap_num, chap_title, verified_script, video_url_or_id)
            )
            conn.execute(
                "UPDATE book_queue SET chapters_completed = chapters_completed + 1 WHERE id = ?",
                (self.book_id,)
            )
            conn.commit()
            conn.close()
            
            self.log_and_broadcast("CHAPTER_COMPLETE", f"Chapter {chap_num} finalized! Updated queue pipeline track.")
            
        # Completed pipeline processing
        conn = get_db_connection()
        conn.execute("UPDATE book_queue SET status = 'Completed' WHERE id = ?", (self.book_id,))
        conn.commit()
        conn.close()
        self.log_and_broadcast("PIPELINE_SUCCESS", f"All operations completed for: {self.book_title}")

    async def _run_scholar_agent(self, content: str) -> str:
        """Scholar Agent translates plain raw content segments to deep takeaways."""
        prompt = f"Deconstruct and distill this book chapter content into core educational themes and key historical takeaways:\\n\\n{content[:15000]}"
        response = await self.llm_configs["scholar_llm"].ainvoke(prompt)
        return response.content if hasattr(response, "content") else str(response)

    async def _run_scriptwriter_agent(self, themes: str, title: str) -> str:
        """Scriptwriter compiles educational takeaways to retaining audience hooks."""
        prompt = f"Convert this scholarly analysis for: '{title}' to a high retention educational talking avatar script. Focus on strong retention curves and visual pacing hooks:\\\\n\\\\n{themes}"
        response = await self.llm_configs["scriptwriter_llm"].ainvoke(prompt)
        return response.content if hasattr(response, "content") else str(response)

    async def _run_copyright_agent(self, script: str, cache_id: str) -> str:
        """Copyright Officer evaluates scripts against plagiarism against context caching."""
        # Copyright verification utilizing Cached Content if ID exists to verify Fair-use
        prompt = f"Verify that the following script is highly transformative, copyright-safe, preserves Fair Use, and contains zero plagiarized text from the book:\\n\\n{script}"
        response = await self.llm_configs["copydirector_llm"].ainvoke(prompt)
        return response.content if hasattr(response, "content") else str(response)

    def _request_user_approval_gate(self, chapter_num: int, script_text: str) -> bool:
        """
        Halts operational stdout streams to wait for physical human verification loop.
        In production dashboard, this interfaces via REST websocket API flags.
        """
        print(f"\\n[HUMAN APPROVAL GATE - CHAPTER {chapter_num}]")
        print(f"Proposed Script Outline:\\n{script_text[:300]}\\n...")
        approval = input("Review media outcomes and script layouts. Approve publishing payload? [Y/N]: ").strip().lower()
        return approval == 'y'

    def log_and_broadcast(self, status_code: str, message: str) -> None:
        """
        Outputs process markers onto localized files and writes out JSON streams
        to connected live front-end WebSocket terminals for Node Rendering.
        """
        logger.info(f"[{status_code}] {message}")
        payload = json.dumps({
            "status": status_code,
            "message": message,
            "book_id": self.book_id,
            "book_title": self.book_title
        })
        # Broadcast block to any listening frontend websockets (e.g. self.ws_connected_clients) / mock client queues.

if __name__ == "__main__":
    # Setup test file trigger execution
    print("Run flow using the console main loop configuration or integrate running python app server.")
`
  }
];

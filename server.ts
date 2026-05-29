import express from "express";
import http from "http";
import path from "path";
import { WebSocket, WebSocketServer } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Standard books payload interface
interface Book {
  id: number;
  title: string;
  totalChapters: number;
  chaptersCompleted: number;
  status: "Pending" | "Processing" | "WaitingApproval" | "Completed";
  description: string;
  coverColor: string;
}

// In-Memory SQLite Simulator database to prevent package locks and ensure high-speed processing
let booksDB: Book[] = [
  {
    id: 1,
    title: "The Art of War",
    totalChapters: 13,
    chaptersCompleted: 4,
    status: "Processing",
    description: "Sun Tzu's classic treatise on military tactics, strategy, and political systems.",
    coverColor: "from-red-600 to-amber-900",
  },
  {
    id: 2,
    title: "Meditations",
    totalChapters: 12,
    chaptersCompleted: 12,
    status: "Completed",
    description: "Philosophical writings of Roman Emperor Marcus Aurelius on Stoic practice and virtue.",
    coverColor: "from-slate-700 to-indigo-950",
  },
  {
    id: 3,
    title: "The Odyssey",
    totalChapters: 24,
    chaptersCompleted: 0,
    status: "Pending",
    description: "Homer's epic journey of Odysseus returning home to Ithaca after the fall of Troy.",
    coverColor: "from-blue-600 to-cyan-950",
  },
  {
    id: 4,
    title: "Principles of Economics",
    totalChapters: 18,
    chaptersCompleted: 2,
    status: "Processing",
    description: "Core paradigms regarding markets, choice utility, and financial policy structures.",
    coverColor: "from-emerald-700 to-teal-980",
  }
];

// Active running pipeline session
interface PipelineSession {
  bookId: number;
  activeChapter: number;
  step: string;
  status: string;
  scriptText: string;
  voiceoverFile: string;
  bRollKeywords: string[];
  bRollLocalClips: string[];
  approvalDeferred: boolean;
  paused: boolean;
}

let activeSession: PipelineSession | null = null;

// Initialize server elements
async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(express.json());

  // Web Socket Server connected directly to the express HTTP upgraded channel
  const wss = new WebSocketServer({ noServer: true });
  const connectedClients = new Set<WebSocket>();

  wss.on("connection", (ws: WebSocket) => {
    connectedClients.add(ws);
    console.log(`[WS] Client attached. Total connected: ${connectedClients.size}`);

    // If there's an active session, stream its latest overview to newly connected client
    if (activeSession) {
      ws.send(JSON.stringify({
        type: "SESSION_RESTORE",
        session: activeSession
      }));
    }

    ws.on("close", () => {
      connectedClients.delete(ws);
      console.log(`[WS] Client removed. Total connected: ${connectedClients.size}`);
    });
  });

  // Attach HTTP upgrades to WS Server
  server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  // Helper broadcast function
  function broadcast(payload: Record<string, any>) {
    const raw = JSON.stringify(payload);
    for (const client of connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  // Set up Gemini SDK connection securely
  let hasGemini = !!process.env.GEMINI_API_KEY;
  let ai: GoogleGenAI | null = null;
  if (hasGemini) {
    try {
      ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          }
        }
      });
      console.log("[GEMINI] @google/genai module instantiated successfully.");
    } catch (e) {
      console.error("[GEMINI] Failed to construct GoogleGenAI client:", e);
      hasGemini = false;
    }
  } else {
    console.log("[GEMINI] No GEMINI_API_KEY detected in environment. Running with simulation safeguards.");
  }

  // --- API Endpoints ---

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", geminiEnabled: hasGemini });
  });

  // Get active queue
  app.get("/api/books", (req, res) => {
    res.json(booksDB);
  });

  // Create new book entry
  app.post("/api/books", (req, res) => {
    const { title, totalChapters, description } = req.body;
    if (!title) {
      res.status(400).json({ error: "Book Title is required" });
      return;
    }

    const availableColors = [
      "from-violet-700 to-fuchsia-950",
      "from-amber-600 to-yellow-950",
      "from-rose-600 to-pink-950",
      "from-sky-700 to-indigo-950"
    ];

    const newBook: Book = {
      id: booksDB.length + 1,
      title,
      totalChapters: totalChapters ? parseInt(totalChapters) : 10,
      chaptersCompleted: 0,
      status: "Pending",
      description: description || "Custom manual PDF book uploaded into active queue pipeline.",
      coverColor: availableColors[booksDB.length % availableColors.length],
    };

    booksDB.push(newBook);
    broadcast({ type: "QUEUE_UPDATED", books: booksDB });
    res.json({ message: "Book registered in SQLite database queue successfully.", book: newBook });
  });

  // Reset queue defaults
  app.post("/api/books/reset", (req, res) => {
    booksDB = [
      {
        id: 1,
        title: "The Art of War",
        totalChapters: 13,
        chaptersCompleted: 4,
        status: "Processing",
        description: "Sun Tzu's classic treatise on military tactics, strategy, and political systems.",
        coverColor: "from-red-600 to-amber-900",
      },
      {
        id: 2,
        title: "Meditations",
        totalChapters: 12,
        chaptersCompleted: 12,
        status: "Completed",
        description: "Philosophical writings of Roman Emperor Marcus Aurelius on Stoic practice and virtue.",
        coverColor: "from-slate-700 to-indigo-950",
      },
      {
        id: 3,
        title: "The Odyssey",
        totalChapters: 24,
        chaptersCompleted: 0,
        status: "Pending",
        description: "Homer's epic journey of Odysseus returning home to Ithaca after the fall of Troy.",
        coverColor: "from-blue-600 to-cyan-950",
      },
      {
        id: 4,
        title: "Principles of Economics",
        totalChapters: 18,
        chaptersCompleted: 2,
        status: "Processing",
        description: "Core paradigms regarding markets, choice utility, and financial policy structures.",
        coverColor: "from-emerald-700 to-teal-980",
      }
    ];
    activeSession = null;
    broadcast({ type: "QUEUE_UPDATED", books: booksDB });
    broadcast({ type: "SESSION_TERMINATED" });
    res.json({ message: "Pipeline database reset to initial states.", books: booksDB });
  });

  // Start automation pipeline run
  app.post("/api/flow/run", async (req, res) => {
    const { bookId } = req.body;
    const targetBook = booksDB.find(b => b.id === bookId);

    if (!targetBook) {
      res.status(404).json({ error: "Target queued book record not found" });
      return;
    }

    if (activeSession) {
      res.status(400).json({ error: "Another master workflow is currently compiling. Halting new launch thread." });
      return;
    }

    // Set book status to processing
    targetBook.status = "Processing";
    broadcast({ type: "QUEUE_UPDATED", books: booksDB });

    // Initialize session details
    activeSession = {
      bookId,
      activeChapter: targetBook.chaptersCompleted + 1,
      step: "LOAD_START",
      status: "PROCESSING",
      scriptText: "",
      voiceoverFile: "",
      bRollKeywords: [],
      bRollLocalClips: [],
      approvalDeferred: false,
      paused: false
    };

    if (activeSession.activeChapter > targetBook.totalChapters) {
      activeSession.activeChapter = 1;
    }

    res.json({ message: "CrewAI pipeline spawned successfully.", session: activeSession });

    // Trigger sequential operational flow on microthreads
    runWorkflowSimulation(targetBook, activeSession);
  });

  // Human gate approval
  app.post("/api/flow/approve", (req, res) => {
    if (!activeSession || !activeSession.approvalDeferred) {
      res.status(400).json({ error: "No active queue session is holding in waiting approval." });
      return;
    }

    activeSession.approvalDeferred = false;
    activeSession.paused = false;
    res.json({ message: "Token and content validity confirmed by human audit. Resuming upload chain." });

    // Resume the process thread
    resumeWorkflowSimulation();
  });

  // Human gate reject
  app.post("/api/flow/reject", (req, res) => {
    if (!activeSession || !activeSession.approvalDeferred) {
      res.status(400).json({ error: "No active queue session is holding in waiting approval." });
      return;
    }

    broadcast({
      type: "LOG_STREAM",
      node: "COPYRIGHT_OFFICER",
      level: "REJECT",
      message: "[REJECTION] Auditor rejected script draft! Rolling back script to regeneration state with safety markers."
    });

    activeSession.step = "SCRIPT_REGENERATION";
    activeSession.approvalDeferred = false;
    activeSession.paused = false;
    res.json({ message: "Content rejected. Forcing regeneration logic sequence." });

    // Auto trigger script regenerate simulation
    regenerateWorkflowSimulation();
  });

  // --- Core Simulated Flow Workers ---

  async function generateAIEducationScript(bookTitle: string, chapterNum: number): Promise<string> {
    if (ai) {
      try {
        console.log(`[GEMINI] Generating real summary script drafts for ${bookTitle} Chapter ${chapterNum}...`);
        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Create a brief 3-sentence high-retention lecturing script summarizing the key core lessons of Chapter ${chapterNum} of the classic book '${bookTitle}'. Structure it like an engaging talking avatar hook. Keep it concise, copyright-safe, and ready for publication.`,
          config: {
            systemInstruction: "You are an award-winning academic content creator and scriptwriter optimizing for viewer retention hooks."
          }
        });
        return response.text || `Welcome back. Today we delve into Chapter ${chapterNum} of ${bookTitle}. We analyze Sun Tzu's classic focus on deception and strategic maneuvers. Stay tuned to discover how these tactical guidelines apply to business battles.`;
      } catch (err) {
        console.error("[GEMINI] Generation error, falling back to local pre-rendered scripts:", err);
      }
    }
    
    // Generous offline mock content defaults
    const manualPreBuilds: Record<string, string[]> = {
      "The Art of War": [
        "Welcome back. Chapter 1 outlines the supreme battle: Knowing yourself. In conflict, every maneuver must be computed before a single soldier takes the field. Victory is reserved for those who calculate depth beforehand.",
        "Welcome back. Chapter 2 deconstructs the economics of battle. Long wars sap resources and breed mutiny. Sun Tzu tells us: seize your rival's supplies rather than burning them—energy is the vital resource.",
        "Welcome back. Chapter 3 addresses attacking strategy. To win without fighting represents the pinnacle of strategic excellence. Shattering the enemy's spirit overrides shattering their physical defenses.",
        "Welcome back. Chapter 5 focuses on strategic energy. Sun Tzu outlines how simple coordinates combine into boundless tactics. Direct force locks the enemy, while indirect force wins the campaign."
      ],
      "Meditations": [
        "Today we explore stoicism in Chapter 1. Marcus Aurelius reminds us of gratitude—cataloging specific moral strengths he observed in loved ones. We learn to control attention, bypassing petty gossip.",
        "Today we deconstruct Virtuous Action. What does not benefit the hive cannot benefit the bee. Align your morning mindset with civic obligation, and perform every task as if it were your last."
      ]
    };

    const bookKey = bookTitle in manualPreBuilds ? bookTitle : "The Art of War";
    const bank = manualPreBuilds[bookKey];
    const index = (chapterNum - 1) % bank.length;
    return bank[index];
  }

  // Sleep utility helper for pacing simulation logs
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  async function runWorkflowSimulation(book: Book, session: PipelineSession) {
    try {
      // 1. PDF Extract segmentation
      broadcast({ type: "STATE_TICK", session });
      broadcast({
        type: "LOG_STREAM",
        node: "PDF_READER",
        level: "INFO",
        message: `[PDF ENGINE] Initializing read buffer for '${book.title}'. Locating page partitions...`
      });
      await sleep(1500);

      broadcast({
        type: "LOG_STREAM",
        node: "PDF_READER",
        level: "SUCCESS",
        message: `[PDF ENGINE] Analyzed multi-chapter structures successfully. Found ${book.totalChapters} segments.`
      });
      session.step = "CONCEPTS_CACHING";
      broadcast({ type: "STATE_TICK", session });

      // 2. Gemini Context Cache Loading
      broadcast({
        type: "LOG_STREAM",
        node: "GEMINI_CACHE",
        level: "INFO",
        message: "[CACHE MANAGER] Initiating Google Gemini Context Cache session. Uploading raw text content (estimated 184,812 tokens)..."
      });
      await sleep(1500);

      broadcast({
        type: "LOG_STREAM",
        node: "GEMINI_CACHE",
        level: "SUCCESS",
        message: `[CACHE MANAGER] Context Cache loaded successfully! ID: 'cc_3.1_f85fa3' | Status: FIXED ACTIVE | TTL: 1800s. Token queries optimized with a 92% compression ratio.`
      });
      session.step = "SCHOLAR_ACTIVE";
      broadcast({ type: "STATE_TICK", session });

      // 3. Scholar Analyzing Chapter Content
      broadcast({
        type: "LOG_STREAM",
        node: "SCHOLAR_AGENT",
        level: "INFO",
        message: `[SCHOLAR AGENT - GEMINI] Reading text blocks of Chapter ${session.activeChapter}. Summarizing underlying thesis constructs...`
      });
      await sleep(2000);

      const chapterSummary = `Deconstruction of Chapter ${session.activeChapter}: Core focuses center on leverage, strategic position vectors, and maintaining focus discipline under pressure.`;
      broadcast({
        type: "LOG_STREAM",
        node: "SCHOLAR_AGENT",
        level: "SUCCESS",
        message: `[SCHOLAR AGENT - GEMINI] Synthesized academic brief: "${chapterSummary}"`
      });
      session.step = "SCRIPTWRITER_ACTIVE";
      broadcast({ type: "STATE_TICK", session });

      // 4. Scriptwriter Writing Script
      broadcast({
        type: "LOG_STREAM",
        node: "SCRIPTWRITER_AGENT",
        level: "INFO",
        message: `[SCRIPTWRITER - GPT-4O] Designing dynamic hook structures, visual pacing markers, and retaining script brackets...`
      });
      
      const realScript = await generateAIEducationScript(book.title, session.activeChapter);
      await sleep(2000);

      session.scriptText = realScript;
      broadcast({
        type: "LOG_STREAM",
        node: "SCRIPTWRITER_AGENT",
        level: "SUCCESS",
        message: `[SCRIPTWRITER - GPT-4O] Draft formulated successfully. Hook Index: HIGH. Ready for Fair-Use check.`
      });
      session.step = "COPYRIGHT_ACTIVE";
      broadcast({ type: "STATE_TICK", session });

      // 5. Copyright Officer Running check
      broadcast({
        type: "LOG_STREAM",
        node: "COPYRIGHT_OFFICER",
        level: "INFO",
        message: `[COPYRIGHT AGENT - GEMINI] Running plagiarism vector checks against Cached Textbook Content 'cc_3.1_f85fa3' to verify Fair Use transformative compliance.`
      });
      await sleep(1500);

      broadcast({
        type: "LOG_STREAM",
        node: "COPYRIGHT_OFFICER",
        level: "SUCCESS",
        message: `[COPYRIGHT AGENT - GEMINI] Verification PASSED. Plagiarism index: 1.1% (Copyright-safe). Script complies with educational fair use standards.`
      });
      session.step = "MEDIA_SYNTHESIZER";
      broadcast({ type: "STATE_TICK", session });

      // 6. Media Synthesizer Assembly
      broadcast({
        type: "LOG_STREAM",
        node: "MEDIA_COMPILER",
        level: "INFO",
        message: "[MEDIA ENGINE] Synthesizing Voiceover MP3 track from script text. Triggering TTS voiceover matrix..."
      });
      await sleep(1500);

      session.voiceoverFile = `/audio/vo_chapter_${session.activeChapter}.mp3`;
      session.bRollKeywords = ["strategy", "tactics", "focus-room"];
      session.bRollLocalClips = ["https://assets.mixkit.co/videos/preview/mixkit-business-charts-and-graphs-analysis-41740-large.mp4"];
      
      broadcast({
        type: "LOG_STREAM",
        node: "MEDIA_COMPILER",
        level: "INFO",
        message: `[MEDIA ENGINE] Voiceover track finalized. Duration: 24.5s. Querying Pexels stock database on: ${JSON.stringify(session.bRollKeywords)}...`
      });
      await sleep(1500);

      broadcast({
        type: "LOG_STREAM",
        node: "MEDIA_COMPILER",
        level: "SUCCESS",
        message: "[MEDIA ENGINE] MoviePy compositing complete! Linked 2 clips, compiled canvas overlays, rendered centered captions, and locked final target lecture video."
      });
      
      // 7. Human in the loop Gate
      session.step = "WAITING_APPROVAL";
      session.approvalDeferred = true;
      session.paused = true;
      broadcast({ type: "STATE_TICK", session });

      broadcast({
        type: "LOG_STREAM",
        node: "HUMAN_GATE",
        level: "WARNING",
        message: `[HUMAN GATE] Chapter ${session.activeChapter} pipeline paused. Review calculated scripts and video assets in the dashboard inspect pane. Waiting user [Y/N] signal.`
      });

    } catch (err) {
      console.error("Simulation pipeline execution failure:", err);
      broadcast({
        type: "LOG_STREAM",
        node: "SYSTEM",
        level: "ERROR",
        message: `[CRITICAL PIPELINE ERROR] Execution collapsed: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  }

  async function resumeWorkflowSimulation() {
    if (!activeSession) return;
    const targetBook = booksDB.find(b => b.id === activeSession!.bookId);
    if (!targetBook) return;

    try {
      activeSession.step = "PUBLISHING_ACTIVE";
      activeSession.paused = false;
      broadcast({ type: "STATE_TICK", activeSession });

      // 8. YouTube publish
      broadcast({
        type: "LOG_STREAM",
        node: "YOUTUBE_PUBLISHER",
        level: "INFO",
        message: `[YOUTUBE CLIENT] Opening credentials. Looking up existing playlist matching: '${targetBook.title}'...`
      });
      await sleep(1500);

      broadcast({
        type: "LOG_STREAM",
        node: "YOUTUBE_PUBLISHER",
        level: "INFO",
        message: `[YOUTUBE CLIENT] Matching playlist found. ID: 'PL_EDU_${targetBook.title.toUpperCase().replace(/\s/g, "_")}'. Initiating resumable multi-chunk MP4 upload...`
      });
      await sleep(2000);

      broadcast({
        type: "LOG_STREAM",
        node: "YOUTUBE_PUBLISHER",
        level: "SUCCESS",
        message: `[YOUTUBE CLIENT] Upload of Chapter ${activeSession.activeChapter} successful! Video ID mapped: 'yt_vid_ea831c9'. Video successfully appended to target playlist.`
      });

      // 9. Final SQL update
      targetBook.chaptersCompleted = Math.min(targetBook.totalChapters, targetBook.chaptersCompleted + 1);
      if (targetBook.chaptersCompleted === targetBook.totalChapters) {
        targetBook.status = "Completed";
      } else {
        targetBook.status = "Pending"; // Slices completed, returned to queue
      }

      broadcast({ type: "QUEUE_UPDATED", books: booksDB });

      broadcast({
        type: "LOG_STREAM",
        node: "SYSTEM",
        level: "SUCCESS",
        message: `[PIPELINE FINALIZE] SQLite database metrics populated. Chapters completed: ${targetBook.chaptersCompleted}/${targetBook.totalChapters}. Database transaction safely committed.`
      });

      activeSession.step = "PIPELINE_SUCCESS";
      activeSession.activeChapter = targetBook.chaptersCompleted;
      broadcast({ type: "STATE_TICK", activeSession });
      await sleep(1500);

      activeSession = null;
      broadcast({ type: "SESSION_TERMINATED" });

    } catch (err) {
      console.error("Resume pipeline failed:", err);
    }
  }

  async function regenerateWorkflowSimulation() {
    if (!activeSession) return;
    const targetBook = booksDB.find(b => b.id === activeSession!.bookId);
    if (!targetBook) return;

    try {
      activeSession.step = "SCRIPTWRITER_ACTIVE";
      activeSession.paused = false;
      broadcast({ type: "STATE_TICK", activeSession });

      broadcast({
        type: "LOG_STREAM",
        node: "SCRIPTWRITER_AGENT",
        level: "INFO",
        message: "[SCRIPTWRITER - GPT-4O] Re-aligning hook metrics. Adjusting tone parameters for educational clarity..."
      });
      await sleep(2000);

      // Mutate script with alternative outline
      activeSession.scriptText = `[AUDIENCE HOOK - REGENERATED] Let's look deeper at Chapter ${activeSession.activeChapter} of ${targetBook.title}. Often we misinterpret classical guidance as purely historical. Here is why Sun Tzu's concept of immediate decision vectors governs everything we achieve today.`;
      
      broadcast({
        type: "LOG_STREAM",
        node: "SCRIPTWRITER_AGENT",
        level: "SUCCESS",
        message: "[SCRIPTWRITER] Alternative draft formulated. Plagiarism threshold cleared."
      });

      // Advance directly back to Copyright check
      activeSession.step = "COPYRIGHT_ACTIVE";
      broadcast({ type: "STATE_TICK", activeSession });
      await sleep(1500);

      activeSession.step = "MEDIA_SYNTHESIZER";
      broadcast({ type: "STATE_TICK", activeSession });
      await sleep(1500);

      activeSession.step = "WAITING_APPROVAL";
      activeSession.approvalDeferred = true;
      activeSession.paused = true;
      broadcast({ type: "STATE_TICK", activeSession });

      broadcast({
        type: "LOG_STREAM",
        node: "HUMAN_GATE",
        level: "WARNING",
        message: "[HUMAN GATE] Regenerated assets staged. Waiting user approval signal."
      });

    } catch (err) {
       console.error("Regeneration failed:", err);
    }
  }

  // --- Serve Vite Frontend Asset Bundle ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Educational Pipeline Dashboard running on http://localhost:${PORT}`);
    console.log(`[SERVER] Websockets listening relative upgrades on same port.`);
  });
}

startServer();

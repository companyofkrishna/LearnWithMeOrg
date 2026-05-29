import React, { useState, useEffect, useRef } from "react";
import CodeViewer from "./components/CodeViewer";
import { 
  Database, 
  Terminal, 
  Play, 
  CheckCircle, 
  Clock, 
  Cpu, 
  RefreshCw, 
  UserCheck, 
  AlertTriangle, 
  BookOpen, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Code,
  Sparkles,
  Youtube,
  Volume2,
  Tv,
  HelpCircle
} from "lucide-react";

// Books Type Definition
interface Book {
  id: number;
  title: string;
  totalChapters: number;
  chaptersCompleted: number;
  status: "Pending" | "Processing" | "WaitingApproval" | "Completed";
  description: string;
  coverColor: string;
}

// Log line definition
interface Log {
  id: string;
  node: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "REJECT" | "ERROR";
  message: string;
  timestamp: string;
}

// Pipeline Session State Definition
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

export default function App() {
  const [activeTab, setActiveTab] = useState<"workspace" | "codebase">("workspace");
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [activeSession, setActiveSession] = useState<PipelineSession | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [wsStatus, setWsStatus] = useState<"CONNECTED" | "CONNECTING" | "DISCONNECTED">("DISCONNECTED");
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookChapters, setNewBookChapters] = useState("12");
  const [newBookDesc, setNewBookDesc] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [currentCaptionIdx, setCurrentCaptionIdx] = useState(0);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-fetch queue details on start
  useEffect(() => {
    fetchBooks();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Sync log listings auto scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Synchronize playing dynamic subtitle loops when B-Roll/Avatar preview script exists
  useEffect(() => {
    if (!activeSession || !activeSession.scriptText) {
      setCurrentCaptionIdx(0);
      return;
    }

    const sentences = activeSession.scriptText.split(".").map(s => s.trim()).filter(Boolean);
    if (sentences.length === 0) return;

    const interval = setInterval(() => {
      setCurrentCaptionIdx(prev => (prev + 1) % sentences.length);
    }, 4500);

    return () => clearInterval(interval);
  }, [activeSession?.scriptText]);

  const fetchBooks = async () => {
    try {
      const res = await fetch("/api/books");
      if (res.ok) {
        const data = await res.json();
        setBooks(data);
        if (data.length > 0 && !selectedBook) {
          setSelectedBook(data[0]);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch books queue, system running offline simulation model.", e);
    }
  };

  const connectWebSocket = () => {
    setWsStatus("CONNECTING");
    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("CONNECTED");
        addLogEntry("SYSTEM", "SUCCESS", "Telemetry link committed successfully! Front-end connected to live WebSocket.");
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "QUEUE_UPDATED") {
          setBooks(msg.books);
          // Keep selection synchronized
          if (selectedBook) {
            const fresh = msg.books.find((b: Book) => b.id === selectedBook.id);
            if (fresh) setSelectedBook(fresh);
          }
        } else if (msg.type === "STATE_TICK") {
          setActiveSession(msg.session);
        } else if (msg.type === "SESSION_RESTORE") {
          setActiveSession(msg.session);
        } else if (msg.type === "SESSION_TERMINATED") {
          setActiveSession(null);
        } else if (msg.type === "LOG_STREAM") {
          addLogEntry(msg.node, msg.level, msg.message);
        }
      };

      ws.onclose = () => {
        setWsStatus("DISCONNECTED");
        setTimeout(connectWebSocket, 5000); // Polling restore logic
      };

      ws.onerror = () => {
        setWsStatus("DISCONNECTED");
      };
    } catch {
      setWsStatus("DISCONNECTED");
    }
  };

  const addLogEntry = (node: string, level: Log["level"], message: string) => {
    const fresh: Log = {
      id: Math.random().toString(),
      node,
      level,
      message,
      timestamp: new Date().toLocaleTimeString()
    };
    setLogs(prev => [...prev.slice(-99), fresh]); // Cap lists at 100 entries for lightweight DOM profiles
  };

  const bootPipelineFlow = async (bookId: number) => {
    try {
      setLogs([]); // Reset standard logs of the session
      addLogEntry("SYSTEM", "INFO", `[FLOW RUN] Triggering CrewAI orchestrator flow on Book ID: ${bookId}...`);
      const res = await fetch("/api/flow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId })
      });
      if (!res.ok) {
        const err = await res.json();
        addLogEntry("SYSTEM", "ERROR", `Failed boot: ${err.error}`);
      }
    } catch (e) {
      addLogEntry("SYSTEM", "ERROR", "Failed to access backend endpoint route.");
    }
  };

  const handleApprove = async () => {
    try {
      addLogEntry("HUMAN_GATE", "SUCCESS", "[HUMAN GATE] User APPROVAL signature provided. Resuming compilation thread.");
      const res = await fetch("/api/flow/approve", { method: "POST" });
      if (!res.ok) {
        addLogEntry("SYSTEM", "ERROR", "Could not submit approval callback.");
      }
    } catch {
      addLogEntry("SYSTEM", "ERROR", "Offline approval error.");
    }
  };

  const handleReject = async () => {
    try {
      addLogEntry("HUMAN_GATE", "REJECT", "[HUMAN GATE] User REJECTION signature provided. Initiating script re-generation.");
      const res = await fetch("/api/flow/reject", { method: "POST" });
      if (!res.ok) {
        addLogEntry("SYSTEM", "ERROR", "Could not submit reject callback.");
      }
    } catch {
      addLogEntry("SYSTEM", "ERROR", "Offline reject error.");
    }
  };

  const resetAllDB = async () => {
    if (confirm("Reset the SQLite Queue tracker database to original baseline book listings?")) {
      try {
        setLogs([]);
        const res = await fetch("/api/books/reset", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setBooks(data.books);
          setSelectedBook(data.books[0]);
          setActiveSession(null);
          addLogEntry("SYSTEM", "SUCCESS", "Underlying SQLite database queue reset committed.");
        }
      } catch {
        alert("Reset failed.");
      }
    }
  };

  const createBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookTitle) return;

    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newBookTitle,
          totalChapters: newBookChapters,
          description: newBookDesc
        })
      });

      if (res.ok) {
        const data = await res.json();
        setNewBookTitle("");
        setNewBookDesc("");
        setShowAddModal(false);
        fetchBooks();
        addLogEntry("SQLITE_DB", "SUCCESS", `[NEW ENTRY] Successfully committed Book '${data.book.title}' to queue.`);
      }
    } catch {
      alert("Error registering book.");
    }
  };

  // Node graph color mapping helper
  const getNodeState = (nodeName: string) => {
    if (!activeSession) return "idle";
    const step = activeSession.step;

    // Direct mappings centering agent highlights
    if (nodeName === "PDF_READER" && step === "LOAD_START") return "active";
    if (nodeName === "GEMINI_CACHE" && step === "CONCEPTS_CACHING") return "active";
    if (nodeName === "SCHOLAR_AGENT" && step === "SCHOLAR_ACTIVE") return "active";
    if (nodeName === "SCRIPTWRITER" && step === "SCRIPTWRITER_ACTIVE") return "active";
    if (nodeName === "COPYRIGHT" && step === "COPYRIGHT_ACTIVE") return "active";
    if (nodeName === "MEDIA_SYNTH" && step === "MEDIA_SYNTHESIZER") return "active";
    if (nodeName === "HUMAN_GATE" && step === "WAITING_APPROVAL") return "active_wait";
    if (nodeName === "YOUTUBE" && step === "PUBLISHING_ACTIVE") return "active";

    // Finished nodes coloring
    const stepsOrder = [
      "LOAD_START", "CONCEPTS_CACHING", "SCHOLAR_ACTIVE", 
      "SCRIPTWRITER_ACTIVE", "COPYRIGHT_ACTIVE", "MEDIA_SYNTHESIZER", 
      "WAITING_APPROVAL", "PUBLISHING_ACTIVE", "PIPELINE_SUCCESS"
    ];

    const currentIdx = stepsOrder.indexOf(step);
    const nodeIdx = stepsOrder.indexOf(
      nodeName === "PDF_READER" ? "LOAD_START" :
      nodeName === "GEMINI_CACHE" ? "CONCEPTS_CACHING" :
      nodeName === "SCHOLAR_AGENT" ? "SCHOLAR_ACTIVE" :
      nodeName === "SCRIPTWRITER" ? "SCRIPTWRITER_ACTIVE" :
      nodeName === "COPYRIGHT" ? "COPYRIGHT_ACTIVE" :
      nodeName === "MEDIA_SYNTH" ? "MEDIA_SYNTHESIZER" :
      nodeName === "HUMAN_GATE" ? "WAITING_APPROVAL" : "PUBLISHING_ACTIVE"
    );

    if (currentIdx > nodeIdx) return "finished";
    return "idle";
  };

  const getPercentage = (book: Book) => {
    return Math.round((book.chaptersCompleted / book.totalChapters) * 100);
  };

  return (
    <div className="min-h-screen bg-[#070a13] text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-300">
      
      {/* Decorative Top Accent Light Beam */}
      <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Primary Workspace Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/40 backdrop-blur px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-600 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <Cpu className="w-5 h-5 text-slate-900" />
          </div>
          <div>
            <h1 className="font-sans font-bold text-base tracking-tight text-slate-50 uppercase flex items-center gap-2">
              Automated Media Agent Pipeline
            </h1>
            <p className="text-[10px] text-slate-500 font-mono tracking-wider flex items-center gap-3 mt-0.5">
              <span>MODEL ORCHESTRATION: <span className="text-emerald-400">CREWAI FLOWS</span></span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                DATABASE: <span className="text-cyan-400">SQLITE TRACKING</span>
              </span>
            </p>
          </div>
        </div>

        {/* Tab Selection Controls */}
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-0.5 flex gap-1">
            <button
              id="tab-btn-workspace"
              onClick={() => setActiveTab("workspace")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-sans text-xs font-semibold tracking-wide uppercase transition-all ${
                activeTab === "workspace"
                  ? "bg-slate-800 text-emerald-400 font-bold shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Workspace</span>
            </button>
            <button
              id="tab-btn-codebase"
              onClick={() => setActiveTab("codebase")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-sans text-xs font-semibold tracking-wide uppercase transition-all ${
                activeTab === "codebase"
                  ? "bg-slate-800 text-emerald-400 font-bold shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Python Code</span>
            </button>
          </div>

          {/* WebSocket Status Indicator */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 text-[10px] font-mono select-none">
            <span className={`w-1.5 h-1.5 rounded-full ${
              wsStatus === "CONNECTED" ? "bg-emerald-500 animate-pulse" :
              wsStatus === "CONNECTING" ? "bg-amber-400" : "bg-rose-500"
            }`} />
            <span className="text-slate-400 uppercase tracking-wider">{wsStatus}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-6 max-w-7xl mx-auto">
        
        {activeTab === "codebase" ? (
          <CodeViewer />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

            {/* COLUMN 1: SQLITE PERSISTENT QUEUE TRACKER */}
            <section id="sqlite-queue-column" className="xl:col-span-1 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between h-[calc(100vh-140px)] min-h-[550px] overflow-hidden">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-sans font-bold text-slate-300 uppercase tracking-widest">SQLite Book Queue</h3>
                  </div>
                  
                  {/* Plus Icon to Add Book */}
                  <button
                    id="btn-add-book-trigger"
                    onClick={() => setShowAddModal(true)}
                    className="p-1 px-2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 hover:text-emerald-200 transition-all text-xs font-medium flex items-center gap-1.5"
                    title="Register new Book PDF"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Upload</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                  Live connection to <code className="text-slate-300 font-mono">book_queue</code> SQLite table. Tracks individual chapters compiled and YouTube publication status.
                </p>

                {/* Queue Cards */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                  {books.map((book) => {
                    const isSelected = selectedBook?.id === book.id;
                    const percent = getPercentage(book);
                    
                    return (
                      <div
                        key={book.id}
                        id={`book-queue-card-${book.id}`}
                        onClick={() => setSelectedBook(book)}
                        className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? "bg-slate-800/60 border-emerald-500/40 shadow-md shadow-emerald-500/5"
                            : "bg-slate-900/60 border-slate-800 hover:bg-slate-900 hover:border-slate-700/80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-sans font-semibold text-xs tracking-tight text-slate-200 limit-lines-1">
                              {book.title}
                            </span>
                          </div>
                          
                          {/* Badge */}
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider font-semibold ${
                            book.status === "Completed" ? "bg-emerald-500/15 text-emerald-400" :
                            book.status === "Processing" ? "bg-blue-500/15 text-blue-400 animate-pulse" :
                            "bg-slate-800 text-slate-400"
                          }`}>
                            {book.status}
                          </span>
                        </div>

                        {/* Description snippet */}
                        <p className="text-[10px] text-slate-500 mt-1.5 leading-normal truncate">
                          {book.description}
                        </p>

                        {/* Progress stats bar */}
                        <div className="mt-3">
                          <div className="flex justify-between items-center text-[9px] font-mono text-slate-400 mb-1">
                            <span>Chapter Comp: {book.chaptersCompleted} / {book.totalChapters}</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                book.status === "Completed" ? "bg-emerald-500" : "bg-gradient-to-r from-emerald-500 to-cyan-500"
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reset connection button */}
              <div className="pt-4 border-t border-slate-800 mt-4 flex items-center justify-between">
                <button
                  id="reset-queue-btn"
                  onClick={resetAllDB}
                  className="flex items-center gap-1.5 text-[10px] font-mono text-rose-400/80 hover:text-rose-400 transition-colors uppercase tracking-wider"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Reset Database SQLite</span>
                </button>
                <div className="text-[9px] font-mono text-slate-500 uppercase">
                  v3.1.0-Active
                </div>
              </div>
            </section>

            {/* COLUMN 2: 3D NODE-GRAPH WORKSPACE & TERMINAL LOGGER */}
            <section id="flow-graph-column" className="xl:col-span-2 flex flex-col gap-6 h-[calc(100vh-140px)] min-h-[550px]">
              
              {/* Visual Node Graph Grid Layout */}
              <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden cyber-grid flex flex-col justify-between">
                
                {/* Node graph header background indicator */}
                <div className="flex items-center justify-between mb-4 border-b border-slate-900 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-sans font-bold text-slate-300 uppercase tracking-widest">3D Node-Graph UI Workspace</h3>
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">
                    ACTIVE CACHE LOAD: {activeSession ? " cc_3.1_f85fa3 [GEMINI]" : "NONE"}
                  </span>
                </div>

                {/* Graph Grid Nodes Canvas Area */}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 items-center justify-center p-4">
                  
                  {/* NODE 1: PDF Extractor */}
                  <div className={`p-3 rounded-xl border text-center relative flex flex-col items-center justify-center transition-all ${
                    getNodeState("PDF_READER") === "active" ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10" :
                    getNodeState("PDF_READER") === "finished" ? "bg-slate-900/60 border-emerald-500/20 text-emerald-400" :
                    "bg-slate-950/40 border-slate-800/80 text-slate-300"
                  }`}>
                    {getNodeState("PDF_READER") === "active" && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    )}
                    <BookOpen className="w-5 h-5 mb-1.5" />
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider block">PDF Reader</span>
                    <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                      {getNodeState("PDF_READER") === "active" ? "PARSING" :
                       getNodeState("PDF_READER") === "finished" ? "SUCCESS" : "IDLE"}
                    </span>
                  </div>

                  {/* NODE 2: Gemini Cache */}
                  <div className={`p-3 rounded-xl border text-center relative flex flex-col items-center justify-center transition-all ${
                    getNodeState("GEMINI_CACHE") === "active" ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10" :
                    getNodeState("GEMINI_CACHE") === "finished" ? "bg-slate-900/60 border-emerald-500/20 text-emerald-400" :
                    "bg-slate-950/40 border-slate-800/80 text-slate-300"
                  }`}>
                    {getNodeState("GEMINI_CACHE") === "active" && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    )}
                    <Database className="w-5 h-5 mb-1.5" />
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider block">Context Cache</span>
                    <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                      {getNodeState("GEMINI_CACHE") === "active" ? "LOADING" :
                       getNodeState("GEMINI_CACHE") === "finished" ? "CACHED" : "IDLE"}
                    </span>
                  </div>

                  {/* NODE 3: Scholar Agent */}
                  <div className={`p-3 rounded-xl border text-center relative flex flex-col items-center justify-center transition-all ${
                    getNodeState("SCHOLAR_AGENT") === "active" ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10" :
                    getNodeState("SCHOLAR_AGENT") === "finished" ? "bg-slate-900/60 border-emerald-500/20 text-emerald-400" :
                    "bg-slate-950/40 border-slate-800/80 text-slate-300"
                  }`}>
                    {getNodeState("SCHOLAR_AGENT") === "active" && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    )}
                    <Cpu className="w-5 h-5 mb-1.5 text-cyan-400" />
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider block">Scholar Agent</span>
                    <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                      {getNodeState("SCHOLAR_AGENT") === "active" ? "SUMMARIZING" :
                       getNodeState("SCHOLAR_AGENT") === "finished" ? "DECONSTRUCTED" : "IDLE"}
                    </span>
                  </div>

                  {/* NODE 4: Scriptwriter */}
                  <div className={`p-3 rounded-xl border text-center relative flex flex-col items-center justify-center transition-all ${
                    getNodeState("SCRIPTWRITER") === "active" ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10" :
                    getNodeState("SCRIPTWRITER") === "finished" ? "bg-slate-900/60 border-emerald-500/20 text-emerald-400" :
                    "bg-slate-950/40 border-slate-800/80 text-slate-300"
                  }`}>
                    {getNodeState("SCRIPTWRITER") === "active" && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    )}
                    <Plus className="w-5 h-5 mb-1.5 text-indigo-400" />
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider block">Scriptwriter</span>
                    <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                      {getNodeState("SCRIPTWRITER") === "active" ? "GPT-4O RUN" :
                       getNodeState("SCRIPTWRITER") === "finished" ? "WRITTEN" : "IDLE"}
                    </span>
                  </div>

                  {/* NODE 5: Copyright Officer */}
                  <div className={`p-3 rounded-xl border text-center relative flex flex-col items-center justify-center transition-all ${
                    getNodeState("COPYRIGHT") === "active" ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10" :
                    getNodeState("COPYRIGHT") === "finished" ? "bg-slate-900/60 border-emerald-500/20 text-emerald-400" :
                    "bg-slate-950/40 border-slate-800/80 text-slate-300"
                  }`}>
                    {getNodeState("COPYRIGHT") === "active" && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    )}
                    <Clock className="w-5 h-5 mb-1.5 text-amber-500" />
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider block">Copyright Agent</span>
                    <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                      {getNodeState("COPYRIGHT") === "active" ? "VERIFYING" :
                       getNodeState("COPYRIGHT") === "finished" ? "COMPLIANT" : "IDLE"}
                    </span>
                  </div>

                  {/* NODE 6: Media Synthesizer */}
                  <div className={`p-3 rounded-xl border text-center relative flex flex-col items-center justify-center transition-all ${
                    getNodeState("MEDIA_SYNTH") === "active" ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10" :
                    getNodeState("MEDIA_SYNTH") === "finished" ? "bg-slate-900/60 border-emerald-500/20 text-emerald-400" :
                    "bg-slate-950/40 border-slate-800/80 text-slate-300"
                  }`}>
                    {getNodeState("MEDIA_SYNTH") === "active" && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    )}
                    <Volume2 className="w-5 h-5 mb-1.5 text-violet-400" />
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider block">Media Studio</span>
                    <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                      {getNodeState("MEDIA_SYNTH") === "active" ? "COMPILING" :
                       getNodeState("MEDIA_SYNTH") === "finished" ? "RENDERED" : "IDLE"}
                    </span>
                  </div>

                  {/* NODE 7: Human Verification Gate */}
                  <div className={`p-3 rounded-xl border text-center relative flex flex-col items-center justify-center transition-all ${
                    getNodeState("HUMAN_GATE") === "active_wait" ? "bg-amber-500/10 border-amber-500 animate-pulse" :
                    getNodeState("HUMAN_GATE") === "finished" ? "bg-slate-900/60 border-emerald-500/20 text-emerald-400" :
                    "bg-slate-950/40 border-slate-800/80 text-slate-300"
                  }`}>
                    {getNodeState("HUMAN_GATE") === "active_wait" && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                      </span>
                    )}
                    <UserCheck className="w-5 h-5 mb-1.5" />
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider block">Review Gate</span>
                    <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                      {getNodeState("HUMAN_GATE") === "active_wait" ? "ACTION REQUIRED" :
                       getNodeState("HUMAN_GATE") === "finished" ? "APPROVED" : "IDLE"}
                    </span>
                  </div>

                  {/* NODE 8: YouTube Publisher */}
                  <div className={`p-3 rounded-xl border text-center relative flex flex-col items-center justify-center transition-all ${
                    getNodeState("YOUTUBE") === "active" ? "bg-emerald-500/10 border-emerald-500 shadow-md shadow-emerald-500/10" :
                    getNodeState("YOUTUBE") === "finished" ? "bg-slate-900/60 border-emerald-500/20 text-emerald-400" :
                    "bg-slate-950/40 border-slate-800/80 text-slate-300"
                  }`}>
                    {getNodeState("YOUTUBE") === "active" && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                    )}
                    <Youtube className="w-5 h-5 mb-1.5 text-red-500" />
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider block">Playlist sync</span>
                    <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                      {getNodeState("YOUTUBE") === "active" ? "UPLOADING" :
                       getNodeState("YOUTUBE") === "finished" ? "PUBLISHED" : "IDLE"}
                    </span>
                  </div>

                </div>

                {/* Simulated connection path legend */}
                <div className="text-[9.5px] font-mono text-slate-500 mt-2 px-1 flex flex-wrap gap-4 items-center justify-center border-t border-slate-900 pt-2 bg-slate-950/20 text-center">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded bg-slate-800 border border-slate-700" /> State Idle
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded bg-emerald-500 animate-pulse" /> Active processing
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded bg-amber-500 animate-pulse" /> Awaiting Human Gate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded bg-emerald-950 border border-emerald-500/30" /> Stage Complete
                  </span>
                </div>
              </div>

              {/* Terminal Log Console */}
              <div id="terminal-logger-panel" className="h-[200px] bg-slate-950 border border-slate-800 rounded-2xl flex flex-col overflow-hidden">
                <div className="bg-slate-900/80 px-4 py-2 border-b border-slate-800 flex items-center justify-between font-mono text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="uppercase text-[10px] tracking-widest font-bold">CrewAI Execution Logs</span>
                  </div>
                  <span className="text-[10px] uppercase text-slate-500">Sim stream</span>
                </div>

                <div className="flex-1 overflow-y-auto p-3.5 font-mono text-[11px] space-y-1.5 selection:bg-cyan-500 select-text max-h-[160px]">
                  {logs.length === 0 ? (
                    <div className="text-slate-500 italic p-2 select-none text-center">
                      No orchestration logs streamed. Select a book cue segment on the left, and launch "Start Automated Pipeline" to boot the flows.
                    </div>
                  ) : (
                    logs.map((log) => {
                      const levelColors = {
                        INFO: "text-slate-200",
                        SUCCESS: "text-emerald-400 font-semibold",
                        WARNING: "text-amber-400 font-semibold",
                        REJECT: "text-rose-400 font-semibold",
                        ERROR: "text-red-500 font-extrabold"
                      };
                      return (
                        <div key={log.id} className="leading-relaxed hover:bg-slate-900/40 px-1 py-0.5 rounded transition-all">
                          <span className="text-slate-600 select-none mr-2">[{log.timestamp}]</span>
                          <span className="text-cyan-400 select-none font-bold mr-2">[{log.node}]</span>
                          <span className={levelColors[log.level]}>{log.message}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </section>

            {/* COLUMN 3: ASSET INSPECTOR & HUMAN VALIDATION PANEL */}
            <section id="inspector-gate-column" className="xl:col-span-1 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between h-[calc(100vh-140px)] min-h-[550px] overflow-hidden">
              
              <div className="flex-1 flex flex-col justify-between min-h-0">
                <div className="mb-4">
                  <h3 id="panel-title-inspector" className="text-xs font-sans font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-400" />
                    <span>Pipeline Inspector</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-normal">
                    Inspect active drafts, B-roll stock video keywords, and talking-avatar lipsync configurations.
                  </p>
                </div>

                {/* Content body depending on Active State */}
                {!activeSession ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-800 rounded-xl bg-slate-950/20 my-4 select-none">
                    <Clock className="w-8 h-8 text-slate-700 mb-2.5 animate-pulse" />
                    <h4 className="text-xs font-sans font-semibold text-slate-400 uppercase tracking-wide">
                      No Session Running
                    </h4>
                    
                    {selectedBook ? (
                      <div className="mt-4 w-full">
                        <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-left">
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">SELECTED QUEUE RECORD:</div>
                          <div className="text-xs font-bold font-sans text-slate-200 mt-0.5">{selectedBook.title}</div>
                          <p className="text-[10px] text-slate-400 mt-1 leading-normal">{selectedBook.description}</p>
                          
                          <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-800/50 text-[10px] font-mono">
                            <div>Chapters: <span className="text-slate-200">{selectedBook.totalChapters}</span></div>
                            <div>Completed: <span className="text-emerald-400">{selectedBook.chaptersCompleted}</span></div>
                          </div>
                        </div>

                        <button
                          id="trigger-pipeline-btn"
                          onClick={() => bootPipelineFlow(selectedBook.id)}
                          className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 text-slate-950 font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-lg hover:shadow-emerald-500/10"
                        >
                          <Play className="w-4 h-4" />
                          <span>Start CrewAI Flows</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 mt-2 px-2">
                        Add a textbook layout or choose a baseline book inside SQLite to explore.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-between min-h-0 py-2">
                    
                    {/* Active chapter status indicator */}
                    <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 flex items-center justify-between mb-3 text-xs">
                      <div>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">SYNTHESIZING BLOCK:</span>
                        <div className="font-bold font-sans text-slate-200 text-xs truncate">Ch {activeSession.activeChapter} of {books.find(b=>b.id === activeSession!.bookId)?.title}</div>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-400">{activeSession.step}</span>
                    </div>

                    {/* Output script review */}
                    <div className="flex-1 min-h-0 flex flex-col gap-3.5 overflow-y-auto pr-1">
                      
                      {/* Subtitles & Talking Avatar Player mock visual card */}
                      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col relative aspect-video justify-center items-center">
                        
                        {/* Background B-Roll stock visual simulator */}
                        <div className="absolute inset-0 bg-slate-900/90 z-0 flex items-center justify-center font-mono text-[9px] text-slate-500 select-none overflow-hidden uppercase">
                          {activeSession.step === "MEDIA_SYNTHESIZER" || activeSession.step === "WAITING_APPROVAL" || activeSession.step === "PUBLISHING_ACTIVE" || activeSession.step === "PIPELINE_SUCCESS" ? (
                            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center">
                              {/* Pulse circle talking avatar layout animation */}
                              <div className="w-14 h-14 rounded-full border border-emerald-500/30 flex items-center justify-center relative bg-emerald-500/5 animate-pulse">
                                <span className="absolute inset-0.5 rounded-full border border-dashed border-emerald-500/10 animate-spin" />
                                <span className={`w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center ${activeSession.paused ? "" : "animate-bounce"}`}>
                                  <Cpu className="w-4 h-4 text-emerald-400" />
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 uppercase font-sans mt-2.5 font-bold tracking-tight">AI LECTURER AVATAR ACTIVE</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <RefreshCw className="w-5 h-5 text-slate-700 animate-spin" />
                              <span>Compiling video canvas...</span>
                            </div>
                          )}
                        </div>

                        {/* Centered Captions overlay block */}
                        {activeSession.scriptText && (
                          <div className="absolute bottom-2 left-2 right-2 z-10 bg-slate-950/80 backdrop-blur-sm border border-slate-800 rounded px-2.5 py-1.5 min-h-[40px] flex items-center justify-center text-center">
                            <p className="text-[10px] font-sans text-slate-100 font-bold leading-normal">
                              {activeSession.scriptText.split(".").map(s=>s.trim()).filter(Boolean)[currentCaptionIdx] || activeSession.scriptText}
                            </p>
                          </div>
                        )}

                        {/* Top Accent Category Badge */}
                        <div className="absolute top-2 left-2 z-10 bg-slate-950/60 border border-slate-800 rounded px-1.5 py-0.5 text-[8.5px] font-mono text-slate-400 tracking-wider">
                          PREVIEW PLATFORM
                        </div>
                      </div>

                      {/* Calculated TTS Waveform Visualizer */}
                      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-3">
                        <Volume2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Voice Generation Track</span>
                          
                          {/* Animated SVG wave simulator */}
                          <div className="h-6 flex items-center gap-[3px] mt-1 overflow-hidden">
                            {[12, 18, 8, 22, 14, 25, 4, 16, 20, 10, 12, 24, 6, 18, 14, 22, 8, 16, 12, 20, 4, 14, 18, 8, 20].map((h, i) => (
                              <div
                                key={i}
                                className="w-[3px] bg-emerald-500 rounded-full transition-all duration-300"
                                style={{
                                  height: `${activeSession.paused ? Math.max(3, h - 8) : h}%`,
                                  opacity: activeSession.paused ? 0.3 : 0.8
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Interactive script draft content display */}
                      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex-1 flex flex-col justify-between overflow-hidden">
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block border-b border-slate-900 pb-1.5 mb-2">Copyright Safe Script</span>
                        <div className="flex-grow overflow-y-auto max-h-[140px] text-[11px] font-mono text-slate-300 leading-relaxed pr-1 whitespace-pre-wrap select-text">
                          {activeSession.scriptText ? (
                            activeSession.scriptText
                          ) : (
                            <span className="text-slate-600 italic">Formulating narrative scripts via CrewAI...</span>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Approval Action controllers block */}
                    <div className="pt-4 border-t border-slate-800 mt-3">
                      {activeSession.step === "WAITING_APPROVAL" ? (
                        <div className="space-y-3.5">
                          <div className="flex gap-2 p-2.5 rounded border border-amber-500/20 bg-amber-500/5 text-[10px] text-amber-400">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <div>
                              <span className="font-bold block uppercase tracking-wide">HUMAN GATE ENGAGED:</span>
                              Verify B-roll and talking-avatar script metrics. Click Approve to dispatch or Reject to regenerate.
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              id="gate-reject-btn"
                              onClick={handleReject}
                              className="w-full flex items-center justify-center gap-1.5 py-2 hover:bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:text-rose-300 transition-all font-sans text-xs font-bold uppercase rounded-lg cursor-pointer"
                            >
                              <span>Reject / Regen</span>
                            </button>
                            <button
                              id="gate-approve-btn"
                              onClick={handleApprove}
                              className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 transition-all font-sans text-xs font-bold uppercase rounded-lg cursor-pointer"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Approve Run</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 p-3 bg-slate-950 rounded-xl border border-slate-900 text-center text-slate-500 text-[10px] font-mono uppercase tracking-wider select-none">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                          <span>Pipeline iterating: {activeSession.step}</span>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>
            </section>

          </div>
        )}
      </main>

      {/* MODAL WINDOW: PDF BOOK QUEUE LOADER UPLOAD */}
      {showAddModal && (
        <div id="add-modal-overlay" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 border-b border-slate-800 px-5 py-3.5 flex justify-between items-center">
              <h4 className="font-sans font-bold text-xs uppercase text-slate-200 tracking-widest flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Upload Book layout (SQLite Entry)</span>
              </h4>
              <button 
                id="btn-close-modal"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white font-mono text-xs cursor-pointer p-1 uppercase"
              >
                Close
              </button>
            </div>

            <form onSubmit={createBook} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Book Title *</label>
                <input
                  id="input-book-title"
                  type="text"
                  required
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  placeholder="e.g. Principles of Systems Chemistry"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Total Chapters *</label>
                  <input
                    id="input-book-chapters"
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={newBookChapters}
                    onChange={(e) => setNewBookChapters(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Mime format</label>
                  <div className="w-full bg-slate-950/40 border border-slate-800 text-slate-500 rounded-lg px-3 py-2 text-xs select-none">
                    application/pdf
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">Segment Outline Description</label>
                <textarea
                  id="input-book-desc"
                  rows={3}
                  value={newBookDesc}
                  onChange={(e) => setNewBookDesc(e.target.value)}
                  placeholder="Detailed layout summary regarding the educational takeaways of this manual..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 text-slate-450 hover:text-slate-350 border border-slate-805 rounded-lg text-xs font-semibold cursor-pointer text-slate-400"
                >
                  Cancel
                </button>
                <button
                  id="submit-new-book-btn"
                  type="submit"
                  className="flex-1 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-sans font-bold text-xs uppercase tracking-wider rounded-lg cursor-pointer transition-all"
                >
                  Commit to SQLite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

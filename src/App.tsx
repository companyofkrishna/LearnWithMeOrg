import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  Settings, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Play, 
  FileText, 
  Database,
  UploadCloud,
  FileCheck,
  Compass,
  ArrowRight,
  BookOpen,
  StopCircle,
  HelpCircle,
  Activity
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface LogEvent {
  feature: string;
  status: string;
  message: string;
  payload?: any;
}

interface PipelineState {
  currentBook: string;
  totalChapters: number;
  completedChapters: number;
  currentChapterTitle: string;
  isProcessing: boolean;
  waitingApproval: boolean;
  rawTextPreview: string;
  finalScriptOutput: string;
  chaptersList: string[];
  videoUrl?: string;
}

export default function App() {
  // Config state
  const [books, setBooks] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>("");

  // Key configurations with auto-save trackers
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [openaiKey, setOpenaiKey] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pipeline telemetry state
  const [pipeline, setPipeline] = useState<PipelineState>({
    currentBook: "",
    totalChapters: 0,
    completedChapters: 0,
    currentChapterTitle: "",
    isProcessing: false,
    waitingApproval: false,
    rawTextPreview: "",
    finalScriptOutput: "",
    chaptersList: [],
    videoUrl: ""
  });

  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [wsStatus, setWsStatus] = useState<"CONNECTED" | "DISCONNECTED" | "CONNECTING">("DISCONNECTED");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const ws = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [chartData, setChartData] = useState<{ time: string, chapters: number, duration: number }[]>([]);

  // Load backend configurations
  useEffect(() => {
    connectWebSocket();
    fetchBooks();
    fetchSettings();
    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  // Update chart data dynamically as completed chapters increase
  useEffect(() => {
    if (pipeline.completedChapters > 0 || (pipeline.totalChapters > 0 && pipeline.completedChapters === 0)) {
      setChartData(prev => {
        const last = prev[prev.length - 1];
        if (!last || last.chapters !== pipeline.completedChapters) {
           return [...prev, {
             time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
             chapters: pipeline.completedChapters,
             duration: pipeline.completedChapters * 4.5 // Simulated duration: 4.5 mins per chapter
           }];
        }
        return prev;
      });
    } else if (!pipeline.isProcessing && pipeline.completedChapters === 0) {
      setChartData([]); // reset
    }
  }, [pipeline.completedChapters, pipeline.totalChapters, pipeline.isProcessing]);

  // Scroll to logs end
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Handle auto-saving of keys
  const triggerAutoSave = (gKey: string, oKey: string) => {
    setSaveStatus("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            geminiKey: gKey,
            openaiKey: oKey
          })
        });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) {
        console.error("Auto-save failed", e);
        setSaveStatus("idle");
      }
    }, 600); // 600ms debounce
  };

  const handleGeminiChange = (val: string) => {
    setGeminiKey(val);
    triggerAutoSave(val, openaiKey);
  };

  const handleOpenAiChange = (val: string) => {
    setOpenaiKey(val);
    triggerAutoSave(geminiKey, val);
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        // Since we don't return plain secrets back to the browser for security, 
        // we can set a mock bullet value if they are active on backend
        if (data.hasGemini && !geminiKey) setGeminiKey("••••••••••••••••");
        if (data.hasOpenAI && !openaiKey) setOpenaiKey("••••••••••••••••");
      }
    } catch (e) {
      console.warn("Could not load current api variables from background.");
    }
  };

  const fetchBooks = async () => {
    try {
      const res = await fetch("/api/books");
      if (res.ok) {
        const data = await res.json();
        setBooks(data.files || []);
        if (data.files && data.files.length > 0 && !selectedBook) {
          setSelectedBook(data.files[0]);
        }
      }
    } catch (e) {
      console.warn("Book-scanner backend is initializing.");
    }
  };

  const connectWebSocket = () => {
    setWsStatus("CONNECTING");
    
    // Auto bridge location port for zero-config setups
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setWsStatus("CONNECTED");
    };

    ws.current.onclose = () => {
      setWsStatus("DISCONNECTED");
      setTimeout(connectWebSocket, 3000); // Poll connection
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "INITIAL_STATE") {
          setPipeline(data.state);
        } else if (data.type === "PIPELINE_UPDATE") {
          setPipeline(data.state);
        } else if (data.type === "TELEMETRY") {
          setLogs(prev => [...prev, data]);
        }
      } catch (err) {
        console.error("WS error parsing event", err);
      }
    };
  };

  // Upload custom PDF file handler
  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please upload a valid document in PDF format.");
      return;
    }

    setUploadProgress("Uploading file...");
    const formData = new FormData();
    formData.append("book", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setUploadProgress("Success!");
        await fetchBooks();
        setSelectedBook(data.filename);
        setTimeout(() => setUploadProgress(""), 2000);
      } else {
        setUploadProgress("Upload failed.");
      }
    } catch (e) {
      setUploadProgress("Error upload.");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const startPipeline = async () => {
    setLogs([]);
    try {
      const payload: any = {};
      if (selectedBook) {
        payload.filename = selectedBook;
      }

      const res = await fetch("/api/flow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      }
    } catch (e) {
      alert("Failed connecting to media engine server.");
    }
  };

  const stopPipeline = async () => {
    try {
      await fetch("/api/flow/stop", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  const approvePipeline = async () => {
    try {
      await fetch("/api/flow/approve", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "EXECUTING") return "text-amber-400 animate-pulse";
    if (status === "VERIFIED SUCCESS") return "text-emerald-400 font-semibold";
    if (status === "FAILED") return "text-rose-400 font-semibold";
    if (status === "WAITING") return "text-cyan-400 animate-pulse";
    return "text-slate-400";
  };

  // Calculations for beautiful progress trackers
  const hasChapters = pipeline.totalChapters > 0;
  const progressPercent = hasChapters 
    ? Math.round((pipeline.completedChapters / pipeline.totalChapters) * 100) 
    : 0;

  return (
    <div className="h-screen w-screen bg-[#090d16] text-slate-100 flex flex-col overflow-hidden font-sans select-none">
      
      {/* GLOW BAR */}
      <div className="h-[2px] w-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-indigo-500 shrink-0 z-20" />

      {/* HEADER */}
      <header className="h-16 bg-[#0c1221] border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-10 shadow-lg shadow-black/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-slate-200 uppercase">
              Automated Book-to-Video Pipeline
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">
              Syllabus Generation Workstation • Version 2.1
            </p>
          </div>
        </div>

        {/* WebSocket Connection Badge in Header */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full relative flex">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${wsStatus === 'CONNECTED' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${wsStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </span>
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
              Host Link: {wsStatus}
            </span>
          </div>

          {/* Core Controls */}
          {pipeline.isProcessing ? (
            <button 
              onClick={stopPipeline}
              className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold uppercase rounded transition-all cursor-pointer"
            >
              <StopCircle className="w-4 h-4" /> Stop Process
            </button>
          ) : (
            <button 
              onClick={startPipeline}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs uppercase tracking-wider rounded shadow-md shadow-emerald-500/20 transition-all hover:-translate-y-[1px] active:translate-y-0 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" /> Start Pipeline
            </button>
          )}
        </div>
      </header>

      {/* WORKSPACE AREA */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT COMPILER PANEL: Inputs & Selection Dropdown */}
        <div className="w-[380px] shrink-0 border-r border-slate-800 bg-[#0b101f] flex flex-col overflow-y-auto p-5 gap-6 select-text">
          
          {/* SECURE AUTO-SAVE API KEYS */}
          <div className="rounded-xl bg-[#0f172a] border border-slate-800 p-4 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200">API Credentials</h2>
              </div>
              
              {/* Intelligent Save Status Badging */}
              {saveStatus === "saving" && (
                <span className="text-[9px] font-mono font-bold text-amber-400 uppercase animate-pulse">
                  Auto-saving...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase">
                  ✓ Saved
                </span>
              )}
            </div>

            <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
              API Keys are automatically captured and saved directly on standard inputs. No manual clicks required.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Google Gemini Developer Key
                </label>
                <input 
                  type="password" 
                  value={geminiKey}
                  placeholder="Paste Gemini Key here..."
                  onChange={(e) => handleGeminiChange(e.target.value)}
                  className="w-full bg-[#080d16] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none transition-colors selection:bg-emerald-500/25"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  OpenAI Companion Key (Optional)
                </label>
                <input 
                  type="password" 
                  value={openaiKey}
                  placeholder="Paste OpenAI Key if active..."
                  onChange={(e) => handleOpenAiChange(e.target.value)}
                  className="w-full bg-[#080d16] border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* DYNAMIC UPLOAD REGISTRATION PANEL */}
          <div className="rounded-xl bg-[#0f172a] border border-slate-800 p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200">Source Book Selection</h2>
              </div>
            </div>

            {/* DRAG AND DROP HIGH-FLEXIBILITY UPLOAD REGISTRATION Card */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer ${
                isDragging ? "border-emerald-400 bg-emerald-500/5" : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <input 
                type="file" 
                id="file-input"
                accept=".pdf"
                className="hidden"
                onChange={(e) => e.target.files && handleUpload(e.target.files[0])}
              />
              <label htmlFor="file-input" className="cursor-pointer block">
                <UploadCloud className="w-7 h-7 mx-auto text-slate-400 mb-2" />
                <span className="text-xs block font-semibold text-slate-300">Click to choose a Book PDF</span>
                <span className="text-[10px] block text-slate-500 mt-1">or drag & drop here</span>
                {uploadProgress && (
                  <span className="text-[10px] font-mono block text-emerald-400 mt-2 font-bold animate-pulse">
                    {uploadProgress}
                  </span>
                )}
              </label>
            </div>

            {/* Show Selected File */}
            {selectedBook && (
              <div className="flex items-center justify-between bg-[#080d16] border border-emerald-500/30 rounded px-3 py-2">
                 <div className="flex items-center gap-2 overflow-hidden">
                    <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-mono text-emerald-300 truncate">{selectedBook}</span>
                 </div>
              </div>
            )}
          </div>

          {/* INTERACTIVE COMPILATION PROGRESS & CUSTOM STEPPER */}
          <div className="rounded-xl bg-[#0f172a] border border-slate-800 p-4 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200 border-b border-slate-800/60 pb-2 flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" /> Book Lecture Progress
            </h2>

            {/* Core Pipeline Progress Bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-slate-400">Chapters Completed</span>
                <span className="text-[11px] font-mono font-bold text-emerald-400">
                  {pipeline.completedChapters} / {pipeline.totalChapters} ({progressPercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-slate-700/40">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Chapters Step Progress Stepper */}
            {pipeline.chaptersList.length > 0 ? (
              <div className="space-y-2 mt-4 max-h-[220px] overflow-y-auto pr-1">
                {pipeline.chaptersList.map((ch, idx) => {
                  const isCompleted = idx < pipeline.completedChapters;
                  const isActive = idx === pipeline.completedChapters && pipeline.isProcessing;
                  const isCurrent = pipeline.currentChapterTitle === ch;
                  
                  return (
                    <div 
                      key={idx} 
                      className={`flex items-center gap-2.5 p-1.5 rounded text-xs border transition-colors duration-200 ${
                        isActive || isCurrent
                          ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                          : isCompleted 
                            ? "bg-[#0b101f] border-slate-800 text-slate-400"
                            : "border-transparent text-slate-500"
                      }`}
                    >
                      <div className="shrink-0">
                        {isCompleted ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] text-slate-950 font-bold">
                            ✓
                          </div>
                        ) : idx === pipeline.completedChapters && pipeline.isProcessing ? (
                          <div className="w-4 h-4 rounded-full bg-amber-500 animate-spin flex items-center justify-center text-[10px] text-slate-950 font-bold">
                            ↻
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[9px] font-mono">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <span className="truncate flex-1 font-mono text-[10.5px]">
                        {ch}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="text-[10px] text-slate-500 italic block">
                Await document parser stream...
              </span>
            )}
          </div>
        </div>

        {/* CENTER PANE: Splitted Workspace (Original payload presentation) */}
        <div className="flex-1 flex flex-col bg-[#070b13] overflow-hidden">
          
          {/* Workspace Title bar */}
          <div className="h-10 bg-[#0c1221] border-b border-slate-800 flex items-center px-6 shrink-0 justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-emerald-400" /> Interactive Payload Inspector
            </span>
            {pipeline.currentBook && (
              <span className="text-[10px] font-mono bg-slate-900 border border-slate-800 text-cyan-400 px-2 py-0.5 rounded">
                Active Book: {pipeline.currentBook}
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-[2] flex overflow-hidden border-b border-slate-800">
            
              {/* Split Top Panel: Raw Extracted Book Stream */}
              <div className="w-1/2 border-r border-slate-800 flex flex-col bg-slate-950/20 h-full">
                <div className="bg-[#0b101f] px-4 py-2 border-b border-slate-800 flex items-center gap-2 shrink-0">
                  <FileCheck className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-300 uppercase font-mono">
                    1. Raw Book Segment Cache (PyMuPDF)
                  </span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto text-xs font-mono text-slate-400 leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/20">
                  {pipeline.rawTextPreview || "System initialized. Drop your book PDF. Select a document and launch the workflow to extract the textbook metadata streams..."}
                </div>
              </div>

              {/* Split Bottom Panel: Synthesized Text Drafts */}
              <div className="w-1/2 flex flex-col bg-slate-950/30 h-full relative">
                <div className="bg-[#0b101f] px-4 py-2 border-b border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-bold text-slate-300 uppercase font-mono">
                      2. Generated Lesson Script & Video
                    </span>
                  </div>
                  {pipeline.videoUrl && (
                    <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase font-bold animate-pulse">
                      ● Video Compiled
                    </span>
                  )}
                </div>

                {/* DYNAMIC VIDEO PLAYER EMBEDDED IF ACTIVE */}
                {pipeline.videoUrl && (
                  <div className="p-4 bg-[#0a0f1d] border-b border-slate-800 shrink-0">
                    <div className="rounded-lg overflow-hidden border border-slate-800 bg-black aspect-video relative group shadow-lg shadow-black/40">
                      <video 
                        key={pipeline.videoUrl}
                        controls 
                        autoPlay={pipeline.completedChapters > 0}
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      >
                        <source src={pipeline.videoUrl} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                      {/* Minimalist Watermark overlay */}
                      <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1 rounded text-[9.5px] font-mono text-emerald-400 border border-emerald-500/10 pointer-events-none select-none tracking-wider uppercase">
                        Media Render Active • 1080p
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-2 px-1">
                      <span className="text-[10px] font-mono text-slate-400">
                        Synthesized Stream Feed: <span className="text-cyan-400">{pipeline.currentChapterTitle || "Chapter Overview"}</span>
                      </span>
                      <div className="flex items-center gap-3 cursor-pointer">
                        <a 
                          href={pipeline.videoUrl} 
                          download={`lecture_export.mp4`}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 hover:underline font-mono"
                        >
                          Download Video ↓
                        </a>
                        <a 
                          href={pipeline.videoUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 hover:underline font-mono"
                        >
                          Open Video ↗
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 p-5 overflow-y-auto text-sm font-serif text-slate-200 leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/20">
                  {pipeline.finalScriptOutput || "Awaiting multi-agent syllabus structuring. The agents (Scholar and Scriptwriter) will automatically isolate concepts, map chapters, and unwrap drafts..."}
                </div>

                {/* DUAL GATE APPROVAL THRESHOLD */}
                {pipeline.waitingApproval && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
                    <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400">
                      <AlertTriangle className="w-7 h-7 animate-pulse" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-230 uppercase tracking-widest mb-2 text-amber-400">
                      Human Authorization Threshold
                    </h3>
                    <p className="text-xs text-slate-300 mb-6 max-w-sm leading-relaxed">
                      The Scholar and Scriptwriter pipeline have completed the overall textbook compilation. Please review the script details. Do you authorize synthesis for video creation?
                    </p>
                    
                    <div className="flex gap-4">
                      <button 
                        onClick={stopPipeline} 
                        className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold uppercase rounded transition-colors cursor-pointer"
                      >
                        Dismount
                      </button>
                      <button 
                        onClick={approvePipeline} 
                        className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider rounded shadow-lg shadow-emerald-500/20 border-0 transition-all hover:scale-[1.01] cursor-pointer"
                      >
                        Sign off script <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Analytics Bottom Panel */}
            <div className="flex-[1] bg-[#070b13] p-4 flex flex-col min-h-[180px] border-t border-slate-800">
               <div className="flex items-center gap-2 mb-3 shrink-0">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="text-[10px] font-bold text-slate-300 uppercase font-mono">Pipeline Telemetry Analytics</span>
               </div>
               <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorChapters" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorDuration" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="time" stroke="#475569" fontSize={10} tickMargin={8} />
                      <YAxis yAxisId="left" stroke="#475569" fontSize={10} />
                      <YAxis yAxisId="right" orientation="right" stroke="#475569" fontSize={10} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', fontSize: '12px' }}
                        itemStyle={{ color: '#cbd5e1' }}
                      />
                      <Area yAxisId="left" type="monotone" name="Chapters Processed" dataKey="chapters" stroke="#10b981" fillOpacity={1} fill="url(#colorChapters)" />
                      <Area yAxisId="right" type="monotone" name="Video Duration (m)" dataKey="duration" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorDuration)" />
                    </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Telemetry logs & Chart */}
        <div className="w-[320px] shrink-0 border-l border-slate-800 flex flex-col bg-[#0b101f] select-text">
          <div className="h-10 bg-[#0c1221] border-b border-slate-800 flex items-center px-4 shrink-0 justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" /> Pipeline Console
            </span>
          </div>

          <div className="flex-1 p-4 overflow-y-auto text-[10.5px] font-mono space-y-3 min-h-0 border-b border-slate-800">
            {logs.length === 0 ? (
              <span className="text-slate-500 block leading-relaxed italic">
                System idle inside port 3000 mapping layer. Ready to run textbook file. Select a book from the list and begin folder scan extraction.
              </span>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex flex-col border-l-2 border-slate-700 pl-2 pb-0.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-cyan-400 font-semibold lowercase">
                      [{log.feature}]
                    </span>
                    <span className={`${getStatusColor(log.status)} text-[9px] uppercase font-bold`}>
                      [{log.status}]
                    </span>
                  </div>
                  <span className="text-slate-300 break-words leading-relaxed">
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>

          {/* DATA VISUALIZATION PANEL */}
          <div className="h-1/3 min-h-[200px] shrink-0 flex flex-col bg-[#0c1221]">
            <div className="h-8 border-b border-slate-800 flex items-center px-4 shrink-0">
               <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                 <Activity className="w-3.5 h-3.5 text-emerald-400" /> Telemetry Metrics
               </span>
            </div>
            <div className="flex-1 p-3 min-h-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorChapters" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorDuration" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px' }}
                      itemStyle={{ fontSize: '10px', fontWeight: 'bold' }}
                      labelStyle={{ fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}
                    />
                    <Area type="monotone" dataKey="chapters" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorChapters)" name="Chapters Processed" />
                    <Area type="monotone" dataKey="duration" stroke="#0ea5e9" strokeWidth={2} fillOpacity={1} fill="url(#colorDuration)" name="Video Duration (min)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                  <Activity className="w-6 h-6 text-slate-500 mb-2" />
                  <span className="text-[10px] font-mono text-slate-400">Awaiting vector synthesis...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

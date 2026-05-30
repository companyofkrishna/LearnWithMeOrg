import React, { useState, useEffect, useRef } from "react";
import { jsPDF } from "jspdf";
import {
  Terminal,
  Settings,
  CheckCircle,
  Clock,
  AlertTriangle,
  Play,
  FileText,
  Database,
  FileCheck,
  Compass,
  ArrowRight,
  BookOpen,
  StopCircle,
  HelpCircle,
  Activity,
  Download,
  Youtube,
  UploadCloud,
  CheckCircle2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const KEY_TERMS: Record<string, string> = {
  Algorithm:
    "A logical, step-by-step procedure for solving a mathematical problem or completing a computer process.",
  "Neural Network":
    "A machine learning model inspired by the structure of the human brain, designed to recognize patterns and make intelligent categorizations.",
  "Machine Learning":
    "A branch of artificial intelligence where systems learn from data to identify patterns and make decisions with minimal human intervention.",
  API: "Application Programming Interface: a set of functions allowing applications to access data and interact with external systems securely.",
  Syntax:
    "The set of rules that defines the structure and combinations of symbols in a programming language.",
  PyMuPDF:
    "A high-performance Python library (fitz) used for extracting text, metadata, and images from PDF documents.",
  FastAPI:
    "A modern, high-performance web framework for Python, based on standard Python type hints.",
  "B-roll":
    "Supplemental video footage intercut with the primary shot to provide context, visual interest, or hide cuts.",
  Voiceover:
    "An unseen narrator's voice, reading from a script over visual media to provide explanatory dialogue.",
  Tokens:
    "The basic units of data (often partial structural syllables) processed by Large Language Models.",
  Gemini:
    "A multimodal artificial intelligence model natively designed by Google, capable of processing various data streams.",
};

const renderHighlightedText = (text: string, interactive: boolean = false) => {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Highlighting without horizontal layout shifts for edit mode overlay sync
  html = html.replace(
    /(\[?(?:Voiceover|VO)(?::|-)[^\]\n]*\]?)/gi,
    '<span class="text-purple-400 bg-purple-500/10">$1</span>',
  );
  html = html.replace(
    /(\[?(?:B-roll|B-Roll|Visual|Graphic)(?::|-)[^\]\n]*\]?)/gi,
    '<span class="text-amber-400 bg-amber-500/10">$1</span>',
  );
  html = html.replace(
    /(\([^)]+\))/g,
    '<span class="text-slate-400 italic bg-slate-800/40">$1</span>',
  );

  if (interactive) {
    Object.keys(KEY_TERMS).forEach((term) => {
      const regex = new RegExp(`\\b(${term})\\b`, "gi");
      html = html.replace(
        regex,
        `<span class="text-cyan-400 font-semibold underline decoration-cyan-400/40 decoration-dashed hover:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer term-btn transition-colors rounded" data-term="$1">$&</span>`,
      );
    });
  }

  if (html[html.length - 1] === "\n") html += " ";
  return html;
};

interface LogEvent {
  feature: string;
  status: string;
  message: string;
  payload?: any;
}

interface ChapterResult {
  title: string;
  script: string;
  summary?: string;
  videoUrl?: string;
  approved?: boolean;
  youtubeUrl?: string;
  uploading?: boolean;
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
  generatedChapters?: ChapterResult[];
}

const AGENT_STAGES = [
  {
    id: "PDF_ENGINE",
    name: "Extractor",
    emoji: "📄",
    description: "Parsing Book",
  },
  {
    id: "SCHOLAR_AGENT",
    name: "Scholar",
    emoji: "🦉",
    description: "Summarizing",
  },
  {
    id: "SCRIPTWRITER",
    name: "Scriptwriter",
    emoji: "✍️",
    description: "Drafting Script",
  },
  {
    id: "COPYRIGHT_CHECK",
    name: "Legal",
    emoji: "⚖️",
    description: "Validating",
  },
  {
    id: "HUMAN_GATE",
    name: "Reviewer",
    emoji: "👤",
    description: "Awaiting auth",
  },
  {
    id: "MEDIA_SYNTH_ENGINE",
    name: "Director",
    emoji: "🎬",
    description: "Synthesizing",
  },
  {
    id: "YOUTUBE_PUBLISHER",
    name: "Publisher",
    emoji: "🚀",
    description: "Uploading",
  },
];

export default function App() {
  // Config state
  const [books, setBooks] = useState<string[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>("");
  const [voiceoverTone, setVoiceoverTone] = useState<string>("Professional");
  const [downloadedSummaries, setDownloadedSummaries] = useState<Set<string>>(new Set());

  // Key configurations with auto-save trackers
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [openaiKey, setOpenaiKey] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
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
    videoUrl: "",
  });

  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [wsStatus, setWsStatus] = useState<
    "CONNECTED" | "DISCONNECTED" | "CONNECTING"
  >("DISCONNECTED");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const ws = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const [chartData, setChartData] = useState<
    { time: string; chapters: number; duration: number }[]
  >([]);
  const [activeTab, setActiveTab] = useState<"pipeline" | "script">("pipeline");
  const [scriptFeedback, setScriptFeedback] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);

  const [editorView, setEditorView] = useState<"edit" | "review">("edit");
  const [activeTermPopup, setActiveTermPopup] = useState<{
    term: string;
    def: string;
    x: number;
    y: number;
  } | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Auto-advance the active script focus as multi-agent chain completes chapters
  useEffect(() => {
    if (
      pipeline.isProcessing &&
      pipeline.generatedChapters &&
      pipeline.generatedChapters.length > 0
    ) {
      setActiveChapterIndex(pipeline.generatedChapters.length - 1);
    }
  }, [pipeline.generatedChapters?.length, pipeline.isProcessing]);

  const handleEditorScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = e.currentTarget.scrollTop;
      highlightRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleReviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains("term-btn")) {
      const term = target.getAttribute("data-term");
      if (term) {
        const originalTerm = Object.keys(KEY_TERMS).find(
          (k) => k.toLowerCase() === term.toLowerCase(),
        );
        if (originalTerm) {
          const rect = target.getBoundingClientRect();
          setActiveTermPopup({
            term: originalTerm,
            def: KEY_TERMS[originalTerm],
            x: Math.min(rect.left, window.innerWidth - 260),
            y: rect.bottom + 10,
          });
        }
      }
    } else {
      setActiveTermPopup(null);
    }
  };

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
    if (
      pipeline.completedChapters > 0 ||
      (pipeline.totalChapters > 0 && pipeline.completedChapters === 0)
    ) {
      setChartData((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.chapters !== pipeline.completedChapters) {
          return [
            ...prev,
            {
              time: new Date().toLocaleTimeString([], {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
              chapters: pipeline.completedChapters,
              duration: pipeline.completedChapters * 4.5, // Simulated duration: 4.5 mins per chapter
            },
          ];
        }
        return prev;
      });
    } else if (!pipeline.isProcessing && pipeline.completedChapters === 0) {
      setChartData([]); // reset
    }
  }, [
    pipeline.completedChapters,
    pipeline.totalChapters,
    pipeline.isProcessing,
  ]);

  // Scroll to logs end
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Auto-download scholar summary PDFs
  useEffect(() => {
    if (pipeline.generatedChapters && pipeline.generatedChapters.length > 0) {
      pipeline.generatedChapters.forEach((chapter) => {
        if (chapter.summary && !downloadedSummaries.has(chapter.title)) {
          const doc = new jsPDF();
          doc.setFont("helvetica", "bold");
          doc.setFontSize(16);
          doc.text(`Scholar Outline: ${chapter.title}`, 20, 20);
          
          doc.setFont("helvetica", "normal");
          doc.setFontSize(12);
          const splitText = doc.splitTextToSize(chapter.summary, 170);
          doc.text(splitText, 20, 30);
          
          doc.save(`Scholar_Outline_${chapter.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
          
          setDownloadedSummaries((prev) => new Set(prev).add(chapter.title));
        }
      });
    }
  }, [pipeline.generatedChapters, downloadedSummaries]);

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
            openaiKey: oKey,
          }),
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
          setLogs((prev) => [...prev, data]);
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
        body: formData,
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
        body: JSON.stringify(payload),
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
      await fetch("/api/flow/approve", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: voiceoverTone })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const uploadToYoutube = async (chapterTitle: string) => {
    try {
      await fetch("/api/youtube/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterTitle }),
      });
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

  // Find currently active agent from logs
  const activeAgentId =
    [...logs]
      .reverse()
      .find((l) => AGENT_STAGES.some((a) => a.id === l.feature))?.feature || "";
  const activeAgentIndex = AGENT_STAGES.findIndex(
    (a) => a.id === activeAgentId,
  );

  return (
    <div
      className="h-screen w-screen bg-[#090d16] text-slate-100 flex flex-col overflow-hidden font-sans select-none"
      onClick={(e) => {
        if (!(e.target as HTMLElement).classList.contains("term-btn")) {
          setActiveTermPopup(null);
        }
      }}
    >
      {/* Term Definition Popup Workspace */}
      {activeTermPopup && (
        <div
          className="fixed z-[100] bg-[#0c1221] border border-slate-700 shadow-xl rounded-lg p-4 w-64 animate-in fade-in zoom-in duration-200"
          style={{ top: activeTermPopup.y, left: activeTermPopup.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
              {activeTermPopup.term}
            </h4>
            <button
              onClick={() => setActiveTermPopup(null)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <StopCircle className="w-4 h-4 flex rotate-45" />
            </button>
          </div>
          <div className="w-full h-px bg-slate-800 mb-2"></div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            {activeTermPopup.def}
          </p>
        </div>
      )}

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
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${wsStatus === "CONNECTED" ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${wsStatus === "CONNECTED" ? "bg-emerald-500" : "bg-rose-500"}`}
              />
            </span>
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400">
              Host Link: {wsStatus}
            </span>
          </div>

          {/* Core Controls */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-[#0f172a] hover:bg-[#1e293b] text-slate-300 border border-slate-800 text-xs font-semibold uppercase rounded transition-all cursor-pointer"
          >
            <Settings className="w-4 h-4" /> API Settings
          </button>

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

      {/* AGENT TRACKING SUB-HEADER */}
      <div className="h-10 bg-[#080d16] border-b border-slate-800/80 shrink-0 flex items-center justify-center gap-4 px-6 overflow-x-auto overflow-y-hidden">
        {AGENT_STAGES.map((agent, index) => {
          const isPast = activeAgentIndex > index;
          const isActive = activeAgentIndex === index;
          const isPending = activeAgentIndex < index && pipeline.isProcessing;
          const isDone = activeAgentIndex === -1 && !pipeline.isProcessing;

          let stateClass = "opacity-30";
          if (isActive) stateClass = "opacity-100 scale-105";
          else if (isPast || isDone) stateClass = "opacity-50";

          return (
            <React.Fragment key={agent.id}>
              <div
                className={`flex items-center gap-2 transition-all duration-300 ${stateClass}`}
              >
                <span className={`text-sm ${isActive ? "animate-bounce" : ""}`}>
                  {agent.emoji}
                </span>
                <span
                  className={`text-[10px] uppercase font-mono tracking-widest ${isActive ? "text-emerald-400 font-bold" : isPast ? "text-slate-400" : "text-slate-500"}`}
                >
                  {agent.name}
                </span>
              </div>
              {index < AGENT_STAGES.length - 1 && (
                <div className="text-slate-700/50 mx-1">→</div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm shadow-[0_0_15px_rgba(0,0,0,0.5)] z-50 flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-[#0f172a] border border-slate-700 w-full max-w-md rounded-xl p-6 relative shadow-2xl">
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
            >
              <StopCircle className="w-5 h-5 flex rotate-45" />
            </button>

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-200">
                  API Credentials
                </h2>
              </div>

              {saveStatus === "saving" && (
                <span className="text-[10px] font-mono font-bold text-amber-400 uppercase animate-pulse">
                  Auto-saving...
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase pt-0.5">
                  ✓ Saved
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-6 text-balance">
              API Keys are automatically captured and saved directly on standard
              inputs. No manual clicks required.
            </p>

            <div className="grid grid-cols-[145px_1fr] gap-x-2 gap-y-4 items-center">
              <label className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Google Gemini Key
              </label>
              <input
                type="password"
                value={geminiKey}
                placeholder="Paste Gemini Key here..."
                onChange={(e) => handleGeminiChange(e.target.value)}
                className="w-full bg-[#080d16] border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none transition-colors selection:bg-emerald-500/25"
              />

              <label className="text-xs font-mono uppercase tracking-wider text-slate-400">
                OpenAI Key (Opt)
              </label>
              <input
                type="password"
                value={openaiKey}
                placeholder="Paste OpenAI Key if active..."
                onChange={(e) => handleOpenAiChange(e.target.value)}
                className="w-full bg-[#080d16] border border-slate-800 rounded-md px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 outline-none transition-colors"
              />
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold uppercase tracking-wider rounded transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WORKSPACE AREA */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT COMPILER PANEL: Inputs & Selection Dropdown */}
        <div className="w-[350px] shrink-0 border-r border-slate-800 bg-[#0b101f] flex flex-col overflow-y-auto p-5 gap-6 select-text">
          {/* DYNAMIC UPLOAD REGISTRATION PANEL */}
          <div className="rounded-xl bg-[#0f172a] border border-slate-800 p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200">
                  Source Book Selection
                </h2>
              </div>
            </div>

            {/* DRAG AND DROP HIGH-FLEXIBILITY UPLOAD REGISTRATION Card */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-all cursor-pointer ${
                isDragging
                  ? "border-emerald-400 bg-emerald-500/5"
                  : "border-slate-800 hover:border-slate-700"
              }`}
            >
              <input
                type="file"
                id="file-input"
                accept=".pdf"
                className="hidden"
                onChange={(e) =>
                  e.target.files && handleUpload(e.target.files[0])
                }
              />
              <label htmlFor="file-input" className="cursor-pointer block">
                <UploadCloud className="w-7 h-7 mx-auto text-slate-400 mb-2" />
                <span className="text-xs block font-semibold text-slate-300">
                  Click to choose a Book PDF
                </span>
                <span className="text-[10px] block text-slate-500 mt-1">
                  or drag & drop here
                </span>
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
                  <span className="text-xs font-mono text-emerald-300 truncate">
                    {selectedBook}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* INTERACTIVE COMPILATION PROGRESS & CUSTOM STEPPER */}
          <div className="rounded-xl bg-[#0f172a] border border-slate-800 p-4 shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-200 border-b border-slate-800/60 pb-2 flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-400" /> Book Lecture
              Progress
            </h2>

            {/* Core Pipeline Progress Bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-slate-400">
                  Chapters Completed
                </span>
                <span className="text-[11px] font-mono font-bold text-emerald-400">
                  {pipeline.completedChapters} / {pipeline.totalChapters} (
                  {progressPercent}%)
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
                  const isActive =
                    idx === pipeline.completedChapters && pipeline.isProcessing;
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
                        ) : idx === pipeline.completedChapters &&
                          pipeline.isProcessing ? (
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
          {/* Workspace Tabs */}
          <div className="h-10 bg-[#0c1221] border-b border-slate-800 flex items-center shrink-0">
            <button
              onClick={() => setActiveTab("pipeline")}
              className={`h-full px-6 flex items-center gap-2 border-r border-slate-800 text-[10px] font-mono tracking-widest uppercase transition-colors select-none outline-none ${activeTab === "pipeline" ? "bg-[#0b101f] text-emerald-400 border-b-2 border-b-emerald-400" : "text-slate-500 hover:text-slate-300 hover:bg-[#0b101f]/50"}`}
            >
              <FileCheck className="w-3.5 h-3.5" /> Pipeline Explorer
            </button>
            <button
              onClick={() => setActiveTab("script")}
              className={`h-full px-6 flex items-center gap-2 border-r border-slate-800 text-[10px] font-mono tracking-widest uppercase transition-colors select-none outline-none ${activeTab === "script" ? "bg-[#0b101f] text-emerald-400 border-b-2 border-b-emerald-400" : "text-slate-500 hover:text-slate-300 hover:bg-[#0b101f]/50"}`}
            >
              <FileText className="w-3.5 h-3.5" /> Script Workspace
            </button>

            <div className="flex-1 flex justify-end px-6">
              {pipeline.currentBook && (
                <span className="text-[10px] font-mono bg-[#070b13] border border-slate-800 text-cyan-400 px-2 py-0.5 rounded shadow-inner">
                  Active Resource: {pipeline.currentBook}
                </span>
              )}
            </div>
          </div>

          {activeTab === "pipeline" ? (
            <div className="flex-1 flex overflow-hidden">
              {/* Split Left Panel: Raw Extracted Book Stream */}
              <div className="w-1/2 border-r border-slate-800 flex flex-col bg-slate-950/20 h-full">
                <div className="bg-[#0b101f] px-4 py-2 border-b border-slate-800 flex items-center gap-2 shrink-0">
                  <Database className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-300 uppercase font-mono">
                    1. Raw Book Segment Cache (PyMuPDF)
                  </span>
                </div>
                <div className="flex-1 p-4 overflow-y-auto text-xs font-mono text-slate-400 leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/20">
                  {pipeline.rawTextPreview ||
                    "System initialized. Drop your book PDF. Select a document and launch the workflow to extract the textbook metadata streams..."}
                </div>
              </div>

              {/* Split Right Panel: Synthesized Video & Mini-Script */}
              <div className="w-1/2 flex flex-col bg-slate-950/30 h-full relative">
                <div className="bg-[#0b101f] px-4 py-2 border-b border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-bold text-slate-300 uppercase font-mono">
                      2. Generated Video Stream
                    </span>
                  </div>
                  {pipeline.videoUrl && (
                    <span className="text-[9px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase font-bold animate-pulse">
                      ● Compiled
                    </span>
                  )}
                </div>

                {/* DYNAMIC VIDEO PLAYER EMBEDDED IF ACTIVE */}
                {pipeline.videoUrl ? (
                  <div className="p-4 bg-[#0a0f1d] border-b border-slate-800 flex-none flex flex-col items-center w-full">
                    <div className="w-full relative overflow-hidden rounded-lg border border-slate-800 bg-black shadow-lg shadow-black/40 aspect-video">
                      <video
                        key={pipeline.videoUrl}
                        controls
                        autoPlay={pipeline.completedChapters > 0}
                        className="absolute inset-0 w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      >
                        <source src={pipeline.videoUrl} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                      {/* Minimalist Watermark overlay */}
                      <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1 rounded text-[9.5px] font-mono text-emerald-400 border border-emerald-500/10 pointer-events-none select-none tracking-wider uppercase z-10">
                        Media Render Active • 1080p
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3 pt-1 w-full">
                      <span
                        className="text-[10px] font-mono text-slate-400 truncate pr-3"
                        title={
                          pipeline.currentChapterTitle || "Chapter Overview"
                        }
                      >
                        Feed:{" "}
                        <span className="text-cyan-400">
                          {pipeline.currentChapterTitle || "Chapter Overview"}
                        </span>
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        {(() => {
                          const activeCh = pipeline.generatedChapters?.find(
                            (ch) => ch.videoUrl === pipeline.videoUrl,
                          );
                          if (activeCh?.youtubeUrl) {
                            return (
                              <a
                                href={activeCh.youtubeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10.5px] font-bold bg-green-500/20 text-green-400 border border-green-500/30 rounded px-2 py-1 uppercase tracking-wide flex items-center gap-1.5 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> Published
                              </a>
                            );
                          } else if (activeCh?.uploading) {
                            return (
                              <span className="text-[10.5px] font-bold bg-slate-800 text-slate-400 border border-slate-700 rounded px-2 py-1 uppercase tracking-wide flex items-center gap-1.5 animate-pulse">
                                <UploadCloud className="w-3.5 h-3.5" />{" "}
                                Publishing...
                              </span>
                            );
                          } else if (activeCh) {
                            return (
                              <button
                                onClick={() => uploadToYoutube(activeCh.title)}
                                className="text-[10.5px] font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 border border-red-500/30 rounded px-2 py-1 uppercase tracking-wide flex items-center gap-1.5 transition-colors shadow-lg"
                              >
                                <Youtube className="w-3.5 h-3.5" /> Publish to YouTube
                              </button>
                            );
                          }
                          return null;
                        })()}
                        <div className="w-px h-3 bg-slate-700 mx-1"></div>
                        <a
                          href={pipeline.videoUrl}
                          download={`lecture_export.mp4`}
                          className="text-[10.5px] font-bold text-emerald-400 hover:text-emerald-300 hover:underline uppercase tracking-wide flex items-center gap-1"
                        >
                          Download
                        </a>
                        <a
                          href={pipeline.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10.5px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline uppercase tracking-wide flex items-center gap-1"
                        >
                          Open
                        </a>
                      </div>
                    </div>

                    {/* Video Metadata Panel */}
                    <div className="w-full mt-4 bg-[#070b13] border border-slate-800/80 rounded p-3 grid grid-cols-4 gap-4 divide-x divide-slate-800/60 shadow-inner">
                      <div className="flex flex-col px-2">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                          Resolution
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400">
                          1080p (16:9)
                        </span>
                      </div>
                      <div className="flex flex-col px-2 pl-4">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                          Frame Rate
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400">
                          30 FPS
                        </span>
                      </div>
                      <div className="flex flex-col px-2 pl-4">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                          Audio Codec
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400">
                          AAC / 320kbps
                        </span>
                      </div>
                      <div className="flex flex-col px-2 pl-4">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                          Est. Size
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400">
                          ~42 MB
                        </span>
                      </div>
                    </div>

                    {/* Multi-chapter video selection list */}
                    {pipeline.generatedChapters &&
                      pipeline.generatedChapters.length > 1 && (
                        <div className="mt-4 pt-3 border-t border-slate-800 flex gap-2 overflow-x-auto pb-1 pb-scroll">
                          {pipeline.generatedChapters.map((chap, idx) => (
                            <div
                              key={idx}
                              onClick={() => {
                                if (chap.videoUrl)
                                  setPipeline({
                                    ...pipeline,
                                    videoUrl: chap.videoUrl,
                                    currentChapterTitle: chap.title,
                                  });
                              }}
                              className={`shrink-0 w-28 p-1.5 border rounded cursor-pointer transition-colors ${pipeline.videoUrl === chap.videoUrl ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 hover:border-slate-700 bg-[#070b13]"}`}
                            >
                              <div className="w-full aspect-video bg-black flex items-center justify-center rounded-sm text-slate-800 relative shadow-inner overflow-hidden mb-1">
                                {chap.youtubeUrl ? (
                                  <div className="absolute top-1 right-1 bg-black/60 rounded p-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                                  </div>
                                ) : chap.uploading ? (
                                  <div className="absolute top-1 right-1 bg-black/60 rounded p-0.5">
                                    <UploadCloud className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
                                  </div>
                                ) : null}
                                <Play className="w-3 h-3 absolute z-10 text-slate-500" />
                              </div>
                              <div className="text-[9px] font-mono text-slate-400 truncate text-center uppercase tracking-wider">
                                {chap.title}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="p-8 border-b border-slate-800 shrink-0 flex flex-col items-center justify-center opacity-50 bg-[#0a0f1d] min-h-[35vh]">
                    <div className="w-12 h-12 rounded-full border border-slate-700 flex items-center justify-center mb-3">
                      <Play className="w-5 h-5 text-slate-600 ml-1" />
                    </div>
                    <span className="text-xs font-mono text-slate-500 uppercase tracking-widest text-center">
                      Awaiting Render Data
                    </span>
                  </div>
                )}

                <div className="flex-1 p-5 overflow-y-auto text-sm font-serif text-slate-300 leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/20 bg-slate-950/30">
                  <div className="mb-2 text-xs font-mono text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                    Latest Synced Chunk
                  </div>
                  {pipeline.finalScriptOutput ? (
                    <div className="line-clamp-6 opacity-75">
                      {pipeline.finalScriptOutput}
                    </div>
                  ) : (
                    "Awaiting multi-agent syllabus structuring. Switch to 'Script Workspace' tab to edit or review the full comprehensive script."
                  )}

                  {pipeline.finalScriptOutput && (
                    <button
                      onClick={() => setActiveTab("script")}
                      className="mt-4 text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wider flex items-center gap-1"
                    >
                      Open Full Script Workspace{" "}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                      The Scholar and Scriptwriter pipeline have completed the
                      overall textbook compilation. Please review the script
                      details. Do you authorize synthesis for video creation?
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
          ) : (
            <div className="flex-1 flex bg-slate-950/30 overflow-hidden relative">
              {/* Script Chapter Selector Sidebar */}
              <div className="w-64 shrink-0 border-r border-slate-800 bg-[#070b13] flex flex-col pt-4">
                <span className="text-[10px] font-bold tracking-widest font-mono text-slate-500 uppercase px-5 mb-3">
                  Generated Chapters
                </span>
                <div className="flex-1 overflow-y-auto">
                  {pipeline.generatedChapters?.map((chap, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveChapterIndex(idx)}
                      className={`w-full text-left px-5 py-3 border-l-2 text-xs transition-colors flex items-center justify-between group ${activeChapterIndex === idx ? "border-emerald-500 bg-[#0a0f1d] text-slate-200" : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-300"}`}
                    >
                      <span className="line-clamp-2 font-mono flex-1 pr-2">
                        {chap.title}
                      </span>
                      {activeChapterIndex === idx && (
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  ))}
                  {(!pipeline.generatedChapters ||
                    pipeline.generatedChapters.length === 0) && (
                    <div className="px-5 py-3 text-[10px] text-slate-600 font-mono uppercase">
                      Waiting for agents...
                    </div>
                  )}
                </div>
              </div>

              {/* Main Script Editor */}
              <div className="flex-1 flex flex-col relative min-w-0">
                <div className="flex-1 p-6 overflow-y-auto flex flex-col items-center">
                  <div className="w-full max-w-3xl flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-slate-200 flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" /> Lesson
                        Script Editor
                      </h3>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 mr-2">
                          <span className="text-[10px] font-mono text-slate-500 uppercase">Voice Tone:</span>
                          <select 
                            value={voiceoverTone}
                            onChange={(e) => setVoiceoverTone(e.target.value)}
                            className="bg-[#0b101f] border border-slate-700 text-cyan-400 text-[10px] font-bold uppercase tracking-wide rounded px-2 py-1 outline-none appearance-none cursor-pointer hover:border-slate-500 transition-colors"
                          >
                            <option value="Professional">Professional</option>
                            <option value="Energetic">Energetic</option>
                            <option value="Calm">Calm</option>
                            <option value="Authoritative">Authoritative</option>
                          </select>
                        </div>
                        <a
                          href={`data:text/plain;charset=utf-8,${encodeURIComponent(pipeline.generatedChapters?.[activeChapterIndex]?.script || pipeline.finalScriptOutput || "")}`}
                          download={`script_${pipeline.generatedChapters?.[activeChapterIndex]?.title?.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "export"}.txt`}
                          className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-[9px] font-bold text-cyan-400 hover:text-cyan-300 uppercase tracking-widest transition-colors cursor-pointer rounded border border-slate-700 hover:border-slate-600"
                          onClick={(e) => {
                            if (
                              !(
                                pipeline.generatedChapters?.[activeChapterIndex]
                                  ?.script || pipeline.finalScriptOutput
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <Download className="w-3 h-3" /> Export Script
                        </a>
                        <span className="text-[10px] font-mono text-slate-500 uppercase">
                          {pipeline.generatedChapters?.[activeChapterIndex]
                            ?.script?.length ||
                            pipeline.finalScriptOutput.length ||
                            0}{" "}
                          Characters
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 w-full bg-[#0c1221] border border-slate-800 rounded flex flex-col shadow-inner relative min-h-[350px]">
                      <div className="h-10 bg-[#080d15] border-b border-slate-800 flex items-center justify-between px-3 shrink-0">
                        <div className="flex gap-1.5 bg-[#0c1221] p-1 rounded-md border border-slate-800/50">
                          <button
                            onClick={() => setEditorView("edit")}
                            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-all ${editorView === "edit" ? "bg-emerald-500/20 text-emerald-400 shadow-sm" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"}`}
                          >
                            Real-Time Editor
                          </button>
                          <button
                            onClick={() => setEditorView("review")}
                            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded transition-all flex items-center gap-1.5 ${editorView === "review" ? "bg-cyan-500/20 text-cyan-400 shadow-sm" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"}`}
                          >
                            <BookOpen className="w-3.5 h-3.5" /> Interactive
                            Review
                          </button>
                        </div>
                      </div>
                      <div className="relative flex-1 overflow-hidden group">
                        {editorView === "edit" ? (
                          <>
                            <div
                              ref={highlightRef}
                              className="absolute inset-0 p-6 text-sm font-serif leading-loose whitespace-pre-wrap break-words pointer-events-none z-0 overflow-auto text-slate-300"
                              dangerouslySetInnerHTML={{
                                __html: renderHighlightedText(
                                  pipeline.generatedChapters?.[
                                    activeChapterIndex
                                  ]?.script || pipeline.finalScriptOutput,
                                  false,
                                ),
                              }}
                            />
                            <textarea
                              value={
                                pipeline.generatedChapters?.[activeChapterIndex]
                                  ?.script || pipeline.finalScriptOutput
                              }
                              onChange={(e) => {
                                const newVal = e.target.value;
                                if (
                                  pipeline.generatedChapters &&
                                  pipeline.generatedChapters[activeChapterIndex]
                                ) {
                                  const updatedChapters = [
                                    ...pipeline.generatedChapters,
                                  ];
                                  updatedChapters[activeChapterIndex] = {
                                    ...updatedChapters[activeChapterIndex],
                                    script: newVal,
                                  };
                                  setPipeline({
                                    ...pipeline,
                                    generatedChapters: updatedChapters,
                                  });
                                } else {
                                  setPipeline({
                                    ...pipeline,
                                    finalScriptOutput: newVal,
                                  });
                                }
                              }}
                              onScroll={handleEditorScroll}
                              placeholder="The synthesized academic script will populate here..."
                              className="absolute inset-0 w-full h-full p-6 text-sm font-serif leading-loose outline-none resize-none z-10 bg-transparent text-transparent caret-emerald-400 selection:bg-emerald-500/25 overflow-auto shadow-inner"
                              spellCheck="false"
                            />
                          </>
                        ) : (
                          <div
                            className="absolute inset-0 p-6 text-sm font-serif text-slate-200 leading-loose whitespace-pre-wrap break-words overflow-y-auto selection:bg-cyan-500/20 cursor-text shadow-inner"
                            onClick={handleReviewClick}
                            dangerouslySetInnerHTML={{
                              __html: renderHighlightedText(
                                pipeline.generatedChapters?.[activeChapterIndex]
                                  ?.script || pipeline.finalScriptOutput,
                                true,
                              ),
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Fixed Refinement Prompt Input at Bottom */}
                <div className="h-44 border-t border-slate-800 bg-[#0c1221] p-5 flex flex-col items-center shrink-0">
                  <div className="w-full max-w-3xl flex flex-col gap-3 h-full">
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <Settings className="w-3.5 h-3.5" /> Suggestion &
                      Refinement Prompt
                    </h3>
                    <textarea
                      value={scriptFeedback}
                      onChange={(e) => setScriptFeedback(e.target.value)}
                      placeholder="E.g., Make the tone more professional and technical, expand on chapter concepts, add bullet points..."
                      className="flex-1 w-full bg-[#080d16] border border-slate-800 rounded p-3 text-xs text-slate-200 focus:border-cyan-500 outline-none resize-none selection:bg-cyan-500/30"
                    />
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => {
                          if (!scriptFeedback) return;
                          setLogs((prev) => [
                            ...prev,
                            {
                              feature: "SCRIPT_AGENT",
                              status: "WAITING",
                              message: `Sending feedback for ${pipeline.generatedChapters?.[activeChapterIndex]?.title || "active script"}: "${scriptFeedback}"`,
                            },
                          ]);
                          setScriptFeedback("");
                          alert(
                            "Feedback submitted to AI Scriptwriter for generation. (Simulation)",
                          );
                        }}
                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded shadow transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!scriptFeedback.trim()}
                      >
                        Send Feedback <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANE: Telemetry logs & Chart */}
        <div className="w-[320px] shrink-0 border-l border-slate-800 flex flex-col bg-[#0b101f] select-text">
          <div className="h-10 bg-[#0c1221] border-b border-slate-800 flex items-center px-4 shrink-0 justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-cyan-400" /> Pipeline
              Console
            </span>
          </div>

          <div className="flex-1 p-4 overflow-y-auto text-[10.5px] font-mono space-y-3 min-h-0 border-b border-slate-800">
            {logs.length === 0 ? (
              <span className="text-slate-500 block leading-relaxed italic">
                System idle inside port 3000 mapping layer. Ready to run
                textbook file. Select a book from the list and begin folder scan
                extraction.
              </span>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className="flex flex-col border-l-2 border-slate-700 pl-2 pb-0.5"
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-cyan-400 font-semibold lowercase">
                      [{log.feature}]
                    </span>
                    <span
                      className={`${getStatusColor(log.status)} text-[9px] uppercase font-bold`}
                    >
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
                <Activity className="w-3.5 h-3.5 text-emerald-400" /> Telemetry
                Metrics
              </span>
            </div>
            <div className="flex-1 p-3 min-h-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorChapters"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#10b981"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#10b981"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorDuration"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#0ea5e9"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#0ea5e9"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 9, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "4px",
                      }}
                      itemStyle={{ fontSize: "10px", fontWeight: "bold" }}
                      labelStyle={{
                        fontSize: "10px",
                        color: "#94a3b8",
                        marginBottom: "2px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="chapters"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorChapters)"
                      name="Chapters Processed"
                    />
                    <Area
                      type="monotone"
                      dataKey="duration"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorDuration)"
                      name="Video Duration (min)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                  <Activity className="w-6 h-6 text-slate-500 mb-2" />
                  <span className="text-[10px] font-mono text-slate-400">
                    Awaiting vector synthesis...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

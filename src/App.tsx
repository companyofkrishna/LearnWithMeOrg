import React, { useState, useEffect, useRef } from "react";
import CodeViewer from "./components/CodeViewer";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
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
  HelpCircle,
  Settings,
  Eye,
  EyeOff,
  Activity,
  Pause,
  Maximize2,
  VolumeX,
  Music,
  Radio,
  BarChart2
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
  progressHistory?: number[];
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

// Analytics Mock Data
const ANALYTICS_DATA = {
  totalTokens: {
    data: [
      { day: "Mon", tokens: 120500 },
      { day: "Tue", tokens: 180200 },
      { day: "Wed", tokens: 250000 },
      { day: "Thu", tokens: 220100 },
      { day: "Fri", tokens: 305000 },
      { day: "Sat", tokens: 410000 },
      { day: "Sun", tokens: 380500 },
    ],
    total: "1.86M",
  },
  averageLatency: {
    data: [
      { stage: "Reader", latency: 4.2 },
      { stage: "Scriptwriter", latency: 8.5 },
      { stage: "Director", latency: 3.1 },
      { stage: "Synthesis", latency: 12.4 },
      { stage: "YouTube", latency: 2.3 },
    ],
  },
  youtubeViews: {
    data: [
      { day: "Mon", views: 2400 },
      { day: "Tue", views: 3500 },
      { day: "Wed", views: 5100 },
      { day: "Thu", views: 8900 },
      { day: "Fri", views: 14200 },
      { day: "Sat", views: 22500 },
      { day: "Sun", views: 31000 },
    ],
    total: "87.6K",
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"workspace" | "codebase" | "analytics">("workspace");
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

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState({
    hasCustomKey: false,
    hasDefaultKey: false,
    geminiModel: "gemini-2.5-flash",
    simulationSpeed: 1,
    autoApprove: false,
  });
  const [customKeyInput, setCustomKeyInput] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Interactive Media Preview Player states
  const [activePreview, setActivePreview] = useState<{
    bookTitle: string;
    chapterNum: number;
    scriptText: string;
    bRollUrl: string;
    isLiveSession: boolean;
  } | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [duration] = useState(25); // Simulated default duration
  const [currentSpeechSentenceIdx, setCurrentSpeechSentenceIdx] = useState(0);
  const [synthSoundTrack, setSynthSoundTrack] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreenCinema, setIsFullscreenCinema] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const droneOscsRef = useRef<OscillatorNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const getCompletedChapterScript = (bookTitle: string, chapterNum: number) => {
    const defaults: Record<string, string[]> = {
      "The Art of War": [
        "Welcome back. Chapter 1 outlines the supreme battle: Knowing yourself. In conflict, every maneuver must be computed before a single soldier takes the field. Victory is reserved for those who calculate depth beforehand.",
        "Welcome back. Chapter 2 deconstructs the economics of battle. Long wars sap resources and breed mutiny. Sun Tzu tells us: seize your rival's supplies rather than burning them—energy is the vital resource.",
        "Welcome back. Chapter 3 addresses attacking strategy. To win without fighting represents the pinnacle of strategic excellence. Shattering the enemy's spirit overrides shattering their physical defenses.",
        "Welcome back. Chapter 5 focuses on strategic energy. Sun Tzu outlines how simple coordinates combine into boundless tactics. Direct force locks the enemy, while indirect force wins the campaign."
      ],
      "Meditations": [
        "Today we explore stoicism in Chapter 1. Marcus Aurelius reminds us of gratitude—cataloging specific moral strengths he observed in loved ones. We learn to control attention, bypassing petty gossip.",
        "Today we deconstruct Virtuous Action. What does not benefit the hive cannot benefit the bee. Align your morning mindset with civic obligation, and perform every task as if it were your last.",
        "Welcome to stoic reflection. Chapter 3 calls us to cherish each fleeting hour. The health of a mind relies on pure intent, unperturbed by outer clamor or public approval.",
        "Chapter 4 teaches that the soul creates its own retreat. Retiring into your quiet reason yields pristine serenity. The outer world is variable, but your internal fortress remains quiet."
      ],
      "The Odyssey": [
        "Behold Chapter 1 of the grand epic. Athena appeals to Zeus for Odysseus, who remains captive on the island of Ogygia. The quest for home under cosmic sky marks the beginning of modern heroic adventure.",
        "Chapter 2 shows Telemachus summoning the Ithacan assembly in grief. Seeking word of his long-lost father, he equips an exploration vessel, defying the greedy suitors who lay waste to his halls."
      ],
      "Principles of Economics": [
        "Chapter 1 reviews the principles of choice. Individuals face tradeoffs: choosing one path relinquishes another. Rational agents evaluate marginal costs against marginal rewards.",
        "Chapter 2 introduces supply and demand schedules. Markets seek equilibrium points where supply meets purchasing desire. Price acts as a signal guiding raw material distribution."
      ]
    };
    const titleKey = bookTitle in defaults ? bookTitle : "The Art of War";
    const bank = defaults[titleKey];
    const idx = Math.abs(chapterNum - 1) % bank.length;
    return bank[idx];
  };

  const getChapterBRollUrl = (bookTitle: string, chapterNum: number) => {
    const urls = [
      "https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-continuous-writing-of-programming-code-on-a-screen-43024-large.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-business-charts-and-graphs-analysis-41740-large.mp4",
      "https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-glow-31742-large.mp4"
    ];
    const hash = bookTitle.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) + chapterNum;
    const idx = Math.abs(hash) % urls.length;
    return urls[idx];
  };

  const startAmbientSynth = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }
      stopAmbientSynth();

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.08 * volume, ctx.currentTime + 1.0);
      masterGain.connect(ctx.destination);
      gainNodeRef.current = masterGain;

      // Warm strategical chords based on clean sine and triangle waves inside the safe filter
      const freqs = [110.0, 165.0, 220.0, 330.0];
      droneOscsRef.current = freqs.map((freq, index) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        
        osc.type = index % 2 === 0 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.2 + (index * 0.15);
        lfoGain.gain.value = 1.5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();
        
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(450, ctx.currentTime);
        
        osc.connect(filter);
        filter.connect(masterGain);
        
        osc.start();
        return osc;
      });
    } catch (e) {
      console.warn("Failed synth audio engine boot:", e);
    }
  };

  const stopAmbientSynth = () => {
    droneOscsRef.current.forEach(osc => {
      try { osc.stop(); } catch {}
    });
    droneOscsRef.current = [];
    if (gainNodeRef.current) {
      try { gainNodeRef.current.disconnect(); } catch {}
      gainNodeRef.current = null;
    }
  };

  const speakSentence = (index: number) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (!activePreview || !isPlaying) return;

    const sentences = activePreview.scriptText.split(".").map(s => s.trim()).filter(Boolean);
    if (sentences.length === 0 || index >= sentences.length) {
      setIsPlaying(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(sentences[index]);
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.startsWith("en-") && v.name.includes("Google")) || 
                  voices.find(v => v.lang.startsWith("en-") && v.name.includes("Natural")) ||
                  voices.find(v => v.lang.startsWith("en-")) || 
                  voices[0];
    if (voice) {
      utterance.voice = voice;
    }
    
    utterance.rate = 1.05 * playbackRate;
    utterance.pitch = 0.95;
    utterance.volume = volume;

    utterance.onend = () => {
      if (index + 1 < sentences.length) {
        setCurrentSpeechSentenceIdx(index + 1);
      } else {
        setIsPlaying(false);
        setCurrentSpeechSentenceIdx(0);
        setPlaybackTime(0);
      }
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    speechUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  // Sync play state
  useEffect(() => {
    if (isPlaying && activePreview) {
      speakSentence(currentSpeechSentenceIdx);
      if (synthSoundTrack) {
        startAmbientSynth();
      }
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackRate;
        videoRef.current.play().catch(() => {});
      }
    } else {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      stopAmbientSynth();
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      stopAmbientSynth();
    };
  }, [isPlaying, currentSpeechSentenceIdx, activePreview?.scriptText, playbackRate]);

  // Adjust volume
  useEffect(() => {
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(isPlaying && synthSoundTrack ? 0.08 * volume : 0, audioCtxRef.current.currentTime);
    }
  }, [isPlaying, synthSoundTrack, volume]);

  // Handle play duration progress bar slider
  useEffect(() => {
    let interval: any = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlaybackTime(prev => {
          if (prev >= duration) {
            setIsPlaying(false);
            setCurrentSpeechSentenceIdx(0);
            return 0;
          }
          return Number((prev + 0.1).toFixed(1));
        });
      }, 100);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, duration]);

  // Keep live synthesis outputs synced as they arrive in activeSession
  useEffect(() => {
    if (activeSession && activeSession.scriptText) {
      const bookObj = books.find(b => b.id === activeSession.bookId);
      const bRoll = activeSession.bRollLocalClips?.[0] || "https://assets.mixkit.co/videos/preview/mixkit-business-charts-and-graphs-analysis-41740-large.mp4";
      
      setActivePreview({
        bookTitle: bookObj?.title || "Active Textbook compilation",
        chapterNum: activeSession.activeChapter,
        scriptText: activeSession.scriptText,
        bRollUrl: bRoll,
        isLiveSession: true
      });
    }
  }, [activeSession?.scriptText, activeSession?.activeChapter, activeSession?.step]);

  // Sync internal caption idx with speech speech synthesis sentences
  useEffect(() => {
    setCurrentCaptionIdx(currentSpeechSentenceIdx);
  }, [currentSpeechSentenceIdx]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-fetch queue details on start
  useEffect(() => {
    fetchBooks();
    fetchSettings();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        if (data.hasCustomKey) {
          setCustomKeyInput("••••••••••••••••••••••••");
        }
      }
    } catch (e) {
      console.warn("Offline fallback for loading configuration variables.", e);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const keyToSend = customKeyInput === "••••••••••••••••••••••••" ? undefined : customKeyInput;

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: keyToSend,
          geminiModel: settings.geminiModel,
          simulationSpeed: settings.simulationSpeed,
          autoApprove: settings.autoApprove
        })
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        if (data.settings.hasCustomKey) {
          setCustomKeyInput("••••••••••••••••••••••••");
        } else {
          setCustomKeyInput("");
        }
        setShowSettingsModal(false);
        addLogEntry("SYSTEM", "SUCCESS", "[SETTINGS] Application settings synchronized successfully with the active environment.");
      } else {
        addLogEntry("SYSTEM", "ERROR", "Failed to preserve options on active environment.");
      }
    } catch {
      addLogEntry("SYSTEM", "ERROR", "Offline error trying to save options.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Sync log listings auto scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Synchronize playing dynamic subtitle loops when B-Roll/Avatar preview script exists and player is not active
  useEffect(() => {
    if (isPlaying) return; // Handed off to voice speech synthesis system for extreme precision
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
  }, [activeSession?.scriptText, isPlaying]);

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

  const stopPipeline = async () => {
    try {
      addLogEntry("SYSTEM", "WARNING", "[ABORT ACTION] Sending request to stop active book queue analysis pipeline.");
      const res = await fetch("/api/flow/stop", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBooks(data.books);
        setActiveSession(null);
        addLogEntry("SYSTEM", "SUCCESS", "[SYSTEM] Active orchestration pipeline stopped successfully.");
      } else {
        const err = await res.json();
        addLogEntry("SYSTEM", "ERROR", `Failed to stop pipeline: ${err.error || "Unknown error"}`);
      }
    } catch {
      addLogEntry("SYSTEM", "ERROR", "Offline error trying to stop pipeline.");
    }
  };

  const clearAllQueue = async () => {
    if (confirm("Are you sure you want to clear ALL books from the queue database? This cannot be undone.")) {
      try {
        setLogs([]);
        const res = await fetch("/api/books/clear", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setBooks(data.books);
          setSelectedBook(null);
          setActiveSession(null);
          addLogEntry("SQLITE_DB", "SUCCESS", "[SQLITE] All entries wiped out. Database queue is now empty.");
        }
      } catch {
        addLogEntry("SYSTEM", "ERROR", "Error clearing books queue.");
      }
    }
  };

  const deleteBook = async (e: React.MouseEvent, bookId: number) => {
    e.stopPropagation(); // Avoid triggering card selection onClick
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        setBooks(data.books);
        addLogEntry("SQLITE_DB", "SUCCESS", `[REMOVED] Tracked book ID ${bookId} removed.`);
        if (selectedBook?.id === bookId) {
          setSelectedBook(data.books[0] || null);
        }
      } else {
        const err = await res.json();
        addLogEntry("SYSTEM", "ERROR", `Failed to delete: ${err.error}`);
      }
    } catch {
      addLogEntry("SYSTEM", "ERROR", "Offline delete error.");
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
    <div className="h-screen flex flex-col bg-[#070a13] text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-300 overflow-hidden">
      
      {/* Decorative Top Accent Light Beam */}
      <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />

      {/* Primary Workspace Header */}
      <header className="shrink-0 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        
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
            <button
              id="tab-btn-analytics"
              onClick={() => setActiveTab("analytics")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md font-sans text-xs font-semibold tracking-wide uppercase transition-all ${
                activeTab === "analytics"
                  ? "bg-slate-800 text-emerald-400 font-bold shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Analytics</span>
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

          {/* Unified Simulation/Model Settings control */}
          <button
            id="btn-trigger-settings-modal"
            onClick={() => {
              fetchSettings();
              setShowSettingsModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800 text-slate-300 hover:text-emerald-400 transition-all text-xs font-semibold select-none cursor-pointer group"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400 group-hover:rotate-45 transition-transform duration-300" />
            <span className="font-sans uppercase text-[10px] tracking-wide">Settings</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-6 max-w-7xl w-full mx-auto flex-1 overflow-y-auto">
        
        {activeTab === "codebase" ? (
          <CodeViewer />
        ) : activeTab === "analytics" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Tokens Consumed Area Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    Total Tokens Consumed
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Aggregated LLM token usage across all crew runs.</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-emerald-400">{ANALYTICS_DATA.totalTokens.total}</div>
                  <div className="text-[10px] uppercase text-slate-500">Total Tokens</div>
                </div>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ANALYTICS_DATA.totalTokens.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="day" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val / 1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9', borderRadius: '8px' }}
                      itemStyle={{ color: '#10b981' }}
                    />
                    <Area type="monotone" dataKey="tokens" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorTokens)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Average Latency Bar Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col">
              <div className="mb-6">
                <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Average Latency (s)
                </h3>
                <p className="text-xs text-slate-500 mt-1">Stage compilation time averages.</p>
              </div>
              <div className="flex-1 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ANALYTICS_DATA.averageLatency.data} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={true} vertical={false} />
                    <XAxis type="number" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="stage" type="category" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{fill: '#1e293b', opacity: 0.4}}
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9', borderRadius: '8px' }}
                    />
                    <Bar dataKey="latency" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* YouTube Views Area Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-rose-500" />
                    YouTube Views
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Video performance metrics.</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-rose-500">{ANALYTICS_DATA.youtubeViews.total}</div>
                  <div className="text-[10px] uppercase text-slate-500">Total</div>
                </div>
              </div>
              <div className="flex-1 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ANALYTICS_DATA.youtubeViews.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="day" stroke="#475569" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#475569" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val / 1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f1f5f9', borderRadius: '8px' }}
                      itemStyle={{ color: '#f43f5e' }}
                    />
                    <Area type="monotone" dataKey="views" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorViews)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
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
                  
                  <div className="flex items-center gap-1.5">
                    {/* Clear Button */}
                    {books.length > 0 && (
                      <button
                        id="btn-clear-queue"
                        onClick={clearAllQueue}
                        className="p-1 px-2 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-rose-200 transition-all text-[10px] font-medium tracking-wider uppercase flex items-center gap-1"
                        title="Clear all books from queue"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    )}

                    {/* Plus Icon to Add Book */}
                    <button
                      id="btn-add-book-trigger"
                      onClick={() => setShowAddModal(true)}
                      className="p-1 px-2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-300 hover:text-emerald-200 transition-all text-[10px] font-medium tracking-wider uppercase flex items-center gap-1"
                      title="Register new Book PDF"
                    >
                      <Plus className="w-3" />
                      <span>Upload</span>
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                  Live connection to <code className="text-slate-300 font-mono">book_queue</code> SQLite table. Tracks individual chapters compiled and YouTube publication status.
                </p>

                {/* Queue Cards */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                  {books.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl px-4">
                      <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">Database queue is empty</p>
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="mt-3 text-[10px] uppercase font-bold text-emerald-400 hover:underline"
                      >
                        Click to upload your first book
                      </button>
                    </div>
                  ) : (
                    books.map((book) => {
                      const isSelected = selectedBook?.id === book.id;
                      const percent = getPercentage(book);
                      const history = book.progressHistory && book.progressHistory.length > 0 
                        ? book.progressHistory 
                        : [0, book.chaptersCompleted];
                      const chartData = history.map((val, idx) => ({
                        idx,
                        completed: val
                      }));
                      
                      return (
                        <div
                          key={book.id}
                          id={`book-queue-card-${book.id}`}
                          onClick={() => setSelectedBook(book)}
                          className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 relative group/card ${
                            isSelected
                              ? "bg-slate-800/60 border-emerald-500/40 shadow-md shadow-emerald-500/5"
                              : "bg-slate-900/60 border-slate-800 hover:bg-slate-900 hover:border-slate-700/80"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-sans font-semibold text-xs tracking-tight text-slate-200 truncate block">
                                {book.title}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Badge */}
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider font-semibold ${
                                book.status === "Completed" ? "bg-emerald-500/15 text-emerald-400" :
                                book.status === "Processing" ? "bg-blue-500/15 text-blue-400 animate-pulse" :
                                "bg-slate-800 text-slate-400"
                              }`}>
                                {book.status}
                              </span>

                              {/* Delete book individual target */}
                              <button
                                title={`Delete '${book.title}' from queue`}
                                onClick={(e) => deleteBook(e, book.id)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all opacity-80 sm:opacity-0 group-hover/card:opacity-100"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                        {/* Description snippet */}
                        <p className="text-[10px] text-slate-500 mt-1.5 leading-normal truncate">
                          {book.description}
                        </p>

                        {/* Mini Sparkline Chart */}
                        <div className="mt-2.5 h-7 w-full overflow-hidden bg-slate-950/40 rounded-lg border border-slate-800/40 p-0.5">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                              data={chartData}
                              margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
                            >
                              <defs>
                                <linearGradient id={`gradient-card-${book.id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={book.status === "Completed" ? "#10b981" : "#06b6d4"} stopOpacity={0.25}/>
                                  <stop offset="95%" stopColor={book.status === "Completed" ? "#10b981" : "#06b6d4"} stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <Area 
                                type="monotone" 
                                dataKey="completed" 
                                stroke={book.status === "Completed" ? "#10b981" : "#06b6d4"} 
                                strokeWidth={1.5}
                                fillOpacity={1}
                                fill={`url(#gradient-card-${book.id})`}
                                dot={{ r: 1.5, strokeWidth: 1, fill: book.status === "Completed" ? "#10b981" : "#06b6d4" }}
                                activeDot={{ r: 3 }}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>

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
                  }))}
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
                  activePreview ? (
                    <div className="flex-1 flex flex-col justify-between min-h-0 py-2">
                      <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 flex items-center justify-between mb-3 text-xs">
                        <div>
                          <span className="text-[10px] font-mono text-slate-500 uppercase">PREVIEWING CHAPTER COMPILATION:</span>
                          <div className="font-bold font-sans text-slate-200 text-xs truncate">Ch {activePreview.chapterNum} — {activePreview.bookTitle}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setActivePreview(null);
                            setIsPlaying(false);
                            setPlaybackTime(0);
                            setCurrentSpeechSentenceIdx(0);
                          }}
                          className="text-[10px] uppercase font-mono font-bold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                        >
                          [Close Player]
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 flex flex-col gap-3.5 overflow-y-auto pr-1">
                        {/* Audio-Video Studio Player View */}
                        {(() => {
                          const sentences = activePreview.scriptText.split(".").map(s => s.trim()).filter(Boolean);
                          const currentSentenceText = sentences[currentCaptionIdx] || activePreview.scriptText;
                          const eqBars = isPlaying ? [16, 28, 12, 35, 20, 42, 8, 24, 30, 15, 18, 32, 10, 26, 20, 35, 14, 28] : [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
                          return (
                            <div className="space-y-4">
                              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative aspect-video flex flex-col justify-end items-center group/player">
                                <video
                                  ref={videoRef}
                                  src={activePreview.bRollUrl}
                                  className="absolute inset-0 w-full h-full object-cover z-0 opacity-70"
                                  loop
                                  muted
                                  playsInline
                                />
                                {isPlaying && (
                                  <div className="absolute right-4 top-4 z-10 w-11 h-11 rounded-full border border-emerald-500/50 bg-emerald-500/10 backdrop-blur-sm flex items-center justify-center animate-pulse overflow-hidden">
                                    <span className="absolute inset-1 rounded-full border border-dashed border-emerald-500/30 animate-spin" />
                                    <Cpu className="w-5 h-5 text-emerald-400 animate-bounce" />
                                  </div>
                                )}
                                <div className="absolute top-3 left-3 z-10 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded px-2.5 py-1 text-[9px] font-mono text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                  <span>AV STUDIO PREVIEW: CHAPTER {activePreview.chapterNum}</span>
                                </div>
                                <div className="absolute top-10 left-3 z-10 bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 rounded px-2 py-1 text-[8px] font-mono text-slate-300 flex items-center gap-2 uppercase tracking-wide">
                                  <span>1080p</span>
                                  <span className="w-1 h-1 rounded-full bg-slate-500/50" />
                                  <span>AVC/H.264</span>
                                  <span className="w-1 h-1 rounded-full bg-slate-500/50" />
                                  <span>{(24.5 + activePreview.chapterNum * 2.1).toFixed(1)} MB</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setIsFullscreenCinema(true)}
                                  className="absolute top-3 right-3 z-10 bg-slate-900/80 hover:bg-slate-800 border border-slate-850 rounded p-1.5 text-slate-300 hover:text-emerald-400 cursor-pointer opacity-0 group-hover/player:opacity-100 transition-opacity"
                                  title="Open Cinema Mode"
                                >
                                  <Maximize2 className="w-3.5 h-3.5" />
                                </button>
                                {!isPlaying && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsPlaying(true);
                                      if (audioCtxRef.current?.state === "suspended") {
                                        audioCtxRef.current.resume();
                                      }
                                    }}
                                    className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-slate-900/90 border border-slate-705 text-emerald-400 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-10 hover:border-emerald-500/55 cursor-pointer shadow-lg"
                                  >
                                    <Play className="w-5 h-5 ml-0.5 fill-current" />
                                  </button>
                                )}
                                <div className="absolute bottom-4 left-3 right-3 z-10 bg-slate-950/85 backdrop-blur-md border border-slate-850 rounded-xl p-3 text-center min-h-[50px] flex items-center justify-center shadow-lg">
                                  <p className="text-[11px] font-sans text-slate-100 font-bold leading-normal tracking-wide select-text">
                                    {currentSentenceText}
                                  </p>
                                </div>
                              </div>

                              <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-3.5 space-y-3.5 select-none shadow">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-mono text-slate-500 w-6">
                                    0:{playbackTime.toFixed(0).padStart(2, '0')}
                                  </span>
                                  <input
                                    type="range"
                                    min="0"
                                    max={duration}
                                    step="0.1"
                                    value={playbackTime}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setPlaybackTime(val);
                                      if (sentences.length > 0) {
                                        const targetIdx = Math.min(sentences.length - 1, Math.floor((val / duration) * sentences.length));
                                        setCurrentSpeechSentenceIdx(targetIdx);
                                      }
                                    }}
                                    className="flex-1 accent-emerald-500 bg-slate-800 h-1 rounded-lg cursor-pointer focus:outline-none"
                                  />
                                  <span className="text-[9px] font-mono text-slate-500 w-6">
                                    0:{duration}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setIsPlaying(!isPlaying)}
                                      className="p-2 rounded-lg bg-slate-900 border border-slate-850 hover:border-emerald-500/40 text-emerald-400 transition-all cursor-pointer shadow"
                                      title={isPlaying ? "Pause summary" : "Play vocal short video representation"}
                                    >
                                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsPlaying(false);
                                        setPlaybackTime(0);
                                        setCurrentSpeechSentenceIdx(0);
                                      }}
                                      className="p-1 px-2.5 rounded-lg border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 text-[10px] uppercase font-mono cursor-pointer"
                                    >
                                      Restart
                                    </button>
                                    <select
                                      value={playbackRate}
                                      onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                                      className="bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 text-[10px] uppercase font-mono rounded-lg px-1 py-1 h-[26px] cursor-pointer focus:outline-none focus:border-emerald-500/50"
                                      title="Playback speed"
                                    >
                                      <option value={0.5}>0.5x</option>
                                      <option value={1}>1.0x</option>
                                      <option value={2}>2.0x</option>
                                    </select>
                                  </div>

                                  <div className="flex items-center gap-1 h-5 overflow-hidden w-20">
                                    {eqBars.map((h, i) => (
                                      <div
                                        key={i}
                                        className="w-1 bg-emerald-500/85 rounded transition-all duration-300"
                                        style={{ height: `${h}%` }}
                                      />
                                    ))}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSynthSoundTrack(!synthSoundTrack)}
                                      className={`p-1.5 rounded-lg border flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold transition-all cursor-pointer ${
                                        synthSoundTrack
                                          ? "bg-purple-500/15 border-purple-500/40 text-purple-400 font-bold"
                                          : "bg-slate-900/40 border-slate-855 text-slate-500 hover:text-slate-350"
                                      }`}
                                      title="Toggle atmospheric synthesizer chord"
                                    >
                                      <Music className="w-3.5 h-3.5" />
                                      <span>Synth Drone</span>
                                    </button>

                                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 rounded-lg px-2 py-1.5">
                                      <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                                      <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={volume}
                                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                                        className="w-12 bg-slate-800 accent-emerald-500 h-1 rounded cursor-pointer"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-900 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                                  <div className="flex items-center gap-1.5">
                                    <Radio className="w-3 h-3 text-emerald-400" />
                                    <span>Source: Standard Narrative synthesized voice</span>
                                  </div>
                                  <div>
                                    Sentences: <span className="text-slate-350 font-bold">{currentSpeechSentenceIdx + 1}/{sentences.length}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Interactive script draft content display */}
                        <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex-1 flex flex-col justify-between overflow-hidden min-h-[140px]">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block border-b border-slate-900 pb-1.5 mb-2 font-bold">Composed Script Text</span>
                          <div className="flex-grow overflow-y-auto max-h-[140px] text-[11px] font-mono text-slate-300 leading-relaxed pr-1 whitespace-pre-wrap select-text">
                            {activePreview.scriptText}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col justify-between min-h-0 my-4 select-none">
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-slate-805 rounded-xl bg-slate-950/20 my-1 overflow-y-auto max-h-[360px] scrollbar-thin">
                        <Clock className="w-8 h-8 text-slate-700 mb-2.5" />
                        <h4 className="text-xs font-sans font-bold text-slate-400 uppercase tracking-wide">
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

                            {/* Completed Chapter Media list indicators */}
                            {selectedBook.chaptersCompleted > 0 && (
                              <div className="mt-4 bg-slate-950/50 border border-slate-800/60 rounded-xl p-3 text-left">
                                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block mb-1.5 font-bold">🎬 PLAY COMPILATION SHORT:</span>
                                <div className="space-y-1 block max-h-[120px] overflow-y-auto pr-1">
                                  {Array.from({ length: selectedBook.chaptersCompleted }).map((_, idx) => {
                                    const chapNum = idx + 1;
                                    const scriptText = getCompletedChapterScript(selectedBook.title, chapNum);
                                    const bRollUrl = getChapterBRollUrl(selectedBook.title, chapNum);
                                    return (
                                      <button
                                        key={chapNum}
                                        type="button"
                                        onClick={() => {
                                          setActivePreview({
                                            bookTitle: selectedBook.title,
                                            chapterNum: chapNum,
                                            scriptText,
                                            bRollUrl,
                                            isLiveSession: false
                                          });
                                          setIsPlaying(true);
                                          setPlaybackTime(0);
                                          setCurrentSpeechSentenceIdx(0);
                                        }}
                                        className="w-full flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-850 hover:border-emerald-500/40 hover:bg-slate-800 text-left transition-all text-xs font-medium cursor-pointer group/line"
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <Tv className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                          <span className="truncate text-slate-350 group-hover/line:text-slate-150">Ch {chapNum} lecture video</span>
                                        </div>
                                        <Play className="w-3 h-3 text-slate-500 group-hover/line:text-emerald-400 fill-current" />
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            <button
                              id="trigger-pipeline-btn"
                              onClick={() => bootPipelineFlow(selectedBook.id)}
                              className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-95 text-slate-950 font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-lg"
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
                    </div>
                  )
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
                      
                      {activeSession.step === "MEDIA_SYNTHESIZER" || activeSession.step === "WAITING_APPROVAL" || activeSession.step === "PUBLISHING_ACTIVE" || activeSession.step === "PIPELINE_SUCCESS" ? (
                        activePreview ? (
                          (() => {
                            const sentences = activePreview.scriptText.split(".").map(s => s.trim()).filter(Boolean);
                            const currentSentenceText = sentences[currentCaptionIdx] || activePreview.scriptText;
                            const eqBars = isPlaying ? [16, 28, 12, 35, 20, 42, 8, 24, 30, 15, 18, 32, 10, 26, 20, 35, 14, 28] : [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
                            return (
                              <div className="space-y-4">
                                <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative aspect-video flex flex-col justify-end items-center group/player">
                                  <video
                                    ref={videoRef}
                                    src={activePreview.bRollUrl}
                                    className="absolute inset-0 w-full h-full object-cover z-0 opacity-70"
                                    loop
                                    muted
                                    playsInline
                                  />
                                  {isPlaying && (
                                    <div className="absolute right-4 top-4 z-10 w-11 h-11 rounded-full border border-emerald-500/50 bg-emerald-500/10 backdrop-blur-sm flex items-center justify-center animate-pulse overflow-hidden">
                                      <span className="absolute inset-1 rounded-full border border-dashed border-emerald-500/30 animate-spin" />
                                      <Cpu className="w-5 h-5 text-emerald-400 animate-bounce" />
                                    </div>
                                  )}
                                  <div className="absolute top-3 left-3 z-10 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded px-2.5 py-1 text-[9px] font-mono text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                    <span>AV STUDIO PREVIEW: CHAPTER {activePreview.chapterNum}</span>
                                  </div>
                                  <div className="absolute top-10 left-3 z-10 bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 rounded px-2 py-1 text-[8px] font-mono text-slate-300 flex items-center gap-2 uppercase tracking-wide">
                                    <span>1080p</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-500/50" />
                                    <span>AVC/H.264</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-500/50" />
                                    <span>{(24.5 + activePreview.chapterNum * 2.1).toFixed(1)} MB</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setIsFullscreenCinema(true)}
                                    className="absolute top-3 right-3 z-10 bg-slate-900/80 hover:bg-slate-800 border border-slate-850 rounded p-1.5 text-slate-300 hover:text-emerald-400 cursor-pointer opacity-0 group-hover/player:opacity-100 transition-opacity"
                                    title="Open Cinema Mode"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5" />
                                  </button>
                                  {!isPlaying && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsPlaying(true);
                                        if (audioCtxRef.current?.state === "suspended") {
                                          audioCtxRef.current.resume();
                                        }
                                      }}
                                      className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-slate-900/90 border border-slate-705 text-emerald-400 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-10 hover:border-emerald-500/55 cursor-pointer shadow-lg"
                                    >
                                      <Play className="w-5 h-5 ml-0.5 fill-current" />
                                    </button>
                                  )}
                                  <div className="absolute bottom-4 left-3 right-3 z-10 bg-slate-950/85 backdrop-blur-md border border-slate-850 rounded-xl p-3 text-center min-h-[50px] flex items-center justify-center shadow-lg">
                                    <p className="text-[11px] font-sans text-slate-100 font-bold leading-normal tracking-wide select-text">
                                      {currentSentenceText}
                                    </p>
                                  </div>
                                </div>

                                <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-3.5 space-y-3.5 select-none shadow">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-mono text-slate-500 w-6">
                                      0:{playbackTime.toFixed(0).padStart(2, '0')}
                                    </span>
                                    <input
                                      type="range"
                                      min="0"
                                      max={duration}
                                      step="0.1"
                                      value={playbackTime}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setPlaybackTime(val);
                                        if (sentences.length > 0) {
                                          const targetIdx = Math.min(sentences.length - 1, Math.floor((val / duration) * sentences.length));
                                          setCurrentSpeechSentenceIdx(targetIdx);
                                        }
                                      }}
                                      className="flex-1 accent-emerald-500 bg-slate-800 h-1 rounded-lg cursor-pointer focus:outline-none"
                                    />
                                    <span className="text-[9px] font-mono text-slate-500 w-6">
                                      0:{duration}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setIsPlaying(!isPlaying)}
                                        className="p-2 rounded-lg bg-slate-900 border border-slate-850 hover:border-emerald-500/40 text-emerald-400 transition-all cursor-pointer shadow"
                                        title={isPlaying ? "Pause summary" : "Play vocal short video representation"}
                                      >
                                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setIsPlaying(false);
                                          setPlaybackTime(0);
                                          setCurrentSpeechSentenceIdx(0);
                                        }}
                                        className="p-1 px-2.5 rounded-lg border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 text-[10px] uppercase font-mono cursor-pointer"
                                      >
                                        Restart
                                      </button>
                                      <select
                                        value={playbackRate}
                                        onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                                        className="bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 text-[10px] uppercase font-mono rounded-lg px-1 py-1 h-[26px] cursor-pointer focus:outline-none focus:border-emerald-500/50"
                                        title="Playback speed"
                                      >
                                        <option value={0.5}>0.5x</option>
                                        <option value={1}>1.0x</option>
                                        <option value={2}>2.0x</option>
                                      </select>
                                    </div>

                                    <div className="flex items-center gap-1 h-5 overflow-hidden w-20">
                                      {eqBars.map((h, i) => (
                                        <div
                                          key={i}
                                          className="w-1 bg-emerald-500/85 rounded transition-all duration-300"
                                          style={{ height: `${h}%` }}
                                        />
                                      ))}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSynthSoundTrack(!synthSoundTrack)}
                                        className={`p-1.5 rounded-lg border flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold transition-all cursor-pointer ${
                                          synthSoundTrack
                                            ? "bg-purple-500/15 border-purple-500/40 text-purple-400 font-bold"
                                            : "bg-slate-900/40 border-slate-855 text-slate-500 hover:text-slate-350"
                                        }`}
                                        title="Toggle atmospheric synthesizer chord"
                                      >
                                        <Music className="w-3.5 h-3.5" />
                                        <span>Synth Drone</span>
                                      </button>

                                      <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 rounded-lg px-2 py-1.5">
                                        <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                                        <input
                                          type="range"
                                          min="0"
                                          max="1"
                                          step="0.05"
                                          value={volume}
                                          onChange={(e) => setVolume(parseFloat(e.target.value))}
                                          className="w-12 bg-slate-800 accent-emerald-500 h-1 rounded cursor-pointer"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-900 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                                    <div className="flex items-center gap-1.5">
                                      <Radio className="w-3 h-3 text-emerald-400" />
                                      <span>Source: Standard Narrative synthesized voice</span>
                                    </div>
                                    <div>
                                      Sentences: <span className="text-slate-350 font-bold">{currentSpeechSentenceIdx + 1}/{sentences.length}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="bg-slate-950 px-4 py-8 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center">
                            <span className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2.5 animate-pulse">
                              <Cpu className="w-5 h-5" />
                            </span>
                            <span className="text-xs font-semibold text-slate-300">Formulating Narrative & Media Layout...</span>
                            <span className="text-[10px] text-slate-500 mt-1 font-mono">CrewAI Agent Workflow processing content</span>
                          </div>
                        )
                      ) : (
                        <div className="bg-slate-950 px-4 py-8 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center">
                          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mb-2.5" />
                          <span className="text-xs font-semibold text-slate-300">Reading PDF Textbook Contents...</span>
                          <span className="text-[10px] text-slate-500 mt-1 font-mono">Current state: {activeSession.step}</span>
                        </div>
                      )}

                      {/* Interactive script draft content display */}
                      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex-1 flex flex-col justify-between overflow-hidden min-h-[120px]">
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block border-b border-slate-900 pb-1.5 mb-2 font-bold">Copyright Safe Script</span>
                        <div className="flex-grow overflow-y-auto max-h-[140px] text-[11px] font-mono text-slate-300 leading-relaxed pr-1 whitespace-pre-wrap select-text">
                          {activeSession.scriptText ? (
                            activeSession.scriptText
                          ) : (
                            <span className="text-slate-600 italic">Formulating narrative scripts via CrewAI...</span>
                          )}
                        </div>
                      </div>

                    </div>                    {/* Approval Action controllers block */}
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

                          <button
                            id="abort-pipeline-waiting-btn"
                            onClick={stopPipeline}
                            className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 text-rose-300/90 hover:text-rose-200 transition-all font-sans text-xs font-semibold uppercase rounded-lg cursor-pointer"
                          >
                            <span>Abort Pipeline Run</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-center gap-2 p-3 bg-slate-950 rounded-xl border border-slate-900 text-center text-slate-505 text-[10px] font-mono uppercase tracking-wider select-none">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                            <span className="text-slate-400">Pipeline iterating: <span className="text-emerald-400">{activeSession.step}</span></span>
                          </div>

                          <button
                            id="abort-pipeline-iterating-btn"
                            onClick={stopPipeline}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-200 hover:text-rose-100 transition-all font-sans text-xs font-bold uppercase rounded-lg cursor-pointer"
                          >
                            <span>Stop / Abort Pipeline</span>
                          </button>
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

      {/* MODAL WINDOW: SETTINGS CONFIGURATIONS */}
      {showSettingsModal && (
        <div id="settings-modal-overlay" className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-slate-950 border-b border-slate-800 px-5 py-3.5 flex justify-between items-center">
              <h4 className="font-sans font-bold text-xs uppercase text-slate-200 tracking-widest flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-400 rotate-45" />
                <span>Workspace Orchestration Settings</span>
              </h4>
              <button 
                id="btn-close-settings"
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white font-mono text-xs cursor-pointer p-1 uppercase"
              >
                Close
              </button>
            </div>

            <form onSubmit={saveSettings} className="p-5 space-y-4">
              {/* API KEY ROW */}
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Google Gemini API Key
                </label>
                <div className="relative">
                  <input
                    id="input-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={customKeyInput}
                    onChange={(e) => setCustomKeyInput(e.target.value)}
                    placeholder="Enter custom key (or leave empty for environment default)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3 pr-10 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 animate-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-305"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {settings.hasDefaultKey && !settings.hasCustomKey && (
                  <p className="text-[10px] text-emerald-500/85 mt-1.5 font-mono">
                    ✓ Google AI Studio fallback key detected and loaded.
                  </p>
                )}
                {settings.hasCustomKey && (
                  <p className="text-[10px] text-cyan-400 mt-1.5 flex items-center gap-1 font-mono">
                    <span>✓ Custom user-provided key is active.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomKeyInput("");
                      }}
                      className="text-[10px] text-rose-450 hover:underline uppercase font-bold ml-1 cursor-pointer font-bold"
                    >
                      [Clear]
                    </button>
                  </p>
                )}
              </div>

              {/* MODEL ROW */}
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1.5">
                  Gemini Model Choice
                </label>
                <select
                  id="select-gemini-model"
                  value={settings.geminiModel}
                  onChange={(e) => setSettings({ ...settings, geminiModel: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Default - Efficient)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep Reasoning)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy Standard)</option>
                  <option value="gemini-3.5-flash">Gemini 3.5 Flash (Preview)</option>
                </select>
              </div>
              
              {/* AUTO-APPROVE (AUTO AUDIT BYPASS) */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <div className="pr-3">
                  <label className="block text-[10px] font-mono text-slate-350 uppercase tracking-wider font-bold">
                    Auto-Approve Pipeline
                  </label>
                  <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                    By-pass wait state and auto-commit generated reviews.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, autoApprove: !settings.autoApprove })}
                  className={`w-11 h-6 rounded-full p-1 transition-all duration-300 cursor-pointer ${
                    settings.autoApprove ? "bg-emerald-500" : "bg-slate-800"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-slate-900 rounded-full transition-all duration-300 transform ${
                      settings.autoApprove ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-2 text-slate-400 hover:text-slate-300 border border-slate-800 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="submit-settings-btn"
                  type="submit"
                  disabled={isSavingSettings}
                  className="flex-1 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-sans font-bold text-xs uppercase tracking-wider rounded-lg cursor-pointer transition-all disabled:opacity-50"
                >
                  {isSavingSettings ? "Saving..." : "Commit Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isFullscreenCinema && activePreview && (
        <div id="cinema-preview-modal" className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex flex-col justify-center items-center p-6 transition-all duration-300">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest block font-bold">CINEMA PREVIEW MODE</span>
                <h4 className="text-xs font-sans font-extrabold text-slate-200 uppercase mt-0.5">
                  {activePreview.bookTitle} — Chapter {activePreview.chapterNum} Media Draft
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsFullscreenCinema(false)}
                className="p-1 px-3 bg-slate-805 hover:bg-slate-75 * hover:text-white text-slate-400 text-xs font-mono rounded-lg transition-all uppercase cursor-pointer border border-slate-750"
              >
                Exit Cinema
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-70px)] pr-4">
              {/* Audio-Video Studio Player View (reused in cinema layout) */}
              {(() => {
                const sentences = activePreview.scriptText.split(".").map(s => s.trim()).filter(Boolean);
                const currentSentenceText = sentences[currentCaptionIdx] || activePreview.scriptText;
                const eqBars = isPlaying ? [16, 28, 12, 35, 20, 42, 8, 24, 30, 15, 18, 32, 10, 26, 20, 35, 14, 28] : [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
                return (
                  <div className="space-y-4">
                    <div className="bg-slate-950 border border-slate-850 rounded-xl overflow-hidden shadow-2xl relative aspect-video flex flex-col justify-end items-center">
                      <video
                        ref={videoRef}
                        src={activePreview.bRollUrl}
                        className="absolute inset-0 w-full h-full object-cover z-0 opacity-70"
                        loop
                        muted
                        playsInline
                      />
                      {isPlaying && (
                        <div className="absolute right-4 top-4 z-10 w-11 h-11 rounded-full border border-emerald-500/50 bg-emerald-500/10 backdrop-blur-sm flex items-center justify-center animate-pulse overflow-hidden">
                          <span className="absolute inset-1 rounded-full border border-dashed border-emerald-500/30 animate-spin" />
                          <Cpu className="w-5 h-5 text-emerald-400 animate-bounce" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3 z-10 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded px-2.5 py-1 text-[9px] font-mono text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                        <span>AV STUDIO PREVIEW: CHAPTER {activePreview.chapterNum}</span>
                      </div>
                      <div className="absolute top-10 left-3 z-10 bg-slate-900/60 backdrop-blur-sm border border-slate-800/50 rounded px-2 py-1 text-[8px] font-mono text-slate-300 flex items-center gap-2 uppercase tracking-wide">
                        <span>1080p</span>
                        <span className="w-1 h-1 rounded-full bg-slate-500/50" />
                        <span>AVC/H.264</span>
                        <span className="w-1 h-1 rounded-full bg-slate-500/50" />
                        <span>{(24.5 + activePreview.chapterNum * 2.1).toFixed(1)} MB</span>
                      </div>
                      {!isPlaying && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(true);
                            if (audioCtxRef.current?.state === "suspended") {
                              audioCtxRef.current.resume();
                            }
                          }}
                          className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-slate-900/90 border border-slate-705 text-emerald-400 flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-10 hover:border-emerald-500/55 cursor-pointer shadow-lg"
                        >
                          <Play className="w-5 h-5 ml-0.5 fill-current" />
                        </button>
                      )}
                      <div className="absolute bottom-4 left-3 right-3 z-10 bg-slate-950/85 backdrop-blur-md border border-slate-850 rounded-xl p-3 text-center min-h-[50px] flex items-center justify-center shadow-lg">
                        <p className="text-xs sm:text-sm font-sans text-slate-100 font-bold leading-normal tracking-wide select-text">
                          {currentSentenceText}
                        </p>
                      </div>
                    </div>

                    <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-3.5 space-y-3.5 select-none shadow">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-slate-500 w-6">
                          0:{playbackTime.toFixed(0).padStart(2, '0')}
                        </span>
                        <input
                          type="range"
                          min="0"
                          max={duration}
                          step="0.1"
                          value={playbackTime}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setPlaybackTime(val);
                            if (sentences.length > 0) {
                              const targetIdx = Math.min(sentences.length - 1, Math.floor((val / duration) * sentences.length));
                              setCurrentSpeechSentenceIdx(targetIdx);
                            }
                          }}
                          className="flex-1 accent-emerald-500 bg-slate-800 h-1 rounded-lg cursor-pointer focus:outline-none"
                        />
                        <span className="text-[9px] font-mono text-slate-500 w-6">
                          0:{duration}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="p-2 rounded-lg bg-slate-900 border border-slate-850 hover:border-emerald-500/40 text-emerald-400 transition-all cursor-pointer shadow"
                          >
                            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsPlaying(false);
                              setPlaybackTime(0);
                              setCurrentSpeechSentenceIdx(0);
                            }}
                            className="p-1 px-2.5 rounded-lg border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 text-[10px] uppercase font-mono cursor-pointer"
                          >
                            Restart
                          </button>
                          <select
                            value={playbackRate}
                            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                            className="bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 text-[10px] uppercase font-mono rounded-lg px-1 py-1 h-[26px] cursor-pointer focus:outline-none focus:border-emerald-500/50"
                            title="Playback speed"
                          >
                            <option value={0.5}>0.5x</option>
                            <option value={1}>1.0x</option>
                            <option value={2}>2.0x</option>
                          </select>
                        </div>

                        <div className="flex items-center gap-1 h-5 overflow-hidden w-20">
                          {eqBars.map((h, i) => (
                            <div
                              key={i}
                              className="w-1 bg-emerald-500/85 rounded transition-all duration-300"
                              style={{ height: `${h}%` }}
                            />
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSynthSoundTrack(!synthSoundTrack)}
                            className={`p-1.5 rounded-lg border flex items-center gap-1.5 text-[10px] uppercase font-mono font-bold transition-all cursor-pointer ${
                              synthSoundTrack
                                ? "bg-purple-500/15 border-purple-500/40 text-purple-400 font-bold"
                                : "bg-slate-900/40 border-slate-855 text-slate-500 hover:text-slate-350"
                            }`}
                          >
                            <Music className="w-3.5 h-3.5" />
                            <span>Synth Drone</span>
                          </button>

                          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 rounded-lg px-2 py-1.5">
                            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={volume}
                              onChange={(e) => setVolume(parseFloat(e.target.value))}
                              className="w-12 bg-slate-800 accent-emerald-500 h-1 rounded cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 space-y-2 select-text text-left">
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block font-bold">Narration Commentary Script:</span>
                <p className="text-xs text-slate-300 font-mono leading-relaxed max-h-[140px] overflow-y-auto pr-1">
                  {activePreview.scriptText}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Status Bar */}
      <footer className="mt-auto shrink-0 border-t border-slate-800 bg-slate-950 px-4 py-2 flex items-center justify-between text-[10px] font-mono select-none">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase tracking-widest">System Status</span>
          </div>
          <div className="h-3 w-[1px] bg-slate-800"></div>
          <div className="flex items-center gap-2 text-slate-300 uppercase tracking-widest">
            <span className="text-slate-500">Gemini Pro API:</span>
            {(settings.hasCustomKey || settings.hasDefaultKey) ? (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-rose-500">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                Key Missing
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-slate-500 uppercase tracking-widest">
          <span>Engine: CrewAI Pipeline</span>
          <div className="h-3 w-[1px] bg-slate-800"></div>
          <span>Model: Gemini Pro</span>
        </div>
      </footer>

    </div>
  );
}

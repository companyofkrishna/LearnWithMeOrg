import React, { useState, useEffect, useRef } from "react";
import { Terminal, Settings, CheckCircle, Clock, AlertTriangle, Play, FileText, Database } from "lucide-react";

interface LogEvent {
  feature: string;
  status: string;
  message: string;
  payload?: any;
}

export default function App() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [rawText, setRawText] = useState<string>("");
  const [finalScript, setFinalScript] = useState<string>("");
  const [wsStatus, setWsStatus] = useState("DISCONNECTED");
  const [showSettings, setShowSettings] = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);
  
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");

  const ws = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connectWebSocket();
    fetchSettings();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      if (data.hasGemini) setGeminiKey("••••••••••••••••");
      if (data.hasOpenAI) setOpenaiKey("••••••••••••••••");
    } catch (e) {
      console.warn("Could not fetch settings. Python backend may be offline.");
    }
  };

  const saveSettings = async () => {
    try {
      await fetch("http://localhost:8000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          geminiKey: geminiKey === "••••••••••••••••" ? null : geminiKey,
          openaiKey: openaiKey === "••••••••••••••••" ? null : openaiKey
        })
      });
      setShowSettings(false);
    } catch (e) {
      console.warn("Could not save settings. Python backend may be offline.");
      setShowSettings(false);
    }
  };

  const connectWebSocket = () => {
    ws.current = new WebSocket("ws://localhost:8000/ws");
    ws.current.onopen = () => setWsStatus("CONNECTED");
    ws.current.onclose = () => {
      setWsStatus("DISCONNECTED");
      setTimeout(connectWebSocket, 3000);
    };
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "TELEMETRY") {
        setLogs(prev => [...prev, data]);
        if (data.payload?.rawText) setRawText(data.payload.rawText);
        if (data.payload?.script) setFinalScript(data.payload.script);
        if (data.feature === "HUMAN_GATE" && data.status === "WAITING") setIsWaitingApproval(true);
        if (data.feature === "HUMAN_GATE" && data.status === "VERIFIED SUCCESS") setIsWaitingApproval(false);
      }
    };
  };

  const startPipeline = async () => {
    setLogs([]); setRawText(""); setFinalScript(""); setIsWaitingApproval(false);
    try {
      const res = await fetch("http://localhost:8000/api/flow/run", { method: "POST" });
      const data = await res.json();
      if (data.error) alert(data.error);
    } catch (e) {
      alert("Failed to start pipeline. Is the Python backend running on port 8000?");
    }
  };

  const approvePipeline = async () => {
    try {
      await fetch("http://localhost:8000/api/flow/approve", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "EXECUTING") return "text-amber-400 animate-pulse";
    if (status === "VERIFIED SUCCESS") return "text-emerald-400 font-bold";
    if (status === "FAILED") return "text-rose-500 font-bold";
    if (status === "WAITING") return "text-cyan-400 animate-pulse";
    return "text-slate-500";
  };

  return (
    <div className="h-screen w-screen bg-[#070a13] text-slate-100 flex flex-col overflow-hidden font-sans">
      
      {/* HEADER */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-10 relative">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-emerald-500" />
          <h1 className="font-bold text-sm uppercase tracking-widest text-slate-200">The Open Syllabus Engine</h1>
          <span className={`text-[10px] px-2 py-0.5 rounded border font-mono ${wsStatus === 'CONNECTED' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
            Backend: {wsStatus}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-emerald-400 transition-colors uppercase tracking-wider">
            <Settings className="w-4 h-4" /> API Settings
          </button>
          <button onClick={startPipeline} className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold uppercase rounded transition-colors shadow-lg shadow-emerald-500/20">
            <Play className="w-4 h-4" /> Run Folder Scan
          </button>
        </div>
      </header>

      {/* SPLIT SCREEN WORKSPACE */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANE: Raw Data & Script Inspector */}
        <div className="w-1/2 border-r border-slate-800 flex flex-col bg-slate-900/40 min-w-0">
          <div className="h-8 bg-slate-950 flex items-center px-4 border-b border-slate-800 shrink-0">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Left Pane: Payload Inspector</span>
          </div>
          
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden min-h-0">
            {/* Raw Text Window */}
            <div className="flex-1 flex flex-col border border-slate-800 rounded bg-slate-950 overflow-hidden min-h-0">
              <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center gap-2 shrink-0">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase">1. Raw PDF Extraction (PyMuPDF)</span>
              </div>
              <div className="flex-1 p-3 overflow-y-auto text-[11px] font-mono text-slate-400 leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30">
                {rawText || "Waiting for PDF scan engine..."}
              </div>
            </div>

            {/* Final Script Window */}
            <div className="flex-1 flex flex-col border border-slate-800 rounded bg-slate-950 overflow-hidden relative min-h-0">
              <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center gap-2 shrink-0">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase">2. Generated Output Script (CrewAI)</span>
              </div>
              <div className="flex-1 p-3 overflow-y-auto text-xs font-serif text-slate-200 leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30">
                {finalScript || "Waiting for Scholar & Scriptwriter agents..."}
              </div>

              {/* HUMAN GATEWAY OVERLAY */}
              {isWaitingApproval && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
                  <AlertTriangle className="w-10 h-10 text-amber-400 mb-3 animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-2">Human Approval Required</h3>
                  <p className="text-xs text-slate-400 mb-6 max-w-md">The script has been generated and copyright-verified. Review the text above. Do you wish to proceed to media rendering and YouTube compilation?</p>
                  <button onClick={approvePipeline} className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 text-xs font-bold uppercase tracking-wider rounded shadow-lg shadow-emerald-500/20 transition-all">
                    Proceed to Media Synthesis
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Feature Matrix & Telemetry */}
        <div className="w-1/2 flex flex-col bg-slate-900/20 min-w-0">
          <div className="h-8 bg-slate-950 flex items-center px-4 border-b border-slate-800 shrink-0">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Right Pane: Diagnostic Telemetry</span>
          </div>

          <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden min-h-0">
            {/* Live Log Stream */}
            <div className="flex-1 flex flex-col border border-slate-800 rounded bg-slate-950 overflow-hidden min-h-0">
              <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center gap-2 shrink-0">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] font-bold text-slate-300 uppercase">Execution Console</span>
              </div>
              <div className="flex-1 p-3 overflow-y-auto text-[11px] font-mono space-y-2">
                {logs.length === 0 ? (
                  <span className="text-slate-600">System idle. Ready to parse PDF.</span>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="flex flex-col border-l-2 border-slate-800 pl-2 py-0.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-cyan-400 font-bold">[{log.feature}]</span>
                        <span className={`font-bold uppercase ${getStatusColor(log.status)}`}>[{log.status}]</span>
                      </div>
                      <span className="text-slate-300 break-words">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 w-[400px]">
            <h2 className="text-sm font-bold uppercase tracking-widest mb-4 text-emerald-400">API Configurations</h2>
            
            <label className="block text-[10px] text-slate-400 uppercase mb-1">Google Gemini Key</label>
            <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded px-3 py-2 mb-4 text-xs focus:border-emerald-500 outline-none" />

            <label className="block text-[10px] text-slate-400 uppercase mb-1">OpenAI Key (Optional)</label>
            <input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded px-3 py-2 mb-6 text-xs focus:border-emerald-500 outline-none" />

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200">CANCEL</button>
              <button onClick={saveSettings} className="px-4 py-2 bg-emerald-500 text-slate-950 text-xs font-bold rounded">SAVE KEYS</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


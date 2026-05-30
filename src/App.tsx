import React, { useState, useRef, useEffect } from "react";
import { Play, Square, FileText, CheckCircle2, Circle, AlertCircle, RefreshCw, Cpu, Activity } from "lucide-react";

interface VerificationStep {
  id: string;
  label: string;
  state: "NOT_STARTED" | "EXECUTING" | "VERIFIED_SUCCESS" | "FAILED";
  log: string | null;
}

const INITIAL_STEPS: VerificationStep[] = [
  { id: "PDF_ENGINE", label: "[PDF_ENGINE] Document parsing and metadata extraction", state: "NOT_STARTED", log: null },
  { id: "GEMINI_CONTEXT_CACHE", label: "[GEMINI_CONTEXT_CACHE] Large-scale token cache initialization", state: "NOT_STARTED", log: null },
  { id: "SCHOLAR_AGENT", label: "[SCHOLAR_AGENT] Concept mapping and educational synthesis", state: "NOT_STARTED", log: null },
  { id: "SCRIPTWRITER", label: "[SCRIPTWRITER] Fair-use script adaptation and structuring", state: "NOT_STARTED", log: null },
  { id: "COPYRIGHT_CHECK", label: "[COPYRIGHT_CHECK] Plagiarism vector and fair-use validation", state: "NOT_STARTED", log: null },
  { id: "MEDIA_SYNTH_ENGINE", label: "[MEDIA_SYNTH_ENGINE] Voiceover & stock B-roll rendering", state: "NOT_STARTED", log: null },
  { id: "YOUTUBE_PUBLISHER", label: "[YOUTUBE_OAUTH_&_PUBLISHER] Platform deployment routine", state: "NOT_STARTED", log: null },
];

export default function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [steps, setSteps] = useState<VerificationStep[]>(INITIAL_STEPS);
  const [rawTextOutput, setRawTextOutput] = useState<string>("");
  const [finalScriptOutput, setFinalScriptOutput] = useState<string>("");
  
  const processRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (processRef.current) clearTimeout(processRef.current);
    };
  }, []);

  const startProcessing = () => {
    setIsProcessing(true);
    setSteps(INITIAL_STEPS);
    setRawTextOutput("");
    setFinalScriptOutput("");
    executeStep(0);
  };

  const executeStep = (stepIndex: number) => {
    if (stepIndex >= INITIAL_STEPS.length) {
      setIsProcessing(false);
      return;
    }

    setSteps(prev => prev.map((s, idx) => 
      idx === stepIndex ? { ...s, state: "EXECUTING" } : s
    ));

    const stepId = INITIAL_STEPS[stepIndex].id;

    setTimeout(() => {
      let nextLog = "";
      
      switch (stepId) {
        case "PDF_ENGINE":
          nextLog = "VERIFIED: Read 342 pages. Computed boundaries. Raw buffer stream captured (23,401 bytes).";
          setRawTextOutput("> INITIATING PDF BYTE STREAM EXTRACT...\n\nChapter 1\nThe fundamental architecture of AI requires a structured systemic approach to cognitive loading. In this section we explore standard mechanisms of retrieval augmented generation.\n\n[PAGE END]\n\nChapter 2\nBuilding robust telemetry ensures deep visibility into orchestrator pipelines.");
          break;
        case "GEMINI_CONTEXT_CACHE":
          nextLog = "VERIFIED: Cache ID [cch-9a8x-001] active. Sent 154,203 tokens. TTL set to 1800s.";
          break;
        case "SCHOLAR_AGENT":
          nextLog = "VERIFIED: Telemetry Latency: 1.4s. Thesis construct identified perfectly.";
          break;
        case "SCRIPTWRITER":
          nextLog = "VERIFIED: Response generated in 2.1s. Hooks optimized for video engagement.";
          setFinalScriptOutput("Welcome back to the Deep Dive.\n\nToday we are exploring the fundamental architecture of AI cognitive systems. Let's break down Chapter 1.\n\nAt its core, a system is only as strong as its context window and retrieval systems.");
          break;
        case "COPYRIGHT_CHECK":
          nextLog = "VERIFIED: Plagiarism delta: 1.2%. Content strictly within transformative fair-use guidelines.";
          break;
        case "MEDIA_SYNTH_ENGINE":
          nextLog = "VERIFIED: Audio track [vo_001.mp3] linked. Stock video path [/assets/broll_12.mp4] cached. Render sequence locked.";
          break;
        case "YOUTUBE_PUBLISHER":
          nextLog = "VERIFIED: Auth tokens valid. Appended to playlist 'AI Architecture'. URL mapping complete: https://youtu.be/xxx_yyy_zzz.";
          break;
      }

      setSteps(prev => prev.map((s, idx) => 
        idx === stepIndex ? { ...s, state: "VERIFIED_SUCCESS", log: nextLog } : s
      ));

      processRef.current = setTimeout(() => {
        executeStep(stepIndex + 1);
      }, 1500);

    }, 2000);
  };

  const stopProcessing = () => {
    setIsProcessing(false);
    if (processRef.current) {
      clearTimeout(processRef.current);
    }
    setSteps(prev => prev.map(s => 
      s.state === "EXECUTING" ? { ...s, state: "FAILED", log: "ABORTED BY USER" } : s
    ));
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <header className="shrink-0 h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-6 z-10 relative shadow-sm">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-emerald-400" />
          <h1 className="font-bold text-sm tracking-widest uppercase text-slate-200">
            Intelligent Media Pipeline
          </h1>
          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
            SYSTEM_UPTIME: 99.9%
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {!isProcessing ? (
             <button 
                onClick={startProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded font-bold uppercase tracking-wider text-xs transition-colors"
             >
                <Play className="w-4 h-4" />
                Initialize Pipeline
             </button>
          ) : (
             <button 
                onClick={stopProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded font-bold uppercase tracking-wider text-xs transition-colors"
             >
                <Square className="w-4 h-4 fill-current flex-shrink-0" />
                Halt Execution
             </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-1/2 flex flex-col border-r border-slate-800 bg-[#0b0e14]">
          <div className="shrink-0 h-10 border-b border-slate-800 flex items-center px-4 bg-slate-900/50">
            <FileText className="w-4 h-4 text-emerald-500 mr-2" />
            <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">
              Script Inspector Window
            </h2>
          </div>
          
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            <div className="flex-1 flex flex-col min-h-0">
              <label className="text-[10px] text-slate-500 font-mono tracking-wider mb-2 uppercase">
                // RAW_PDF_BUFFER_STREAM
              </label>
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded p-4 font-mono text-xs text-slate-400 overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                {rawTextOutput || "Awaiting generic document extraction sequence..."}
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0">
              <label className="text-[10px] text-slate-500 font-mono tracking-wider mb-2 uppercase border-t border-slate-800/50 pt-4">
                 // COMPILED_FINAL_SCRIPT_OUTPUT
              </label>
              <div className="flex-1 bg-slate-900/60 border border-emerald-500/20 rounded p-4 font-serif text-sm text-slate-200 overflow-y-auto whitespace-pre-wrap leading-loose shadow-inner">
                {finalScriptOutput || "Awaiting semantic orchestration output..."}
              </div>
            </div>
          </div>
        </div>

        <div className="w-1/2 flex flex-col bg-[#070a13]">
           <div className="shrink-0 h-10 border-b border-slate-800 flex items-center px-4 bg-slate-900/50 justify-between">
              <div className="flex items-center gap-2">
                 <Activity className="w-4 h-4 text-emerald-500" />
                 <h2 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                    Feature Verification Matrix
                 </h2>
              </div>
              {isProcessing && (
                 <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-emerald-400">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                    SYSTEM ACTIVE
                 </span>
              )}
           </div>

           <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {steps.map((step) => {
                 let Icon = Circle;
                 let borderClass = "border-slate-800";
                 let bgClass = "bg-slate-950/50";
                 let textClass = "text-slate-400";
                 
                 if (step.state === "EXECUTING") {
                    Icon = RefreshCw;
                    borderClass = "border-amber-500/50";
                    bgClass = "bg-amber-500/5";
                    textClass = "text-amber-500";
                 } else if (step.state === "VERIFIED_SUCCESS") {
                    Icon = CheckCircle2;
                    borderClass = "border-emerald-500/30";
                    bgClass = "bg-emerald-500/5";
                    textClass = "text-emerald-400";
                 } else if (step.state === "FAILED") {
                    Icon = AlertCircle;
                    borderClass = "border-rose-500/50";
                    bgClass = "bg-rose-500/5";
                    textClass = "text-rose-400";
                 }

                 return (
                    <div key={step.id} className={`p-4 rounded-lg border flex flex-col gap-3 transition-colors duration-300 ${borderClass} ${bgClass}`}>
                       <div className="flex items-center justify-between">
                          <h3 className="font-mono text-xs font-bold tracking-widest uppercase text-slate-200">
                             {step.label}
                          </h3>
                          <div className={`flex items-center gap-1.5 font-mono text-[10px] tracking-wider uppercase font-bold ${textClass}`}>
                             {step.state === "EXECUTING" && <Icon className="w-3.5 h-3.5 animate-spin" />}
                             {step.state !== "EXECUTING" && <Icon className="w-3.5 h-3.5" />}
                             {step.state.replace("_", " ")}
                          </div>
                       </div>
                       
                       <div className="bg-black/40 rounded p-2.5 min-h-[40px] flex items-center border border-slate-800/80">
                          <code className={`font-mono text-[10px] ${step.log ? "text-emerald-300" : "text-slate-600"} break-all`}>
                             {step.log || "> SYSTEM AWAITING INSTRUCTIONS..."}
                          </code>
                       </div>
                    </div>
                 );
              })}
           </div>
        </div>
      </div>
    </div>
  );
}

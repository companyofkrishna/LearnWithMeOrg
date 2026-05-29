import React, { useState } from "react";
import { pythonCodebase, CodeFile } from "../pythonCode";
import { Copy, Check, FileCode, Server, Terminal, Video, Share2, Layers } from "lucide-react";

export default function CodeViewer() {
  const [selectedFile, setSelectedFile] = useState<CodeFile>(pythonCodebase[0]);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = (fileName: string) => {
    if (fileName === "config.py") return <Server className="w-4 h-4 text-emerald-400" />;
    if (fileName === "pdf_engine.py") return <Layers className="w-4 h-4 text-cyan-400" />;
    if (fileName === "media_engine.py") return <Video className="w-4 h-4 text-amber-400" />;
    if (fileName === "youtube_api.py") return <Share2 className="w-4 h-4 text-red-400" />;
    return <Terminal className="w-4 h-4 text-blue-400" />;
  };

  return (
    <div id="code-viewer-container" className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)]">
      {/* Tab Selectors */}
      <div id="sidebar-files" className="lg:col-span-1 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4 px-2">
            <FileCode className="w-5 h-5 text-emerald-400" />
            <h3 className="font-sans font-semibold text-slate-200 tracking-tight text-sm uppercase">Python Codebase</h3>
          </div>
          
          <p className="text-xs text-slate-400 mb-6 px-2 leading-relaxed">
            Production-grade orchestrator files utilizing CrewAI, Google Gemini context caching, and MoviePy.
          </p>

          <nav className="space-y-1.5">
            {pythonCodebase.map((file) => (
              <button
                key={file.name}
                id={`btn-file-${file.name.replace(".", "-")}`}
                onClick={() => {
                  setSelectedFile(file);
                  setCopied(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-xs font-mono transition-all duration-150 ${
                  selectedFile.name === file.name
                    ? "bg-emerald-500/10 border-l-2 border-emerald-500 text-emerald-300"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                {getFileIcon(file.name)}
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Info box */}
        <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg mt-4">
          <p className="text-[10px] font-mono text-slate-500 leading-normal">
            <span className="text-emerald-400 font-semibold uppercase">Engine Tip:</span> Add credentials into local <code className="text-slate-300 font-sans">.env</code> to unleash the Live automated video synthesis!
          </p>
        </div>
      </div>

      {/* Code Display Area */}
      <div id="code-viewer-panel" className="lg:col-span-3 flex flex-col bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden">
        {/* Title and metadata bar */}
        <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 animate-pulse"></span>
            <div>
              <h4 className="text-xs font-mono font-medium text-slate-200">{selectedFile.name}</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 max-w-xl truncate">{selectedFile.description}</p>
            </div>
          </div>

          <button
            id="copy-code-btn"
            onClick={() => handleCopy(selectedFile.code)}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-mono text-[11px] transition-all"
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        {/* Code container */}
        <div className="flex-1 overflow-auto p-4 bg-[#0a0d16] font-mono text-xs text-slate-300 leading-relaxed max-h-[calc(100vh-250px)]">
          <pre className="select-text whitespace-pre overflow-x-auto">
            <code>{selectedFile.code}</code>
          </pre>
        </div>

        {/* Code summary specs block */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 text-slate-400 text-[10px] uppercase font-mono tracking-wider flex items-center gap-6">
          <div>Language: <span className="text-emerald-400 font-bold">{selectedFile.language}</span></div>
          <div>Lines: <span className="text-slate-300">{selectedFile.code.split("\n").length}</span></div>
          <div>Optimization: <span className="text-cyan-400">Context Cached API</span></div>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { Upload, FileSpreadsheet, Settings2, Zap, Download, History, ChevronRight, X, AlertCircle, CheckCircle2, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ColumnMapper, { ColMapping } from "@/components/ColumnMapper";
import ProcessingResult from "@/components/ProcessingResult";

type Step = "upload" | "mapping" | "processing" | "result";

interface ParseResponse {
  headers: string[];
  suggestions: Array<{ field: keyof ColMapping; column: string | null; confidence: number }>;
  totalRows: number;
  previewRows: Record<string, string>[];
}

interface ProcessResponse {
  id: number | null;
  suffix: string;
  metrics: {
    totalRegistros: number;
    totalComContato: number;
    totalSemContato: number;
    totalCpf: number;
    totalCnpj: number;
    totalInvalidos: number;
    totalLinhasGeradas: number;
  };
  files: {
    cpfLigacao: { url: string; key: string; name: string };
    cpfSms: { url: string; key: string; name: string };
    cnpjLigacao: { url: string; key: string; name: string };
    cnpjSms: { url: string; key: string; name: string };
  };
  preview: {
    cpfLigacao: Record<string, string>[];
    cpfSms: Record<string, string>[];
    cnpjLigacao: Record<string, string>[];
    cnpjSms: Record<string, string>[];
  };
}

const STEPS = [
  { id: "upload", label: "Upload", icon: Upload },
  { id: "mapping", label: "Mapeamento", icon: Settings2 },
  { id: "processing", label: "Processando", icon: Zap },
  { id: "result", label: "Resultado", icon: Download },
] as const;

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parseData, setParseData] = useState<ParseResponse | null>(null);
  const [mapping, setMapping] = useState<ColMapping>({
    nome: null, documento: null,
    telefone1: null, telefone2: null, telefone3: null, telefone4: null,
    semContato: null,
  });
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    const ext = f.name.toLowerCase();
    if (!ext.endsWith(".csv") && !ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
      toast.error("Formato inválido. Use arquivos CSV ou XLSX.");
      return;
    }
    setFile(f);
    setIsLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/upload/parse", { method: "POST", body: fd });
      if (!res.ok) {
        let errMsg = "Erro ao analisar arquivo";
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const data: ParseResponse = await res.json();
      setParseData(data);

      // Apply suggestions to mapping
      const newMapping: ColMapping = { nome: null, documento: null, telefone1: null, telefone2: null, telefone3: null, telefone4: null, semContato: null };
      for (const s of data.suggestions) {
        if (s.column && s.confidence >= 50) {
          (newMapping as any)[s.field] = s.column;
        }
      }
      setMapping(newMapping);
      setStep("mapping");
      toast.success(`Arquivo analisado: ${data.totalRows.toLocaleString("pt-BR")} registros encontrados`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  }, [handleFile]);

  const handleProcess = useCallback(async () => {
    if (!file || !parseData) return;
    setStep("processing");
    setIsLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/upload/process", { method: "POST", body: fd });
      if (!res.ok) {
        let errMsg = "Erro ao processar";
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const data: ProcessResponse = await res.json();
      setResult(data);
      setStep("result");
      toast.success("Processamento concluído com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo");
      setStep("mapping");
    } finally {
      setIsLoading(false);
    }
  }, [file, parseData, mapping]);

  const handleReset = () => {
    setStep("upload");
    setFile(null);
    setParseData(null);
    setResult(null);
    setMapping({ nome: null, documento: null, telefone1: null, telefone2: null, telefone3: null, telefone4: null, semContato: null });
  };

  const currentStepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-200 to-blue-200 border border-pink-300/50 flex items-center justify-center shadow-sm">
              <span className="text-lg font-bold text-pink-500 leading-none">H<span className="text-red-400">♥</span></span>
            </div>
            <div>
              <span className="font-semibold text-foreground tracking-tight">Processador</span>
              <span className="font-light text-muted-foreground ml-1.5 text-sm">CSV Inteligente</span>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link href="/contatos">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-2">
                <Users className="w-4 h-4" />
                Contatos
              </Button>
            </Link>
            <Link href="/consulta">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-2">
                <Search className="w-4 h-4" />
                Consulta
              </Button>
            </Link>
            <Link href="/historico">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-2">
                <History className="w-4 h-4" />
                Histórico
              </Button>
            </Link>
            {step !== "upload" && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-foreground gap-2">
                <X className="w-4 h-4" />
                Novo
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="container py-10">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0 mb-12">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isDone = idx < currentStepIdx;
            const isActive = idx === currentStepIdx;
            const isPending = idx > currentStepIdx;
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" :
                  isDone ? "bg-primary/15 text-primary border border-primary/30" :
                  "bg-muted/50 text-muted-foreground"
                }`}>
                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <ChevronRight className={`w-4 h-4 mx-1 ${idx < currentStepIdx ? "text-primary/50" : "text-border"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* STEP: Upload */}
        {step === "upload" && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold tracking-tight mb-3">
                <span className="text-foreground">Processador de</span>{" "}
                <span className="text-primary">Planilhas</span>
              </h1>
              <p className="text-muted-foreground text-base leading-relaxed">
                Envie sua planilha de cobrança e receba 4 arquivos segmentados prontos para disparos via URA e SMS no sistema Linksys.
              </p>
            </div>

            {/* Drop zone */}
            <div
              className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 ${
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-border hover:border-primary/50 hover:bg-card/50"
              } ${isLoading ? "pointer-events-none opacity-60" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileChange} />
              <div className="flex flex-col items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                  isDragging ? "bg-primary/20 scale-110" : "bg-muted/50"
                }`}>
                  {isLoading ? (
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className={`w-8 h-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  )}
                </div>
                <div>
                  <p className="text-lg font-medium text-foreground mb-1">
                    {isLoading ? "Analisando arquivo..." : isDragging ? "Solte o arquivo aqui" : "Arraste ou clique para enviar"}
                  </p>
                  <p className="text-sm text-muted-foreground">Suporta arquivos CSV e XLSX até 50MB</p>
                </div>
                {!isLoading && (
                  <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10">
                    Selecionar arquivo
                  </Button>
                )}
              </div>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3 mt-8">
              {[
                { icon: Settings2, title: "Identificação automática", desc: "Detecta colunas de nome, documento e telefones" },
                { icon: Zap, title: "Expansão de telefones", desc: "Gera uma linha por telefone válido" },
                { icon: FileSpreadsheet, title: "4 arquivos de saída", desc: "CPF/CNPJ × Ligação/SMS separados" },
                { icon: Download, title: "Download em lote", desc: "Baixe todos os arquivos em um ZIP" },
              ].map((f) => (
                <Card key={f.title} className="p-4 bg-card/50 border-border/50">
                  <f.icon className="w-5 h-5 text-primary mb-2" />
                  <p className="text-sm font-medium text-foreground">{f.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* STEP: Mapping */}
        {step === "mapping" && parseData && (
          <ColumnMapper
            headers={parseData.headers}
            suggestions={parseData.suggestions}
            mapping={mapping}
            onChange={setMapping}
            totalRows={parseData.totalRows}
            previewRows={parseData.previewRows}
            fileName={file?.name || ""}
            onProcess={handleProcess}
            isProcessing={isLoading}
          />
        )}

        {/* STEP: Processing */}
        {step === "processing" && (
          <div className="max-w-md mx-auto text-center py-20">
            <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-6">
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Processando planilha...</h2>
            <p className="text-muted-foreground text-sm">
              Classificando documentos, limpando telefones e gerando os 4 arquivos de saída.
            </p>
          </div>
        )}

        {/* STEP: Result */}
        {step === "result" && result && (
          <ProcessingResult result={result} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}

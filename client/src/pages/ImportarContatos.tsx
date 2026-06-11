import { useState, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import {
  Upload, FileSpreadsheet, ArrowLeft, CheckCircle2, AlertCircle,
  Users, Phone, Mail, ChevronRight, Loader2, RefreshCw, Wrench
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type Step = "upload" | "mapping" | "importing" | "done";

interface ParseResult {
  headers: string[];
  suggestions: Record<string, string>;
  totalRows: number;
  previewRows: Record<string, string>[];
}

interface ImportResult {
  totalLidos: number;
  totalImportados: number;
  totalAtualizados: number;
  totalIgnorados: number;
  totalErros: number;
  totalCorrigidos: number;
  totalCpf: number;
  totalCnpj: number;
  jobId: string;
  erros: Array<{ linha: number; motivo: string }>;
  correcoes: Array<{ linha: number; original: string; corrigido: string; metodo: string }>;
}

interface ImportProgress {
  status: "running" | "done" | "error";
  totalLidos: number;
  totalProcessados: number;
  totalImportados: number;
  totalCorrigidos: number;
  totalErros: number;
  message: string;
  result?: Record<string, unknown>;
}

const FIELD_LABELS: Record<string, string> = {
  documento: "CPF / CNPJ",
  nome: "Nome / Razão Social",
  celular1: "Celular 01",
  celular2: "Celular 02",
  celular3: "Celular 03",
  celular4: "Celular 04",
  email1: "E-mail 01",
  email2: "E-mail 02",
  email3: "E-mail 03",
};

const FIELD_ICONS: Record<string, React.ReactNode> = {
  documento: <Users className="w-4 h-4" />,
  nome: <Users className="w-4 h-4" />,
  celular1: <Phone className="w-4 h-4" />,
  celular2: <Phone className="w-4 h-4" />,
  celular3: <Phone className="w-4 h-4" />,
  celular4: <Phone className="w-4 h-4" />,
  email1: <Mail className="w-4 h-4" />,
  email2: <Mail className="w-4 h-4" />,
  email3: <Mail className="w-4 h-4" />,
};

export default function ImportarContatos() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateMode, setDuplicateMode] = useState<"merge" | "update" | "ignore">("merge");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Clean up SSE on unmount
  useEffect(() => {
    return () => { sseRef.current?.close(); };
  }, []);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const resp = await fetch("/api/contatos/parse", { method: "POST", body: form });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || "Erro ao ler arquivo");
      }
      const data: ParseResult = await resp.json();
      setParseResult(data);
      setMapping(data.suggestions);
      setStep("mapping");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleImport = async () => {
    if (!file) return;
    setStep("importing");
    setLoading(true);
    setProgress(null);

    // Generate a unique jobId for SSE tracking
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Open SSE connection BEFORE sending the import request
    const sse = new EventSource(`/api/contatos/import-progress/${jobId}`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data: ImportProgress = JSON.parse(event.data);
        setProgress(data);
        if (data.status === "done" || data.status === "error") {
          sse.close();
          sseRef.current = null;
        }
      } catch {}
    };

    sse.onerror = () => {
      sse.close();
      sseRef.current = null;
    };

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mapping", JSON.stringify(mapping));
      form.append("duplicateMode", duplicateMode);
      form.append("jobId", jobId);
      const resp = await fetch("/api/contatos/import", { method: "POST", body: form });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || "Erro na importação");
      }
      const data: ImportResult = await resp.json();
      setImportResult(data);
      setStep("done");
      toast.success(`${data.totalImportados} contatos processados!`);
    } catch (e: any) {
      toast.error(e.message);
      setStep("mapping");
      sse.close();
      sseRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    sseRef.current?.close();
    sseRef.current = null;
    setStep("upload");
    setFile(null);
    setParseResult(null);
    setMapping({});
    setImportResult(null);
    setProgress(null);
  };

  // Compute progress percentage
  const progressPct = progress && progress.totalLidos > 0
    ? Math.round((progress.totalProcessados / progress.totalLidos) * 100)
    : progress?.status === "done" ? 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/contatos">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              Contatos
            </Button>
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1 className="text-lg font-semibold">Importar Contatos</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-8 text-sm">
          {(["upload", "mapping", "importing", "done"] as Step[]).map((s, i) => {
            const labels = ["Upload", "Mapeamento", "Importando", "Concluído"];
            const active = step === s;
            const done = ["upload", "mapping", "importing", "done"].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  active ? "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" :
                  done ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                  "text-muted-foreground"
                }`}>
                  {done ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[10px]">{i+1}</span>}
                  {labels[i]}
                </div>
                {i < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        {/* STEP: Upload */}
        {step === "upload" && (
          <div className="space-y-6">
            <div
              className={`border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
                dragOver ? "border-pink-400 bg-pink-50 dark:bg-pink-900/10" : "border-border hover:border-pink-300 hover:bg-muted/30"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <div className="flex flex-col items-center gap-4">
                {loading ? (
                  <Loader2 className="w-12 h-12 text-pink-400 animate-spin" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center">
                    <Upload className="w-8 h-8 text-pink-500" />
                  </div>
                )}
                <div>
                  <p className="text-lg font-semibold mb-1">Arraste ou clique para enviar</p>
                  <p className="text-sm text-muted-foreground">Suporta arquivos CSV e XLSX até 50MB</p>
                </div>
                <Button variant="outline" size="sm" className="mt-2" disabled={loading}>
                  Selecionar arquivo
                </Button>
              </div>
            </div>

            <Card className="border-border/50">
              <CardContent className="pt-6">
                <p className="text-sm font-medium mb-3 text-muted-foreground">Estrutura esperada do arquivo:</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {["CPF/CNPJ", "NOME / RAZAO_SOCIAL", "CELULAR 01", "CELULAR 02", "CELULAR 03", "CELULAR 04", "E-MAIL 01", "E-MAIL 02", "E-MAIL 03"].map((col) => (
                    <div key={col} className="bg-muted/50 rounded px-2 py-1 font-mono text-muted-foreground">{col}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP: Mapping */}
        {step === "mapping" && parseResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Mapeamento de Colunas</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  <FileSpreadsheet className="w-4 h-4 inline mr-1" />
                  {file?.name} — {parseResult.totalRows.toLocaleString()} registros
                </p>
              </div>
            </div>

            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Associação de Colunas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                  <div key={field} className="flex items-center gap-4">
                    <div className="flex items-center gap-2 w-44 text-sm font-medium">
                      <span className="text-muted-foreground">{FIELD_ICONS[field]}</span>
                      {label}
                      {(field === "documento" || field === "nome") && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">obrig.</Badge>
                      )}
                    </div>
                    <Select
                      value={mapping[field] || "__none__"}
                      onValueChange={(v) => setMapping(prev => ({ ...prev, [field]: v === "__none__" ? "" : v }))}
                    >
                      <SelectTrigger className="flex-1 h-9">
                        <SelectValue placeholder="— não mapear —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— não mapear —</SelectItem>
                        {parseResult.headers.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping[field] && (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-300 shrink-0">
                        detectado
                      </Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Duplicate mode */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Tratamento de Duplicatas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: "merge", label: "Mesclar", desc: "Preenche campos vazios com novos dados" },
                    { value: "update", label: "Atualizar", desc: "Substitui todos os campos com novos dados" },
                    { value: "ignore", label: "Ignorar", desc: "Mantém registros existentes intactos" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDuplicateMode(opt.value)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        duplicateMode === opt.value
                          ? "border-pink-400 bg-pink-50 dark:bg-pink-900/20"
                          : "border-border hover:border-pink-300"
                      }`}
                    >
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Prévia dos Dados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {parseResult.headers.slice(0, 9).map(h => (
                          <th key={h} className="text-left py-2 px-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.previewRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          {parseResult.headers.slice(0, 9).map(h => (
                            <td key={h} className="py-2 px-2 text-muted-foreground max-w-[120px] truncate">{row[h] || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset}>Cancelar</Button>
              <Button
                onClick={handleImport}
                disabled={!mapping.documento}
                className="flex-1 bg-pink-500 hover:bg-pink-600 text-white"
              >
                Importar {parseResult.totalRows.toLocaleString()} registros
              </Button>
            </div>
          </div>
        )}

        {/* STEP: Importing — with real-time progress bar */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-16 gap-8 max-w-lg mx-auto">
            <div className="w-20 h-20 rounded-full bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
            </div>

            <div className="w-full space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-1">
                  {progress?.message || "Preparando importação..."}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {progress?.totalLidos
                    ? `${progress.totalProcessados.toLocaleString()} de ${progress.totalLidos.toLocaleString()} registros`
                    : "Validando, limpando e armazenando os registros"}
                </p>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <Progress
                  value={progressPct}
                  className="h-3 rounded-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progressPct}%</span>
                  {progress && (
                    <span className="flex gap-3">
                      {progress.totalCorrigidos > 0 && (
                        <span className="text-amber-600">
                          {progress.totalCorrigidos} corrigidos
                        </span>
                      )}
                      {progress.totalErros > 0 && (
                        <span className="text-red-500">
                          {progress.totalErros} erros
                        </span>
                      )}
                      <span className="text-green-600">
                        {progress.totalImportados.toLocaleString()} importados
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Live stats */}
              {progress && (
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="bg-muted/50 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Lidos</p>
                    <p className="text-lg font-bold">{progress.totalLidos.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Importados</p>
                    <p className="text-lg font-bold text-green-600">{progress.totalImportados.toLocaleString()}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Erros</p>
                    <p className="text-lg font-bold text-red-500">{progress.totalErros.toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP: Done */}
        {step === "done" && importResult && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Importação concluída!</h2>
                <p className="text-sm text-muted-foreground">{file?.name}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total lidos", value: importResult.totalLidos, color: "text-foreground" },
                { label: "Importados", value: importResult.totalImportados, color: "text-green-600" },
                { label: "Corrigidos auto.", value: importResult.totalCorrigidos, color: "text-amber-600" },
                { label: "Atualizados", value: importResult.totalAtualizados, color: "text-blue-600" },
                { label: "Ignorados", value: importResult.totalIgnorados, color: "text-muted-foreground" },
                { label: "Erros", value: importResult.totalErros, color: "text-red-500" },
                { label: "CPFs", value: importResult.totalCpf, color: "text-pink-600" },
                { label: "CNPJs", value: importResult.totalCnpj, color: "text-sky-600" },
              ].map(m => (
                <Card key={m.label} className="border-border/50">
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                    <p className={`text-2xl font-bold ${m.color}`}>{m.value.toLocaleString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Auto-corrections report */}
            {importResult.correcoes.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-900/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                    <Wrench className="w-4 h-4" />
                    Documentos corrigidos automaticamente ({importResult.totalCorrigidos})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    Os documentos abaixo tinham dígitos faltando e foram corrigidos com zeros à esquerda.
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {importResult.correcoes.map((c, i) => (
                      <div key={i} className="text-xs flex gap-3 py-1 border-b border-border/50">
                        <span className="text-muted-foreground w-16 shrink-0">Linha {c.linha}</span>
                        <span className="font-mono text-red-400 line-through">{c.original}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono text-green-600">{c.corrigido}</span>
                        <span className="text-muted-foreground ml-auto">{c.metodo}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {importResult.erros.length > 0 && (
              <Card className="border-red-200 dark:border-red-900/50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    Linhas com erro ({importResult.totalErros})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {importResult.erros.map((e, i) => (
                      <div key={i} className="text-xs flex gap-3 py-1 border-b border-border/50">
                        <span className="text-muted-foreground w-16 shrink-0">Linha {e.linha}</span>
                        <span className="text-red-600">{e.motivo}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={reset} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Nova importação
              </Button>
              <Link href="/contatos">
                <Button className="bg-pink-500 hover:bg-pink-600 text-white gap-2">
                  <Users className="w-4 h-4" />
                  Ver base de contatos
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

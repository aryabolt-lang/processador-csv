import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import GlobalNav, { PageLayout } from "@/components/GlobalNav";
import {
  Upload, Mail, Settings2, CheckCircle2, Download, AlertTriangle,
  FileText, ChevronRight, RefreshCw, Info, X, Archive, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailColMapping {
  nomeCol: string | null;
  documentoCol: string | null;
  protocoloCol: string | null;
  valorCol: string | null;
  nomeCredorCol: string | null;
  docCredorCol: string | null;
  emailCols: string[];
  spamThreshold: number;
}

interface ParseResult {
  headers: string[];
  suggestions: EmailColMapping;
  totalRows: number;
  previewRows: Array<Record<string, string>>;
}

interface ProcessStats {
  totalRows: number;
  rowsWithEmail: number;
  rowsWithoutEmail: number;
  uniqueEmails: number;
  normalEmails: number;
  flaggedEmails: number;
  spamThreshold: number;
}

interface ProcessResult {
  stats: ProcessStats;
  contatosSynced?: { total: number; upserted: number; skipped: number };
  files: {
    normal: { url: string; name: string };
    alerta: { url: string; name: string };
    semEmail: { url: string; name: string };
  };
}

type Step = "upload" | "mapping" | "processing" | "result";

const NONE_VALUE = "__none__";

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmailProcessor() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<EmailColMapping | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload handlers ──────────────────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", f);
      const resp = await fetch("/api/email/parse", { method: "POST", body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro ao ler arquivo." }));
        throw new Error(err.error);
      }
      const data: ParseResult = await resp.json();
      setParseResult(data);
      setMapping({ ...data.suggestions });
      setStep("mapping");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  // ── Process ──────────────────────────────────────────────────────────────
  const handleProcess = async () => {
    if (!file || !mapping) return;
    if (mapping.emailCols.length === 0) {
      toast.error("Selecione pelo menos uma coluna de e-mail.");
      return;
    }
    setLoading(true);
    setStep("processing");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      const resp = await fetch("/api/email/process", { method: "POST", body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro ao processar." }));
        throw new Error(err.error);
      }
      const data: ProcessResult = await resp.json();
      setProcessResult(data);
      setStep("result");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo.");
      setStep("mapping");
    } finally {
      setLoading(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────────
  const downloadFile = async (url: string, name: string) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Erro ao baixar arquivo.");
    }
  };

  const downloadZip = async () => {
    if (!processResult) return;
    try {
      const resp = await fetch("/api/email/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: {
            normal: processResult.files.normal.url,
            alerta: processResult.files.alerta.url,
            semEmail: processResult.files.semEmail.url,
          },
        }),
      });
      if (!resp.ok) throw new Error("Erro ao gerar ZIP.");
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "EMAIL_DISPAROS.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      toast.error(err.message || "Erro ao baixar ZIP.");
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────
  const reset = () => {
    setStep("upload");
    setFile(null);
    setParseResult(null);
    setMapping(null);
    setProcessResult(null);
  };

  // ── Mapping helpers ──────────────────────────────────────────────────────
  const toggleEmailCol = (col: string) => {
    if (!mapping) return;
    const already = mapping.emailCols.includes(col);
    setMapping({
      ...mapping,
      emailCols: already
        ? mapping.emailCols.filter((c) => c !== col)
        : [...mapping.emailCols, col],
    });
  };

  const setField = (field: keyof EmailColMapping, value: string) => {
    if (!mapping) return;
    setMapping({ ...mapping, [field]: value === NONE_VALUE ? null : value });
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const steps: { id: Step; label: string }[] = [
    { id: "upload", label: "Upload" },
    { id: "mapping", label: "Mapeamento" },
    { id: "processing", label: "Processando" },
    { id: "result", label: "Resultado" },
  ];
  const stepIdx = steps.findIndex((s) => s.id === step);

  return (
    <TooltipProvider>
      <>
        <GlobalNav actions={step !== "upload" ? (
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1 text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
            Novo arquivo
          </Button>
        ) : undefined} />
        <PageLayout>

        {/* Step indicator */}
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    i < stepIdx
                      ? "bg-green-500/10 text-green-600"
                      : i === stepIdx
                      ? "bg-blue-500/10 text-blue-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < stepIdx ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px]"
                      style={{ borderColor: i === stepIdx ? "currentColor" : "transparent",
                               background: i === stepIdx ? "transparent" : "currentColor",
                               color: i === stepIdx ? "currentColor" : "white" }}>
                      {i + 1}
                    </span>
                  )}
                  {s.label}
                </div>
                {i < steps.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                )}
              </div>
            ))}
          </div>
        </div>

        <main className="max-w-5xl mx-auto px-4 pb-12">
          {/* ── STEP: UPLOAD ── */}
          {step === "upload" && (
            <div className="max-w-xl mx-auto">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold mb-2">Processar E-mails</h2>
                <p className="text-muted-foreground text-sm">
                  Envie sua planilha e receba 3 arquivos: e-mails prontos para disparar,
                  alertas de possível spam e registros sem e-mail.
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-blue-500 bg-blue-500/5"
                    : "border-border hover:border-blue-400 hover:bg-blue-500/3"
                }`}
              >
                <div className="w-14 h-14 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-7 h-7 text-blue-500" />
                </div>
                <p className="font-medium mb-1">Arraste ou clique para enviar</p>
                <p className="text-sm text-muted-foreground">Suporta CSV e XLSX até 50 MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>

              {loading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Lendo arquivo…
                </div>
              )}

              {/* Info cards */}
              <div className="grid grid-cols-3 gap-3 mt-8">
                {[
                  { icon: Mail, title: "Deduplicação", desc: "Um e-mail = uma mensagem" },
                  { icon: AlertTriangle, title: "Alerta spam", desc: "Sinaliza endereços com muitos protocolos" },
                  { icon: FileText, title: "3 arquivos", desc: "Normal, Alerta e Sem e-mail" },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="rounded-lg border bg-card p-3 text-center">
                    <Icon className="w-5 h-5 mx-auto mb-1.5 text-blue-500" />
                    <p className="text-xs font-medium">{title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: MAPPING ── */}
          {step === "mapping" && parseResult && mapping && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">Mapeamento de Colunas</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Arquivo: <span className="font-medium text-foreground">{file?.name}</span>
                    {" · "}{parseResult.totalRows.toLocaleString("pt-BR")} registros
                  </p>
                </div>
                <Badge variant="outline" className="gap-1">
                  <Settings2 className="w-3.5 h-3.5" />
                  {parseResult.headers.length} colunas detectadas
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email columns (multi-select checkboxes) */}
                <Card className="md:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-500" />
                      Colunas de E-mail
                      <Badge variant="secondary" className="ml-auto">{mapping.emailCols.length} selecionadas</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {parseResult.headers.map((h) => {
                        const selected = mapping.emailCols.includes(h);
                        return (
                          <button
                            key={h}
                            onClick={() => toggleEmailCol(h)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                              selected
                                ? "bg-blue-500 text-white border-blue-500"
                                : "bg-background border-border hover:border-blue-400 text-muted-foreground"
                            }`}
                          >
                            {h}
                          </button>
                        );
                      })}
                    </div>
                    {mapping.emailCols.length === 0 && (
                      <p className="text-xs text-destructive mt-2">
                        Selecione pelo menos uma coluna de e-mail.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Field mappings */}
                {[
                  { field: "nomeCol" as const, label: "Nome do Devedor", icon: "👤" },
                  { field: "documentoCol" as const, label: "CPF / CNPJ", icon: "🪪" },
                  { field: "protocoloCol" as const, label: "Protocolo", icon: "📋" },
                  { field: "valorCol" as const, label: "Valor do Protesto", icon: "💰" },
                  { field: "nomeCredorCol" as const, label: "Nome do Credor", icon: "🏢" },
                  { field: "docCredorCol" as const, label: "CPF/CNPJ do Credor", icon: "🔑" },
                ].map(({ field, label, icon }) => (
                  <div key={field} className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1.5">
                      <span>{icon}</span> {label}
                    </Label>
                    <Select
                      value={mapping[field] ?? NONE_VALUE}
                      onValueChange={(v) => setField(field, v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="— não mapear —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>— não mapear —</SelectItem>
                        {parseResult.headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}

                {/* Spam threshold */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    Limite de alerta de spam
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">
                        E-mails que aparecem em N ou mais protocolos serão separados no arquivo
                        EMAIL_ALERTA_SPAM.csv para revisão antes do disparo.
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={mapping.spamThreshold}
                    onChange={(e) =>
                      setMapping({ ...mapping, spamThreshold: Math.max(1, parseInt(e.target.value) || 5) })
                    }
                    className="h-8 text-xs w-24"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Padrão: 5 protocolos
                  </p>
                </div>
              </div>

              {/* Preview table */}
              {parseResult.previewRows.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Prévia (10 primeiras linhas)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            {parseResult.headers.slice(0, 8).map((h) => (
                              <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parseResult.previewRows.map((row, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                              {parseResult.headers.slice(0, 8).map((h) => (
                                <td key={h} className="px-3 py-1.5 text-muted-foreground max-w-[120px] truncate">
                                  {row[h] || "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={reset}>
                  <X className="w-4 h-4 mr-1" /> Cancelar
                </Button>
                <Button
                  onClick={handleProcess}
                  disabled={mapping.emailCols.length === 0}
                  className="bg-blue-500 hover:bg-blue-600 text-white gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Processar e-mails
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP: PROCESSING ── */}
          {step === "processing" && (
            <div className="max-w-sm mx-auto text-center py-20">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Processando…</h2>
              <p className="text-sm text-muted-foreground">
                Deduplicando e-mails e gerando arquivos. Aguarde.
              </p>
            </div>
          )}

          {/* ── STEP: RESULT ── */}
          {step === "result" && processResult && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Processamento concluído
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {file?.name}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={reset} className="gap-1">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Novo arquivo
                </Button>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "Total de registros",
                    value: processResult.stats.totalRows.toLocaleString("pt-BR"),
                    color: "text-foreground",
                    bg: "bg-muted/40",
                  },
                  {
                    label: "Com e-mail",
                    value: processResult.stats.rowsWithEmail.toLocaleString("pt-BR"),
                    color: "text-blue-600",
                    bg: "bg-blue-500/5",
                  },
                  {
                    label: "Sem e-mail",
                    value: processResult.stats.rowsWithoutEmail.toLocaleString("pt-BR"),
                    color: "text-muted-foreground",
                    bg: "bg-muted/40",
                  },
                  {
                    label: "E-mails únicos",
                    value: processResult.stats.uniqueEmails.toLocaleString("pt-BR"),
                    color: "text-purple-600",
                    bg: "bg-purple-500/5",
                  },
                ].map(({ label, value, color, bg }) => (
                  <div key={label} className={`rounded-xl ${bg} p-4 text-center`}>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                  </div>
                ))}
              </div>

              {/* Contacts sync banner */}
              {processResult.contatosSynced && processResult.contatosSynced.upserted > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">
                    <span className="font-semibold">{processResult.contatosSynced.upserted.toLocaleString("pt-BR")} contatos</span> foram adicionados ou atualizados automaticamente na agenda interna.
                  </p>
                </div>
              )}

              {/* Spam alert banner */}
              {processResult.stats.flaggedEmails > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                      {processResult.stats.flaggedEmails} e-mail{processResult.stats.flaggedEmails > 1 ? "s" : ""} com alerta de spam
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">
                      Esses endereços aparecem em {processResult.stats.spamThreshold} ou mais protocolos.
                      Revise o arquivo <strong>EMAIL_ALERTA_SPAM.csv</strong> antes de disparar.
                    </p>
                  </div>
                </div>
              )}

              {/* Download cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Normal */}
                <Card className="border-green-200 dark:border-green-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-green-500/10 flex items-center justify-center">
                        <Mail className="w-3.5 h-3.5 text-green-600" />
                      </div>
                      EMAIL_NORMAL
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-center py-2">
                      <p className="text-3xl font-bold text-green-600">
                        {processResult.stats.normalEmails.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-xs text-muted-foreground">e-mails prontos</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Endereços com menos de {processResult.stats.spamThreshold} protocolos.
                      Seguros para disparar.
                    </p>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
                      size="sm"
                      onClick={() => downloadFile(processResult.files.normal.url, processResult.files.normal.name)}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar CSV
                    </Button>
                  </CardContent>
                </Card>

                {/* Alerta */}
                <Card className="border-amber-200 dark:border-amber-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      EMAIL_ALERTA_SPAM
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-center py-2">
                      <p className="text-3xl font-bold text-amber-600">
                        {processResult.stats.flaggedEmails.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-xs text-muted-foreground">e-mails para revisar</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Endereços com {processResult.stats.spamThreshold}+ protocolos.
                      Revise antes de disparar.
                    </p>
                    <Button
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2"
                      size="sm"
                      onClick={() => downloadFile(processResult.files.alerta.url, processResult.files.alerta.name)}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar CSV
                    </Button>
                  </CardContent>
                </Card>

                {/* Sem email */}
                <Card className="border-muted">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      SEM_EMAIL
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-center py-2">
                      <p className="text-3xl font-bold text-muted-foreground">
                        {processResult.stats.rowsWithoutEmail.toLocaleString("pt-BR")}
                      </p>
                      <p className="text-xs text-muted-foreground">registros sem e-mail</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Registros originais sem nenhum endereço de e-mail válido.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      size="sm"
                      onClick={() => downloadFile(processResult.files.semEmail.url, processResult.files.semEmail.name)}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar CSV
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Download all ZIP */}
              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={downloadZip}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8"
                >
                  <Archive className="w-5 h-5" />
                  Baixar todos os 3 arquivos (ZIP)
                </Button>
              </div>

              {/* Output format info */}
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500" />
                    Estrutura dos arquivos de saída
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className="border-b">
                          {["E-MAIL", "QTDE_PROTOCOLOS", "PROTOCOLOS", "DEVEDOR", "CPF_CNPJ", "TIPO_DOC", "VALOR_TOTAL", "NOME_CREDOR", "CPF_CNPJ_CREDOR"].map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-2 py-1 text-blue-600">joao@email.com</td>
                          <td className="px-2 py-1">3</td>
                          <td className="px-2 py-1 text-muted-foreground">PROT01 | PROT02 | PROT03</td>
                          <td className="px-2 py-1">João Silva</td>
                          <td className="px-2 py-1">123.456.789-00</td>
                          <td className="px-2 py-1">CPF</td>
                          <td className="px-2 py-1">R$ 1.500,00</td>
                          <td className="px-2 py-1 text-muted-foreground">Credor S.A.</td>
                          <td className="px-2 py-1 text-muted-foreground">12.345.678/0001-90</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Separador: vírgula (,) · Encoding: UTF-8 · Protocolos múltiplos separados por " | "
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
        </PageLayout>
      </>
    </TooltipProvider>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  Search,
  CheckCircle2,
  Clock,
  MessageSquare,
  Copy,
  Settings,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCheck,
  FileCheck,
  Phone,
  Mail,
  Users,
  Smartphone,
  Bell,
  AlertTriangle,
  Download,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  SlidersHorizontal,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import GlobalNav, { PageLayout } from "@/components/GlobalNav";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Protocolo {
  id: number;
  protocolo: string;
  nomeDevedor: string | null;
  documento: string | null;
  tipoDoc: "CPF" | "CNPJ" | "INVALIDO";
  numeroTitulo: string | null;
  credor: string | null;
  docCredor: string | null;
  telefone: string | null;
  valorProtesto: string | null;
  statusIntimacao: "pendente" | "intimado";
  canalIntimacao: string | null;
  intimadoEm: string | null;
  nomeArquivo: string | null;
  dataProtocolo: string | null;
  situacaoTitulo: string | null;
  tituloEncerrado: number; // 0 or 1
  createdAt: string;
}

interface ParseResult {
  headers: string[];
  suggestions: Record<string, string | null>;
  totalRows: number;
  previewRows: Record<string, string>[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface FilterTag {
  label: string;
  value: string;
  type: "documento" | "nome";
}

const NONE_VALUE = "__none__";

const CANAIS = [
  { value: "WhatsApp", label: "WhatsApp", icon: Smartphone },
  { value: "E-mail", label: "E-mail", icon: Mail },
  { value: "Pessoal", label: "Pessoal (presencial)", icon: Users },
  { value: "SMS", label: "SMS", icon: Phone },
  { value: "Telefone", label: "Telefone", icon: Phone },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDoc(digits: string | null): string {
  if (!digits) return "—";
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return digits;
}

const MENSAGEM_SECRETARIA_FAZENDA = `Consta em nosso cartório um débito encaminhado para protesto referente à:

SECRETARIA DA FAZENDA DO ESTADO DO TOCANTINS – IPVA DE VEÍCULO


Segue o boleto para pagamento.

⚠️ O pagamento deverá ser realizado até a data de vencimento da intimação, para evitar o protesto em seu nome.

Ao efetuar o pagamento por meio desta intimação, será realizada a quitação do IPVA referente ao ano de 2025, bem como dos emolumentos cartórios relacionados ao procedimento.

Caso prefira, também é possível realizar o parcelamento diretamente junto à Secretaria da Fazenda. Nesse caso, será necessário:

• Solicitar o parcelamento junto à Secretaria da Fazenda;
• Efetuar o pagamento da primeira parcela;
• Entrar em contato novamente com o cartório até a data de vencimento da intimação;
• Realizar o pagamento dos emolumentos cartórios e eventuais despesas do protesto, para a regularização completa.

Se precisar de qualquer orientação, estamos à disposição para ajudar 🤝`;

function isSecretariaFazenda(titulos: Protocolo[]): boolean {
  return titulos.some((t) => t.credor && /secretaria.{0,10}fazenda/i.test(t.credor));
}

function buildMessage(template: string, nome: string, cpf: string, titulos: Protocolo[]): string {
  // Special case: Secretaria da Fazenda gets a fixed message
  if (isSecretariaFazenda(titulos)) {
    return MENSAGEM_SECRETARIA_FAZENDA;
  }

  const tituloLines = titulos
    .map((t, i) => {
      const parts = [`${i + 1}. Protocolo: ${t.protocolo}`];
      if (t.numeroTitulo) parts.push(`   Título: ${t.numeroTitulo}`);
      if (t.credor) parts.push(`   Credor: ${t.credor}`);
      if (t.valorProtesto) parts.push(`   Valor: ${t.valorProtesto}`);
      return parts.join("\n");
    })
    .join("\n\n");

  return template
    .replace(/\{\{nome\}\}/g, nome)
    .replace(/\{\{cpf\}\}/g, cpf)
    .replace(/\{\{documento\}\}/g, cpf)
    .replace(/\{\{titulos\}\}/g, tituloLines)
    .replace(/\{\{protocolo\}\}/g, titulos.map((t) => t.protocolo).join(", "))
    .replace(/\{\{credor\}\}/g, titulos.map((t) => t.credor || "").filter(Boolean).join(", "))
    .replace(/\{\{titulo\}\}/g, titulos.map((t) => t.numeroTitulo || "").filter(Boolean).join(", "));
}

// ─── Import Modal (protocolos) ────────────────────────────────────────────────

function ImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<"upload" | "mapping" | "importing">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const reset = () => { setStep("upload"); setFile(null); setParseResult(null); setMapping({}); };

  const handleFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/protocolos/parse", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro ao ler arquivo");
      setParseResult(d);
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(d.suggestions)) m[k] = (v as string) || NONE_VALUE;
      setMapping(m);
      setStep("mapping");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !parseResult) return;
    setStep("importing");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const cleanMapping: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(mapping)) cleanMapping[k] = v === NONE_VALUE ? null : v;
      fd.append("mapping", JSON.stringify(cleanMapping));
      const res = await fetch("/api/protocolos/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro ao importar");
      toast.success(`${d.imported} protocolos importados!`);
      onImported();
      onClose();
      reset();
    } catch (err: any) {
      toast.error(err.message);
      setStep("mapping");
    } finally {
      setLoading(false);
    }
  };

  const headers = parseResult?.headers || [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-500" />
            Importar Protocolos
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div
            className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => document.getElementById("proto-file-input")?.click()}
          >
            <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="font-medium">Arraste ou clique para selecionar</p>
            <p className="text-sm text-muted-foreground mt-1">CSV ou XLSX</p>
            <input id="proto-file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {loading && <p className="mt-3 text-sm text-blue-500 animate-pulse">Lendo arquivo…</p>}
          </div>
        )}

        {step === "mapping" && parseResult && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Arquivo: <strong>{file?.name}</strong> — {parseResult.totalRows.toLocaleString("pt-BR")} linhas
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "protocoloCol", label: "Protocolo *" },
                { key: "nomeCol", label: "Nome do devedor" },
                { key: "documentoCol", label: "CPF / CNPJ" },
                { key: "numeroTituloCol", label: "Nº Título" },
                { key: "credorCol", label: "Credor" },
                { key: "docCredorCol", label: "Doc. Credor" },
                { key: "telefoneCol", label: "Telefone" },
                { key: "valorCol", label: "Valor do protesto" },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Select value={mapping[key] || NONE_VALUE} onValueChange={(v) => setMapping((m) => ({ ...m, [key]: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>— não mapear —</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {/* Preview */}
            <div className="overflow-x-auto rounded border text-xs">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>{headers.slice(0, 6).map((h) => <th key={h} className="p-2 text-left font-medium">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {parseResult.previewRows.slice(0, 3).map((row, i) => (
                    <tr key={i} className="border-t">
                      {headers.slice(0, 6).map((h) => <td key={h} className="p-2 truncate max-w-24">{row[h] || ""}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="py-10 text-center">
            <RefreshCw className="w-8 h-8 mx-auto animate-spin text-blue-500 mb-3" />
            <p className="font-medium">Importando protocolos…</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancelar</Button>
          {step === "mapping" && (
            <Button onClick={handleImport} disabled={loading} className="bg-blue-500 hover:bg-blue-600 text-white">
              Importar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Enriquecer Modal ─────────────────────────────────────────────────────────────

interface EnriquecerResult {
  totalNoArquivo: number;
  registrosUnicos: number;
  encontrados: number;
  enriquecidos: number;
  semAlteracao: number;
  naoEncontrados: number;
  colunasDetectadas: Record<string, string | null>;
}

function EnriquecerModal({ open, onClose, onEnriquecido }: { open: boolean; onClose: () => void; onEnriquecido: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EnriquecerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setFile(null); setResult(null); setError(null); };

  const handleEnriquecer = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/protocolos/enriquecer", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro ao enriquecer");
      setResult(d);
      onEnriquecido();
      toast.success(`${d.enriquecidos.toLocaleString("pt-BR")} registro(s) enriquecido(s)!`);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            Enriquecer Dados dos Protocolos
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie uma planilha com dados atualizados. O sistema identificará os registros pela chave <strong>Protocolo + CPF/CNPJ</strong> e preencherá apenas os campos que ainda estão vazios no banco.
          </p>
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800 space-y-1">
            <p className="font-semibold">Campos enriquecidos (somente se vazios):</p>
            <p>Nome do devedor · Número do título · Credor · CPF/CNPJ do credor · Telefone · Valor · Data do protocolo</p>
            <p className="font-semibold mt-1">Campos sempre atualizados:</p>
            <p>Situação do título (PAGO, CANCELADO, EDITAL, etc.)</p>
          </div>

          {!result ? (
            <>
              <div
                className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); setError(null); } }}
                onClick={() => document.getElementById("enriquecer-file-input")?.click()}
              >
                <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                {file ? (
                  <p className="font-medium text-orange-600">{file.name}</p>
                ) : (
                  <>
                    <p className="font-medium">Arraste ou clique para selecionar</p>
                    <p className="text-sm text-muted-foreground mt-1">CSV ou XLSX com Protocolo + CPF/CNPJ Devedor</p>
                  </>
                )}
                <input id="enriquecer-file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setError(null); } }} />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
            </>
          ) : (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-3">
              <p className="font-semibold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Enriquecimento concluído!
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white border border-slate-100 p-2">
                  <p className="text-xs text-slate-500">Linhas no arquivo</p>
                  <p className="text-lg font-bold text-slate-700">{result.totalNoArquivo.toLocaleString("pt-BR")}</p>
                </div>
                <div className="rounded-lg bg-white border border-slate-100 p-2">
                  <p className="text-xs text-slate-500">Registros únicos</p>
                  <p className="text-lg font-bold text-slate-700">{result.registrosUnicos.toLocaleString("pt-BR")}</p>
                </div>
                <div className="rounded-lg bg-emerald-100 border border-emerald-200 p-2">
                  <p className="text-xs text-emerald-600 font-medium">Enriquecidos</p>
                  <p className="text-lg font-bold text-emerald-700">{result.enriquecidos.toLocaleString("pt-BR")}</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-2">
                  <p className="text-xs text-blue-600 font-medium">Encontrados no banco</p>
                  <p className="text-lg font-bold text-blue-700">{result.encontrados.toLocaleString("pt-BR")}</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
                  <p className="text-xs text-slate-500">Já completos (sem alteração)</p>
                  <p className="text-lg font-bold text-slate-600">{result.semAlteracao.toLocaleString("pt-BR")}</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-2">
                  <p className="text-xs text-amber-600">Não encontrados no banco</p>
                  <p className="text-lg font-bold text-amber-700">{result.naoEncontrados.toLocaleString("pt-BR")}</p>
                </div>
              </div>
              {result.colunasDetectadas && (
                <div className="text-xs text-slate-500 bg-white rounded-lg border border-slate-100 p-2">
                  <p className="font-semibold text-slate-600 mb-1">Colunas detectadas:</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {Object.entries(result.colunasDetectadas).filter(([, v]) => v).map(([k, v]) => (
                      <span key={k}><span className="text-slate-400">{k}:</span> <strong>{v}</strong></span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Fechar</Button>
          {!result && (
            <Button onClick={handleEnriquecer} disabled={!file || loading} className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              {loading ? "Enriquecendo..." : "Enriquecer dados"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import Intimados Modal ───────────────────────────────────────────────────

function ImportIntimadosModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ format: string; processed: number; skipped: number; notFound: number; total: number } | null>(null);

  const reset = () => { setFile(null); setResult(null); };

  const handleFile = (f: File) => setFile(f);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/protocolos/import-intimados", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Erro ao importar");
      setResult(d);
      onImported();
      toast.success(`${d.processed} intimações importadas!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatLabels: Record<string, string> = {
    diligencias: "DILIGÊNCIAS-INTIMADOS",
    campaign: "Relatório de Campanha",
    pesquisar: "Pesquisar Títulos (intimação pessoal)",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-green-500" />
            Importar Intimações Realizadas
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie um dos formatos suportados para marcar protocolos como intimados automaticamente:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li><strong>DILIGÊNCIAS-INTIMADOS.csv</strong> — intimações eletrônicas e pessoais</li>
            <li><strong>campaign_report.csv</strong> — relatório de campanha WhatsApp</li>
            <li><strong>PesquisarTítulos.csv</strong> — intimações pessoais (ignora Thaiana, Wesley, Tadeu, S/N)</li>
          </ul>

          {!result ? (
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => document.getElementById("intimados-file-input")?.click()}
            >
              <FileCheck className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              {file ? (
                <p className="font-medium text-green-600">{file.name}</p>
              ) : (
                <>
                  <p className="font-medium">Arraste ou clique para selecionar</p>
                  <p className="text-sm text-muted-foreground mt-1">CSV ou XLSX</p>
                </>
              )}
              <input id="intimados-file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          ) : (
            <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 p-4 space-y-2">
              <p className="font-semibold text-green-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Importação concluída!
              </p>
              <p className="text-sm text-muted-foreground">Formato detectado: <strong>{formatLabels[result.format] || result.format}</strong></p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Total no arquivo: <strong>{result.total.toLocaleString("pt-BR")}</strong></div>
                <div>Atualizados: <strong className="text-green-600">{result.processed.toLocaleString("pt-BR")}</strong></div>
                <div>Ignorados: <strong className="text-amber-600">{result.skipped.toLocaleString("pt-BR")}</strong></div>
                <div>Não encontrados: <strong className="text-red-500">{result.notFound.toLocaleString("pt-BR")}</strong></div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Fechar</Button>
          {!result && (
            <Button onClick={handleImport} disabled={!file || loading} className="bg-green-500 hover:bg-green-600 text-white gap-2">
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCheck className="w-4 h-4" />}
              {loading ? "Importando…" : "Importar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Template Modal ───────────────────────────────────────────────────────────

function TemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [template, setTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      fetch("/api/protocolos/config/mensagem").then((r) => r.json()).then((d) => setTemplate(d.template || ""));
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/protocolos/config/mensagem", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      toast.success("Template salvo!");
      onClose();
    } catch {
      toast.error("Erro ao salvar template.");
    } finally {
      setSaving(false);
    }
  };

  const VARS = ["{{nome}}", "{{cpf}}", "{{documento}}", "{{protocolo}}", "{{credor}}", "{{titulo}}", "{{titulos}}"];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Template de Mensagem WhatsApp
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Use <strong>*negrito*</strong>, _itálico_, e as variáveis abaixo. O sistema substitui automaticamente.
          </p>
          <div className="flex flex-wrap gap-1">
            {VARS.map((v) => (
              <button key={v} className="text-xs bg-muted px-2 py-0.5 rounded font-mono hover:bg-blue-100 hover:text-blue-700 transition-colors"
                onClick={() => setTemplate((t) => t + v)}>
                {v}
              </button>
            ))}
          </div>
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={12}
            className="font-mono text-sm"
            placeholder="Cole aqui o texto da mensagem…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="bg-blue-500 hover:bg-blue-600 text-white">
            {saving ? "Salvando…" : "Salvar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Canal Intimação Modal ────────────────────────────────────────────────────

function CanalModal({
  open,
  count,
  onConfirm,
  onClose,
}: {
  open: boolean;
  count: number;
  onConfirm: (canal: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  // Reset when modal opens
  useEffect(() => {
    if (open) { setSelected([]); setCustom(""); }
  }, [open]);

  const toggle = (val: string) =>
    setSelected((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);

  const handleConfirm = () => {
    const canais = [...selected];
    if (custom.trim()) canais.push(custom.trim());
    if (canais.length === 0) { toast.error("Selecione pelo menos um meio de intimação."); return; }
    onConfirm(canais.join(", "));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCheck className="w-5 h-5 text-green-500" />
            Confirmar Intimação
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Marcar <strong>{count}</strong> protocolo(s) como <strong>Intimado</strong>. Como foi realizada a intimação?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {CANAIS.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition-all ${
                  selected.includes(value)
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-muted hover:border-muted-foreground/40"
                }`}
              >
                <Checkbox
                  checked={selected.includes(value)}
                  onCheckedChange={() => toggle(value)}
                />
                <Icon className="w-3.5 h-3.5" />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Outro (campo livre)</Label>
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Ex: Carta, Oficial de Justiça…"
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirm} className="bg-green-500 hover:bg-green-600 text-white gap-2">
            <CheckCheck className="w-4 h-4" />
            Confirmar como Intimado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Copy Message Modal ───────────────────────────────────────────────────────

function CopyMessageModal({
  open,
  onClose,
  selectedRows,
  template,
}: {
  open: boolean;
  onClose: () => void;
  selectedRows: Protocolo[];
  template: string;
}) {
  // Group by document
  const groups = new Map<string, { nome: string; doc: string; rows: Protocolo[] }>();
  for (const r of selectedRows) {
    const key = r.documento || r.nomeDevedor || r.protocolo;
    if (!groups.has(key)) {
      groups.set(key, { nome: r.nomeDevedor || "Devedor", doc: formatDoc(r.documento), rows: [] });
    }
    groups.get(key)!.rows.push(r);
  }

  const copyAll = () => {
    const msgs = Array.from(groups.values())
      .map(({ nome, doc, rows }) => buildMessage(template, nome, doc, rows))
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(msgs).then(() => toast.success("Mensagem copiada!")).catch(() => toast.error("Erro ao copiar."));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-500" />
            Mensagem WhatsApp — {groups.size} devedor(es)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {Array.from(groups.values()).map(({ nome, doc, rows }, i) => {
            const msg = buildMessage(template, nome, doc, rows);
            return (
              <div key={i} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{nome} <span className="text-muted-foreground font-normal">({doc})</span></p>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                    onClick={() => navigator.clipboard.writeText(msg).then(() => toast.success("Copiado!"))}>
                    <Copy className="w-3 h-3" /> Copiar
                  </Button>
                </div>
                <pre className="text-xs whitespace-pre-wrap font-sans text-muted-foreground bg-background rounded p-2 border">{msg}</pre>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={copyAll} className="bg-green-500 hover:bg-green-600 text-white gap-2">
            <Copy className="w-4 h-4" />
            Copiar tudo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SituacaoBadge ───────────────────────────────────────────────────────────

const SITUACAO_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  PAGO: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Pago" },
  CANCELADO: { bg: "bg-slate-100", text: "text-slate-600", label: "Cancelado" },
  "CANCELADO SEM ONUS": { bg: "bg-slate-100", text: "text-slate-600", label: "Canc. s/ ônus" },
  "CANCELADO SEM ÔNUS": { bg: "bg-slate-100", text: "text-slate-600", label: "Canc. s/ ônus" },
  DEVOLVIDO: { bg: "bg-orange-100", text: "text-orange-700", label: "Devolvido" },
  RETIRADO: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Retirado" },
  PROTESTADO: { bg: "bg-purple-100", text: "text-purple-700", label: "Protestado" },
  EDITAL: { bg: "bg-blue-100", text: "text-blue-700", label: "Edital" },
  NOTIFICACAO: { bg: "bg-sky-100", text: "text-sky-700", label: "Notificação" },
  PROTOCOLADO: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Protocolado" },
};

function SituacaoBadge({ situacao }: { situacao: string }) {
  const s = SITUACAO_STYLES[situacao.toUpperCase()] || { bg: "bg-gray-100", text: "text-gray-600", label: situacao };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

// ─── ImportSituacoesModal ─────────────────────────────────────────────────────

function ImportSituacoesModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated: number; notFound: number; encerrados: number; editais: number; total: number; detectedColumns?: { protocolo: string; situacao: string } } | null>(null);
  const [error, setError] = useState("");

  function handleClose() {
    setFile(null);
    setResult(null);
    setError("");
    onClose();
  }

  async function handleImport() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/protocolos/importar-situacoes", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar");
      setResult(data);
      onImported();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-violet-600" />
            Atualizar Situações dos Títulos
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!result ? (
            <>
              <p className="text-sm text-slate-600">
                Importe um CSV com as colunas <strong>Protocolo</strong> e <strong>Situação Atual</strong>.
                O sistema detecta automaticamente as colunas e atualiza os títulos correspondentes.
              </p>
              <div className="rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-4 text-center">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  id="sit-file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <label htmlFor="sit-file" className="cursor-pointer">
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-violet-700 font-medium">
                      <FileCheck className="w-5 h-5" />
                      {file.name}
                    </div>
                  ) : (
                    <div className="text-slate-500">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-violet-400" />
                      <p className="text-sm">Clique para selecionar o arquivo</p>
                      <p className="text-xs text-slate-400 mt-1">CSV ou XLSX com Protocolo + Situação Atual</p>
                    </div>
                  )}
                </label>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-700">Regras de classificação:</p>
                <p>✅ <strong>Encerrados</strong> (não intimar mais): PAGO, CANCELADO, DEVOLVIDO, RETIRADO, PROTESTADO</p>
                <p>📋 <strong>Edital</strong>: marcado como intimado via Edital automaticamente</p>
                <p>🔔 <strong>Demais</strong> (NOTIFICACAO, PROTOCOLADO): permanecem ativos</p>
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="font-semibold text-emerald-800">Situações atualizadas!</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-blue-600 font-medium">Atualizados</p>
                  <p className="text-xl font-bold text-blue-800">{result.updated}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500 font-medium">Não encontrados</p>
                  <p className="text-xl font-bold text-slate-700">{result.notFound}</p>
                </div>
                <div className="rounded-lg bg-slate-100 p-3">
                  <p className="text-xs text-slate-600 font-medium">Encerrados</p>
                  <p className="text-xl font-bold text-slate-700">{result.encerrados}</p>
                </div>
                <div className="rounded-lg bg-blue-100 p-3">
                  <p className="text-xs text-blue-700 font-medium">Intimados por Edital</p>
                  <p className="text-xl font-bold text-blue-800">{result.editais}</p>
                </div>
              </div>
              {result.detectedColumns && (
                <p className="text-xs text-slate-500 text-center">
                  Colunas detectadas: <strong>{result.detectedColumns.protocolo}</strong> + <strong>{result.detectedColumns.situacao}</strong>
                </p>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
          {!result && (
            <Button
              onClick={handleImport}
              disabled={!file || loading}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {loading ? "Processando..." : "Importar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── SituacaoModal (manual update) ───────────────────────────────────────────

const SITUACOES_OPCOES = [
  { value: "PAGO", label: "Pago", desc: "Título quitado" },
  { value: "CANCELADO", label: "Cancelado", desc: "Título cancelado" },
  { value: "CANCELADO SEM ONUS", label: "Cancelado sem ônus", desc: "Cancelado sem cobrança" },
  { value: "DEVOLVIDO", label: "Devolvido", desc: "Título devolvido ao credor" },
  { value: "RETIRADO", label: "Retirado", desc: "Retirado pelo apresentante" },
  { value: "PROTESTADO", label: "Protestado", desc: "Protesto lavrado" },
  { value: "EDITAL", label: "Edital", desc: "Intimado por edital" },
  { value: "NOTIFICACAO", label: "Notificação", desc: "Em fase de notificação" },
  { value: "PROTOCOLADO", label: "Protocolado", desc: "Recém protocolado" },
];

function SituacaoModal({ open, ids, onClose, onUpdated }: { open: boolean; ids: number[]; onClose: () => void; onUpdated: () => void }) {
  const [situacao, setSituacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!situacao) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/protocolos/atualizar-situacao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, situacao }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao atualizar");
      toast.success(`Situação atualizada para ${ids.length} protocolo(s).`);
      onUpdated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-violet-600" />
            Atualizar Situação
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">
            Atualizar situação de <strong>{ids.length}</strong> protocolo(s) selecionado(s).
          </p>
          <div className="space-y-2">
            {SITUACOES_OPCOES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSituacao(opt.value)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-all ${
                  situacao === opt.value
                    ? "border-violet-400 bg-violet-50 text-violet-800 font-medium"
                    : "border-slate-200 hover:border-slate-300 text-slate-700"
                }`}
              >
                <div className="text-left">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-slate-500 ml-2">{opt.desc}</span>
                </div>
                <SituacaoBadge situacao={opt.value} />
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={!situacao || loading}
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// ─── SortIcon helper ──────────────────────────────────────────────────────────

function SortIcon({ col, orderBy, orderDir }: { col: string; orderBy: string; orderDir: "asc" | "desc" }) {
  if (orderBy !== col) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30 inline" />;
  return orderDir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 text-blue-500 inline" />
    : <ArrowDown className="w-3 h-3 ml-1 text-blue-500 inline" />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Protocolos() {
  const [rows, setRows] = useState<Protocolo[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, pages: 0 });
  const [pageLimit, setPageLimit] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterTags, setFilterTags] = useState<FilterTag[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showImportIntimados, setShowImportIntimados] = useState(false);
  const [showImportSituacoes, setShowImportSituacoes] = useState(false);
  const [showEnriquecer, setShowEnriquecer] = useState(false);
  const [showSituacaoModal, setShowSituacaoModal] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showCopyMsg, setShowCopyMsg] = useState(false);
  const [showCanalModal, setShowCanalModal] = useState(false);
  const [pendingToggleId, setPendingToggleId] = useState<number | null>(null);
  const [template, setTemplate] = useState("");
  const [page, setPage] = useState(1);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Sort & advanced filters ────────────────────────────────────────────────
  const [orderBy, setOrderBy] = useState<string>("createdAt");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterCol, setFilterCol] = useState<string>("");
  const [filterVal, setFilterVal] = useState<string>("");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [competencia, setCompetencia] = useState<string>("");
  const [telefoneFilter, setTelefoneFilter] = useState<string>("");

  // ── Gaps / Bell state ──────────────────────────────────────────────────────
  const [showGapsPanel, setShowGapsPanel] = useState(false);
  const [gapsStats, setGapsStats] = useState<{ min: number | null; max: number | null; total: number; gapsCount: number; totalPendentes?: number; totalIntimados?: number; totalEncerrados?: number; totalFiltrado?: number; hasFilter?: boolean } | null>(null);
  const [gapsList, setGapsList] = useState<number[]>([]);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsLoaded, setGapsLoaded] = useState(false);

  // Persisted preferences for gap analysis
  const [dataCorte, setDataCorte] = useState<string>(() => localStorage.getItem("gaps_dataCorte") || "2025-05-15");
  const [ignorarSequencia, setIgnorarSequencia] = useState<boolean>(() => localStorage.getItem("gaps_ignorarSequencia") === "true");

  useEffect(() => { localStorage.setItem("gaps_dataCorte", dataCorte); }, [dataCorte]);
  useEffect(() => { localStorage.setItem("gaps_ignorarSequencia", String(ignorarSequencia)); }, [ignorarSequencia]);

  const fetchGapsStats = useCallback(async () => {
    if (ignorarSequencia) { setGapsStats((prev) => prev ? { ...prev, gapsCount: 0 } : null); return; }
    try {
      const params = new URLSearchParams();
      if (dataCorte) params.set("dataCorte", dataCorte);
      if (dataInicio) params.set("dataInicio", dataInicio);
      if (dataFim) params.set("dataFim", dataFim);
      if (competencia) params.set("competencia", competencia);
      // Use filterTags as the search query when no free-text q is active
      const effectiveQ = q || (filterTags.length > 0 ? filterTags.map((t) => t.value).join(" ") : "");
      if (effectiveQ) params.set("q", effectiveQ);
      if (statusFilter !== "todos") params.set("status", statusFilter);
      if (filterCol && filterVal) { params.set("filterCol", filterCol); params.set("filterVal", filterVal); }
      if (telefoneFilter) params.set("telefone", telefoneFilter);
      const res = await fetch(`/api/protocolos/stats?${params}`);
      const d = await res.json();
      setGapsStats(d);
    } catch { /* silent */ }
  }, [dataCorte, ignorarSequencia, dataInicio, dataFim, competencia, q, statusFilter, filterCol, filterVal, telefoneFilter, filterTags]);

  const fetchGapsFull = useCallback(async () => {
    if (ignorarSequencia) { setGapsList([]); setGapsLoaded(true); return; }
    setGapsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "5000" });
      if (dataCorte) params.set("dataCorte", dataCorte);
      const res = await fetch(`/api/protocolos/gaps?${params}`);
      const d = await res.json();
      setGapsList(d.gaps || []);
      setGapsStats({ min: d.min, max: d.max, total: d.total, gapsCount: d.gapsCount });
      setGapsLoaded(true);
    } catch {
      toast.error("Erro ao carregar gaps.");
    } finally {
      setGapsLoading(false);
    }
  }, [gapsLoaded, dataCorte, ignorarSequencia]);

  const handleOpenGaps = () => {
    setShowGapsPanel(true);
    fetchGapsFull();
  };

  const downloadGapsCsv = () => {
    const params = new URLSearchParams();
    if (dataCorte) params.set("dataCorte", dataCorte);
    window.open(`/api/protocolos/gaps/export?${params}`, "_blank");
  };

  // Group gaps into ranges for display
  const gapRanges = useMemo(() => {
    if (!gapsList.length) return [];
    const ranges: { start: number; end: number; count: number }[] = [];
    let start = gapsList[0];
    let prev = gapsList[0];
    for (let i = 1; i < gapsList.length; i++) {
      if (gapsList[i] === prev + 1) {
        prev = gapsList[i];
      } else {
        ranges.push({ start, end: prev, count: prev - start + 1 });
        start = gapsList[i];
        prev = gapsList[i];
      }
    }
    ranges.push({ start, end: prev, count: prev - start + 1 });
    return ranges;
  }, [gapsList]);

  const fetchTemplate = useCallback(async () => {
    const res = await fetch("/api/protocolos/config/mensagem");
    const d = await res.json();
    setTemplate(d.template || "");
  }, []);

  const buildQuery = useCallback((p: number, search: string, status: string, tags: FilterTag[]) => {
    const params = new URLSearchParams({ page: String(p), limit: String(pageLimit) });
    if (search) params.set("q", search);
    if (status !== "todos") params.set("status", status);
    if (!search && tags.length > 0) params.set("q", tags.map((t) => t.value).join(" "));
    // Sort
    if (orderBy !== "createdAt" || orderDir !== "desc") {
      params.set("orderBy", orderBy);
      params.set("orderDir", orderDir);
    }
    // Advanced filters
    if (filterCol && filterVal) { params.set("filterCol", filterCol); params.set("filterVal", filterVal); }
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);
    if (competencia) params.set("competencia", competencia);
    if (telefoneFilter) params.set("telefone", telefoneFilter);
    return params;
  }, [pageLimit, orderBy, orderDir, filterCol, filterVal, dataInicio, dataFim, competencia, telefoneFilter]);

  const fetchRows = useCallback(async (p: number, search: string, status: string, tags: FilterTag[]) => {
    setLoading(true);
    try {
      const params = buildQuery(p, search, status, tags);
      const res = await fetch(`/api/protocolos?${params}`);
      const d = await res.json();
      setRows(d.data || []);
      setPagination(d.pagination);
    } catch {
      toast.error("Erro ao carregar protocolos.");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchTemplate();
    fetchRows(1, "", "todos", []);
    fetchGapsStats();
  }, [fetchTemplate, fetchRows, fetchGapsStats]);

  const handleSearch = (val: string) => {
    setQ(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      setSelectedIds(new Set());
      fetchRows(1, val, statusFilter, filterTags);
      fetchGapsStats();
    }, 400);
  };

  const handleStatusFilter = (val: string) => {
    setStatusFilter(val);
    setPage(1);
    setSelectedIds(new Set());
    fetchRows(1, q, val, filterTags);
    setTimeout(() => fetchGapsStats(), 50);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedIds(new Set());
    fetchRows(newPage, q, statusFilter, filterTags);
  };

  const handleSort = (col: string) => {
    let newDir: "asc" | "desc" = "asc";
    if (orderBy === col) newDir = orderDir === "asc" ? "desc" : "asc";
    setOrderBy(col);
    setOrderDir(newDir);
    setPage(1);
    setSelectedIds(new Set());
    // buildQuery reads state, so we need to pass new values directly
    const params = new URLSearchParams({ page: "1", limit: String(pageLimit) });
    if (q) params.set("q", q);
    if (statusFilter !== "todos") params.set("status", statusFilter);
    if (!q && filterTags.length > 0) params.set("q", filterTags.map((t) => t.value).join(" "));
    params.set("orderBy", col);
    params.set("orderDir", newDir);
    if (filterCol && filterVal) { params.set("filterCol", filterCol); params.set("filterVal", filterVal); }
    if (dataInicio) params.set("dataInicio", dataInicio);
    if (dataFim) params.set("dataFim", dataFim);
    if (competencia) params.set("competencia", competencia);
    if (telefoneFilter) params.set("telefone", telefoneFilter);
    setLoading(true);
    fetch(`/api/protocolos?${params}`)
      .then((r) => r.json())
      .then((d) => { setRows(d.data || []); setPagination(d.pagination); })
      .catch(() => toast.error("Erro ao ordenar."))
      .finally(() => setLoading(false));
  };

  const handleApplyAdvancedFilters = () => {
    setPage(1);
    setSelectedIds(new Set());
    fetchRows(1, q, statusFilter, filterTags);
    // Refresh stats cards to reflect the new date filters
    setTimeout(() => fetchGapsStats(), 50);
  };

  const handleClearAdvancedFilters = () => {
    setFilterCol(""); setFilterVal(""); setDataInicio(""); setDataFim(""); setCompetencia(""); setTelefoneFilter("");
    setOrderBy("createdAt"); setOrderDir("desc");
    setPage(1);
    setSelectedIds(new Set());
    // fetch with cleared state
    const params = new URLSearchParams({ page: "1", limit: String(pageLimit) });
    if (q) params.set("q", q);
    if (statusFilter !== "todos") params.set("status", statusFilter);
    if (!q && filterTags.length > 0) params.set("q", filterTags.map((t) => t.value).join(" "));
    setLoading(true);
    fetch(`/api/protocolos?${params}`)
      .then((r) => r.json())
      .then((d) => { setRows(d.data || []); setPagination(d.pagination); })
      .catch(() => toast.error("Erro ao limpar filtros."))
      .finally(() => setLoading(false));
    // Refresh stats cards with no date filters
    setTimeout(() => fetchGapsStats(), 50);
  };

  // Count active advanced filters
  const activeAdvancedFiltersCount = [filterCol && filterVal, dataInicio, dataFim, competencia, telefoneFilter].filter(Boolean).length;

  // Add a filter tag (document or name click)
  const addFilterTag = (tag: FilterTag) => {
    setFilterTags((prev) => {
      if (prev.some((t) => t.value === tag.value)) return prev;
      const next = [...prev, tag];
      setPage(1);
      setQ("");
      setSelectedIds(new Set());
      fetchRows(1, "", statusFilter, next);
      return next;
    });
  };

  const removeFilterTag = (value: string) => {
    setFilterTags((prev) => {
      const next = prev.filter((t) => t.value !== value);
      setPage(1);
      setSelectedIds(new Set());
      fetchRows(1, q, statusFilter, next);
      return next;
    });
  };

  const clearAllTags = () => {
    setFilterTags([]);
    setPage(1);
    setSelectedIds(new Set());
    fetchRows(1, q, statusFilter, []);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  // Inline toggle: if marking as intimado, open canal modal; if pendente, do it directly
  const handleInlineToggle = async (row: Protocolo) => {
    if (row.statusIntimacao === "pendente") {
      // Will mark as intimado → ask for canal
      setPendingToggleId(row.id);
      setShowCanalModal(true);
    } else {
      // Mark back to pendente directly
      await markStatus([row.id], "pendente", null);
    }
  };

  // Bulk mark as intimado → ask for canal
  const handleBulkMarkIntimado = () => {
    if (selectedIds.size === 0) return;
    setShowCanalModal(true);
  };

  const markStatus = async (ids: number[], status: "pendente" | "intimado", canal: string | null) => {
    try {
      const res = await fetch("/api/protocolos/marcar-intimado", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status, canal }),
      });
      if (!res.ok) throw new Error("Erro ao atualizar");
      const label = status === "intimado" ? "Intimado" : "Pendente";
      toast.success(`${ids.length} protocolo(s) marcado(s) como ${label}.`);
      setSelectedIds(new Set());
      fetchRows(page, q, statusFilter, filterTags);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCanalConfirm = async (canal: string) => {
    setShowCanalModal(false);
    if (pendingToggleId !== null) {
      // Single toggle
      await markStatus([pendingToggleId], "intimado", canal);
      setPendingToggleId(null);
    } else {
      // Bulk
      await markStatus(Array.from(selectedIds), "intimado", canal);
    }
  };

  const handleCanalClose = () => {
    setShowCanalModal(false);
    setPendingToggleId(null);
  };

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));

  const navActions = (
    <>
      {/* Notification Bell */}
      <button
        onClick={handleOpenGaps}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
        title="Verificar protocolos faltantes"
      >
        <Bell className="w-4 h-4 text-slate-600" />
        {!ignorarSequencia && gapsStats && gapsStats.gapsCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
            {gapsStats.gapsCount > 999 ? "999+" : gapsStats.gapsCount}
          </span>
        )}
        {((!ignorarSequencia && gapsStats && gapsStats.gapsCount === 0) || ignorarSequencia) && (
          <span className="absolute -top-1 -right-1 w-[10px] h-[10px] rounded-full bg-emerald-400 border-2 border-white" />
        )}
      </button>
      <Button variant="outline" size="sm" className="gap-2 text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600" onClick={() => setShowTemplate(true)}>
        <Settings className="w-4 h-4" /> Template
      </Button>
      <Button size="sm" variant="outline" className="gap-2 border-orange-200 text-orange-700 hover:bg-orange-50 bg-orange-50/50" onClick={() => setShowEnriquecer(true)}>
        <TrendingUp className="w-4 h-4" /> Enriquecer dados
      </Button>
      <Button size="sm" variant="outline" className="gap-2 border-violet-200 text-violet-700 hover:bg-violet-50 bg-violet-50/50" onClick={() => setShowImportSituacoes(true)}>
        <RefreshCw className="w-4 h-4" /> Atualizar situações
      </Button>
      <Button size="sm" variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/50" onClick={() => setShowImportIntimados(true)}>
        <FileCheck className="w-4 h-4" /> Importar intimações
      </Button>
      <Button size="sm" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white gap-2 shadow-md shadow-blue-200" onClick={() => setShowImport(true)}>
        <Upload className="w-4 h-4" /> Importar protocolos
      </Button>
    </>
  );

  return (
    <>
      <GlobalNav actions={navActions} />
      <PageLayout className="bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: gapsStats?.hasFilter ? "Total filtrado" : "Total de protocolos", value: (gapsStats?.totalFiltrado != null ? gapsStats.totalFiltrado : pagination.total).toLocaleString("pt-BR"), color: "text-slate-800", bg: "bg-white", iconBg: "bg-blue-50", iconColor: "text-blue-500", Icon: CheckCheck, filter: null, subtitle: gapsStats?.hasFilter ? "do filtro ativo" : undefined },
            { label: "Pendentes", value: gapsStats?.totalPendentes != null ? gapsStats.totalPendentes.toLocaleString("pt-BR") : rows.filter((r) => r.statusIntimacao === "pendente").length, color: "text-amber-600", bg: statusFilter === "pendente" ? "bg-amber-50" : "bg-white", iconBg: "bg-amber-50", iconColor: "text-amber-500", Icon: Clock, filter: "pendente", subtitle: gapsStats?.hasFilter ? "no filtro ativo" : undefined },
            { label: "Intimados", value: gapsStats?.totalIntimados != null ? gapsStats.totalIntimados.toLocaleString("pt-BR") : rows.filter((r) => r.statusIntimacao === "intimado").length, color: "text-emerald-600", bg: statusFilter === "intimado" ? "bg-emerald-50" : "bg-white", iconBg: "bg-emerald-50", iconColor: "text-emerald-500", Icon: CheckCircle2, filter: "intimado", subtitle: gapsStats?.hasFilter ? "no filtro ativo" : undefined },
            { label: "Selecionados", value: selectedIds.size, color: "text-blue-600", bg: "bg-white", iconBg: "bg-blue-50", iconColor: "text-blue-500", Icon: Users, filter: null, subtitle: undefined },
          ].map((card) => (
            <div
              key={card.label}
              onClick={() => { if (card.filter) handleStatusFilter(card.filter === statusFilter ? "todos" : card.filter); }}
              className={`${card.bg} rounded-2xl p-4 shadow-sm border border-slate-100 transition-all ${
                card.filter ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.99]" : ""
              } ${card.filter && statusFilter === card.filter ? "ring-2 ring-offset-1 " + (card.filter === "pendente" ? "ring-amber-400" : "ring-emerald-400") : ""}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {card.label}
                    {card.subtitle && <span className="ml-1 text-blue-400 font-medium">· {card.subtitle}</span>}
                    {card.filter && !card.subtitle && <span className="ml-1 text-slate-400">{statusFilter === card.filter ? "✓ filtrado" : "→ clique para filtrar"}</span>}
                  </p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${card.iconBg}`}>
                  <card.Icon className={`w-4 h-4 ${card.iconColor}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                className="pl-9 rounded-xl border-slate-200 bg-slate-50"
                placeholder="Buscar por nome, CPF (com ou sem pontos), protocolo, título, credor…"
                value={q}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={handleStatusFilter}>
              <SelectTrigger className="w-40 rounded-xl border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
                <SelectItem value="intimado">Intimados</SelectItem>
                <SelectItem value="edital">Por Edital</SelectItem>
                <SelectItem value="encerrado">Encerrados</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 rounded-xl border-slate-200 ${showAdvancedFilters ? "bg-blue-50 border-blue-300 text-blue-700" : ""}`}
              onClick={() => setShowAdvancedFilters((v) => !v)}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros avançados
              {activeAdvancedFiltersCount > 0 && (
                <span className="ml-1 bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{activeAdvancedFiltersCount}</span>
              )}
            </Button>
          </div>

          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div className="border border-blue-100 rounded-xl bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" /> Filtros avançados</p>
                {activeAdvancedFiltersCount > 0 && (
                  <button onClick={handleClearAdvancedFilters} className="text-xs text-red-500 hover:text-red-700 underline">Limpar tudo</button>
                )}
              </div>
              {/* Column filter */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-48">
                  <Select value={filterCol || "__none__"} onValueChange={(v) => setFilterCol(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="w-44 h-8 text-xs rounded-lg border-slate-200 bg-white">
                      <SelectValue placeholder="Coluna..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Selecionar coluna</SelectItem>
                      <SelectItem value="protocolo">Protocolo</SelectItem>
                      <SelectItem value="nomeDevedor">Nome do devedor</SelectItem>
                      <SelectItem value="documento">CPF / CNPJ</SelectItem>
                      <SelectItem value="numeroTitulo">Nº Título</SelectItem>
                      <SelectItem value="credor">Credor</SelectItem>
                      <SelectItem value="telefone">Telefone</SelectItem>
                      <SelectItem value="valorProtesto">Valor</SelectItem>
                      <SelectItem value="situacaoTitulo">Situação</SelectItem>
                      <SelectItem value="nomeArquivo">Arquivo</SelectItem>
                      <SelectItem value="canalIntimacao">Canal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-xs rounded-lg border-slate-200 bg-white flex-1"
                    placeholder="Buscar nesta coluna..."
                    value={filterVal}
                    onChange={(e) => setFilterVal(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyAdvancedFilters()}
                  />
                </div>
                {/* Phone search */}
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    className="h-8 text-xs rounded-lg border-slate-200 bg-white pl-8 w-44"
                    placeholder="Buscar por telefone..."
                    value={telefoneFilter}
                    onChange={(e) => setTelefoneFilter(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyAdvancedFilters()}
                  />
                </div>
              </div>
              {/* Date filters */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-slate-500 font-medium">Data protocolo:</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">De</span>
                  <input
                    type="date"
                    className="h-8 text-xs rounded-lg border border-slate-200 bg-white px-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Até</span>
                  <input
                    type="date"
                    className="h-8 text-xs rounded-lg border border-slate-200 bg-white px-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Competência</span>
                  <input
                    type="month"
                    className="h-8 text-xs rounded-lg border border-slate-200 bg-white px-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={competencia}
                    onChange={(e) => setCompetencia(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-8 text-xs rounded-lg bg-blue-600 hover:bg-blue-700" onClick={handleApplyAdvancedFilters}>
                  <Filter className="w-3.5 h-3.5 mr-1" /> Aplicar filtros
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs rounded-lg border-slate-200" onClick={handleClearAdvancedFilters}>
                  Limpar
                </Button>
              </div>
            </div>
          )}

          {/* Filter tags — all active filters shown as removable chips */}
          {(filterTags.length > 0 || dataInicio || dataFim || competencia || (filterCol && filterVal) || telefoneFilter) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Filtros ativos:</span>
              {/* Advanced filter chips */}
              {dataInicio && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium border border-violet-200">
                  📅 De: {dataInicio}
                  <button onClick={() => { setDataInicio(""); setTimeout(() => { fetchRows(1, q, statusFilter, filterTags); fetchGapsStats(); }, 50); }} className="ml-0.5 hover:text-violet-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              {dataFim && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium border border-violet-200">
                  📅 Até: {dataFim}
                  <button onClick={() => { setDataFim(""); setTimeout(() => { fetchRows(1, q, statusFilter, filterTags); fetchGapsStats(); }, 50); }} className="ml-0.5 hover:text-violet-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              {competencia && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium border border-indigo-200">
                  🗓 Competência: {competencia}
                  <button onClick={() => { setCompetencia(""); setTimeout(() => { fetchRows(1, q, statusFilter, filterTags); fetchGapsStats(); }, 50); }} className="ml-0.5 hover:text-indigo-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              {filterCol && filterVal && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-medium border border-teal-200">
                  🔍 {filterCol}: {filterVal}
                  <button onClick={() => { setFilterCol(""); setFilterVal(""); setTimeout(() => { fetchRows(1, q, statusFilter, filterTags); fetchGapsStats(); }, 50); }} className="ml-0.5 hover:text-teal-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              {telefoneFilter && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-100 text-cyan-700 text-xs font-medium border border-cyan-200">
                  📱 Tel: {telefoneFilter}
                  <button onClick={() => { setTelefoneFilter(""); setTimeout(() => { fetchRows(1, q, statusFilter, filterTags); fetchGapsStats(); }, 50); }} className="ml-0.5 hover:text-cyan-900"><X className="w-3 h-3" /></button>
                </span>
              )}
              {/* Name/document filter tags */}
              {filterTags.map((tag) => (
                <span
                  key={tag.value}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium border border-blue-200"
                >
                  {tag.type === "documento" ? "📋" : "👤"} {tag.label}
                  <button
                    onClick={() => removeFilterTag(tag.value)}
                    className="ml-0.5 hover:text-blue-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  setDataInicio(""); setDataFim(""); setCompetencia(""); setFilterCol(""); setFilterVal(""); setTelefoneFilter("");
                  clearAllTags();
                  setTimeout(() => fetchGapsStats(), 50);
                }}
                className="text-xs text-slate-400 hover:text-red-500 underline"
              >
                Limpar todos
              </button>
            </div>
          )}
        </div>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl p-3 flex items-center justify-between flex-wrap gap-2 shadow-lg shadow-blue-200">
            <span className="text-white text-sm font-medium">{selectedIds.size} protocolo(s) selecionado(s)</span>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="gap-1.5 bg-white/10 text-white border-white/30 hover:bg-white/20" onClick={handleBulkMarkIntimado}>
                <CheckCheck className="w-4 h-4" /> Marcar intimado
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 bg-white/10 text-white border-white/30 hover:bg-white/20" onClick={() => markStatus(Array.from(selectedIds), "pendente", null)}>
                <Clock className="w-4 h-4" /> Reverter pendente
              </Button>
              <Button size="sm" className="gap-1.5 bg-white text-blue-600 hover:bg-white/90" onClick={() => {
                // Build all messages and copy directly to clipboard
                const groups = new Map<string, { nome: string; doc: string; rows: Protocolo[] }>();
                for (const r of selectedRows) {
                  const key = r.documento || r.nomeDevedor || r.protocolo;
                  if (!groups.has(key)) {
                    groups.set(key, { nome: r.nomeDevedor || "Devedor", doc: formatDoc(r.documento), rows: [] });
                  }
                  groups.get(key)!.rows.push(r);
                }
                const msgs = Array.from(groups.values())
                  .map(({ nome, doc, rows }) => buildMessage(template, nome, doc, rows))
                  .join("\n\n---\n\n");
                navigator.clipboard.writeText(msgs)
                  .then(() => toast.success(`Mensagem copiada para ${groups.size} devedor(es)!`))
                  .catch(() => { toast.error("Não foi possível copiar automaticamente."); setShowCopyMsg(true); });
              }}>
                <MessageSquare className="w-4 h-4" /> Copiar mensagem
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 bg-white/10 text-white border-white/30 hover:bg-white/20" onClick={() => setShowSituacaoModal(true)}>
                <RefreshCw className="w-4 h-4" /> Atualizar situação
              </Button>
            </div>
          </div>
        )}

        {/* Top Pagination + Page Size */}
        <div className="flex items-center justify-between px-4 py-2 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500">
              {pageLimit === 99999
                ? `${pagination.total.toLocaleString("pt-BR")} registros (todos)`
                : `Página ${page} de ${pagination.pages} · ${pagination.total.toLocaleString("pt-BR")} registros`}
            </p>
            <Select
              value={String(pageLimit)}
              onValueChange={(v) => {
                const newLimit = Number(v);
                setPageLimit(newLimit);
                setPage(1);
                setLoading(true);
                const params = buildQuery(1, q, statusFilter, filterTags);
                params.set("limit", String(newLimit));
                fetch(`/api/protocolos?${params}`)
                  .then((r) => r.json())
                  .then((d) => { setRows(d.data || []); setPagination(d.pagination); })
                  .catch(() => toast.error("Erro ao carregar."))
                  .finally(() => setLoading(false));
              }}
            >
              <SelectTrigger className="h-7 text-xs w-28 rounded-lg border-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 por pág.</SelectItem>
                <SelectItem value="100">100 por pág.</SelectItem>
                <SelectItem value="500">500 por pág.</SelectItem>
                <SelectItem value="1000">1000 por pág.</SelectItem>
                <SelectItem value="99999">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {pageLimit !== 99999 && pagination.pages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page <= 1} onClick={() => handlePageChange(page - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs px-2 text-slate-600 font-medium">{page} / {pagination.pages}</span>
              <Button variant="outline" size="icon" className="w-7 h-7" disabled={page >= pagination.pages} onClick={() => handlePageChange(page + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-blue-50/50 border-b border-slate-100">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={rows.length > 0 && selectedIds.size === rows.length}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  {([
                    { col: "protocolo", label: "Protocolo" },
                    { col: "dataProtocolo", label: "Data" },
                    { col: "nomeDevedor", label: "Nome do devedor" },
                    { col: "documento", label: "CPF / CNPJ" },
                    { col: "numeroTitulo", label: "Nº Título" },
                    { col: "credor", label: "Credor" },
                    { col: "telefone", label: "Telefone" },
                    { col: "statusIntimacao", label: "Status" },
                  ] as { col: string; label: string }[]).map(({ col, label }) => (
                    <th
                      key={col}
                      className="p-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 hover:bg-blue-50/60 transition-colors"
                      onClick={() => handleSort(col)}
                    >
                      <span className="inline-flex items-center gap-0.5">
                        {label}
                        <SortIcon col={col} orderBy={orderBy} orderDir={orderDir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      <RefreshCw className="w-5 h-5 animate-spin inline mr-2" />
                      Carregando…
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-muted-foreground">
                      <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Nenhum protocolo encontrado</p>
                      <p className="text-sm mt-1">Importe uma planilha para começar.</p>
                    </td>
                  </tr>
                )}
                {!loading && rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/80 transition-colors ${selectedIds.has(row.id) ? "bg-blue-50/40" : ""} ${row.tituloEncerrado ? "opacity-60" : ""}`}
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => toggleSelect(row.id)}
                      />
                    </td>
                    <td className="p-3 font-mono text-xs font-medium text-slate-600">
                      <div className="flex flex-col gap-0.5">
                        <span>{row.protocolo}</span>
                        {row.situacaoTitulo && (
                          <SituacaoBadge situacao={row.situacaoTitulo} />
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                      {row.dataProtocolo
                        ? (() => {
                            const [y, m, d] = String(row.dataProtocolo).split("-");
                            return `${d}/${m}/${y}`;
                          })()
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-3 max-w-48 truncate">
                      <button
                        className="text-left text-blue-600 hover:text-blue-800 hover:underline transition-colors font-medium"
                        onClick={() => addFilterTag({ label: row.nomeDevedor || row.protocolo, value: row.documento || row.nomeDevedor || row.protocolo, type: "nome" })}
                        title="Filtrar todos os protestos desta pessoa"
                      >
                        {row.nomeDevedor || "—"}
                      </button>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      <div className="flex items-center gap-1">
                        {row.documento ? (
                          <button
                            className="hover:text-indigo-600 hover:underline transition-colors font-mono text-xs text-slate-700"
                            onClick={() => addFilterTag({ label: formatDoc(row.documento), value: row.documento!, type: "documento" })}
                            title="Filtrar todos os protestos deste CPF/CNPJ"
                          >
                            {formatDoc(row.documento)}
                          </button>
                        ) : <span className="text-slate-300">—</span>}
                        {row.tipoDoc !== "INVALIDO" && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${row.tipoDoc === "CPF" ? "border-blue-200 text-blue-600 bg-blue-50" : "border-orange-200 text-orange-600 bg-orange-50"}`}>
                            {row.tipoDoc}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs font-mono text-slate-600">{row.numeroTitulo || <span className="text-slate-300">—</span>}</td>
                    <td className="p-3 max-w-36 truncate text-xs text-slate-600">{row.credor || <span className="text-slate-300">—</span>}</td>
                    <td className="p-3 font-mono text-xs text-slate-600">{row.telefone || <span className="text-slate-300">—</span>}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {!row.tituloEncerrado && (
                          <Switch
                            checked={row.statusIntimacao === "intimado"}
                            onCheckedChange={() => handleInlineToggle(row)}
                            className="data-[state=checked]:bg-green-500"
                          />
                        )}
                        <div className="flex flex-col">
                          <span className={`text-xs font-medium ${row.tituloEncerrado ? "text-slate-400" : row.statusIntimacao === "intimado" ? "text-green-600" : "text-amber-600"}`}>
                            {row.tituloEncerrado ? "Encerrado" : row.statusIntimacao === "intimado" ? "Intimado" : "Pendente"}
                          </span>
                          {row.canalIntimacao && (
                            <span className="text-[10px] text-muted-foreground">{row.canalIntimacao}</span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </div>

      {/* Gaps Side Panel */}
      <Sheet open={showGapsPanel} onOpenChange={setShowGapsPanel}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center gap-2 text-slate-800">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              Verificação de Consistência
            </SheetTitle>
          </SheetHeader>

          <div className="py-4 space-y-5">

            {/* ── Preferences ── */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Configurações</p>

              {/* Data de corte */}
              <div className="space-y-1">
                <Label className="text-xs text-slate-600">Data de corte (protocolos a partir de)</Label>
                <input
                  type="date"
                  value={dataCorte}
                  onChange={(e) => { setDataCorte(e.target.value); setGapsLoaded(false); }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <p className="text-[11px] text-slate-400">Protocolos com data anterior a esta data são ignorados na análise.</p>
              </div>

              {/* Ignorar sequência */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-700">Ignorar verificação de sequência</p>
                  <p className="text-[11px] text-slate-400">Desativa o badge e a análise de gaps.</p>
                </div>
                <Switch
                  checked={ignorarSequencia}
                  onCheckedChange={(v) => { setIgnorarSequencia(v); setGapsLoaded(false); }}
                />
              </div>
            </div>

            {/* Verificação desativada */}
            {ignorarSequencia && (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <Bell className="w-6 h-6 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">Verificação desativada</p>
                <p className="text-xs text-slate-400">Ative a verificação de sequência para ver os protocolos faltantes.</p>
              </div>
            )}

            {/* Summary cards */}
            {!ignorarSequencia && gapsStats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                  <p className="text-xs text-blue-600 font-medium">Intervalo</p>
                  <p className="text-sm font-bold text-blue-800 mt-0.5">
                    {gapsStats.min?.toLocaleString("pt-BR")} – {gapsStats.max?.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs text-slate-500 font-medium">Protocolos no banco</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{gapsStats.total.toLocaleString("pt-BR")}</p>
                </div>
                <div className={`rounded-xl border p-3 col-span-2 ${
                  gapsStats.gapsCount === 0
                    ? "bg-emerald-50 border-emerald-100"
                    : "bg-amber-50 border-amber-200"
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs font-medium ${
                        gapsStats.gapsCount === 0 ? "text-emerald-600" : "text-amber-700"
                      }`}>
                        {gapsStats.gapsCount === 0 ? "✅ Nenhum protocolo faltando!" : "⚠️ Protocolos faltantes"}
                      </p>
                      {gapsStats.gapsCount > 0 && (
                        <p className="text-xl font-bold text-amber-800 mt-0.5">
                          {gapsStats.gapsCount.toLocaleString("pt-BR")} faltando
                        </p>
                      )}
                    </div>
                    {gapsStats.gapsCount > 0 && (
                      <Button size="sm" variant="outline" className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100" onClick={downloadGapsCsv}>
                        <Download className="w-3.5 h-3.5" />
                        Exportar CSV
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Loading */}
            {!ignorarSequencia && gapsLoading && (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span className="text-sm">Calculando gaps…</span>
              </div>
            )}

            {/* Gap ranges list */}
            {!ignorarSequencia && !gapsLoading && gapRanges.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-amber-500" />
                    Faixas de protocolos faltantes
                  </p>
                  <span className="text-xs text-slate-400">{gapRanges.length} faixa(s)</span>
                </div>
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                  {gapRanges.map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-amber-50/60 border border-amber-100 px-3 py-2">
                      <div className="text-sm">
                        {r.start === r.end ? (
                          <span className="font-mono text-slate-700">{r.start.toLocaleString("pt-BR")}</span>
                        ) : (
                          <span className="font-mono text-slate-700">
                            {r.start.toLocaleString("pt-BR")} – {r.end.toLocaleString("pt-BR")}
                          </span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                        {r.count === 1 ? "1 protocolo" : `${r.count} protocolos`}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No gaps */}
            {!ignorarSequencia && !gapsLoading && gapsLoaded && gapRanges.length === 0 && gapsStats && gapsStats.total > 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                </div>
                <p className="text-sm font-semibold text-emerald-700">Sequência completa!</p>
                <p className="text-xs text-slate-500">Todos os protocolos de {gapsStats.min?.toLocaleString("pt-BR")} a {gapsStats.max?.toLocaleString("pt-BR")} estão importados.</p>
              </div>
            )}

            {/* Empty state */}
            {!ignorarSequencia && !gapsLoading && gapsLoaded && (!gapsStats || gapsStats.total === 0) && (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                  <Bell className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-sm text-slate-500">Nenhum protocolo importado ainda.</p>
              </div>
            )}

            {/* Reload button */}
            {!ignorarSequencia && gapsLoaded && (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 text-slate-500"
                onClick={() => { setGapsLoaded(false); fetchGapsFull(); }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Recalcular
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Modals */}
      <EnriquecerModal open={showEnriquecer} onClose={() => setShowEnriquecer(false)} onEnriquecido={() => { fetchRows(page, q, statusFilter, filterTags); fetchGapsStats(); }} />
      <ImportModal open={showImport} onClose={() => setShowImport(false)} onImported={() => { fetchRows(1, q, statusFilter, filterTags); setGapsLoaded(false); fetchGapsStats(); }} />
      <ImportIntimadosModal open={showImportIntimados} onClose={() => setShowImportIntimados(false)} onImported={() => fetchRows(page, q, statusFilter, filterTags)} />
      <ImportSituacoesModal
        open={showImportSituacoes}
        onClose={() => setShowImportSituacoes(false)}
        onImported={() => { fetchRows(page, q, statusFilter, filterTags); setGapsLoaded(false); fetchGapsStats(); }}
      />
      <SituacaoModal
        open={showSituacaoModal}
        ids={Array.from(selectedIds)}
        onClose={() => setShowSituacaoModal(false)}
        onUpdated={() => { fetchRows(page, q, statusFilter, filterTags); setSelectedIds(new Set()); }}
      />
      <TemplateModal open={showTemplate} onClose={() => { setShowTemplate(false); fetchTemplate(); }} />
      <CanalModal
        open={showCanalModal}
        count={pendingToggleId !== null ? 1 : selectedIds.size}
        onConfirm={handleCanalConfirm}
        onClose={handleCanalClose}
      />
      {showCopyMsg && (
        <CopyMessageModal open={showCopyMsg} onClose={() => setShowCopyMsg(false)} selectedRows={selectedRows} template={template} />
      )}
      </PageLayout>
    </>
  );
}

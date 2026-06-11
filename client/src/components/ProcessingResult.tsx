import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Package, RotateCcw, Phone, MessageSquare, Users, UserX, FileText, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface FileInfo {
  url: string;
  key: string;
  name: string;
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
    cpfLigacao: FileInfo;
    cpfSms: FileInfo;
    cnpjLigacao: FileInfo;
    cnpjSms: FileInfo;
  };
  preview: {
    cpfLigacao: Record<string, string>[];
    cpfSms: Record<string, string>[];
    cnpjLigacao: Record<string, string>[];
    cnpjSms: Record<string, string>[];
  };
}

interface Props {
  result: ProcessResponse;
  onReset: () => void;
}

function MetricCard({ icon: Icon, label, value, sub, color = "default" }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "primary" | "green" | "red" | "amber";
}) {
  const colorMap = {
    default: "text-foreground",
    primary: "text-primary",
    green: "text-emerald-400",
    red: "text-red-400",
    amber: "text-amber-400",
  };
  const bgMap = {
    default: "bg-muted/30",
    primary: "bg-primary/10",
    green: "bg-emerald-500/10",
    red: "bg-red-500/10",
    amber: "bg-amber-500/10",
  };
  return (
    <Card className="p-5 bg-card border-border/50">
      <div className={`w-9 h-9 rounded-lg ${bgMap[color]} flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${colorMap[color]}`} />
      </div>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground/70 mt-1">{sub}</p>}
    </Card>
  );
}

function DownloadCard({ file, label, type, color }: { file: FileInfo; label: string; type: "ligacao" | "sms"; color: string }) {
  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.name;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success(`Download iniciado: ${file.name}`);
  };

  return (
    <Card
      className={`p-5 border cursor-pointer transition-all hover:scale-[1.01] hover:shadow-lg ${color}`}
      onClick={handleDownload}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg bg-current/10 flex items-center justify-center">
          {type === "ligacao" ? <Phone className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
        </div>
        <Download className="w-4 h-4 opacity-60" />
      </div>
      <p className="font-semibold text-sm">{label}</p>
      <p className="text-xs opacity-70 mt-0.5">{file.name}</p>
      <Badge variant="outline" className="mt-2 text-xs border-current/20 bg-current/5">
        {type === "ligacao" ? "CSV ; separador" : "CSV padrão"}
      </Badge>
    </Card>
  );
}

function PreviewTable({ rows }: { rows: Record<string, string>[] }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro neste arquivo.</p>;
  }
  const headers = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th key={h} className="text-left py-2.5 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/30 hover:bg-accent/30 transition-colors">
              {headers.map((h) => (
                <td key={h} className="py-2.5 pr-4 text-foreground/80 text-xs whitespace-nowrap max-w-48 truncate">
                  {row[h] || <span className="text-muted-foreground/40">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 50 && (
        <p className="text-xs text-muted-foreground text-center py-3">Exibindo os primeiros 50 registros</p>
      )}
    </div>
  );
}

export default function ProcessingResult({ result, onReset }: Props) {
  const [isZipping, setIsZipping] = useState(false);
  const { metrics, files, preview } = result;

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const res = await fetch("/api/upload/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) throw new Error("Erro ao gerar ZIP");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "processamento.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("ZIP baixado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar ZIP");
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Processamento concluído</span>
          </div>
          <h2 className="text-2xl font-bold text-foreground">Resultado do processamento</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
          >
            {isZipping ? (
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            ) : (
              <Package className="w-4 h-4" />
            )}
            Baixar tudo (ZIP)
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} className="gap-2 text-muted-foreground hover:text-foreground">
            <RotateCcw className="w-4 h-4" />
            Nova planilha
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <MetricCard icon={FileText} label="Total de registros" value={metrics.totalRegistros} color="default" />
        <MetricCard icon={Users} label="Com contato" value={metrics.totalComContato} color="green" />
        <MetricCard icon={UserX} label="Sem contato" value={metrics.totalSemContato} color="red" />
        <MetricCard icon={TrendingUp} label="Linhas geradas" value={metrics.totalLinhasGeradas} sub="após expansão de telefones" color="primary" />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        <Card className="p-5 bg-card border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-foreground">{metrics.totalCpf.toLocaleString("pt-BR")}</p>
              <p className="text-sm text-muted-foreground">Registros CPF</p>
            </div>
            <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/20 hover:bg-blue-500/15">11 dígitos</Badge>
          </div>
        </Card>
        <Card className="p-5 bg-card border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-foreground">{metrics.totalCnpj.toLocaleString("pt-BR")}</p>
              <p className="text-sm text-muted-foreground">Registros CNPJ</p>
            </div>
            <Badge className="bg-violet-500/15 text-violet-400 border-violet-500/20 hover:bg-violet-500/15">14 dígitos</Badge>
          </div>
        </Card>
      </div>

      {/* Download cards */}
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Arquivos gerados</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <DownloadCard
          file={files.cpfLigacao}
          label="CPF — Ligação"
          type="ligacao"
          color="border-blue-500/20 text-blue-400 hover:border-blue-500/40 hover:bg-blue-500/5"
        />
        <DownloadCard
          file={files.cpfSms}
          label="CPF — SMS"
          type="sms"
          color="border-cyan-500/20 text-cyan-400 hover:border-cyan-500/40 hover:bg-cyan-500/5"
        />
        <DownloadCard
          file={files.cnpjLigacao}
          label="CNPJ — Ligação"
          type="ligacao"
          color="border-violet-500/20 text-violet-400 hover:border-violet-500/40 hover:bg-violet-500/5"
        />
        <DownloadCard
          file={files.cnpjSms}
          label="CNPJ — SMS"
          type="sms"
          color="border-purple-500/20 text-purple-400 hover:border-purple-500/40 hover:bg-purple-500/5"
        />
      </div>

      {/* Preview tabs */}
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Prévia dos arquivos</h3>
      <Card className="bg-card border-border/50 overflow-hidden">
        <Tabs defaultValue="cpfLigacao">
          <div className="border-b border-border/50 px-4">
            <TabsList className="bg-transparent h-12 gap-1">
              <TabsTrigger value="cpfLigacao" className="text-xs data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-400">
                CPF Ligação ({preview.cpfLigacao.length})
              </TabsTrigger>
              <TabsTrigger value="cpfSms" className="text-xs data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400">
                CPF SMS ({preview.cpfSms.length})
              </TabsTrigger>
              <TabsTrigger value="cnpjLigacao" className="text-xs data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-400">
                CNPJ Ligação ({preview.cnpjLigacao.length})
              </TabsTrigger>
              <TabsTrigger value="cnpjSms" className="text-xs data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-400">
                CNPJ SMS ({preview.cnpjSms.length})
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="p-4">
            <TabsContent value="cpfLigacao" className="mt-0">
              <PreviewTable rows={preview.cpfLigacao} />
            </TabsContent>
            <TabsContent value="cpfSms" className="mt-0">
              <PreviewTable rows={preview.cpfSms} />
            </TabsContent>
            <TabsContent value="cnpjLigacao" className="mt-0">
              <PreviewTable rows={preview.cnpjLigacao} />
            </TabsContent>
            <TabsContent value="cnpjSms" className="mt-0">
              <PreviewTable rows={preview.cnpjSms} />
            </TabsContent>
          </div>
        </Tabs>
      </Card>
    </div>
  );
}

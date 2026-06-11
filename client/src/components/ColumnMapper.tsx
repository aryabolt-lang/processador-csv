import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Zap, FileText, Phone, AlertCircle, ChevronRight, Info } from "lucide-react";

export interface ColMapping {
  nome: string | null;
  documento: string | null;
  telefone1: string | null;
  telefone2: string | null;
  telefone3: string | null;
  telefone4: string | null;
  semContato?: string | null; // deprecated — detected automatically in phone cells
}

interface Props {
  headers: string[];
  suggestions: Array<{ field: keyof ColMapping; column: string | null; confidence: number }>;
  mapping: ColMapping;
  onChange: (m: ColMapping) => void;
  totalRows: number;
  previewRows: Record<string, string>[];
  fileName: string;
  onProcess: () => void;
  isProcessing: boolean;
}

const FIELD_META: Partial<Record<keyof ColMapping, { label: string; icon: React.ReactNode; required: boolean; desc: string }>> = {
  nome: { label: "Nome do devedor", icon: <FileText className="w-4 h-4" />, required: true, desc: "Coluna com o nome completo" },
  documento: { label: "CPF / CNPJ", icon: <FileText className="w-4 h-4" />, required: true, desc: "Documento do devedor (11 ou 14 dígitos)" },
  telefone1: { label: "Telefone 1", icon: <Phone className="w-4 h-4" />, required: false, desc: "Primeiro número de contato" },
  telefone2: { label: "Telefone 2", icon: <Phone className="w-4 h-4" />, required: false, desc: "Segundo número de contato" },
  telefone3: { label: "Telefone 3", icon: <Phone className="w-4 h-4" />, required: false, desc: "Terceiro número de contato" },
  telefone4: { label: "Telefone 4", icon: <Phone className="w-4 h-4" />, required: false, desc: "Quarto número de contato" },
  // semContato removed from UI — detected automatically in phone cells
};

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 80) return <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15">Alta confiança</Badge>;
  if (confidence >= 50) return <Badge className="text-xs bg-amber-500/15 text-amber-400 border-amber-500/20 hover:bg-amber-500/15">Média confiança</Badge>;
  return <Badge className="text-xs bg-muted text-muted-foreground hover:bg-muted">Não identificado</Badge>;
}

export default function ColumnMapper({ headers, suggestions, mapping, onChange, totalRows, previewRows, fileName, onProcess, isProcessing }: Props) {
  const getConfidence = (field: keyof ColMapping) => suggestions.find((s) => s.field === field)?.confidence ?? 0;

  const setField = (field: keyof ColMapping, value: string) => {
    onChange({ ...mapping, [field]: value === "__none__" ? null : value });
  };

  const hasAtLeastOnePhone = !!(mapping.telefone1 || mapping.telefone2 || mapping.telefone3 || mapping.telefone4);
  const canProcess = !!(mapping.nome || mapping.documento) && hasAtLeastOnePhone;

  const phonesMapped = [mapping.telefone1, mapping.telefone2, mapping.telefone3, mapping.telefone4].filter(Boolean).length;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Mapeamento de Colunas</h2>
          <p className="text-muted-foreground text-sm">
            Verifique e ajuste as colunas identificadas automaticamente para{" "}
            <span className="text-foreground font-medium">{fileName}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-primary">{totalRows.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground">registros encontrados</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mapping form */}
        <div className="lg:col-span-2 space-y-3">
          {(Object.keys(FIELD_META) as Array<keyof ColMapping>).filter(f => f !== 'semContato').map((field) => {
            const meta = FIELD_META[field];
            if (!meta) return null;
            const confidence = getConfidence(field);
            const currentVal = mapping[field];

            return (
              <Card key={field} className={`p-4 border transition-all ${
                currentVal ? "border-primary/20 bg-card" : "border-border/50 bg-card/50"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    currentVal ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                  }`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-foreground">{meta.label}</span>
                      {meta.required && <span className="text-xs text-destructive">*</span>}
                      {currentVal && <ConfidenceBadge confidence={confidence} />}
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.desc}</p>
                  </div>
                  <div className="w-52 flex-shrink-0">
                    <Select
                      value={currentVal ?? "__none__"}
                      onValueChange={(v) => setField(field, v)}
                    >
                      <SelectTrigger className="h-9 text-sm bg-input border-border">
                        <SelectValue placeholder="Selecionar coluna..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="__none__" className="text-muted-foreground">
                          — Não mapear —
                        </SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h} className="text-sm">
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Summary + preview */}
        <div className="space-y-4">
          {/* Summary card */}
          <Card className="p-5 bg-card border-border/50">
            <h3 className="text-sm font-semibold text-foreground mb-4">Resumo do mapeamento</h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Nome</span>
                {mapping.nome ? (
                  <span className="text-foreground font-medium truncate max-w-32 text-right">{mapping.nome}</span>
                ) : (
                  <span className="text-destructive text-xs">Não mapeado</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Documento</span>
                {mapping.documento ? (
                  <span className="text-foreground font-medium truncate max-w-32 text-right">{mapping.documento}</span>
                ) : (
                  <span className="text-muted-foreground text-xs">Não mapeado</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Telefones</span>
                <span className={`font-medium ${phonesMapped > 0 ? "text-primary" : "text-destructive"}`}>
                  {phonesMapped} de 4
                </span>
              </div>
              <div className="flex items-start gap-2 mt-1 p-2.5 rounded-lg bg-secondary/40 text-xs text-secondary-foreground">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-primary/70" />
                <span>Registros com “Sem contato” nas células de telefone são excluídos automaticamente.</span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-border/50">
              {!canProcess && (
                <div className="flex items-start gap-2 text-xs text-amber-400 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>Mapeie pelo menos 1 telefone para processar.</span>
                </div>
              )}
              <Button
                className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={onProcess}
                disabled={!canProcess || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Processar planilha
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Preview */}
          {previewRows.length > 0 && (
            <Card className="p-4 bg-card border-border/50 overflow-hidden">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Prévia dos dados ({previewRows.length} linhas)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      {Object.keys(previewRows[0]).slice(0, 4).map((h) => (
                        <th key={h} className="text-left py-1.5 pr-3 text-muted-foreground font-medium truncate max-w-20">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-border/30">
                        {Object.values(row).slice(0, 4).map((v, j) => (
                          <td key={j} className="py-1.5 pr-3 text-foreground/70 truncate max-w-20">{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

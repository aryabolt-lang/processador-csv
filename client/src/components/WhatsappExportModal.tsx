import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageCircle, Download, Star, Settings } from "lucide-react";
import { Link } from "wouter";

interface TemplateColuna {
  variavel: string;
  cabecalho: string;
}

interface Template {
  id: number;
  nome: string;
  descricao: string | null;
  colunas: TemplateColuna[];
  padrao: number;
}

interface ProcessFiles {
  cpfSms: { url: string; name: string };
  cnpjSms: { url: string; name: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  files: ProcessFiles;
}

const API = "/api/whatsapp";

export default function WhatsappExportModal({ open, onClose, files }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [tipoDoc, setTipoDoc] = useState<"TODOS" | "CPF" | "CNPJ">("TODOS");
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) loadTemplates();
  }, [open]);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/templates`);
      const data: Template[] = await res.json();
      setTemplates(data);
      // Auto-select default template
      const def = data.find((t) => t.padrao === 1);
      setSelectedTemplate(def?.id ?? (data[0]?.id ?? null));
    } catch {
      toast.error("Erro ao carregar templates");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!selectedTemplate) {
      toast.error("Selecione um template");
      return;
    }

    // Determine which source file(s) to use based on tipoDoc filter
    const filesToExport: Array<{ url: string; label: string }> = [];
    if (tipoDoc === "TODOS" || tipoDoc === "CPF") {
      filesToExport.push({ url: files.cpfSms.url, label: "CPF" });
    }
    if (tipoDoc === "TODOS" || tipoDoc === "CNPJ") {
      filesToExport.push({ url: files.cnpjSms.url, label: "CNPJ" });
    }

    setExporting(true);
    try {
      for (const f of filesToExport) {
        const res = await fetch(`${API}/exportar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: selectedTemplate,
            fileUrl: f.url,
            tipoDoc: tipoDoc === "TODOS" ? "TODOS" : tipoDoc,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Erro ao exportar");
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const tpl = templates.find((t) => t.id === selectedTemplate);
        const tplName = tpl ? tpl.nome.replace(/\s+/g, "_") : "template";
        a.download = `WHATSAPP_${f.label}_${tplName}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      toast.success(`Exportação concluída! ${filesToExport.length} arquivo(s) baixado(s).`);
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  const selectedTpl = templates.find((t) => t.id === selectedTemplate);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            Exportar para WhatsApp
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Template selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Template de exportação</label>
              <Link href="/whatsapp-templates">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  onClick={onClose}
                >
                  <Settings className="w-3 h-3" />
                  Gerenciar templates
                </button>
              </Link>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground py-2">Carregando templates...</div>
            ) : templates.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">
                Nenhum template criado.{" "}
                <Link href="/whatsapp-templates">
                  <span className="text-green-600 hover:underline cursor-pointer" onClick={onClose}>
                    Criar agora
                  </span>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((t) => (
                  <label
                    key={t.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedTemplate === t.id
                        ? "border-green-500 bg-green-50"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={selectedTemplate === t.id}
                      onChange={() => setSelectedTemplate(t.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.nome}</span>
                        {t.padrao === 1 && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                            <Star className="w-2.5 h-2.5 fill-current" /> Padrão
                          </Badge>
                        )}
                      </div>
                      {t.descricao && (
                        <p className="text-xs text-muted-foreground mt-0.5">{t.descricao}</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.colunas.map((c, i) => (
                          <span
                            key={i}
                            className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono"
                          >
                            {c.cabecalho}
                          </span>
                        ))}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Tipo de documento filter */}
          <div>
            <label className="text-sm font-medium mb-2 block">Filtrar por tipo de documento</label>
            <div className="flex gap-2">
              {(["TODOS", "CPF", "CNPJ"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTipoDoc(opt)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    tipoDoc === opt
                      ? "bg-green-600 text-white border-green-600"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Preview of what will be generated */}
          {selectedTpl && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Arquivo(s) que serão gerados:
              </p>
              {(tipoDoc === "TODOS" || tipoDoc === "CPF") && (
                <p className="text-xs text-foreground">
                  📄 WHATSAPP_CPF_{selectedTpl.nome.replace(/\s+/g, "_")}.csv
                </p>
              )}
              {(tipoDoc === "TODOS" || tipoDoc === "CNPJ") && (
                <p className="text-xs text-foreground">
                  📄 WHATSAPP_CNPJ_{selectedTpl.nome.replace(/\s+/g, "_")}.csv
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1.5">
                Colunas: {selectedTpl.colunas.map((c) => c.cabecalho).join(", ")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || !selectedTemplate || templates.length === 0}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Exportando..." : "Exportar CSV"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

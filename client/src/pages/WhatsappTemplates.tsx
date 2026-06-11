import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  StarOff,
  GripVertical,
  X,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import GlobalNav, { PageLayout } from "@/components/GlobalNav";

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
  createdAt: string;
  updatedAt: string;
}

interface Variavel {
  variavel: string;
  descricao: string;
}

const API = "/api/whatsapp";

export default function WhatsappTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [variaveis, setVariaveis] = useState<Variavel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showVarHelp, setShowVarHelp] = useState(false);

  // Form state
  const [formNome, setFormNome] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formColunas, setFormColunas] = useState<TemplateColuna[]>([
    { variavel: "{{telefone}}", cabecalho: "Telefone" },
    { variavel: "{{nome}}", cabecalho: "Nome" },
    { variavel: "{{documento_fmt}}", cabecalho: "CPF_CNPJ" },
  ]);
  const [formPadrao, setFormPadrao] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [tRes, vRes] = await Promise.all([
        fetch(`${API}/templates`),
        fetch(`${API}/variaveis`),
      ]);
      setTemplates(await tRes.json());
      setVariaveis(await vRes.json());
    } catch {
      toast.error("Erro ao carregar templates");
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditingTemplate(null);
    setFormNome("");
    setFormDescricao("");
    setFormColunas([
      { variavel: "{{telefone}}", cabecalho: "Telefone" },
      { variavel: "{{nome}}", cabecalho: "Nome" },
      { variavel: "{{documento_fmt}}", cabecalho: "CPF_CNPJ" },
    ]);
    setFormPadrao(false);
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditingTemplate(t);
    setFormNome(t.nome);
    setFormDescricao(t.descricao ?? "");
    setFormColunas(t.colunas.map((c) => ({ ...c })));
    setFormPadrao(t.padrao === 1);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formNome.trim()) {
      toast.error("Nome do template é obrigatório");
      return;
    }
    if (formColunas.length === 0) {
      toast.error("Adicione pelo menos uma coluna");
      return;
    }
    setSaving(true);
    try {
      const body = {
        nome: formNome.trim(),
        descricao: formDescricao.trim() || undefined,
        colunas: formColunas,
        padrao: formPadrao,
      };
      const url = editingTemplate
        ? `${API}/templates/${editingTemplate.id}`
        : `${API}/templates`;
      const method = editingTemplate ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao salvar");
      }
      toast.success(editingTemplate ? "Template atualizado!" : "Template criado!");
      setShowForm(false);
      loadAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`${API}/templates/${id}`, { method: "DELETE" });
      toast.success("Template excluído");
      loadAll();
    } catch {
      toast.error("Erro ao excluir");
    } finally {
      setDeleteId(null);
    }
  }

  async function handleSetPadrao(id: number) {
    try {
      await fetch(`${API}/templates/${id}/padrao`, { method: "POST" });
      toast.success("Template padrão atualizado!");
      loadAll();
    } catch {
      toast.error("Erro ao definir padrão");
    }
  }

  function addColuna() {
    setFormColunas((prev) => [...prev, { variavel: "{{telefone}}", cabecalho: "" }]);
  }

  function removeColuna(idx: number) {
    setFormColunas((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateColuna(idx: number, field: keyof TemplateColuna, value: string) {
    setFormColunas((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
  }

  function moveColuna(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= formColunas.length) return;
    setFormColunas((prev) => {
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  return (
    <>
      <GlobalNav actions={
        <Button onClick={openNew} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
          <Plus className="w-4 h-4" />
          Novo Template
        </Button>
      } />
      <PageLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Templates WhatsApp</h1>
            <p className="text-sm text-muted-foreground">
              Configure os campos exportados para cada campanha
            </p>
          </div>
        </div>
        <Button onClick={openNew} className="gap-2 bg-green-600 hover:bg-green-700 hidden">
          <Plus className="w-4 h-4" />
          Novo Template
        </Button>
      </div>

      {/* Variable reference */}
      <div className="mb-6 border rounded-xl overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted text-sm font-medium"
          onClick={() => setShowVarHelp((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            Variáveis disponíveis para usar nos templates
          </span>
          {showVarHelp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showVarHelp && (
          <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {variaveis.map((v) => (
              <div key={v.variavel} className="flex items-start gap-2">
                <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-green-700 whitespace-nowrap">
                  {v.variavel}
                </code>
                <span className="text-xs text-muted-foreground">{v.descricao}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nenhum template criado ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="border rounded-xl p-4 bg-card flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{t.nome}</span>
                    {t.padrao === 1 && (
                      <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                        Padrão
                      </Badge>
                    )}
                  </div>
                  {t.descricao && (
                    <p className="text-sm text-muted-foreground mt-0.5">{t.descricao}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {t.padrao !== 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      title="Definir como padrão"
                      onClick={() => handleSetPadrao(t.id)}
                    >
                      <StarOff className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  )}
                  {t.padrao === 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      title="Template padrão"
                      disabled
                    >
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => openEdit(t)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(t.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Column preview */}
              <div className="flex flex-wrap gap-1.5">
                {t.colunas.map((col, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 bg-muted/60 rounded-lg px-2 py-1 text-xs"
                  >
                    <span className="text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium">{col.cabecalho}</span>
                    <span className="text-muted-foreground">
                      ({col.variavel})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Editar Template" : "Novo Template WhatsApp"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome do template *</label>
              <Input
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Ex: Template Cobrança Padrão"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Descrição (opcional)</label>
              <Textarea
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                placeholder="Descreva quando usar este template..."
                rows={2}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">
                  Colunas do CSV *{" "}
                  <span className="text-muted-foreground font-normal">
                    (ordem = ordem no arquivo)
                  </span>
                </label>
                <Button size="sm" variant="outline" onClick={addColuna} className="h-7 gap-1 text-xs">
                  <Plus className="w-3 h-3" /> Coluna
                </Button>
              </div>

              <div className="space-y-2">
                {formColunas.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveColuna(idx, -1)}
                        disabled={idx === 0}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => moveColuna(idx, 1)}
                        disabled={idx === formColunas.length - 1}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground w-4 text-right shrink-0">
                      {idx + 1}.
                    </span>
                    <select
                      value={col.variavel}
                      onChange={(e) => updateColuna(idx, "variavel", e.target.value)}
                      className="flex-1 text-sm border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {variaveis.map((v) => (
                        <option key={v.variavel} value={v.variavel}>
                          {v.variavel} — {v.descricao}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={col.cabecalho}
                      onChange={(e) => updateColuna(idx, "cabecalho", e.target.value)}
                      placeholder="Cabeçalho"
                      className="w-32 text-sm"
                    />
                    <button
                      onClick={() => removeColuna(idx)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="padrao"
                checked={formPadrao}
                onChange={(e) => setFormPadrao(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="padrao" className="text-sm">
                Definir como template padrão
              </label>
            </div>

            {/* Preview */}
            {formColunas.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Prévia do cabeçalho CSV:
                </p>
                <code className="text-xs text-green-700 break-all">
                  {formColunas.map((c) => c.cabecalho || c.variavel).join(",")}
                </code>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? "Salvando..." : editingTemplate ? "Salvar alterações" : "Criar template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
      </PageLayout>
    </>
  );
}

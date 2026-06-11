import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Search, Users, Phone, Mail, Star,
  Edit2, Trash2, Plus, ChevronLeft, ChevronRight,
  SortAsc, SortDesc, Clock, AlertCircle, X, Save, History,
  Copy, Check, Building2, User, Upload, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Contato {
  id: number;
  documento: string;
  tipoDoc: "CPF" | "CNPJ" | "INVALIDO";
  nomeRazaoSocial: string | null;
  celular1: string | null;
  celular2: string | null;
  celular3: string | null;
  celular4: string | null;
  email1: string | null;
  email2: string | null;
  email3: string | null;
  origemArquivo: string | null;
  origem?: "importacao" | "manual";
  telefonePrincipal?: number;
  emailPrincipal?: number;
  ultimaEdicao?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HistoricoEntry {
  id: number;
  documento: string;
  acao: string;
  descricao: string | null;
  camposAlterados: Array<{ campo: string; de: string | null; para: string | null }> | null;
  criadoEm: string;
}

interface ContatoFormData {
  documento: string;
  nomeRazaoSocial: string;
  celular1: string;
  celular2: string;
  celular3: string;
  celular4: string;
  email1: string;
  email2: string;
  email3: string;
}

const EMPTY_FORM: ContatoFormData = {
  documento: "", nomeRazaoSocial: "",
  celular1: "", celular2: "", celular3: "", celular4: "",
  email1: "", email2: "", email3: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDoc(doc: string, tipo: string) {
  if (tipo === "CPF" && doc.length === 11)
    return `${doc.slice(0,3)}.${doc.slice(3,6)}.${doc.slice(6,9)}-${doc.slice(9)}`;
  if (tipo === "CNPJ" && doc.length === 14)
    return `${doc.slice(0,2)}.${doc.slice(2,5)}.${doc.slice(5,8)}/${doc.slice(8,12)}-${doc.slice(12)}`;
  return doc;
}

function fmtPhone(p: string | null) {
  if (!p) return null;
  if (p.length === 11) return `(${p.slice(0,2)}) ${p.slice(2,7)}-${p.slice(7)}`;
  if (p.length === 10) return `(${p.slice(0,2)}) ${p.slice(2,6)}-${p.slice(6)}`;
  return p;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function acaoLabel(acao: string) {
  const map: Record<string, string> = {
    criado: "Criado manualmente",
    importado: "Importado",
    editado: "Editado",
    atualizado_importacao: "Atualizado via importação",
    favorito_alterado: "Favorito alterado",
  };
  return map[acao] ?? acao;
}

function acaoColor(acao: string) {
  if (acao === "criado") return "text-emerald-600";
  if (acao === "editado") return "text-blue-600";
  if (acao === "favorito_alterado") return "text-amber-600";
  return "text-purple-600";
}

// ─── CopyButton ───────────────────────────────────────────────────────────────
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 p-0.5 rounded hover:bg-pink-100 transition-colors text-gray-400 hover:text-pink-500">
      {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
    </button>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function BaseContatos() {
  const [, navigate] = useLocation();

  // List
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<"" | "CPF" | "CNPJ">("");
  const [sort, setSort] = useState<"recent" | "az" | "za">("recent");

  // Detail
  const [selected, setSelected] = useState<Contato | null>(null);
  const [historico, setHistorico] = useState<HistoricoEntry[]>([]);
  const [detailTab, setDetailTab] = useState<"info" | "historico">("info");
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formData, setFormData] = useState<ContatoFormData>(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchList = useCallback(async (newPage = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(newPage), limit: "50", sort });
      if (q) params.set("q", q);
      if (tipo) params.set("tipo", tipo);
      const res = await fetch(`/api/contatos?${params}`);
      const data = await res.json();
      setContatos(data.data ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
      setPage(newPage);
    } catch { toast.error("Erro ao carregar contatos"); }
    finally { setLoading(false); }
  }, [q, tipo, sort]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchList(1), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [fetchList]);

  const fetchHistorico = async (doc: string) => {
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/contatos/${doc}/historico`);
      const data = await res.json();
      setHistorico(Array.isArray(data) ? data : []);
    } catch { setHistorico([]); }
    finally { setLoadingHistorico(false); }
  };

  const selectContato = (c: Contato) => {
    setSelected(c);
    setDetailTab("info");
    fetchHistorico(c.documento);
  };

  // ── Favoritar ──────────────────────────────────────────────────────────────
  const favoritar = async (doc: string, tipoFav: "telefone" | "email", valor: number) => {
    try {
      const res = await fetch(`/api/contatos/${doc}/favoritar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoFav, valor }),
      });
      const updated = await res.json();
      if (!res.ok) { toast.error(updated.error); return; }
      setSelected(updated);
      setContatos(prev => prev.map(c => c.documento === doc ? updated : c));
      toast.success(valor > 0 ? "Principal definido!" : "Principal removido");
    } catch { toast.error("Erro ao favoritar"); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (doc: string) => {
    try {
      const res = await fetch(`/api/contatos/${doc}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erro ao excluir"); return; }
      toast.success("Contato excluído");
      setDeleteConfirm(null);
      if (selected?.documento === doc) setSelected(null);
      fetchList(page);
    } catch { toast.error("Erro ao excluir"); }
  };

  // ── Form ───────────────────────────────────────────────────────────────────
  const openCreate = () => {
    setFormMode("create");
    setFormData(EMPTY_FORM);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (c: Contato) => {
    setFormMode("edit");
    setFormData({
      documento: c.documento,
      nomeRazaoSocial: c.nomeRazaoSocial ?? "",
      celular1: c.celular1 ?? "",
      celular2: c.celular2 ?? "",
      celular3: c.celular3 ?? "",
      celular4: c.celular4 ?? "",
      email1: c.email1 ?? "",
      email2: c.email2 ?? "",
      email3: c.email3 ?? "",
    });
    setFormError("");
    setShowForm(true);
  };

  const handleFormSubmit = async () => {
    setFormLoading(true);
    setFormError("");
    try {
      const url = formMode === "create" ? "/api/contatos" : `/api/contatos/${formData.documento}`;
      const method = formMode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Erro desconhecido"); return; }
      toast.success(formMode === "create" ? "Contato criado!" : "Contato atualizado!");
      setShowForm(false);
      setSelected(data);
      fetchList(page);
      fetchHistorico(data.documento);
    } catch { setFormError("Erro de conexão"); }
    finally { setFormLoading(false); }
  };

  const setField = (field: keyof ContatoFormData, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-pink-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-400 to-blue-400 flex items-center justify-center text-white font-bold text-sm">H♥</div>
              <span className="font-semibold text-gray-700 hidden sm:block">Processador CSV</span>
            </button>
            <span className="text-gray-300">/</span>
            <span className="font-semibold text-gray-800 flex items-center gap-1.5">
              <Users size={16} className="text-pink-400" /> Base de Contatos
            </span>
            {total > 0 && (
              <Badge variant="secondary" className="text-xs bg-pink-100 text-pink-600 border-0">
                {total.toLocaleString("pt-BR")} registros
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/contatos/importar")}
              className="border-pink-200 text-pink-600 hover:bg-pink-50 text-xs gap-1">
              <Upload size={13} /> Importar
            </Button>
            <Button size="sm" onClick={openCreate}
              className="bg-gradient-to-r from-pink-400 to-pink-500 hover:from-pink-500 hover:to-pink-600 text-white text-xs gap-1">
              <Plus size={14} /> Novo Contato
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-4">
        {/* ── List ── */}
        <div className={`flex-1 min-w-0 ${selected ? "hidden lg:flex lg:flex-col lg:w-[420px] lg:flex-none" : "flex flex-col"}`}>
          {/* Search + Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-pink-100 p-4 mb-4">
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Buscar por nome, CPF, CNPJ, telefone ou e-mail..."
                className="pl-9 border-pink-200 focus:border-pink-400 text-sm" />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["", "CPF", "CNPJ"] as const).map(t => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    tipo === t ? "bg-pink-500 text-white" : "bg-pink-50 text-pink-600 hover:bg-pink-100"
                  }`}>
                  {t || "Todos"}
                </button>
              ))}
              <div className="w-px bg-pink-100 mx-1" />
              {([
                { key: "recent" as const, label: "Recentes", icon: <Clock size={11} /> },
                { key: "az" as const, label: "A→Z", icon: <SortAsc size={11} /> },
                { key: "za" as const, label: "Z→A", icon: <SortDesc size={11} /> },
              ]).map(({ key, label, icon }) => (
                <button key={key} onClick={() => setSort(key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-colors ${
                    sort === key ? "bg-blue-500 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                  }`}>
                  {icon}{label}
                </button>
              ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mb-3 px-1">
            <span className="text-sm text-gray-500">
              {loading ? "Carregando..." : `${total.toLocaleString("pt-BR")} contato${total !== 1 ? "s" : ""}`}
            </span>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => fetchList(page - 1)}
                  className="p-1 rounded hover:bg-pink-100 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-gray-500">{page}/{pages}</span>
                <button disabled={page >= pages} onClick={() => fetchList(page + 1)}
                  className="p-1 rounded hover:bg-pink-100 disabled:opacity-30 transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Cards */}
          <div className="space-y-2">
            {loading && contatos.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="w-8 h-8 border-2 border-pink-300 border-t-pink-500 rounded-full animate-spin mx-auto mb-3" />
                Carregando...
              </div>
            )}
            {!loading && contatos.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Users size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">{q ? "Nenhum contato encontrado" : "Nenhum contato importado ainda"}</p>
                {!q && (
                  <Button size="sm" onClick={() => navigate("/contatos/importar")}
                    className="mt-4 bg-pink-500 hover:bg-pink-600 text-white text-xs">
                    Importar contatos
                  </Button>
                )}
              </div>
            )}
            {contatos.map(c => {
              const phonesArr = [c.celular1, c.celular2, c.celular3, c.celular4].filter(Boolean);
              const isSelected = selected?.documento === c.documento;
              const mainPhone = (c.telefonePrincipal && c.telefonePrincipal > 0)
                ? [c.celular1, c.celular2, c.celular3, c.celular4][c.telefonePrincipal - 1]
                : phonesArr[0];

              return (
                <div key={c.documento} onClick={() => selectContato(c)}
                  className={`bg-white rounded-xl border p-3 cursor-pointer transition-all hover:shadow-md ${
                    isSelected ? "border-pink-400 shadow-md ring-1 ring-pink-200" : "border-pink-100 hover:border-pink-200"
                  }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      c.tipoDoc === "CPF" ? "bg-pink-100 text-pink-600" : "bg-blue-100 text-blue-600"
                    }`}>
                      {c.tipoDoc === "CPF" ? <User size={16} /> : <Building2 size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800 text-sm truncate">{c.nomeRazaoSocial ?? "Sem nome"}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                          c.tipoDoc === "CPF" ? "border-pink-200 text-pink-600" : "border-blue-200 text-blue-600"
                        }`}>{c.tipoDoc}</Badge>
                        {c.origem === "manual" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-200 text-emerald-600">Manual</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDoc(c.documento, c.tipoDoc)}</p>
                      {mainPhone && (
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Phone size={10} className="text-pink-400" />
                          {fmtPhone(mainPhone)}
                          {phonesArr.length > 1 && <span className="text-gray-400">+{phonesArr.length - 1}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Detail Panel ── */}
        {selected && (
          <div className="flex-1 lg:max-w-[560px]">
            <div className="bg-white rounded-2xl shadow-sm border border-pink-100 overflow-hidden sticky top-20">
              {/* Panel header */}
              <div className="bg-gradient-to-r from-pink-50 to-blue-50 px-5 py-4 border-b border-pink-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center ${
                      selected.tipoDoc === "CPF" ? "bg-pink-100 text-pink-600" : "bg-blue-100 text-blue-600"
                    }`}>
                      {selected.tipoDoc === "CPF" ? <User size={20} /> : <Building2 size={20} />}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-800 text-base leading-tight">{selected.nomeRazaoSocial ?? "Sem nome"}</h2>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        {fmtDoc(selected.documento, selected.tipoDoc)}
                        <CopyButton value={selected.documento} />
                        <Badge variant="outline" className={`ml-1 text-[10px] px-1.5 py-0 ${
                          selected.tipoDoc === "CPF" ? "border-pink-200 text-pink-600" : "border-blue-200 text-blue-600"
                        }`}>{selected.tipoDoc}</Badge>
                        {selected.origem === "manual" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-200 text-emerald-600">Manual</Badge>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEdit(selected)}
                      className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-500 transition-colors" title="Editar">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => setDeleteConfirm(selected.documento)}
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-400 transition-colors" title="Excluir">
                      <Trash2 size={15} />
                    </button>
                    <button onClick={() => setSelected(null)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors lg:hidden">
                      <X size={15} />
                    </button>
                  </div>
                </div>
                <div className="flex gap-1 mt-3">
                  {(["info", "historico"] as const).map(tab => (
                    <button key={tab} onClick={() => setDetailTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        detailTab === tab ? "bg-white text-pink-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}>
                      {tab === "info" ? "Informações" : "Histórico"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Panel body */}
              <div className="p-5 max-h-[calc(100vh-280px)] overflow-y-auto">
                {detailTab === "info" && (
                  <div className="space-y-5">
                    {/* Phones */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Phone size={12} /> Telefones
                      </h3>
                      <div className="space-y-1.5">
                        {([
                          { label: "Celular 01", val: selected.celular1, idx: 1 },
                          { label: "Celular 02", val: selected.celular2, idx: 2 },
                          { label: "Celular 03", val: selected.celular3, idx: 3 },
                          { label: "Celular 04", val: selected.celular4, idx: 4 },
                        ]).map(({ label, val, idx }) => {
                          if (!val) return null;
                          const isPrincipal = (selected.telefonePrincipal ?? 0) === idx;
                          return (
                            <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                              isPrincipal ? "bg-pink-50 border border-pink-200" : "bg-gray-50"
                            }`}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-16">{label}</span>
                                <span className="text-sm font-medium text-gray-700">{fmtPhone(val)}</span>
                                {isPrincipal && <Badge className="text-[10px] px-1.5 py-0 bg-pink-100 text-pink-600 border-0">Principal</Badge>}
                              </div>
                              <div className="flex items-center gap-1">
                                <CopyButton value={val} />
                                <button onClick={() => favoritar(selected.documento, "telefone", isPrincipal ? 0 : idx)}
                                  className={`p-1 rounded transition-colors ${isPrincipal ? "text-amber-500" : "text-gray-300 hover:text-amber-400"}`}
                                  title={isPrincipal ? "Remover principal" : "Definir como principal"}>
                                  <Star size={13} fill={isPrincipal ? "currentColor" : "none"} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {!selected.celular1 && !selected.celular2 && !selected.celular3 && !selected.celular4 && (
                          <p className="text-xs text-gray-400 italic">Nenhum telefone cadastrado</p>
                        )}
                      </div>
                    </div>

                    {/* Emails */}
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <Mail size={12} /> E-mails
                      </h3>
                      <div className="space-y-1.5">
                        {([
                          { label: "E-mail 01", val: selected.email1, idx: 1 },
                          { label: "E-mail 02", val: selected.email2, idx: 2 },
                          { label: "E-mail 03", val: selected.email3, idx: 3 },
                        ]).map(({ label, val, idx }) => {
                          if (!val) return null;
                          const isPrincipal = (selected.emailPrincipal ?? 0) === idx;
                          return (
                            <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                              isPrincipal ? "bg-blue-50 border border-blue-200" : "bg-gray-50"
                            }`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs text-gray-400 w-16 flex-shrink-0">{label}</span>
                                <span className="text-sm text-gray-700 truncate">{val}</span>
                                {isPrincipal && <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-600 border-0 flex-shrink-0">Principal</Badge>}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <CopyButton value={val} />
                                <button onClick={() => favoritar(selected.documento, "email", isPrincipal ? 0 : idx)}
                                  className={`p-1 rounded transition-colors ${isPrincipal ? "text-amber-500" : "text-gray-300 hover:text-amber-400"}`}>
                                  <Star size={13} fill={isPrincipal ? "currentColor" : "none"} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {!selected.email1 && !selected.email2 && !selected.email3 && (
                          <p className="text-xs text-gray-400 italic">Nenhum e-mail cadastrado</p>
                        )}
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="border-t border-gray-100 pt-4">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Informações do registro</h3>
                      <div className="space-y-1 text-xs text-gray-500">
                        <div className="flex justify-between">
                          <span>Origem</span>
                          <span className="font-medium">{selected.origemArquivo ?? (selected.origem === "manual" ? "Cadastro manual" : "—")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Criado em</span>
                          <span>{fmtDate(selected.createdAt)}</span>
                        </div>
                        {selected.ultimaEdicao && (
                          <div className="flex justify-between">
                            <span>Última edição</span>
                            <span>{fmtDate(selected.ultimaEdicao)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {detailTab === "historico" && (
                  <div>
                    {loadingHistorico ? (
                      <div className="text-center py-8 text-gray-400">
                        <div className="w-6 h-6 border-2 border-pink-300 border-t-pink-500 rounded-full animate-spin mx-auto mb-2" />
                        Carregando histórico...
                      </div>
                    ) : historico.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <History size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Nenhum histórico registrado</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {historico.map(h => (
                          <div key={h.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                h.acao === "criado" ? "bg-emerald-400" :
                                h.acao === "editado" ? "bg-blue-400" :
                                h.acao === "favorito_alterado" ? "bg-amber-400" : "bg-purple-400"
                              }`} />
                              <div className="w-px flex-1 bg-gray-100 mt-1" />
                            </div>
                            <div className="pb-3 flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-xs font-medium ${acaoColor(h.acao)}`}>{acaoLabel(h.acao)}</span>
                                <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtDate(h.criadoEm)}</span>
                              </div>
                              {h.descricao && <p className="text-xs text-gray-500 mt-0.5">{h.descricao}</p>}
                              {h.camposAlterados && h.camposAlterados.length > 0 && (
                                <div className="mt-1.5 space-y-1">
                                  {h.camposAlterados.map((ca, i) => (
                                    <div key={i} className="text-[11px] bg-gray-50 rounded px-2 py-1">
                                      <span className="font-medium text-gray-600">{ca.campo}:</span>{" "}
                                      <span className="text-red-400 line-through">{ca.de ?? "—"}</span>{" → "}
                                      <span className="text-emerald-600">{ca.para ?? "—"}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Create/Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-pink-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                {formMode === "create" ? <Plus size={18} className="text-pink-500" /> : <Edit2 size={18} className="text-blue-500" />}
                {formMode === "create" ? "Novo Contato" : "Editar Contato"}
              </h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  <AlertCircle size={16} /> {formError}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">CPF / CNPJ *</label>
                <Input value={formData.documento} onChange={e => setField("documento", e.target.value)}
                  placeholder="Apenas números" disabled={formMode === "edit"}
                  className="border-pink-200 focus:border-pink-400 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nome / Razão Social *</label>
                <Input value={formData.nomeRazaoSocial} onChange={e => setField("nomeRazaoSocial", e.target.value)}
                  placeholder="Nome completo ou razão social"
                  className="border-pink-200 focus:border-pink-400 text-sm" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Phone size={11} /> Telefones
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["celular1", "celular2", "celular3", "celular4"] as const).map((f, i) => (
                    <div key={f}>
                      <label className="text-[11px] text-gray-400 mb-0.5 block">Celular 0{i + 1}</label>
                      <Input value={formData[f]} onChange={e => setField(f, e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="border-pink-200 focus:border-pink-400 text-sm" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Mail size={11} /> E-mails
                </p>
                <div className="space-y-2">
                  {(["email1", "email2", "email3"] as const).map((f, i) => (
                    <div key={f}>
                      <label className="text-[11px] text-gray-400 mb-0.5 block">E-mail 0{i + 1}</label>
                      <Input value={formData[f]} onChange={e => setField(f, e.target.value)}
                        placeholder="email@exemplo.com" type="email"
                        className="border-pink-200 focus:border-pink-400 text-sm" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-pink-100 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)} size="sm"
                className="border-gray-200 text-gray-600">Cancelar</Button>
              <Button onClick={handleFormSubmit} disabled={formLoading} size="sm"
                className="bg-gradient-to-r from-pink-400 to-pink-500 hover:from-pink-500 hover:to-pink-600 text-white gap-1">
                {formLoading
                  ? <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Salvando...</>
                  : <><Save size={14} /> Salvar</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Excluir contato?</h3>
                <p className="text-xs text-gray-500">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}
                className="border-gray-200 text-gray-600">Cancelar</Button>
              <Button size="sm" onClick={() => handleDelete(deleteConfirm)}
                className="bg-red-500 hover:bg-red-600 text-white">Excluir</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

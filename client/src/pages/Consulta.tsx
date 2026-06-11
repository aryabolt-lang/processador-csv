import { useState, useCallback, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, Search, Phone, FileText, Building2, User, Download, Copy, CheckCheck, Clock, PhoneCall, MessageSquare, AlertCircle, ChevronDown, ChevronUp, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface RegistroProcessado {
  id: number;
  processamentoId: number;
  nome: string | null;
  documento: string | null;
  tipoDoc: "CPF" | "CNPJ" | "INVALIDO";
  telefone: string | null;
  origemTelefone: string | null;
  tipoDisparo: "ligacao" | "sms";
  protocolo: string | null;
  nomeArquivo: string | null;
  createdAt: string;
}

interface SearchResponse {
  results: RegistroProcessado[];
  total: number;
  query: string;
}

interface PessoaProfile {
  nome: string;
  documento: string;
  tipoDoc: "CPF" | "CNPJ" | "INVALIDO";
  titulos: string[];
  telefones: Array<{ numero: string; origem: string; disparos: string[] }>;
  totalLigacoes: number;
  totalSms: number;
  ultimaInteracao: string | null;
  registros: RegistroProcessado[];
}

function formatDoc(doc: string | null, tipo: string): string {
  if (!doc) return "-";
  if (tipo === "CPF" && doc.length === 11) {
    return `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`;
  }
  if (tipo === "CNPJ" && doc.length === 14) {
    return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`;
  }
  return doc;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "-";
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  return phone;
}

function buildProfile(records: RegistroProcessado[]): PessoaProfile | null {
  if (!records.length) return null;
  const first = records[0];
  const nome = first.nome ?? "-";
  const documento = first.documento ?? "";
  const tipoDoc = first.tipoDoc;

  // Unique titulos/protocolos
  const titulos = Array.from(new Set(records.map((r) => r.protocolo).filter(Boolean))) as string[];

  // Group phones
  const phoneMap = new Map<string, { origem: string; disparos: Set<string> }>();
  for (const r of records) {
    if (!r.telefone) continue;
    if (!phoneMap.has(r.telefone)) {
      phoneMap.set(r.telefone, { origem: r.origemTelefone ?? "", disparos: new Set() });
    }
    phoneMap.get(r.telefone)!.disparos.add(r.tipoDisparo);
  }
  const telefones = Array.from(phoneMap.entries()).map(([num, v]) => ({
    numero: num,
    origem: v.origem,
    disparos: Array.from(v.disparos),
  }));

  const totalLigacoes = records.filter((r) => r.tipoDisparo === "ligacao").length;
  const totalSms = records.filter((r) => r.tipoDisparo === "sms").length;

  const sorted = [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const ultimaInteracao = sorted[0]?.createdAt ?? null;

  return { nome, documento, tipoDoc, titulos, telefones, totalLigacoes, totalSms, ultimaInteracao, registros: sorted };
}

function groupByPessoa(records: RegistroProcessado[]): Map<string, RegistroProcessado[]> {
  const map = new Map<string, RegistroProcessado[]>();
  for (const r of records) {
    const key = r.documento ?? r.nome ?? "desconhecido";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return map;
}

export default function Consulta() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [tipoFilter, setTipoFilter] = useState("");
  const [disparoFilter, setDisparoFilter] = useState("");
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [expandedPessoa, setExpandedPessoa] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string, tipo = tipoFilter, disparo = disparoFilter) => {
    if (!q || q.trim().length < 2) return;
    setLoading(true);
    setSelectedDoc(null);
    setExpandedPessoa(null);
    try {
      const params = new URLSearchParams({ q: q.trim() });
      if (tipo) params.set("tipo", tipo);
      if (disparo) params.set("disparo", disparo);
      const res = await fetch(`/api/upload/consulta/search?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data: SearchResponse = await res.json();
      setSearchResult(data);
    } catch (err: any) {
      toast.error("Erro na busca: " + (err.message || "Tente novamente"));
    } finally {
      setLoading(false);
    }
  }, [tipoFilter, disparoFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") doSearch(query);
  };

  const copyPhone = async (phone: string) => {
    await navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    toast.success("Telefone copiado!");
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const copyAllPhones = async (phones: string[]) => {
    await navigator.clipboard.writeText(phones.join("\n"));
    toast.success(`${phones.length} telefones copiados!`);
  };

  const exportCsv = () => {
    if (!query) return;
    const params = new URLSearchParams({ q: query });
    window.open(`/api/upload/consulta/export-csv?${params}`, "_blank");
  };

  const clearSearch = () => {
    setQuery("");
    setSearchResult(null);
    setSelectedDoc(null);
    inputRef.current?.focus();
  };

  const grouped = searchResult ? groupByPessoa(searchResult.results) : new Map();
  const selectedProfile = selectedDoc ? buildProfile(grouped.get(selectedDoc) ?? []) : null;

  const totalPessoas = grouped.size;
  const totalLigacoes = searchResult?.results.filter((r) => r.tipoDisparo === "ligacao").length ?? 0;
  const totalSms = searchResult?.results.filter((r) => r.tipoDisparo === "sms").length ?? 0;
  const totalTelefones = searchResult
    ? new Set(searchResult.results.map((r) => r.telefone).filter(Boolean)).size
    : 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      {/* Header */}
      <header className="border-b border-pink-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2 text-pink-400 hover:text-pink-600">
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
            </Link>
            <div className="w-px h-5 bg-pink-100" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-300 to-blue-300 flex items-center justify-center text-white font-bold text-xs">
                H♥
              </div>
              <span className="font-semibold text-gray-800">Consulta Inteligente</span>
            </div>
          </div>
          {searchResult && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2 border-pink-200 text-pink-600 hover:bg-pink-50">
              <Download className="w-4 h-4" />
              Exportar CSV
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Search hero */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Consulta <span className="text-pink-400">Inteligente</span>
          </h1>
          <p className="text-gray-500 text-sm">
            Pesquise por CPF, CNPJ, telefone ou nome do devedor
          </p>
        </div>

        {/* Search bar */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pink-300" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite CPF, CNPJ, telefone ou nome..."
                className="w-full pl-12 pr-10 py-4 rounded-2xl border-2 border-pink-200 focus:border-pink-400 focus:outline-none text-gray-800 bg-white shadow-sm text-base transition-colors"
              />
              {query && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button
              onClick={() => doSearch(query)}
              disabled={loading || query.length < 2}
              className="px-6 py-4 h-auto rounded-2xl bg-gradient-to-r from-pink-400 to-pink-500 hover:from-pink-500 hover:to-pink-600 text-white font-medium shadow-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Buscando
                </span>
              ) : "Buscar"}
            </Button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
            <Filter className="w-4 h-4 text-gray-400" />
            {["", "CPF", "CNPJ"].map((t) => (
              <button
                key={t || "todos-tipo"}
                onClick={() => { setTipoFilter(t); if (searchResult) doSearch(query, t, disparoFilter); }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  tipoFilter === t
                    ? "bg-pink-400 text-white border-pink-400"
                    : "bg-white text-gray-500 border-gray-200 hover:border-pink-300"
                }`}
              >
                {t || "Todos"}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-200" />
            {["", "ligacao", "sms"].map((d) => (
              <button
                key={d || "todos-disparo"}
                onClick={() => { setDisparoFilter(d); if (searchResult) doSearch(query, tipoFilter, d); }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  disparoFilter === d
                    ? "bg-blue-300 text-white border-blue-300"
                    : "bg-white text-gray-500 border-gray-200 hover:border-blue-300"
                }`}
              >
                {d === "" ? "Todos" : d === "ligacao" ? "Ligação" : "SMS"}
              </button>
            ))}
          </div>
        </div>

        {/* No results */}
        {searchResult && searchResult.total === 0 && (
          <div className="text-center py-16">
            <AlertCircle className="w-12 h-12 text-pink-200 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-1">Nenhum registro encontrado</h3>
            <p className="text-gray-400 text-sm">Tente buscar por outro CPF, CNPJ, telefone ou nome</p>
          </div>
        )}

        {/* Results */}
        {searchResult && searchResult.total > 0 && (
          <div className="space-y-6">
            {/* Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Pessoas", value: totalPessoas, icon: User, color: "pink" },
                { label: "Ligações", value: totalLigacoes, icon: PhoneCall, color: "blue" },
                { label: "SMS", value: totalSms, icon: MessageSquare, color: "purple" },
                { label: "Telefones únicos", value: totalTelefones, icon: Phone, color: "green" },
              ].map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="border-0 shadow-sm bg-white">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      color === "pink" ? "bg-pink-100" :
                      color === "blue" ? "bg-blue-100" :
                      color === "purple" ? "bg-purple-100" : "bg-green-100"
                    }`}>
                      <Icon className={`w-5 h-5 ${
                        color === "pink" ? "text-pink-500" :
                        color === "blue" ? "text-blue-500" :
                        color === "purple" ? "text-purple-500" : "text-green-500"
                      }`} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-800">{value}</div>
                      <div className="text-xs text-gray-500">{label}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {/* Left: pessoa list */}
              <div className="md:col-span-1 space-y-2">
                <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
                  {totalPessoas} pessoa{totalPessoas !== 1 ? "s" : ""} encontrada{totalPessoas !== 1 ? "s" : ""}
                </h2>
                {Array.from(grouped.entries()).map(([docKey, recs]) => {
                  const r = recs[0];
                  const isSelected = selectedDoc === docKey;
                  const isExpanded = expandedPessoa === docKey;
                  return (
                    <div
                      key={docKey}
                      className={`rounded-xl border-2 cursor-pointer transition-all bg-white ${
                        isSelected ? "border-pink-400 shadow-md" : "border-transparent shadow-sm hover:border-pink-200"
                      }`}
                      onClick={() => {
                        setSelectedDoc(isSelected ? null : docKey);
                        setExpandedPessoa(null);
                      }}
                    >
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-800 text-sm truncate">{r.nome ?? "-"}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {formatDoc(r.documento, r.tipoDoc)}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge
                              variant="secondary"
                              className={`text-xs ${r.tipoDoc === "CPF" ? "bg-pink-100 text-pink-600" : "bg-blue-100 text-blue-600"}`}
                            >
                              {r.tipoDoc}
                            </Badge>
                            <span className="text-xs text-gray-400">{recs.length} reg.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right: profile detail */}
              <div className="md:col-span-2">
                {!selectedDoc && (
                  <div className="h-full flex items-center justify-center text-center py-16">
                    <div>
                      <User className="w-12 h-12 text-pink-200 mx-auto mb-3" />
                      <p className="text-gray-400 text-sm">Selecione uma pessoa para ver os detalhes</p>
                    </div>
                  </div>
                )}

                {selectedProfile && (
                  <div className="space-y-4">
                    {/* Profile header */}
                    <Card className="border-0 shadow-sm bg-gradient-to-r from-pink-50 to-blue-50">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {selectedProfile.tipoDoc === "CPF" ? (
                                <User className="w-5 h-5 text-pink-400" />
                              ) : (
                                <Building2 className="w-5 h-5 text-blue-400" />
                              )}
                              <h3 className="text-lg font-bold text-gray-800">{selectedProfile.nome}</h3>
                            </div>
                            <div className="text-sm text-gray-500">
                              {selectedProfile.tipoDoc}: {formatDoc(selectedProfile.documento, selectedProfile.tipoDoc)}
                            </div>
                            {selectedProfile.ultimaInteracao && (
                              <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                                <Clock className="w-3 h-3" />
                                Última interação: {new Date(selectedProfile.ultimaInteracao).toLocaleDateString("pt-BR")}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            <div className="text-center">
                              <div className="text-xl font-bold text-pink-500">{selectedProfile.totalLigacoes}</div>
                              <div className="text-xs text-gray-400">Ligações</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl font-bold text-blue-400">{selectedProfile.totalSms}</div>
                              <div className="text-xs text-gray-400">SMS</div>
                            </div>
                            <div className="text-center">
                              <div className="text-xl font-bold text-purple-400">{selectedProfile.titulos.length}</div>
                              <div className="text-xs text-gray-400">Títulos</div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Phones */}
                    <Card className="border-0 shadow-sm bg-white">
                      <CardHeader className="pb-2 pt-4 px-5">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Phone className="w-4 h-4 text-pink-400" />
                            Telefones ({selectedProfile.telefones.length})
                          </CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyAllPhones(selectedProfile.telefones.map((t) => t.numero))}
                            className="text-xs text-pink-500 hover:text-pink-700 gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            Copiar todos
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="px-5 pb-4">
                        <div className="space-y-2">
                          {selectedProfile.telefones.map((t) => (
                            <div key={t.numero} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                              <div>
                                <span className="font-mono text-sm text-gray-800">{formatPhone(t.numero)}</span>
                                <span className="text-xs text-gray-400 ml-2">({t.origem})</span>
                                <div className="flex gap-1 mt-0.5">
                                  {t.disparos.includes("ligacao") && (
                                    <span className="text-xs bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded">Ligação</span>
                                  )}
                                  {t.disparos.includes("sms") && (
                                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">SMS</span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => copyPhone(t.numero)}
                                className="text-gray-400 hover:text-pink-500 transition-colors p-1"
                              >
                                {copiedPhone === t.numero ? (
                                  <CheckCheck className="w-4 h-4 text-green-500" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Titulos */}
                    {selectedProfile.titulos.length > 0 && (
                      <Card className="border-0 shadow-sm bg-white">
                        <CardHeader className="pb-2 pt-4 px-5">
                          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-400" />
                            Títulos / Protocolos ({selectedProfile.titulos.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="px-5 pb-4">
                          <div className="flex flex-wrap gap-2">
                            {selectedProfile.titulos.map((t) => (
                              <span key={t} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-lg font-mono">
                                {t}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Timeline */}
                    <Card className="border-0 shadow-sm bg-white">
                      <CardHeader className="pb-2 pt-4 px-5">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-purple-400" />
                            Histórico de Contatos
                          </CardTitle>
                          <button
                            onClick={() => setExpandedPessoa(expandedPessoa === selectedDoc ? null : selectedDoc)}
                            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                          >
                            {expandedPessoa === selectedDoc ? (
                              <><ChevronUp className="w-3 h-3" /> Recolher</>
                            ) : (
                              <><ChevronDown className="w-3 h-3" /> Ver todos</>
                            )}
                          </button>
                        </div>
                      </CardHeader>
                      <CardContent className="px-5 pb-4">
                        <div className="relative">
                          <div className="absolute left-3 top-0 bottom-0 w-px bg-pink-100" />
                          <div className="space-y-3">
                            {(expandedPessoa === selectedDoc
                              ? selectedProfile.registros
                              : selectedProfile.registros.slice(0, 5)
                            ).map((r, i) => (
                              <div key={r.id} className="flex items-start gap-3 pl-8 relative">
                                <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-white ${
                                  r.tipoDisparo === "ligacao" ? "bg-pink-400" : "bg-blue-400"
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {r.tipoDisparo === "ligacao" ? (
                                      <PhoneCall className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                                    ) : (
                                      <MessageSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                    )}
                                    <span className="text-sm font-medium text-gray-700 capitalize">{r.tipoDisparo}</span>
                                    <span className="text-xs text-gray-400 font-mono">{formatPhone(r.telefone)}</span>
                                    {r.origemTelefone && (
                                      <span className="text-xs text-gray-300">({r.origemTelefone})</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5">
                                    {r.protocolo && (
                                      <span className="text-xs text-blue-500 font-mono">#{r.protocolo}</span>
                                    )}
                                    <span className="text-xs text-gray-400">
                                      {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                                    </span>
                                    {r.nomeArquivo && (
                                      <span className="text-xs text-gray-300 truncate max-w-[120px]">{r.nomeArquivo}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Empty state (no search yet) */}
        {!searchResult && !loading && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-100 to-blue-100 flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-pink-300" />
            </div>
            <h3 className="text-lg font-medium text-gray-600 mb-2">Busca inteligente de devedores</h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              Digite qualquer informação — CPF, CNPJ, número de telefone ou nome — e o sistema encontrará todos os registros relacionados nas bases processadas.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {["123.456.789-00", "63999990001", "Maria Silva", "12.345.678/0001-00"].map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setQuery(ex); doSearch(ex); }}
                  className="text-xs text-pink-400 border border-pink-200 px-3 py-1.5 rounded-full hover:bg-pink-50 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileSpreadsheet, Clock, Users, TrendingUp, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Processamento {
  id: number;
  nomeArquivo: string;
  totalRegistros: number;
  totalComContato: number;
  totalSemContato: number;
  totalCpf: number;
  totalCnpj: number;
  totalInvalidos: number;
  totalLinhasGeradas: number;
  cpfLigacaoUrl: string | null;
  cpfSmsUrl: string | null;
  cnpjLigacaoUrl: string | null;
  cnpjSmsUrl: string | null;
  zipUrl: string | null;
  status: "processando" | "concluido" | "erro";
  erroMsg: string | null;
  createdAt: string;
}

export default function Historico() {
  const [items, setItems] = useState<Processamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/upload/historico")
      .then((r) => r.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center h-16 gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">Histórico de Processamentos</span>
          </div>
        </div>
      </header>

      <main className="container py-10">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground mb-1">Histórico</h1>
            <p className="text-muted-foreground text-sm">Últimos 20 processamentos realizados na plataforma.</p>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}

          {error && (
            <Card className="p-6 border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-3 text-destructive">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">Erro ao carregar histórico: {error}</span>
              </div>
            </Card>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhum processamento realizado ainda.</p>
              <Link href="/">
                <Button className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90">
                  Processar planilha
                </Button>
              </Link>
            </div>
          )}

          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id} className="p-5 bg-card border-border/50 hover:border-border transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      item.status === "concluido" ? "bg-emerald-500/10" :
                      item.status === "erro" ? "bg-destructive/10" : "bg-primary/10"
                    }`}>
                      {item.status === "concluido" ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : item.status === "erro" ? (
                        <AlertCircle className="w-5 h-5 text-destructive" />
                      ) : (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{item.nomeArquivo}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(item.createdAt).toLocaleString("pt-BR")}</span>
                      </div>
                      {item.erroMsg && (
                        <p className="text-xs text-destructive mt-1">{item.erroMsg}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="hidden md:grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.totalRegistros.toLocaleString("pt-BR")}</p>
                        <p className="text-xs text-muted-foreground">registros</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary">{item.totalLinhasGeradas.toLocaleString("pt-BR")}</p>
                        <p className="text-xs text-muted-foreground">linhas</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.totalSemContato.toLocaleString("pt-BR")}</p>
                        <p className="text-xs text-muted-foreground">sem contato</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Badge className="text-xs bg-blue-500/15 text-blue-400 border-blue-500/20 hover:bg-blue-500/15">
                        CPF: {item.totalCpf}
                      </Badge>
                      <Badge className="text-xs bg-violet-500/15 text-violet-400 border-violet-500/20 hover:bg-violet-500/15">
                        CNPJ: {item.totalCnpj}
                      </Badge>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

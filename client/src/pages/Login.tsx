import { trpc } from "@/lib/trpc";
import { Eye, EyeOff, FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "register";

export default function Login() {
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<Mode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      navigate("/");
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = loginMutation.isPending || registerMutation.isPending;

  function handleSubmit() {
    if (mode === "login") {
      loginMutation.mutate({ email: form.email, password: form.password });
    } else {
      if (!form.name.trim()) { toast.error("Informe seu nome"); return; }
      registerMutation.mutate({ name: form.name, email: form.email, password: form.password });
    }
  }

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-200 to-blue-200 border border-pink-300/50 flex items-center justify-center shadow-lg">
            <span className="text-2xl font-bold text-pink-500 leading-none">H<span className="text-red-400">♥</span></span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Processador CSV</h1>
            <p className="text-muted-foreground text-sm mt-1">Sistema Inteligente de Planilhas</p>
          </div>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">
              {mode === "login" ? "Entrar" : "Criar conta"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Acesse com seu e-mail e senha"
                : "Preencha os dados para criar sua conta"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" placeholder="Seu nome" value={form.name} onChange={set("name")} disabled={isPending} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" placeholder="voce@email.com" value={form.email} onChange={set("email")} disabled={isPending} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
                  value={form.password}
                  onChange={set("password")}
                  disabled={isPending}
                  className="pr-10"
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aguarde...</>
              ) : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>Não tem conta?{" "}
                  <button className="text-primary hover:underline font-medium" onClick={() => setMode("register")}>
                    Criar agora
                  </button></>
              ) : (
                <>Já tem conta?{" "}
                  <button className="text-primary hover:underline font-medium" onClick={() => setMode("login")}>
                    Entrar
                  </button></>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw, Chrome } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isExtensionError: boolean;
}

/**
 * Detects if the error is caused by a browser extension (e.g., Google Translate)
 * modifying the DOM and breaking React's virtual DOM reconciliation.
 * These errors are NOT bugs in the app — they are caused by external interference.
 */
function isExtensionDomError(error: Error): boolean {
  const msg = error.message?.toLowerCase() ?? "";
  const stack = error.stack?.toLowerCase() ?? "";
  return (
    msg.includes("removechild") ||
    msg.includes("insertbefore") ||
    msg.includes("não é filho") ||
    msg.includes("is not a child") ||
    msg.includes("the node to be removed is not a child") ||
    msg.includes("failed to execute 'removechild'") ||
    (error instanceof DOMException && (
      msg.includes("notfounderror") ||
      error.name === "NotFoundError"
    )) ||
    // Chrome translate extension signature
    stack.includes("translate") ||
    stack.includes("extension")
  );
}

class ErrorBoundary extends Component<Props, State> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isExtensionError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      isExtensionError: isExtensionDomError(error),
    };
  }

  componentDidUpdate(_: Props, prevState: State) {
    // Auto-retry after 1.5s for extension-caused errors
    if (this.state.hasError && this.state.isExtensionError && !prevState.hasError) {
      this.retryTimer = setTimeout(() => {
        this.setState({ hasError: false, error: null, isExtensionError: false });
      }, 1500);
    }
  }

  componentWillUnmount() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isExtensionError) {
        return (
          <div className="flex items-center justify-center min-h-screen p-8 bg-background">
            <div className="flex flex-col items-center w-full max-w-md text-center gap-5">
              <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                <Chrome className="w-8 h-8 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-2">
                  Extensão do navegador interferiu
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Uma extensão (como o Google Tradutor) modificou a página e causou um conflito.
                  Recarregando automaticamente...
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-primary">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Recuperando...</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Dica: desative extensões de tradução automática para evitar este problema.
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle size={48} className="text-destructive mb-6 flex-shrink-0" />
            <h2 className="text-xl mb-2 font-semibold text-foreground">Ocorreu um erro inesperado.</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Tente recarregar a página. Se o problema persistir, desative extensões do navegador.
            </p>
            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6 max-h-48">
              <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                {this.state.error?.message}
              </pre>
            </div>
            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer transition-opacity"
              )}
            >
              <RefreshCw size={15} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Historico from "./pages/Historico";
import Consulta from "./pages/Consulta";
import BaseContatos from "./pages/BaseContatos";
import ImportarContatos from "./pages/ImportarContatos";
import WhatsappTemplates from "./pages/WhatsappTemplates";
import Protocolos from "./pages/Protocolos";
import EmailProcessor from "./pages/EmailProcessor";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/historico"} component={Historico} />
      <Route path={"/consulta"} component={Consulta} />
      <Route path={"/contatos"} component={BaseContatos} />
      <Route path={"/contatos/importar"} component={ImportarContatos} />
      <Route path={"/whatsapp-templates"} component={WhatsappTemplates} />
      <Route path={"/protocolos"} component={Protocolos} />
      <Route path={"/email"} component={EmailProcessor} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

/**
 * GlobalNav — collapsible left sidebar + fixed top action bar.
 *
 * Usage:
 *   <GlobalNav actions={<>...page-specific buttons...</>} />
 *   <PageLayout>
 *     ...page content...
 *   </PageLayout>
 *
 * The sidebar width is stored in localStorage so it persists across pages.
 * PageLayout reads the same key and applies the matching left-padding.
 */

import { Link, useLocation } from "wouter";
import {
  Users, Search, History, MessageCircle, Mail, ClipboardList,
  Home, ChevronLeft, ChevronRight, Menu, X,
} from "lucide-react";
import { useState, useEffect, createContext, useContext } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

export const SIDEBAR_EXPANDED_KEY = "sidebar_expanded";
const SIDEBAR_EXPANDED_W = "13rem";   // 208px
const SIDEBAR_COLLAPSED_W = "3.5rem"; // 56px
const TOPBAR_H = "3.5rem";            // 56px

const NAV_ITEMS = [
  { href: "/", label: "Processador", icon: Home, color: "text-pink-600", bg: "bg-pink-50", bar: "bg-pink-500" },
  { href: "/contatos", label: "Contatos", icon: Users, color: "text-blue-600", bg: "bg-blue-50", bar: "bg-blue-500" },
  { href: "/consulta", label: "Consulta", icon: Search, color: "text-indigo-600", bg: "bg-indigo-50", bar: "bg-indigo-500" },
  { href: "/historico", label: "Histórico", icon: History, color: "text-slate-600", bg: "bg-slate-100", bar: "bg-slate-500" },
  { href: "/whatsapp-templates", label: "WhatsApp", icon: MessageCircle, color: "text-green-600", bg: "bg-green-50", bar: "bg-green-500" },
  { href: "/email", label: "E-mails", icon: Mail, color: "text-sky-600", bg: "bg-sky-50", bar: "bg-sky-500" },
  { href: "/protocolos", label: "Protocolos", icon: ClipboardList, color: "text-purple-600", bg: "bg-purple-50", bar: "bg-purple-500" },
];

// ─── Context (so PageLayout can react to sidebar toggle) ──────────────────────

const SidebarCtx = createContext<{ expanded: boolean }>({ expanded: true });

function readExpanded() {
  try { return localStorage.getItem(SIDEBAR_EXPANDED_KEY) !== "false"; } catch { return true; }
}

// ─── GlobalNav ────────────────────────────────────────────────────────────────

interface GlobalNavProps {
  /** Page-specific action buttons rendered in the top bar */
  actions?: React.ReactNode;
}

export default function GlobalNav({ actions }: GlobalNavProps) {
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(readExpanded);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist preference
  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(expanded)); } catch {}
    // Dispatch storage event so PageLayout on the same tab can react
    window.dispatchEvent(new StorageEvent("storage", { key: SIDEBAR_EXPANDED_KEY, newValue: String(expanded) }));
  }, [expanded]);

  // Close mobile drawer on navigation
  useEffect(() => { setMobileOpen(false); }, [location]);

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const sidebarW = expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W;

  return (
    <>
      {/* ── Mobile overlay ─────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ────────────────────────────────────────────────── */}
      <aside
        className="fixed top-0 left-0 h-full z-50 flex flex-col bg-white border-r border-slate-200 shadow-sm overflow-hidden transition-[width] duration-200"
        style={{ width: sidebarW }}
      >
        {/* Logo row */}
        <div className="flex items-center h-14 px-3 border-b border-slate-100 shrink-0 gap-2">
          <Link href="/">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-200 to-blue-200 border border-pink-300/50 flex items-center justify-center shadow-sm shrink-0 cursor-pointer">
              <span className="text-sm font-bold text-pink-500 leading-none">H<span className="text-red-400">♥</span></span>
            </div>
          </Link>
          {expanded && (
            <Link href="/">
              <div className="leading-tight cursor-pointer overflow-hidden">
                <div className="font-semibold text-slate-800 text-sm whitespace-nowrap">Processador</div>
                <div className="text-[10px] text-slate-400 whitespace-nowrap">CSV Inteligente</div>
              </div>
            </Link>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="hidden md:flex ml-auto w-6 h-6 rounded-full border border-slate-200 bg-white items-center justify-center hover:bg-slate-50 transition-colors shrink-0 shadow-sm"
            title={expanded ? "Recolher menu" : "Expandir menu"}
          >
            {expanded
              ? <ChevronLeft className="w-3 h-3 text-slate-500" />
              : <ChevronRight className="w-3 h-3 text-slate-500" />}
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon, color, bg, bar }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href}>
                <div
                  className={`relative flex items-center gap-3 px-2 py-2.5 rounded-lg cursor-pointer transition-all group select-none
                    ${active ? `${bg} ${color} font-semibold` : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}
                    ${expanded ? "" : "justify-center"}
                  `}
                  title={!expanded ? label : undefined}
                >
                  {active && (
                    <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full ${bar}`} />
                  )}
                  <Icon className="w-4 h-4 shrink-0" />
                  {expanded && <span className="text-sm truncate">{label}</span>}
                  {/* Tooltip when collapsed */}
                  {!expanded && (
                    <span className="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[60] transition-opacity">
                      {label}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ── Fixed top bar ──────────────────────────────────────────── */}
      <div
        className="fixed top-0 right-0 z-30 h-14 bg-white/90 backdrop-blur-sm border-b border-slate-200 flex items-center gap-2 px-4 transition-[left] duration-200"
        style={{ left: sidebarW }}
      >
        {/* Mobile hamburger (only visible on small screens) */}
        <button
          className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Menu"
        >
          {mobileOpen ? <X className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
        </button>

        {/* Page-specific actions */}
        <div className="flex items-center gap-2 flex-wrap flex-1 justify-end overflow-x-auto">
          {actions}
        </div>
      </div>

      {/* ── Mobile sidebar (overlay drawer) ───────────────────────── */}
      {mobileOpen && (
        <aside className="fixed top-0 left-0 h-full z-50 w-52 flex flex-col bg-white border-r border-slate-200 shadow-lg md:hidden">
          <div className="flex items-center h-14 px-3 border-b border-slate-100 gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-200 to-blue-200 border border-pink-300/50 flex items-center justify-center shadow-sm shrink-0">
              <span className="text-sm font-bold text-pink-500 leading-none">H<span className="text-red-400">♥</span></span>
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-slate-800 text-sm">Processador</div>
              <div className="text-[10px] text-slate-400">CSV Inteligente</div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
            {NAV_ITEMS.map(({ href, label, icon: Icon, color, bg, bar }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href}>
                  <div
                    className={`relative flex items-center gap-3 px-2 py-2.5 rounded-lg cursor-pointer transition-all select-none
                      ${active ? `${bg} ${color} font-semibold` : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}
                    `}
                    onClick={() => setMobileOpen(false)}
                  >
                    {active && <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full ${bar}`} />}
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm truncate">{label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>
      )}
    </>
  );
}

// ─── PageLayout ───────────────────────────────────────────────────────────────

/**
 * Wrap every page's content with this to offset it from the fixed sidebar + top bar.
 */
export function PageLayout({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [expanded, setExpanded] = useState(readExpanded);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === SIDEBAR_EXPANDED_KEY) {
        setExpanded(e.newValue !== "false");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <div
      className={`min-h-screen transition-[padding-left] duration-200 ${className}`}
      style={{
        paddingLeft: expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W,
        paddingTop: TOPBAR_H,
      }}
    >
      {children}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ArrowLeft, ArrowRight, CalendarDays, Car, Check, ChevronLeft, ChevronRight, Circle, ClipboardList, Clock, FileDown, FileText, Flag, FolderOpen, LayoutDashboard, ListTodo, Menu, Paperclip, Pencil, Play, Plus, Square, StickyNote, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common";
import { supabase } from "@/integrations/supabase/client";
import { portalAction } from "@/lib/portal.functions";
import { InvoiceDocument } from "@/components/portal/InvoiceDocument";
import { effectiveStatus, fmtDate, invoiceTotals, money, type LineItem } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const COLUMNS = [
  { key: "done", label: "Finished" },
  { key: "doing", label: "In-Progress" },
  { key: "todo", label: "Overdue" },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];

export const TAB_ICONS: Record<string, Any> = {
  dashboard: LayoutDashboard,
  board: ClipboardList,
  tasks: ListTodo,
  mytodo: ListTodo,
  time: Clock,
  cal: CalendarDays,
  mileage: Car,
  notes: StickyNote,
  cases: FolderOpen,
};

const londonDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));

function weekStart(dayKey: string) {
  const d = new Date(dayKey + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function fmtMins(mins: number) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function relDay(iso: string) {
  const day = londonDay(iso);
  const today = londonDay(new Date().toISOString());
  if (day === today) return "Today";
  const yesterday = new Date(Date.now() - 86400000);
  if (day === londonDay(yesterday.toISOString())) return "Yesterday";
  return new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export type Act = (action: Any, success?: string) => Promise<Any | null>;

export function openFileHref(href: string, download?: string) {
  const click = (u: string, target?: string) => {
    const a = document.createElement("a");
    a.href = u;
    if (download) a.download = download;
    if (target) a.target = target;
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  if (href.startsWith("data:")) {
    const meta = href.slice(5, href.indexOf(","));
    const mime = meta.split(";")[0] || "application/octet-stream";
    const b64 = href.slice(href.indexOf(",") + 1);
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const u = URL.createObjectURL(new Blob([arr], { type: mime }));
    click(u);
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  } else {
    click(href, "_blank");
  }
}

export function PMPortal({ p, token }: { p: Any; token: string | null }) {
  const act0 = useServerFn(portalAction);
  const qc = useQueryClient();
  const act: Act = async (action, success) => {
    try {
      const r = await act0({ data: { token, action } });
      await qc.invalidateQueries({ queryKey: ["portal", token] });
      if (success) toast.success(success);
      return r;
    } catch (e) { toast.error((e as Error).message); return null; }
  };

  const prefs = p.client.portal_prefs ?? {};
  const rate = Number(prefs.rate ?? 17);
  const badge = p.client.home_kit?.badge as string | undefined;

  const [viewer, setViewer] = useState<"Sara" | "Natalie">("Sara");
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;
        if (!uid) return;
        const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
        if (isAdmin) setViewer("Natalie");
      } catch { /* stay as client viewer */ }
    })();
  }, []);

  const [tab, setTab] = useState<"dashboard" | "board" | "tasks" | "time" | "cal" | "mileage" | "notes" | "mytodo" | "cases">(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return ["board", "tasks", "time", "cal", "mileage", "notes", "mytodo", "cases"].includes(t) ? (t as Any) : "dashboard";
  });
  const [boardAdd, setBoardAdd] = useState(false);
  const [boardAddUrgent, setBoardAddUrgent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const entries: Any[] = p.time ?? [];
  const cards: Any[] = p.board ?? [];
  const running = entries.find((e: Any) => !e.ended_at);
  const doneEntries = entries.filter((e: Any) => e.ended_at && Number(e.minutes) > 0);
  const unbilled = doneEntries.filter((e: Any) => !e.billed);
  const unbilledMins = unbilled.reduce((s: number, e: Any) => s + Number(e.minutes), 0);

  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running?.id]);

  const stats = useMemo(() => {
    const today = londonDay(new Date().toISOString());
    const thisWeek = weekStart(today);
    const thisMonth = today.slice(0, 7);
    let today_ = 0, week = 0, month = 0;
    for (const e of doneEntries) {
      const day = londonDay(e.started_at ?? e.created_at);
      if (day === today) today_ += Number(e.minutes);
      if (weekStart(day) === thisWeek) week += Number(e.minutes);
      if (day.slice(0, 7) === thisMonth) month += Number(e.minutes);
    }
    if (running) today_ += (Date.now() - Date.parse(running.started_at)) / 60000;
    const open = cards.filter((c: Any) => c.status !== "done").length;
    return { today: today_, week, month, open, thisWeek };
  }, [p.time, p.board, running?.id]);

  const weeks = useMemo(() => {
    const out: { key: string; label: string; mins: number }[] = [];
    const base = new Date(stats.thisWeek + "T12:00:00Z");
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() - i * 7);
      const key = d.toISOString().slice(0, 10);
      let mins = 0;
      for (const e of doneEntries) if (weekStart(londonDay(e.started_at ?? e.created_at)) === key) mins += Number(e.minutes);
      const start = new Date(key + "T12:00:00Z");
      out.push({ key, label: start.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" }) + " " + start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }), mins });
    }
    return out;
  }, [p.time]);

  const maxWeek = Math.max(60, ...weeks.map((w) => w.mins));

  const tabs = viewer === "Natalie" ? [
    { v: "dashboard", l: "Dashboard" },
    { v: "tasks", l: "Tasks" },
    { v: "cases", l: "Cases" },
    { v: "board", l: "To-Do Board" },
    { v: "time", l: "Time & Invoices" },
  ] : [
    { v: "dashboard", l: "Dashboard" },
    { v: "mytodo", l: "My To Do" },
    { v: "cases", l: "Cases" },
    { v: "board", l: "Tasks Board" },
    { v: "cal", l: "Calendar" },
    { v: "time", l: "Invoices" },
    { v: "mileage", l: "Mileage" },
    { v: "notes", l: "Notes" },
  ];

  const first = (p.client.name ?? "").split(" ")[0] || "there";
  const welcome = viewer === "Natalie" ? "Natalie" : first;

  return (
    <div className="pm">
      <style>{PM_STYLES}</style>

      <aside className={`pm-side ${menuOpen ? "open" : ""}`} aria-label="Portal sections">
        <div className="pm-side-head">
          {badge ? <img src={badge} alt="Advanced Assessment & Solutions" /> : <span className="pm-brand-fallback">AAS</span>}
        </div>
        <nav className="pm-side-nav">
          {tabs.map((t) => {
            const Ic = TAB_ICONS[t.v];
            return (
              <button key={t.v} type="button" onClick={() => { setMenuOpen(false); setTab(t.v as Any); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`pm-side-item ${t.v === tab ? "active" : ""}`}>
                {Ic ? <Ic className="h-4 w-4 flex-none" /> : null}
                <span>{t.l}</span>
              </button>
            );
          })}
        </nav>
        <div className="pm-side-foot">
          <span className="pm-side-avatar">{(viewer === "Natalie" ? "Natalie" : welcome).slice(0, 1)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{viewer === "Natalie" ? "Natalie" : welcome}</p>
            <p className="text-[11px] text-white/50">{viewer === "Natalie" ? "Admin" : "Client portal"}</p>
          </div>
        </div>
      </aside>
      {menuOpen && <button type="button" className="pm-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <div className="pm-content">
        <div className="pm-topbar">
          <button type="button" className="pm-burger" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <span className="pm-topbar-title">{tabs.find((t) => t.v === tab)?.l ?? "Dashboard"}</span>
          <span className="pm-topbar-badge">{badge ? <img src={badge} alt="" /> : <span className="pm-brand-fallback">AAS</span>}</span>
        </div>

      <main className="pm-main">
        <header className="mb-6">
          <h1 className="text-[1.65rem] font-semibold tracking-tight md:text-4xl">{viewer === "Natalie" ? "HQ Projects Portal" : "HQ Workspace"}</h1>
          {viewer === "Natalie"
            ? <p className="mt-1 text-[1.65rem] font-semibold tracking-tight text-[var(--pm-orange)] md:text-4xl">Hi, Natalie</p>
            : <p className="mt-1 text-[1.65rem] font-semibold tracking-tight text-[var(--pm-orange)] md:text-4xl">Welcome back, {welcome}</p>}
        </header>

        {tab === "dashboard" && (
          <Dashboard p={p} stats={stats} weeks={weeks} maxWeek={maxWeek} rate={rate} unbilledMins={unbilledMins} running={running} viewer={viewer} go={setTab} act={act} onQuickAdd={() => { setBoardAdd(true); setTab("board"); }} onQuickUrgent={() => { setBoardAddUrgent(true); setTab("board"); }} />
        )}
        {tab === "board" && <Board p={p} viewer={viewer} act={act} go={setTab} autoAdd={boardAdd} onAutoAddDone={() => setBoardAdd(false)} autoAddUrgent={boardAddUrgent} onAutoAddUrgentDone={() => setBoardAddUrgent(false)} />}
        {tab === "tasks" && <TasksTab p={p} viewer={viewer} act={act} />}
        {tab === "time" && <TimeTab entries={entries} running={running} unbilledMins={unbilledMins} rate={rate} viewer={viewer} act={act} cards={cards} invoices={p.invoices} files={p.deliverables ?? []} client={p.client} />}
        {tab === "cal" && viewer !== "Natalie" && <CalendarTab avail={(p.client?.portal_prefs?.availability ?? null) as Any} />}
        {tab === "mileage" && <MileageTab act={act} entries={((p.client?.portal_prefs?.mileage ?? []) as Any[])} files={((p.deliverables ?? []) as Any[])} />}
        {tab === "notes" && viewer !== "Natalie" && <NotesTab act={act} notes={((p.client?.portal_prefs?.sara_notes ?? []) as Any[])} />}
        {tab === "mytodo" && viewer !== "Natalie" && <MyTodoTab p={p} viewer={viewer} act={act} />}
        {tab === "cases" && <CasesTab p={p} viewer={viewer} act={act} />}
      </main>

        <footer className="pm-foot">Advanced Assessment &amp; Solutions · HQ Portal - Crafted by <a href="https://nine3designs.co.uk" target="_blank" rel="noreferrer">Nine3 Designs</a></footer>
      </div>
    </div>
  );
}

/* ---------------- styles ---------------- */

export const PM_STYLES = `
.pm { --pm-navy:#0d1c34; --pm-navy2:#16294a; --pm-orange:#f59a2b; --pm-orange-deep:#d97406; --pm-soft:#eef0f2; --pm-soft2:#e7eaee; --pm-ink:#1f2630; --pm-muted:#5e5e5e; --pm-line:#e6e8ea; }
.pm { color: var(--pm-ink); font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif; }
.pm h1, .pm h2, .pm h3 { font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif; color: var(--pm-ink); font-weight: 600; }
.pm { display: flex; min-height: 100vh; }
.pm .pm-side { position: fixed; top: 0; bottom: 0; left: 0; z-index: 60; width: 15.5rem; display: flex; flex-direction: column; background: linear-gradient(180deg, #0d1c34 0%, #101f3b 100%); border-right: 1px solid rgba(255,255,255,.08); box-shadow: 20px 0 60px rgba(13,28,52,.18); transform: translateX(-105%); transition: transform .28s cubic-bezier(.4,0,.2,1); }
.pm .pm-side.open { transform: none; box-shadow: 30px 0 80px rgba(13,28,52,.45); }
.pm .pm-side-head { display: flex; align-items: center; height: auto; min-height: 4.4rem; padding: 1rem 1.1rem; border-bottom: 1px solid rgba(255,255,255,.08); flex: none; }
.pm .pm-side-head img { height: 4.5rem; width: auto; max-width: 13.4rem; }
.pm .pm-brand-fallback { color: #fff; font-size: .8rem; font-weight: 600; letter-spacing: .08em; }
.pm .pm-side-nav { flex: 1; overflow-y: auto; padding: 1rem .8rem; display: flex; flex-direction: column; gap: .2rem; }
.pm .pm-side-item { position: relative; display: flex; align-items: center; gap: .7rem; border-radius: .8rem; padding: .68rem .9rem; font-size: .875rem; font-weight: 500; color: rgba(255,255,255,.72); transition: background .15s ease, color .15s ease; text-align: left; }
.pm .pm-side-item:hover { color: #fff; background: rgba(255,255,255,.08); }
.pm .pm-side-item.active { color: #fff; background: rgba(255,255,255,.10); box-shadow: inset 0 0 0 1px rgba(255,255,255,.10); }
.pm .pm-side-item.active svg { color: var(--pm-orange); }
.pm .pm-side-item.active::before { content: ""; position: absolute; left: -.8rem; top: 22%; bottom: 22%; width: 3px; border-radius: 999px; background: var(--pm-orange); }
.pm .pm-side-foot { display: flex; align-items: center; gap: .7rem; padding: 1rem 1.1rem 1.2rem; border-top: 1px solid rgba(255,255,255,.08); flex: none; }
.pm .pm-side-avatar { width: 2.3rem; height: 2.3rem; border-radius: 999px; background: var(--pm-orange); color: #3d2400; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: .9rem; flex: none; }
.pm .pm-content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pm .pm-topbar { display: flex; align-items: center; gap: .8rem; position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,.86); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: .7rem 1rem; border-bottom: 1px solid var(--pm-line); }
.pm .pm-topbar-title { font-size: .95rem; font-weight: 600; color: var(--pm-navy); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pm .pm-topbar-badge { display: inline-flex; align-items: center; background: var(--pm-navy); border-radius: 999px; height: auto; padding: .5rem .9rem; flex: none; }
.pm .pm-topbar-badge img { height: 3.3rem; width: auto; max-width: 360px; }
.pm .pm-burger { display: inline-flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; border-radius: .9rem; background: var(--pm-navy); color: #fff; border: none; flex: none; cursor: pointer; }
.pm .pm-scrim { position: fixed; inset: 0; z-index: 55; background: rgba(13,28,52,.45); border: none; cursor: pointer; }
@media (min-width: 1024px) {
  .pm .pm-side { transform: none; width: 16rem; }
  .pm .pm-content { padding-left: 16rem; }
  .pm .pm-topbar { display: none; }
  .pm .pm-scrim { display: none; }
}
.pm .pm-dark h2 { color: var(--pm-orange); }
.pm .pm-col { background: linear-gradient(180deg, #ffffff 0%, #f4f6f8 100%); border: 1px solid var(--pm-line); border-top-width: 4px; box-shadow: 0 2px 6px rgba(13,28,52,.05), 0 14px 30px rgba(13,28,52,.07); }
.pm .pm-col:nth-child(1) { border-top-color: #2e9e5b; }
.pm .pm-col:nth-child(2) { border-top-color: var(--pm-orange); }
.pm .pm-col:nth-child(3) { border-top-color: #e5484d; }
.pm .pm-col:nth-child(1) .pm-chip { background: rgba(46,158,91,.14); color: #1d6b3a; }
.pm .pm-col:nth-child(2) .pm-chip { background: rgba(245,154,43,.18); color: #a35803; }
.pm .pm-col:nth-child(3) .pm-chip { background: rgba(229,72,77,.14); color: #a3262b; }
.pm .pm-col .pm-task { box-shadow: 0 1px 2px rgba(13,28,52,.08); }
.pm .pm-main { width: 100%; max-width: 68rem; margin: 0 auto; padding: 1.6rem 1.4rem 0; }
.pm .pm-foot { max-width: 64rem; margin: 0 auto; padding: 2.2rem 1rem 2rem; text-align: center; font-size: .72rem; color: #9aa1a9; }
.pm .pm-card { background: #fff; border-radius: 1.5rem; box-shadow: 0 1px 2px rgba(13,28,52,.04), 0 12px 32px rgba(13,28,52,.06); transition: transform .18s ease, box-shadow .18s ease; }
.pm .pm-card:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(13,28,52,.05), 0 18px 44px rgba(13,28,52,.10); }
.pm .pm-dark { background: var(--pm-navy); border-radius: 1.5rem; color: #fff; box-shadow: 0 16px 40px rgba(13,28,52,.28); }
.pm .pm-dark h2, .pm .pm-dark h3 { color: #fff; }
.pm .pm-tile-icon { width: 2.6rem; height: 2.6rem; display: flex; align-items: center; justify-content: center; border-radius: 1rem; background: rgba(245,154,43,.14); color: var(--pm-orange-deep); flex: none; }
.pm .pm-tile-icon.navy { background: rgba(13,28,52,.06); color: var(--pm-navy); }
.pm .pm-btn { background: var(--pm-navy) !important; color: #fff !important; border-radius: 999px !important; font-weight: 500 !important; font-size: .875rem !important; transition: background .15s ease, transform .15s ease, box-shadow .15s ease !important; }
.pm .pm-btn:hover { background: var(--pm-navy2) !important; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(13,28,52,.25); }
.pm .pm-btn-orange { background: var(--pm-orange) !important; color: #3d2400 !important; border-radius: 999px !important; font-weight: 500 !important; font-size: .875rem !important; transition: background .15s ease, transform .15s ease, box-shadow .15s ease !important; }
.pm .pm-btn-orange:hover { background: var(--pm-orange-deep) !important; color: #fff !important; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(217,116,6,.30); }
.pm .pm-btn-sm { font-size: .76rem !important; padding-left: .7rem !important; padding-right: .7rem !important; gap: .3rem; }
.pm .pm-filebtn { display: inline-flex; align-items: center; gap: .35rem; border-radius: 999px; border: 1px solid var(--pm-line); background: #fff; color: var(--pm-ink); font-size: .74rem; font-weight: 600; padding: .35rem .85rem; transition: border-color .15s ease, box-shadow .15s ease, color .15s ease; cursor: pointer; }
.pm .pm-filebtn:hover { border-color: var(--pm-orange); color: var(--pm-orange-deep); box-shadow: 0 4px 14px rgba(217,116,6,.16); }
.pm .pm-trow { transition: background .15s ease; }
.pm .pm-trow:hover { background: #f6f8fa; }
@media print {
  body * { visibility: hidden !important; }
  .pm-inv-sheet, .pm-inv-sheet * { visibility: visible !important; }
  .pm-inv-sheet { position: absolute !important; left: 0; top: 0; width: 100%; box-shadow: none !important; }
  .no-print { display: none !important; }
}
.pm .pm-chip { display: inline-flex; align-items: center; gap: .35rem; border-radius: 999px; background: var(--pm-soft2); color: var(--pm-ink); font-size: .72rem; font-weight: 600; padding: .22rem .65rem; white-space: nowrap; }
.pm .pm-chip.orange { background: rgba(245,154,43,.16); color: #a35803; }
.pm .pm-chip.navy { background: var(--pm-navy); color: #fff; }
.pm .pm-chip.line { background: #fff; border: 1px solid var(--pm-line); color: var(--pm-muted); }
.pm .pm-circle { width: 2.4rem; height: 2.4rem; border-radius: 999px; background: #fff; box-shadow: 0 2px 8px rgba(13,28,52,.08); display: inline-flex; align-items: center; justify-content: center; color: var(--pm-muted); transition: color .15s ease; flex: none; }
.pm .pm-circle:hover { color: var(--pm-ink); }
.pm .pm-circle.dark { background: var(--pm-navy); color: #fff; box-shadow: 0 8px 20px rgba(13,28,52,.3); }
.pm .pm-circle.orange { background: rgba(245,154,43,.14); color: var(--pm-orange-deep); }
.pm input, .pm textarea, .pm select { font-family: 'Poppins', sans-serif; }
.pm .timer-num { font-variant-numeric: tabular-nums; letter-spacing: .02em; }
.pm .pm-bar { background: var(--pm-navy); border-radius: 999px; min-height: 4px; width: 100%; max-width: .55rem; margin: 0 auto; }
.pm .pm-bar.now { background: var(--pm-orange); }
.pm .pm-dot { width: .55rem; height: .55rem; border-radius: 999px; flex: none; }
.pm .clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pm .pm-col { background: #fff; border-radius: 1.5rem; padding: 1rem; min-height: 140px; box-shadow: 0 1px 2px rgba(13,28,52,.04), 0 12px 32px rgba(13,28,52,.06); }
.pm .pm-col.drop { outline: 2px dashed var(--pm-orange); outline-offset: 3px; }
.pm .pm-task { background: var(--pm-soft); border-radius: 1.1rem; transition: background .15s ease, box-shadow .15s ease; }
.pm .pm-task:hover { background: #e6e9ee; box-shadow: 0 4px 14px rgba(13,28,52,.08); }
.pm .pm-row { background: var(--pm-soft); border-radius: 1.1rem; transition: background .15s ease; }
.pm .pm-row:hover { background: #e6e9ee; }
.pm .pm-tile-dark { background: var(--pm-navy) !important; box-shadow: 0 16px 40px rgba(13,28,52,.28); }
.pm .pm-tile-icon.ondark { background: rgba(245,154,43,.22); color: var(--pm-orange); }
@media (max-width: 640px) {
  .pm .pm-main { padding-top: 1.1rem; }
  .pm .pm-card { border-radius: 1.3rem; }
  .pm .pm-taskactions button { width: 2.35rem !important; height: 2.35rem !important; font-size: .85rem; }
  .pm .pm-taskactions button svg { width: 1.1rem; height: 1.1rem; }
  .pm .pm-task { touch-action: pan-y; }
  .pm .pm-side { width: min(17rem, 84vw); }
  .pm .pm-main { padding-left: .9rem; padding-right: .9rem; }
}
/* mobile optimisation */
@media (max-width: 640px) {
  .pm .pm-main { padding: 1.1rem .75rem 0; }
  .pm .pm-main h1 { font-size: 1.5rem !important; }
  .pm .pm-card { padding: 1rem !important; }
  .pm .pm-boardwrap { padding: .7rem; gap: .7rem; }
  .pm table { font-size: .8rem; }
  .pm .pm-foot { padding: 1.6rem .75rem 1.6rem; }
}
/* board: rounded glass columns · tick-to-complete · task file chips */
.pm .pm-boardwrap { background: linear-gradient(135deg, #dce4ec 0%, #edf0f3 52%, #e9e2d6 100%); border-radius: 1.6rem; padding: 1rem; }
@media (min-width: 768px) { .pm .pm-boardwrap { padding: 1.25rem; } }
.pm .pm-col { background: rgba(255,255,255,.55) !important; backdrop-filter: blur(14px) saturate(1.15); -webkit-backdrop-filter: blur(14px) saturate(1.15); border: 1px solid rgba(255,255,255,.78) !important; border-top-width: 4px !important; box-shadow: 0 10px 34px rgba(13,28,52,.10), inset 0 1px 0 rgba(255,255,255,.65) !important; }
.pm .pm-col:nth-child(1) { border-top-color: #2e9e5b !important; }
.pm .pm-col:nth-child(2) { border-top-color: var(--pm-orange) !important; }
.pm .pm-col:nth-child(3) { border-top-color: #e5484d !important; }
.pm .pm-tickbtn { display: inline-flex; align-items: center; justify-content: center; width: 1.7rem; height: 1.7rem; border-radius: .55rem; border: 1.5px solid #cfd5db; background: #fff; color: #9aa0a6; transition: all .15s ease; }
.pm .pm-tickbtn:hover { background: #3f7d4e; border-color: #3f7d4e; color: #fff; box-shadow: 0 3px 10px rgba(63,125,78,.3); }
.pm .pm-task.important { background: #fff7ed; box-shadow: 0 1px 2px rgba(217,116,6,.10), 0 4px 14px rgba(217,116,6,.10); border-left: 4px solid var(--pm-orange); border-top-left-radius: .4rem; border-bottom-left-radius: .4rem; }
.pm .pm-urgent-chip { display: inline-flex; align-items: center; gap: .3rem; border-radius: 999px; background: rgba(245,154,43,.16); color: #a35803; font-size: .68rem; font-weight: 700; padding: .2rem .55rem; width: fit-content; }
.pm .pm-urgent-toggle { display: inline-flex; align-items: center; gap: .5rem; color: var(--pm-ink); }
.pm .pm-urgent-box { width: 1.15rem; height: 1.15rem; border-radius: .4rem; border: 1.5px solid #cfd5db; background: #fff; display: inline-flex; align-items: center; justify-content: center; color: transparent; transition: all .15s ease; flex: none; }
.pm .pm-urgent-box.on { background: var(--pm-orange); border-color: var(--pm-orange); color: #3d2400; }
.pm .pm-flag-on { color: var(--pm-orange-deep); fill: var(--pm-orange-deep); }
.pm .pm-filechip { display: inline-flex; align-items: center; gap: .3rem; border-radius: 999px; border: 1px solid var(--pm-line); background: #fff; color: var(--pm-ink); font-size: .7rem; font-weight: 500; padding: .25rem .6rem; text-decoration: none; transition: border-color .15s ease, box-shadow .15s ease; }
.pm .pm-filechip:hover { border-color: var(--pm-navy); box-shadow: 0 3px 10px rgba(13,28,52,.10); }
@media (max-width: 640px) {
  .pm .pm-boardwrap { padding: .8rem; }
  .pm .pm-tickbtn { width: 2.35rem; height: 2.35rem; }
  .pm .pm-tickbtn svg { width: 1.1rem; height: 1.1rem; }
  .pm .pm-task { padding: 1rem !important; border-radius: 1rem; }
  .pm .pm-task > div:first-child > p { font-size: .95rem; }
  .pm .pm-task-more { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .34s cubic-bezier(.4,0,.2,1), opacity .26s ease; }
.pm .pm-task-more > div { overflow: hidden; min-height: 0; }
.pm .pm-task-more.open { grid-template-rows: 1fr; opacity: 1; }
.pm .pm-task { cursor: pointer; }
.pm .pm-task:has(.pm-task-more.open) { cursor: default; }
.pm .pm-taskactions { gap: .35rem; }
  .pm .pm-taskactions button { width: 2.5rem !important; height: 2.5rem !important; }
  .pm .pm-taskactions button svg { width: 1.15rem; height: 1.15rem; }
  .pm .pm-taskactions .ml-auto { display: none; }
  .pm .pm-filechip { font-size: .78rem; padding: .45rem .75rem; min-height: 2.1rem; }
  .pm .pm-col { padding: .8rem; }
}
.pm .pm-postit { border-radius: .9rem; padding: 1.1rem 1rem .8rem; box-shadow: 0 8px 18px rgba(13,28,52,.10); border: 1px solid rgba(13,28,52,.05); position: relative; }
.pm .pm-postit::before { content: ""; position: absolute; top: -.45rem; left: 50%; transform: translateX(-50%) rotate(-1.5deg); width: 3.2rem; height: .9rem; background: rgba(255,255,255,.65); border: 1px solid rgba(13,28,52,.06); border-radius: .2rem; }
.pm .pm-case-nav { display: flex; gap: .4rem; overflow-x: auto; padding-bottom: .25rem; scrollbar-width: none; }
.pm .pm-case-nav::-webkit-scrollbar { display: none; }
.pm .pm-case-nav button { flex: none; display: inline-flex; align-items: center; gap: .4rem; border-radius: 999px; border: 1px solid var(--pm-line); background: #fff; padding: .45rem .85rem; font-size: .78rem; font-weight: 500; color: var(--pm-ink); white-space: nowrap; transition: all .15s ease; }
.pm .pm-case-nav button:hover { border-color: var(--pm-orange); }
.pm .pm-case-nav button.active { background: var(--pm-navy); color: #fff; border-color: var(--pm-navy); }
.pm .pm-case-nav button.sub { padding-left: .65rem; font-size: .72rem; }
.pm .pm-case-nav button .pm-dot { flex: none; }
@media (min-width: 768px) { .pm .pm-case-nav { flex-direction: column; overflow: visible; align-items: stretch; } .pm .pm-case-nav button { text-align: left; border-radius: .8rem; justify-content: flex-start; } }
.pm .pm-case-progress { height: .55rem; border-radius: 999px; background: var(--pm-soft2); overflow: hidden; }
.pm .pm-case-progress > span { display: block; height: 100%; border-radius: 999px; background: var(--pm-orange); transition: width .3s ease; }
.pm .pm-case-tick { display: inline-flex; align-items: center; gap: .45rem; }
.pm .pm-case-tick .box { width: 1.15rem; height: 1.15rem; border-radius: .35rem; border: 1.5px solid var(--pm-line); display: inline-flex; align-items: center; justify-content: center; background: #fff; flex: none; transition: all .15s ease; }
.pm .pm-case-tick .box.on { background: #2e9e5b; border-color: #2e9e5b; color: #fff; }
.pm .pm-check-row { display: flex; align-items: center; gap: .6rem; border-radius: .7rem; padding: .5rem .6rem; transition: background .15s ease; }
.pm .pm-check-row:hover { background: var(--pm-soft2); }
.pm .pm-check-row .box { width: 1.15rem; height: 1.15rem; border-radius: .35rem; border: 1.5px solid var(--pm-line); display: inline-flex; align-items: center; justify-content: center; background: #fff; flex: none; transition: all .15s ease; color: #fff; }
.pm .pm-check-row .box.on { background: #2e9e5b; border-color: #2e9e5b; }
`;

/* ---------------- shared bits ---------------- */

function Ring({ frac, children }: { frac: number; children?: Any }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  const f = Math.min(0.998, Math.max(0.002, Number(frac) || 0));
  return (
    <div className="relative h-40 w-40">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" stroke="#c9ced4" strokeWidth="6" strokeDasharray="2 7" />
        <circle cx="64" cy="64" r={R} fill="none" stroke="#f59a2b" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - f)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

function Tile({ icon, label, value, sub, tone, onClick }: { icon: Any; label: string; value: string; sub: string; tone?: "navy" | "dark"; onClick?: () => void }) {
  const dark = tone === "dark";
  return (
    <div className={`pm-card p-4 md:p-5 ${dark ? "pm-tile-dark" : ""} ${onClick ? "cursor-pointer" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="flex items-center gap-3">
        <span className={`pm-tile-icon ${dark ? "ondark" : tone === "navy" ? "navy" : ""}`}>{icon}</span>
        <p className={`text-sm font-medium ${dark ? "text-white" : "text-[#1f2630]"}`}>{label}</p>
      </div>
      <p className={`mt-2.5 text-[1.6rem] font-semibold tracking-tight md:text-3xl ${dark ? "text-[var(--pm-orange)]" : ""}`}>{value}</p>
      <p className={`mt-0.5 text-[11px] ${dark ? "text-white/60" : "text-[#5e5e5e]"}`}>{sub}</p>
    </div>
  );
}

/* ---------------- dashboard ---------------- */

const BOARD_ICONS = [ClipboardList, CalendarDays, Clock];

function splitAssign(notes?: string | null) {
  const t = String(notes ?? "");
  const m = t.match(/^\[assign:(Sara|Natalie)\]\s*/i);
  return m ? { who: m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), rest: t.slice(m[0].length) } : { who: "", rest: t };
}
function withAssign(who: string, rest: string) {
  const r = String(rest ?? "").replace(/^\[assign:(Sara|Natalie)\]\s*/i, "");
  return who ? `[assign:${who}] ${r}`.trim() : r;
}
function AssignChip({ who }: { who: string }) {
  if (!who) return null;
  const pink = who.toLowerCase().startsWith("sara");
  return <span className="pm-chip flex-none" style={{ background: pink ? "#fbe3ef" : "#e2edfa", color: pink ? "#b23a74" : "#28598f" }}>{who}</span>;
}
const COL_ACCENT: Record<string, string> = { todo: "#e5484d", doing: "#f59a2b", done: "#2e9e5b" };

export function Dashboard({ p, stats, weeks, maxWeek, rate, unbilledMins, running, viewer, go, act, onQuickAdd, onQuickUrgent }: Any) {
  const cards: Any[] = p.board ?? [];
  const open_ = cards.filter((c: Any) => c.status !== "done");
  const urg = open_.filter((c: Any) => c.important);
  const upNext = (urg.length ? urg : open_.sort((a: Any, b: Any) => a.position - b.position)).slice(0, 4);
  const doneList = cards.filter((c: Any) => c.status === "done").sort((a: Any, b: Any) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 5);
  const activity: Any[] = (p.activity ?? []).filter((a: Any) => {
    if (viewer === "Natalie") return true;
    const msg = String(a.message ?? "").toLowerCase();
    return msg.includes("task") || msg.startsWith("moved");
  }).slice(0, 6);
  const [busy, setBusy] = useState(false);
  const [qtOpen, setQtOpen] = useState(false);
  const [qtDate, setQtDate] = useState(londonDay(new Date().toISOString()));
  const [qtH, setQtH] = useState("");
  const [qtM, setQtM] = useState("");
  const [qtNote, setQtNote] = useState("");
  const [qtBusy, setQtBusy] = useState(false);
  const todoCount = cards.filter((c: Any) => c.status === "todo").length;
  const mineOpen = cards.filter((c: Any) => { const w = splitAssign(c.notes).who; return c.status !== "done" && (w === "Sara" || w === ""); }).length;
  const doingCount = cards.filter((c: Any) => c.status === "doing").length;
  const doneCount = cards.length - todoCount - doingCount;
  const todayMins = stats.today ?? 0;
  const frac = running ? (Date.now() - Date.parse(running.started_at)) / (8 * 3600000) : todayMins / 480;
  const isNat = viewer === "Natalie";
  const avail = (p.client?.portal_prefs?.availability ?? null) as Any;
  const myTasks: Any[] = (p.tasks ?? []).filter((t: Any) => t.status !== "done" && t.due_date).sort((a: Any, b: Any) => String(a.due_date).localeCompare(String(b.due_date))).slice(0, 6);
  const invLive: Any[] = (p.invoices ?? []).filter((i: Any) => i.status !== "draft");
  const invNew: Any[] = invLive.filter((i: Any) => i.status === "sent");
  const todoOpen: Any[] = cards.filter((c: Any) => c.status !== "done").sort((a: Any, b: Any) => ((b.important ? 1 : 0) - (a.important ? 1 : 0)) || String(a.due_date ?? "9999-99-99").localeCompare(String(b.due_date ?? "9999-99-99")));
  const paidDays = (p.invoices ?? []).filter((i: Any) => i.status === "paid" && i.paid_at).map((i: Any) => String(i.paid_at).slice(0, 10)).sort();
  const lastPaid = paidDays.length ? paidDays[paidDays.length - 1] : "";
  const sincePaidMins = (p.time ?? []).filter((e: Any) => e.ended_at && Number(e.minutes) > 0 && (!lastPaid || londonDay(String(e.started_at ?? e.created_at)) >= lastPaid)).reduce((s: number, e: Any) => s + Number(e.minutes), 0);
  const urgentOpen = todoOpen.filter((c: Any) => c.important);
  const toggleDay = async (dow: number) => {
    const prefs = (p.client?.portal_prefs ?? {}) as Any;
    const av = prefs.availability ?? {};
    const dayName = DAY_NAMES[(dow + 1) % 7];
    const prev = Array.isArray(av.days) ? av.days : [];
    const was = !!(prev.find((d: Any) => String(d?.day) === dayName)?.available);
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => {
      const existing = prev.find((d: Any) => String(d?.day) === day);
      return { day, available: day === dayName ? !was : !!existing?.available, note: existing?.note ?? "" };
    });
    const monday = (d: Date) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
    await act({ type: "availabilitySave", week: String(av.week_start ?? monday(new Date())), days, notes: av.notes ?? "" }, "Availability updated");
  };

  const boardCard = (
    <div className="pm-dark p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Urgent tasks</h2>
        <span className="text-sm font-medium text-white/70">{urgentOpen.length ? `${urgentOpen.length} urgent` : `${stats.open} open`}</span>
      </div>
      {upNext.length === 0 ? <p className="mt-4 text-sm text-white/60">No urgent tasks right now · add tasks on the board.</p> : (
        <ul className="mt-4 space-y-3.5">
          {upNext.map((c: Any, i: number) => {
            const Ico = BOARD_ICONS[i % BOARD_ICONS.length];
            return (
              <li key={c.id} className="flex items-center gap-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/10"><Ico className="h-4 w-4 text-white" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{c.title}</p>
                  <p className="text-[11px] text-white/50">{c.status === "doing" ? "In progress" : "To do"}</p>
                </div>
                <span className="pm-dot" style={{ background: c.important ? "#e5484d" : c.status === "doing" ? "#f59a2b" : "rgba(255,255,255,.25)" }} />
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={() => go("board")} className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#f59a2b] hover:underline">Open the board <ArrowUpRight className="h-3.5 w-3.5" /></button>
    </div>
  );
  const todoCard = (
    <div className="pm-card p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Outstanding To Do</h2>
        <span className="text-sm font-medium text-[#5e5e5e]">{todoOpen.length} open</span>
      </div>
      <p className="mt-1 text-xs text-[#5e5e5e]">Flagged tasks jump to the top.</p>
      {todoOpen.length === 0 ? <p className="mt-4 text-sm text-[#5e5e5e]">Nothing outstanding · add items on the To Do tab.</p> : (
        <ul className="mt-4 space-y-2.5">
          {todoOpen.slice(0, 6).map((c: Any) => (
            <li key={c.id} className="pm-row flex items-center gap-3 px-3 py-2.5">
              {c.important
                ? <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#f59a2b]"><Flag className="h-3 w-3 text-[#3d2400]" /></span>
                : <span className="pm-dot" style={{ background: c.status === "doing" ? "#f59a2b" : "#0d1c34" }} />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.title}</p>
                <p className="text-[11px] text-[#5e5e5e]">{c.status === "doing" ? "In progress" : "To do"}{c.due_date ? ` · due ${fmtDate(c.due_date)}` : ""}{c.files?.length ? ` · ${c.files.length} file${c.files.length > 1 ? "s" : ""}` : ""}</p>
              </div>
              {c.important ? <span className="pm-chip orange flex-none">Flagged</span> : null}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => go("tasks")} className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#f59a2b] hover:underline">Open To Do <ArrowUpRight className="h-3.5 w-3.5" /></button>
    </div>
  );
  const recentCard = (
    <div className="pm-card p-6">
      <h2 className="text-lg font-semibold">Recently completed</h2>
      {doneList.length === 0 ? <p className="mt-3 text-sm text-[#5e5e5e]">Finished tasks will collect here.</p> : (
        <ul className="mt-4 space-y-3">
          {doneList.map((c: Any) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#f59a2b]"><Check className="h-3.5 w-3.5 text-[#3d2400]" /></span>
              <p className="min-w-0 flex-1 truncate text-sm text-[#5e5e5e] line-through">{c.title}</p>
              <span className="flex-none text-xs text-[#5e5e5e]">{fmtDate(c.updated_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  const activityCard = (
    <div className={`p-6 ${isNat ? "pm-card" : "pm-dark"}`}>
      <h2 className="text-lg font-semibold">Latest activity</h2>
      {activity.length === 0 ? <p className={`mt-3 text-sm ${isNat ? "text-[#5e5e5e]" : "text-white/60"}`}>Activity will show here as you work together.</p> : (
        <ul className="mt-4 space-y-3">
          {activity.map((a: Any) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-sm"><span className="font-medium">{a.actor === "client" ? "Sara" : a.actor}</span> <span className={isNat ? "text-[#5e5e5e]" : "text-white/60"}>{a.message}</span></p>
              <span className={`flex-none text-xs ${isNat ? "text-[#5e5e5e]" : "text-white/50"}`}>{fmtDate(a.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className={`grid grid-cols-2 gap-4 ${isNat ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        <Tile icon={<ClipboardList className="h-5 w-5" />} tone="navy" label={isNat ? "Tasks to do" : "Tasks Outstanding"} value={String(isNat ? todoCount : stats.open)} sub="on the board" onClick={() => go("board")} />
        {!isNat && <Tile icon={<Clock className="h-5 w-5" />} label="This week" value={fmtMins(sincePaidMins)} sub="hours logged · resets when an invoice is paid" onClick={() => go("time")} />}
        {isNat ? <Tile icon={<Clock className="h-5 w-5" />} label="This week" value={fmtMins(sincePaidMins)} sub="hours logged · resets when an invoice is paid" onClick={() => go("time")} />
          : <Tile icon={<Play className="h-5 w-5" />} tone="dark" label="My to do" value={String(mineOpen)} sub="assigned to you" onClick={() => go("mytodo")} />}
        {isNat ? null
          : <Tile icon={<Check className="h-5 w-5" />} tone="navy" label="Completed" value={String(doneCount)} sub="tasks finished" onClick={() => go("board")} />}
        {isNat
          ? <Tile icon={<FileText className="h-5 w-5" />} label="Unbilled" value={money((unbilledMins / 60) * rate)} sub={`${fmtMins(unbilledMins)} · ${money(rate)}/hr`} />
          : <Tile icon={<FileText className="h-5 w-5" />} label="Invoices" value={String(invNew.length)} sub={invNew.length ? "new to view" : "all caught up"} onClick={() => go("time")} />}
      </div>

      {!isNat && (
        <div className="pm-card self-start p-6">
          <div>
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <p className="mt-1 text-xs text-[#5e5e5e]">Jump straight to what you need</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button type="button" onClick={onQuickAdd} className="flex flex-col items-start gap-2 rounded-2xl bg-[var(--pm-navy)] px-4 py-5 text-left text-white transition-transform hover:-translate-y-0.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><Plus className="h-4 w-4" /></span>
              <span className="text-sm font-semibold">Add new task</span>
              <span className="text-[11px] text-white/60">Put something on the board</span>
            </button>
            <button type="button" onClick={onQuickUrgent} className="flex flex-col items-start gap-2 rounded-2xl bg-[#b3261e] px-4 py-5 text-left text-white transition-transform hover:-translate-y-0.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><Flag className="h-4 w-4" /></span>
              <span className="text-sm font-semibold">Add URGENT task</span>
              <span className="text-[11px] text-white/70">Put something important on the board</span>
            </button>
            <button type="button" onClick={() => go("board")} className="flex flex-col items-start gap-2 rounded-2xl bg-[var(--pm-soft)] px-4 py-5 text-left transition-transform hover:-translate-y-0.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--pm-navy)] shadow-sm"><ClipboardList className="h-4 w-4" /></span>
              <span className="text-sm font-semibold">To-Do Board</span>
              <span className="text-[11px] text-[#5e5e5e]">See everything on the go</span>
            </button>
            <button type="button" onClick={() => go("cal")} className="flex flex-col items-start gap-2 rounded-2xl bg-[var(--pm-soft)] px-4 py-5 text-left transition-transform hover:-translate-y-0.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--pm-navy)] shadow-sm"><CalendarDays className="h-4 w-4" /></span>
              <span className="text-sm font-semibold">Calendar</span>
              <span className="text-[11px] text-[#5e5e5e]">Dates &amp; availability</span>
            </button>
          </div>
        </div>
      )}

      {isNat && (
      <div className="grid gap-5 lg:grid-cols-3">
        {isNat ? (
        <div className="pm-card flex flex-col items-center p-6">
          <div className="flex w-full items-center justify-between">
            <h2 className="text-lg font-semibold">Time tracker</h2>
            <button type="button" aria-label="Open time tracking" onClick={() => go("time")} className="pm-circle"><Clock className="h-4 w-4" /></button>
          </div>
          <div className="mt-2">
            <Ring frac={frac}>
              <span className="timer-num text-[1.35rem] font-semibold tracking-tight md:text-2xl">{running ? hms(Date.now() - Date.parse(running.started_at)) : "00:00:00"}</span>
              <span className="mt-0.5 text-[10px] text-[#5e5e5e]">{running ? "on the clock" : "not tracking"}</span>
            </Ring>
          </div>
          <p className="mt-2 text-center text-xs text-[#5e5e5e]">{running ? (running.note ? `Tracking · ${running.note}` : "Tracking · no note added") : viewer === "Natalie" ? "Ready when you are" : "Natalie's live work timer"}</p>
          {!running && (
            <Button className="pm-btn-orange mt-4 h-10 px-6" disabled={busy} onClick={async () => { setBusy(true); await act({ type: "timeStart", note: "" }, "Timer started"); setBusy(false); }}>
              <Play className="h-4 w-4" /> Start timer
            </Button>
          )}
          {running && (
            <Button className="pm-btn mt-4 h-10 px-6" disabled={busy} onClick={async () => { setBusy(true); await act({ type: "timeStop", id: running.id }, "Timer stopped · hours logged"); setBusy(false); }}>
              <Square className="h-4 w-4" /> Stop timer
            </Button>
          )}
          <div className="mt-4 grid w-full grid-cols-2 gap-1.5">
            <Button type="button" className="pm-btn pm-btn-sm h-9" onClick={() => setQtOpen(true)}><Plus className="h-3.5 w-3.5" /> Quick Add Time</Button>
            <Button type="button" className="pm-btn-orange pm-btn-sm h-9" onClick={() => (onQuickAdd ? onQuickAdd() : go("board"))}><ClipboardList className="h-3.5 w-3.5" /> Log Task</Button>
          </div>
          <Dialog open={qtOpen} onOpenChange={setQtOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>Quick Add Time</DialogTitle></DialogHeader>
              <div className="mt-2 space-y-3">
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={qtDate} max={londonDay(new Date().toISOString())} onChange={(e) => setQtDate(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Hours</Label><Input type="number" min="0" max="23" value={qtH} onChange={(e) => setQtH(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Minutes</Label><Input type="number" min="0" max="59" value={qtM} onChange={(e) => setQtM(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label>What was it for? (optional)</Label><Input value={qtNote} onChange={(e) => setQtNote(e.target.value)} placeholder="e.g. QA report proofreading" /></div>
                <Button type="button" className="pm-btn-orange h-10 w-full" disabled={qtBusy} onClick={async () => {
                  const mins = (parseInt(qtH || "0", 10) || 0) * 60 + (parseInt(qtM || "0", 10) || 0);
                  if (!qtDate) { toast.error("Pick a date."); return; }
                  if (mins <= 0) { toast.error("Enter how long you worked."); return; }
                  setQtBusy(true);
                  const r = await act({ type: "timeAdd", date: qtDate, minutes: mins, note: qtNote.trim(), actor: "Natalie" }, "Time logged");
                  setQtBusy(false);
                  if (r !== null) { setQtOpen(false); setQtH(""); setQtM(""); setQtNote(""); }
                }}>{qtBusy ? "Saving…" : "Log time"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        ) : null}

        {isNat ? <MonthCalCard avail={(p.client?.portal_prefs?.availability ?? null) as Any} booked={((p.client?.portal_prefs?.booked ?? []) as Any[])} cta={false} onCircle={() => go("availability")} onToggleDay={toggleDay} /> : null}
        {isNat ? boardCard : null}
      </div>
      )}

      {!isNat && (
      <div className="grid gap-5 lg:grid-cols-2">
        <MonthCalCard avail={avail} />
        <div className="pm-dark self-start p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tasks due</h2>
            <button type="button" aria-label="Open the board" onClick={() => go("board")} className="pm-circle"><ClipboardList className="h-4 w-4" /></button>
          </div>
          {myTasks.length === 0 ? <p className="mt-3 text-sm text-white/60">No dated tasks right now.</p> : (
            <ul className="mt-4 grid gap-2.5">
              {myTasks.map((t: Any) => (
                <li key={t.id} className="pm-row flex items-center gap-3 px-3 py-2.5">
                  <span className="pm-dot" style={{ background: "#f59a2b" }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    {t.notes ? <p className="truncate text-xs text-white/60">{t.notes}</p> : null}
                  </div>
                  <span className="pm-chip line">Due {fmtDate(t.due_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      )}

    </div>
  );
}

/* ---------------- monthly calendar ---------------- */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const POSTIT_COLOURS = ["#FFF3B0", "#FFDCE5", "#D9EEFF", "#DFF5D3", "#F1E4FF", "#FFE7CF"];
const BOOK_CALL_URL = "https://calendar.google.com/calendar/u/0/r/eventedit?vcon=meet&dates=20261012T170000&hl=en&add=natalie@nine3designs.co.uk&text=Free%20discovery%20call%20with%20Nine3%20Designs&details=Free%2015-minute%20video%20call%20to%20discuss%20your%20project.%20Booked%20via%20nine3designs.co.uk";

function MonthCal({ avail, large, booked, onToggleDay }: { avail: Any; large?: boolean; booked?: Any[]; onToggleDay?: (dow: number) => void }) {
  const [off, setOff] = useState(0);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + off);
  const y = base.getFullYear(), m = base.getMonth();
  const label = base.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const now = new Date();
  const availSet = new Set<string>();
  if (avail?.week_start && Array.isArray(avail.days)) {
    const ws = new Date(avail.week_start + "T12:00:00Z");
    for (const d of avail.days as Any[]) if (d?.available) {
      const idx = DAY_NAMES.indexOf(String(d.day));
      if (idx >= 0) { const dt = new Date(ws); dt.setDate(ws.getDate() + idx); availSet.add(`${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`); }
    }
  }
  const bookedSet = new Set<string>();
  const bookedWho = new Map<string, string>();
  for (const b of booked ?? []) if (b?.date) { bookedSet.add(String(b.date).slice(0, 10)); bookedWho.set(String(b.date).slice(0, 10), String((b as Any).who ?? "")); }
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous month" onClick={() => setOff((o) => o - 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--pm-soft2)] text-[#1f2630] transition-colors hover:bg-[var(--pm-navy)] hover:text-white"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label="Next month" onClick={() => setOff((o) => o + 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--pm-soft2)] text-[#1f2630] transition-colors hover:bg-[var(--pm-navy)] hover:text-white"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
      <div className={`mt-3 grid grid-cols-7 ${large ? "gap-1.5" : "gap-1"} text-center`}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <span key={d} className="text-[10px] font-semibold uppercase tracking-wide text-[#9aa0a6]">{d}</span>)}
        {cells.map((d, i) => d === null ? <span key={`b${i}`} /> : (() => {
          const today = d === now.getDate() && m === now.getMonth() && y === now.getFullYear();
          const isAvail = availSet.has(`${y}-${m}-${d}`);
          const isBooked = bookedSet.has(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
          return (
            <span key={d} className={`flex flex-col items-center ${onToggleDay ? "cursor-pointer" : ""}`} onClick={onToggleDay ? () => onToggleDay(i % 7) : undefined}>
              <span title={isBooked ? "Booked call" : undefined} className={`flex items-center justify-center rounded-full ${large ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs"} ${today ? "bg-[var(--pm-orange)] font-semibold text-[#3d2400]" : isAvail || isBooked ? "bg-[rgba(245,154,43,.14)] font-semibold text-[#a35803]" : "text-[#5e5e5e]"}`}>{d}</span>
              <span className="pm-dot mt-0.5" style={{ width: ".4rem", height: ".4rem", background: isBooked ? (bookedWho.get(`${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`) === "Jermaine" ? "#0d1c34" : "#f59a2b") : isAvail ? "#f59a2b" : "transparent" }} />
            </span>
          );
        })())}
      </div>
      {(availSet.size > 0 || bookedSet.size > 0) ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5e5e5e]">
          {availSet.size > 0 ? <span className="flex items-center gap-1.5"><span className="pm-dot" style={{ background: "#f59a2b" }} /> Natalie</span> : null}
          <span className="flex items-center gap-1.5"><span className="pm-dot" style={{ background: "#0d1c34" }} /> Jermaine</span>
          {bookedSet.size > 0 ? <span className="flex items-center gap-1.5"><span className="pm-dot" style={{ background: "#f59a2b" }} /> Booked calls</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function MonthCalCard({ avail, booked, cta = true, onCircle, onToggleDay }: { avail: Any; booked?: Any[]; cta?: boolean; onCircle?: () => void; onToggleDay?: (dow: number) => void }) {
  return (
    <div className="pm-card flex flex-col p-6">
      <div className="flex w-full items-center justify-between">
        <h2 className="text-lg font-semibold">This month</h2>
        <button type="button" aria-label="Availability settings" onClick={onCircle} style={onCircle ? { cursor: "pointer" } : undefined}><span className="pm-circle"><CalendarDays className="h-4 w-4" /></span></button>
      </div>
      <div className="mt-3 flex-1">
        <MonthCal avail={avail} booked={booked} onToggleDay={onToggleDay} />
      </div>
      {cta ? (
        <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="pm-btn-orange mt-4 inline-flex h-10 items-center justify-center gap-2 px-5 text-sm no-underline">
          <CalendarDays className="h-4 w-4" /> Book a call with Natalie
        </a>
      ) : null}
    </div>
  );
}

function CalendarTab({ avail }: { avail: Any }) {
  return (
    <div className="space-y-4">
      <div className="pm-card p-6 md:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Calendar</h2>
            <p className="mt-1 text-xs text-[#5e5e5e]">Your month at a glance</p>
          </div>
          <span className="pm-circle orange"><CalendarDays className="h-4 w-4" /></span>
        </div>
        <div className="mx-auto mt-6 max-w-xl">
          <MonthCal avail={avail} large />
        </div>
        <div className="mt-6 text-center">
          <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="pm-btn-orange inline-flex h-11 items-center justify-center gap-2 px-6 text-sm no-underline">
            <CalendarDays className="h-4 w-4" /> Book call with Natalie
          </a>
        </div>
      </div>
    </div>
  );
}

/* ---------------- notes (Sara's brain dump) ---------------- */

function NotesTab({ act, notes }: { act: Act; notes: Any[] }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="pm-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Notes</h2>
            <p className="mt-1 text-xs text-[#5e5e5e]">Your brain dump · ideas, reminders, anything</p>
          </div>
          <span className="pm-circle orange"><Pencil className="h-4 w-4" /></span>
        </div>
        <form className="mt-4" onSubmit={async (e) => { e.preventDefault(); if (!text.trim() || busy) return; setBusy(true); const r = await act({ type: "noteAdd", text: text.trim() }, "Note saved"); if (r) setText(""); setBusy(false); }}>
          <Textarea autoFocus placeholder="Dump a thought..." value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-sm" />
          <div className="mt-2.5 flex justify-end">
            <Button type="submit" className="pm-btn-orange h-9 px-5" disabled={busy}>Save note</Button>
          </div>
        </form>
      </div>
      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d5dade] px-4 py-10 text-center text-sm text-[#5e5e5e]">Nothing jotted yet · your notes will collect here.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((n: Any, ni: number) => (
            <div key={n.id} className="pm-postit" style={{ background: POSTIT_COLOURS[ni % POSTIT_COLOURS.length], transform: `rotate(${ni % 2 ? 0.7 : -0.7}deg)` }}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3a3627]">{n.text}</p>
              <div className="mt-3 flex items-center justify-between border-t border-[#00000014] pt-2.5">
                <span className="text-[11px] text-[#7a7460]">{fmtDate(n.at)}</span>
                <IconBtn label="Delete note" danger={confirmDel === n.id} onClick={() => {
                  if (confirmDel === n.id) { act({ type: "noteDelete", id: n.id }, "Note deleted"); setConfirmDel(null); }
                  else { setConfirmDel(n.id); setTimeout(() => setConfirmDel((k) => (k === n.id ? null : k)), 2600); }
                }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- my to do (Sara) ---------------- */

function MyTodoTab({ p, viewer, act }: { p: Any; viewer: string; act: Act }) {
  const cards: Any[] = p.board ?? [];
  const mine = cards.filter((c: Any) => { const w = splitAssign(c.notes).who; return w === "Sara" || w === ""; });
  const [showDone, setShowDone] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const notes: Any[] = ((p.client?.portal_prefs?.sara_notes ?? []) as Any[]);
  const open_ = mine.filter((c: Any) => c.status !== "done");
  const urg = open_.filter((c: Any) => c.important);
  const doing = open_.filter((c: Any) => c.status === "doing");
  const done = mine.filter((c: Any) => c.status === "done").sort((a: Any, b: Any) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const sortDue = (list: Any[]) => [...list].sort((a: Any, b: Any) => ((b.important ? 1 : 0) - (a.important ? 1 : 0)) || String(a.due_date ?? "9999-99-99").localeCompare(String(b.due_date ?? "9999-99-99")) || Number(a.position) - Number(b.position));

  const toggle = async (c: Any) => {
    setBusy(c.id);
    await act({ type: "cardEdit", id: c.id, status: c.status === "done" ? "todo" : "done", actor: viewer }, c.status === "done" ? "Moved back to To do" : "Ticked off");
    setBusy(null);
  };

  const stat = (label: string, value: number | string, tone: string, icon: Any) => (
    <div className="pm-card flex items-center gap-3.5 p-4">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl" style={{ background: `${tone}1a`, color: tone }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tracking-tight text-[#0d1c34]">{value}</p>
        <p className="mt-1.5 truncate text-xs font-medium text-[#5e5e5e]">{label}</p>
      </div>
    </div>
  );

  const tickRow = (c: Any) => (
    <div key={c.id} className={`pmt-row ${c.status === "done" ? "done" : ""}`}>
      <div className="flex items-start gap-2.5">
        <button type="button" aria-label={c.status === "done" ? "Mark as not done" : "Tick off"} disabled={busy === c.id} onClick={() => toggle(c)}
          className={`pm-tickbtn mt-0.5 flex-none ${c.status === "done" ? "" : ""}`}
          style={c.status === "done" ? { background: "#2e9e5b", borderColor: "#2e9e5b", color: "#fff" } : undefined}>
          <Check className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className={`text-sm font-semibold leading-snug ${c.status === "done" ? "text-[#5e5e5e] line-through" : "text-[#0d1c34]"}`}>{c.title}</p>
            {c.important ? <span className="pm-urgent-chip"><Flag className="h-3 w-3" /> Urgent</span> : null}
            {c.due_date ? <span className={`pmt-due ${c.status !== "done" ? dueState(c.due_date) : ""}`}><CalendarDays className="h-3 w-3" /> Due {fmtDue(c.due_date)}</span> : null}
          </div>
          {splitAssign(c.notes).rest ? <p className="pmt-detail">{splitAssign(c.notes).rest}</p> : null}
          {Array.isArray(c.files) && c.files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(c.files as Any[]).map((f: Any, k: number) => (
                <button key={k} type="button" className="pm-filechip" title={`Download ${f.name}`} onClick={async () => { const r = await act({ type: "cardFilesGet", id: c.id }); const m = (r?.files ?? []).find((x: Any) => x?.name === f.name); if (m?.dataUri) openFileHref(m.dataUri, m.name); }}><Paperclip className="h-3 w-3 flex-none" /><span className="max-w-36 truncate">{f.name}</span></button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const panel = (label: string, sub: string, items: Any[], empty: string, tone: string) => (
    <div className="pm-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide"><span className="pm-dot" style={{ background: tone }} /> {label}</h3>
        <span className="pm-chip">{items.length}</span>
      </div>
      <p className="mt-1 text-xs text-[#5e5e5e]">{sub}</p>
      {items.length === 0 ? <p className="pmt-empty mt-3">{empty}</p> : <div className="mt-3 space-y-2">{items.slice(0, 8).map(tickRow)}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <style>{PMT_STYLES}</style>
      <div>
        <h2 className="text-xl font-semibold">My To Do</h2>
        <p className="mt-0.5 text-xs text-[#5e5e5e]">Everything assigned to you · tick things off as you go</p>
      </div>

      {mine.length === 0 ? (
        <div className="pmt-empty">Nothing assigned to you yet · tasks appear here when Natalie or you add one with your name on.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {stat("Urgent tasks", urg.length, "#e5484d", <Flag className="h-5 w-5" />)}
            {stat("Outstanding tasks", open_.length, "#0d1c34", <ClipboardList className="h-5 w-5" />)}
            {stat("In progress", doing.length, "#f59a2b", <ListTodo className="h-5 w-5" />)}
            {stat("Completed tasks", done.length, "#2e9e5b", <Check className="h-5 w-5" />)}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {panel("Assigned to you", "Nearest due date first", sortDue(open_), "Nothing assigned right now.", "#0d1c34")}
            {panel("Urgent tasks", "Flagged · do these first", sortDue(urg), "Nothing urgent · good news.", "#e5484d")}
          </div>

          <div className="pm-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide"><StickyNote className="h-4 w-4 text-[#d97406]" /> My notepad</h3>
              <span className="pm-chip">{notes.length}</span>
            </div>
            <p className="mt-1 text-xs text-[#5e5e5e]">Quick jottings · these also appear on your Notes page</p>
            <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={async (e: Any) => { e.preventDefault(); if (!noteText.trim() || noteBusy) return; setNoteBusy(true); const r = await act({ type: "noteAdd", text: noteText }, "Noted"); setNoteBusy(false); if (r !== null) setNoteText(""); }}>
              <Input value={noteText} onChange={(e: Any) => setNoteText(e.target.value)} placeholder="Jot something down…" className="h-10" />
              <Button type="submit" className="pm-btn-orange h-10 px-6" disabled={noteBusy}>{noteBusy ? "…" : "Add"}</Button>
            </form>
            {notes.length === 0 ? <p className="pmt-empty mt-3">Your notepad is empty.</p> : (
              <ul className="mt-3 space-y-2">
                {notes.slice(0, 6).map((n: Any) => (
                  <li key={n.id} className="pm-row flex items-start gap-2.5 px-3 py-2.5">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{n.text}</p>
                    <span className="flex-none text-[11px] text-[#9aa0a6]">{relDay(n.at)}</span>
                    <IconBtn label="Delete note" onClick={async () => { await act({ type: "noteDelete", id: n.id }, "Note deleted"); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pm-card p-5">
            <button type="button" onClick={() => setShowDone((o: boolean) => !o)} className="flex w-full items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide"><span className="pm-dot" style={{ background: "#2e9e5b" }} /> Completed</h3>
              <span className="pm-chip">{done.length}{done.length ? (showDone ? " · hide" : " · show") : ""}</span>
            </button>
            {showDone && (done.length === 0 ? <p className="pmt-empty mt-3">Completed tasks will collect here.</p> : <div className="mt-3 space-y-2">{done.slice(0, 12).map(tickRow)}</div>)}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- cases (Sara) ---------------- */

const CASE_CHECKLIST = [
  "Instruction", "Format of the assessment", "Enquiries and interviews undertaken", "Executive Summary (background)",
  "Summary of the child's needs", "Analysis - Social, Family & Environment History x2", "Analysis of ability to meet children's needs",
  "Teaching needs", "Recommendation", "Family History & Functioning", "Education and Employment", "Forensic History",
  "Alcohol and Drugs", "Couple Relationship and Domestic Abuse", "Independence Skills", "Routine and Pace of Learning",
  "Housing", "Social Integration and Community Resources", "Money", "Wider Family and Support Network",
  "Working with professionals", "Health", "Emotional and Behavioural Development", "Identity Family and Social Relationships",
  "Social presentation and self care skills", "Parenting Capacity - basic care", "Ensuring safety and managing risk",
  "Emotional Warmth", "Stimulation", "Guidance and Boundaries", "Stability", "Answers to questions from instruction", "Declaration",
];

function caseProgress(c: Any) {
  const done = CASE_CHECKLIST.filter((_x: string, i: number) => c?.checks?.[`check:${i}`]).length;
  return { done, total: CASE_CHECKLIST.length };
}

function daysUntil(d: string) {
  if (!d) return 0;
  const f = new Date(d + "T00:00:00");
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((f.getTime() - today.getTime()) / 86400000);
}

const MALD_COLOURS = [
  { k: "green", bg: "#e7f5ec", solid: "#2e9e5b", text: "#1d6b3a" },
  { k: "amber", bg: "#fdf3e0", solid: "#f59a2b", text: "#a35803" },
  { k: "red", bg: "#fdeaea", solid: "#e5484d", text: "#a3262b" },
];

function ColourDot({ k }: Any) {
  const c = MALD_COLOURS.find((x) => x.k === k);
  if (!c) return null;
  return <span className="pm-dot" style={{ background: c.solid }} />;
}

function NotesBox({ initial, onSave }: Any) {
  const [v, setV] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2">
      <textarea value={v} onChange={(e: Any) => setV(e.target.value)} rows={3} placeholder="Summary of what was said…" className="w-full rounded-xl border border-[#d5dade] bg-white p-3 text-sm text-[#0d1c34] outline-none focus:border-[#f59a2b]" />
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSave({ notes: v }); setBusy(false); }} className="pm-btn mt-2 h-8 px-3 text-xs">{busy ? "Saving…" : "Save summary"}</button>
    </div>
  );
}

function ChecklistItem({ item, i, c, act }: Any) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("mum");
  const on = !!c.checks?.[`check:${i}`];
  const isParentItem = i >= 9 && i <= 30;
  const mald = c.mald?.[String(i)] ?? {};
  const slotKey = isParentItem ? who : "all";
  const slot = mald[slotKey] ?? {};
  const save = async (patch: Any) => { await act({ type: "caseMald", id: c.id, item: i, who: slotKey, ...patch }); };
  return (
    <li className="rounded-xl border border-transparent transition-colors hover:border-[#e6e8ea]">
      <div className="flex items-center gap-1">
        <button type="button" aria-pressed={on} onClick={async () => { await act({ type: "caseCheck", id: c.id, key: `check:${i}`, done: !on }); }} className="pm-check-row w-full">
          <span className={`box ${on ? "on" : ""}`}><Check className="h-3.5 w-3.5" /></span>
          <span className={`min-w-0 flex-1 text-left text-sm ${on ? "text-[#9aa0a6] line-through" : "font-medium"}`}>{item}</span>
          {mald.all?.colour ? <ColourDot k={mald.all.colour} /> : null}
          {mald.mum?.colour ? <ColourDot k={mald.mum.colour} /> : null}
          {mald.dad?.colour ? <ColourDot k={mald.dad.colour} /> : null}
        </button>
        <button type="button" onClick={() => setOpen((o: boolean) => !o)} aria-expanded={open} className="flex-none rounded-full bg-[#eef0f2] px-2.5 py-1.5 text-[11px] font-semibold text-[#0d1c34] transition-colors hover:bg-[#f59a2b] hover:text-[#3d2400]">{open ? "Close" : "Colours & notes"}</button>
      </div>
      {open && (
        <div className="border-t border-[#eef0f2] px-1 pb-3 pt-3">
          {isParentItem && (
            <div className="mb-2 flex gap-1.5">
              {[{ k: "mum", l: "Mum" }, { k: "dad", l: "Dad" }].map((w) => (
                <button key={w.k} type="button" onClick={() => setWho(w.k)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${who === w.k ? "bg-[#0d1c34] text-white" : "bg-[#eef0f2] text-[#0d1c34] hover:bg-[#e2e5e9]"}`}>{w.l}</button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {MALD_COLOURS.map((col) => (
              <button key={col.k} type="button" onClick={() => save({ colour: col.k })} aria-pressed={slot.colour === col.k} className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all" style={slot.colour === col.k ? { background: col.solid, color: "#fff" } : { background: col.bg, color: col.text }}>{col.k.charAt(0).toUpperCase() + col.k.slice(1)}</button>
            ))}
          </div>
          <NotesBox key={slotKey} initial={slot.notes} onSave={save} />
        </div>
      )}
    </li>
  );
}

function QaSection({ c, act, slot, label, hint }: Any) {
  const [date, setDate] = useState(String(c?.qa?.[`${slot}:date`] ?? ""));
  const [dateBusy, setDateBusy] = useState(false);
  const [uploading, setUploading] = useState<"" | "report" | "amend">("");
  const saveDate = async (v: string) => {
    setDate(v);
    setDateBusy(true);
    await act({ type: "caseSave", id: c.id, key: `qa:${slot}:date`, content: v }, "QA date saved");
    setDateBusy(false);
  };
  const upload = async (kind: "report" | "amend", fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setUploading(kind);
    const read = await Promise.all(Array.from(fileList).map((f: Any) => new Promise<Any>((res) => { const r = new FileReader(); r.onload = () => res({ name: f.name, dataUri: String(r.result) }); r.onerror = () => res(null); r.readAsDataURL(f); })));
    const clean = read.filter(Boolean);
    const total = clean.reduce((s2: number, f: Any) => s2 + (f?.dataUri?.length ?? 0), 0);
    if (total > 6_200_000) { toast.error("Those files are too large altogether · keep uploads under about 4 MB."); setUploading(""); return; }
    const r = await act({ type: "caseQaFiles", id: c.id, slot, kind, files: clean }, kind === "report" ? "Report uploaded" : "Amendment file uploaded");
    setUploading("");
  };
  const reports: Any[] = ((c?.qa?.[`${slot}:report`] ?? []) as Any[]);
  const amends: Any[] = ((c?.qa?.[`${slot}:amend`] ?? []) as Any[]);
  const dl = (f: Any) => { if (f?.dataUri) openFileHref(f.dataUri, f.name); };
  const fileRow = (f: Any, kind: "report" | "amend") => (
    <li key={f.id} className="pm-row flex items-center gap-2.5 px-3 py-2.5">
      <FileText className="h-4 w-4 flex-none text-[#d97406]" />
      <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline" onClick={() => dl(f)}>{f.name}</button>
      <span className="flex-none text-[11px] text-[#9aa0a6]">{f.at ? relDay(f.at) : ""}</span>
      <IconBtn label="Delete file" onClick={async () => { await act({ type: "caseQaFileDelete", id: c.id, slot, kind, fileId: f.id }, "File removed"); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
    </li>
  );
  return (
    <div className="space-y-4">
      <div className="pm-card p-5">
        <h3 className="text-lg font-semibold">{label} · QA report</h3>
        <p className="mt-1 text-xs text-[#5e5e5e]">{hint}</p>
        <input type="file" multiple className="hidden" id={`qa-${slot}-report`} onChange={(e: Any) => { upload("report", e.target.files); if (e.target) e.target.value = ""; }} />
        <label htmlFor={`qa-${slot}-report`} className="pm-filebtn mt-3 cursor-pointer"><Upload className="h-3.5 w-3.5" /> {uploading === "report" ? "Uploading…" : "Upload report"}{reports.length ? ` (${reports.length})` : ""}</label>
        {reports.length === 0 ? <p className="pmt-empty mt-3">No report uploaded yet.</p> : <ul className="mt-3 space-y-2">{reports.map((f: Any) => fileRow(f, "report"))}</ul>}
      </div>
      <div className="pm-card p-5">
        <h3 className="text-lg font-semibold">{label} · QA date</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Input type="date" value={date} onChange={(e: Any) => saveDate(e.target.value)} className="h-10 max-w-52" />
          {dateBusy ? <span className="text-xs text-[#9aa0a6]">Saving…</span> : date ? <span className="pm-chip">Saved</span> : null}
        </div>
      </div>
      <div className="pm-card p-5">
        <h3 className="text-lg font-semibold">{label} · Amendment files</h3>
        <p className="mt-1 text-xs text-[#5e5e5e]">Any amended or corrected versions — everything here can be downloaded again.</p>
        <input type="file" multiple className="hidden" id={`qa-${slot}-amend`} onChange={(e: Any) => { upload("amend", e.target.files); if (e.target) e.target.value = ""; }} />
        <label htmlFor={`qa-${slot}-amend`} className="pm-filebtn mt-3 cursor-pointer"><Upload className="h-3.5 w-3.5" /> {uploading === "amend" ? "Uploading…" : "Upload amendment file"}{amends.length ? ` (${amends.length})` : ""}</label>
        {amends.length === 0 ? <p className="pmt-empty mt-3">No amendment files yet.</p> : <ul className="mt-3 space-y-2">{amends.map((f: Any) => fileRow(f, "amend"))}</ul>}
      </div>
    </div>
  );
}

function FilingDateCard({ c, act }: Any) {
  const [date, setDate] = useState(String(c?.filing_date ?? ""));
  const [busy, setBusy] = useState(false);
  return (
    <div className="pm-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Filing date</h3>
        {busy ? <span className="text-xs text-[#9aa0a6]">Saving…</span> : date ? <span className="pm-chip">Saved</span> : null}
      </div>
      <p className="mt-1 text-xs text-[#5e5e5e]">When this assessment is due to be filed · will drive dashboard countdowns later</p>
      <Input type="date" value={date} onChange={async (e: Any) => { const v = e.target.value; setDate(v); setBusy(true); await act({ type: "caseSave", id: c.id, key: "filing_date", content: v }, "Filing date saved"); setBusy(false); }} className="mt-3 h-10 max-w-52" />
      {date ? <p className="mt-2 text-xs font-semibold" style={{ color: daysUntil(date) < 0 ? "#a3262b" : "#0d1c34" }}>Days until filing: {daysUntil(date) < 0 ? `filed ${Math.abs(daysUntil(date))} days ago` : daysUntil(date)}</p> : null}
    </div>
  );
}

function DateBoxes({ c, act }: Any) {
  const dates: Any[] = Array.isArray(c?.date_boxes) ? [...c.date_boxes] : [];
  while (dates.length < 10) dates.push({});
  const setBox = async (i: number, patch: Any) => {
    const cur: Any[] = Array.isArray(c?.date_boxes) ? [...c.date_boxes] : [];
    while (cur.length < 10) cur.push({});
    cur[i] = { ...cur[i], ...patch };
    await act({ type: "caseSave", id: c.id, key: "date_boxes", content: JSON.stringify(cur) }, "Dates saved");
  };
  return (
    <div className="pm-card p-5">
      <h3 className="text-lg font-semibold">Important Dates</h3>
      <p className="mt-1 text-xs text-[#5e5e5e]">Hearing dates, deadlines, key appointments · each with its own note</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {dates.map((d: Any, i: number) => (
          <div key={i} className="rounded-2xl border border-[#e6e8ea] bg-[#fafbfc] p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#0d1c34] text-xs font-bold text-white">{i + 1}</span>
              <Input type="date" value={String(d?.date ?? "")} onChange={(e: Any) => setBox(i, { date: e.target.value })} className="h-9" />
            </div>
            <Textarea value={String(d?.note ?? "")} onChange={(e: Any) => setBox(i, { note: e.target.value })} rows={2} placeholder="Notes / description…" className="mt-2 text-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionEditor({ c, act, skey, label, hint, rows }: Any) {
  const [text, setText] = useState(String(c?.sections?.[skey] ?? ""));
  const [busy, setBusy] = useState(false);
  const dirty = text !== String(c?.sections?.[skey] ?? "");
  const save = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    await act({ type: "caseSave", id: c.id, key: skey, content: text }, "Saved");
    setBusy(false);
  };
  return (
    <div className="pm-card p-5">
      <h3 className="text-lg font-semibold">{label}</h3>
      {hint ? <p className="mt-1 text-xs text-[#5e5e5e]">{hint}</p> : null}
      <Textarea value={text} onChange={(e: Any) => setText(e.target.value)} onBlur={save} rows={rows ?? 10} className="mt-3 text-sm" placeholder="Write here…" />
      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-[11px] text-[#9aa0a6]">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        <Button type="button" className="pm-btn-orange h-9 px-5" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

function CaseDetail({ c, act, viewer, onBack }: Any) {
  const [sel, setSel] = useState("home");
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logH, setLogH] = useState("");
  const [logM, setLogM] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logBusy, setLogBusy] = useState(false);
  const prog = caseProgress(c);
  const notes: Any[] = Array.isArray(c.notes) ? c.notes : [];
  const log: Any[] = Array.isArray(c.log) ? c.log : [];
  const navBtn = (key: string, label: string, sub = false, dotColor = "") => (
    <button key={key} type="button" onClick={() => setSel(key)} className={`${sub ? "sub " : ""}${sel === key ? "active" : ""}`}>
      {dotColor ? <span className="pm-dot" style={{ background: dotColor }} /> : null}
      {label}
      {key === "checklists" ? <span className="pm-chip ml-auto">{prog.done}/{prog.total}</span> : null}
    </button>
  );
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5e5e5e] hover:text-[#0d1c34]"><ArrowLeft className="h-3.5 w-3.5" /> All cases</button>

      <div className="grid gap-4 md:grid-cols-[230px_1fr]">
        <nav className="pm-case-nav" aria-label="Case sections">
          {navBtn("home", "Case Home")}
          {navBtn("details", "Basic Details & Contact Info")}
          {navBtn("dates", "Important Dates")}
          {navBtn("checklists", "Checklists")}
          {navBtn("notes", "Notes")}
          {navBtn("log", "Time Log")}
          {navBtn("interim", "Interim QA")}
          {navBtn("final", "Final QA")}
        </nav>

        <div className="min-w-0 space-y-4">
          {sel === "home" && (
            <>
              <div className="pm-card p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-semibold">{c.title}</h2>
                  <span className={`pm-chip ${c.assigned === "Jermaine" ? "navy" : "orange"}`}>Assigned to {c.assigned === "Jermaine" ? "Jermaine" : "Sara"}</span>
                </div>
                {c.info ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#4b5563]">{c.info}</p> : <p className="mt-2 text-sm italic text-[#9aa0a6]">No basic info added yet · add it under Basic Details.</p>}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-[#5e5e5e]">
                    <span className="font-semibold">Assessment framework · checklist progress</span>
                    <span>{prog.done}/{prog.total} complete</span>
                  </div>
                  <div className="pm-case-progress mt-1.5"><span style={{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%` }} /></div>
                </div>
                <p className="mt-3 text-[11px] text-[#9aa0a6]">Created {fmtDate(c.created_at)} · updated {relDay(c.updated_at)}</p>
              </div>
              <FilingDateCard c={c} act={act} />
              <div className="grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => setSel("details")} className="pm-card p-4 text-left"><p className="text-sm font-semibold">Basic details</p><p className="mt-0.5 text-[11px] text-[#5e5e5e]">Names &amp; contact info</p></button>
                <button type="button" onClick={() => setSel("checklists")} className="pm-card p-4 text-left"><p className="text-sm font-semibold">Checklists</p><p className="mt-0.5 text-[11px] text-[#5e5e5e]">{prog.done}/{prog.total} sections done</p></button>
                <button type="button" onClick={() => setSel("log")} className="pm-card p-4 text-left"><p className="text-sm font-semibold">Time log</p><p className="mt-0.5 text-[11px] text-[#5e5e5e]">{log.length} entr{log.length === 1 ? "y" : "ies"}</p></button>
              </div>
            </>
          )}

          {sel === "details" && <SectionEditor c={c} act={act} skey="details" label="Basic Details & Contact Info" hint="Names, ages, addresses, contact details, who's who in the family" rows={12} />}
          {sel === "dates" && <DateBoxes c={c} act={act} />}

          {sel === "checklists" && (
            <div className="pm-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">Assessment checklist</h3>
                <span className="pm-chip">{prog.done}/{prog.total} complete</span>
              </div>
              <div className="pm-case-progress mt-3"><span style={{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%` }} /></div>
              <p className="mt-3 rounded-xl bg-[#eef0f2] px-3 py-2 text-[11px] text-[#5e5e5e]">Tap "Colours &amp; notes" on a section to record Green / Amber / Red and a summary of what was said — parent sections have Mum and Dad tabs.</p>
              <ul className="mt-3 space-y-1">
                {CASE_CHECKLIST.map((item: string, i: number) => (
                  <ChecklistItem key={i} item={item} i={i} c={c} act={act} />
                ))}
              </ul>
            </div>
          )}

          {sel === "notes" && (
            <div className="pm-card p-5">
              <h3 className="text-lg font-semibold">Case notes</h3>
              <p className="mt-1 text-xs text-[#5e5e5e]">Working notes for this case · only people in this portal can see them</p>
              <form className="mt-3" onSubmit={async (e: Any) => { e.preventDefault(); if (!noteText.trim() || noteBusy) return; setNoteBusy(true); const r = await act({ type: "caseNoteAdd", id: c.id, text: noteText }, "Note added"); setNoteBusy(false); if (r !== null) setNoteText(""); }}>
                <Textarea value={noteText} onChange={(e: Any) => setNoteText(e.target.value)} rows={3} className="text-sm" placeholder="Add a note…" />
                <div className="mt-2 flex justify-end"><Button type="submit" className="pm-btn-orange h-9 px-5" disabled={noteBusy}>{noteBusy ? "Saving…" : "Add note"}</Button></div>
              </form>
              {notes.length === 0 ? <p className="pmt-empty mt-3">No notes yet.</p> : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {notes.map((n: Any, ni: number) => (
                    <div key={n.id} className="pm-postit" style={{ background: POSTIT_COLOURS[ni % POSTIT_COLOURS.length], transform: `rotate(${ni % 2 ? 0.7 : -0.7}deg)` }}>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#3a3627]">{n.text}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-[#00000014] pt-2.5">
                        <span className="text-[11px] text-[#7a7460]">{fmtDate(n.at)}</span>
                        <IconBtn label="Delete note" onClick={async () => { await act({ type: "caseNoteDelete", id: c.id, noteId: n.id }, "Note deleted"); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {sel === "log" && (
            <div className="pm-card p-5">
              <h3 className="text-lg font-semibold">Time log</h3>
              <p className="mt-1 text-xs text-[#5e5e5e]">Hours spent on this case · Natalie picks these up for invoicing</p>
              <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]" onSubmit={async (e: Any) => {
                e.preventDefault();
                const mins = (parseInt(logH || "0", 10) || 0) * 60 + (parseInt(logM || "0", 10) || 0);
                if (!logDate) { toast.error("Pick a date."); return; }
                if (mins <= 0) { toast.error("Enter how long you worked."); return; }
                setLogBusy(true);
                const r = await act({ type: "caseLogAdd", id: c.id, date: logDate, hours: Math.round((mins / 60) * 100) / 100, note: logNote.trim() }, "Time logged");
                setLogBusy(false);
                if (r !== null) { setLogH(""); setLogM(""); setLogNote(""); }
              }}>
                <Input type="date" value={logDate} max={logDate} onChange={(e: Any) => setLogDate(e.target.value)} className="h-10" />
                <div className="flex gap-2">
                  <Input type="number" min="0" max="23" placeholder="Hrs" value={logH} onChange={(e: Any) => setLogH(e.target.value)} className="h-10" />
                  <Input type="number" min="0" max="59" placeholder="Min" value={logM} onChange={(e: Any) => setLogM(e.target.value)} className="h-10" />
                </div>
                <Input value={logNote} onChange={(e: Any) => setLogNote(e.target.value)} placeholder="What was it for? (optional)" className="h-10" />
                <Button type="submit" className="pm-btn-orange h-10" disabled={logBusy}>{logBusy ? "…" : "Add"}</Button>
              </form>
              {log.length === 0 ? <p className="pmt-empty mt-4">No time logged against this case yet.</p> : (
                <ul className="mt-4 space-y-2">
                  {log.map((t: Any) => (
                    <li key={t.id} className="pm-row flex items-center gap-3 px-3 py-2.5">
                      <Clock className="h-4 w-4 flex-none text-[#d97406]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fmtDate(t.date)}{t.note ? ` · ${t.note}` : ""}</p>
                      </div>
                      <span className="pm-chip orange flex-none">{Number(t.hours).toFixed(2)} h</span>
                      <IconBtn label="Delete entry" onClick={async () => { await act({ type: "caseLogDelete", id: c.id, logId: t.id }, "Entry removed"); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {sel === "interim" && <QaSection c={c} act={act} slot="interim" label="Interim QA" hint="Upload the report, log the QA date, and attach any amendment files." />}
          {sel === "final" && <QaSection c={c} act={act} slot="final" label="Final QA" hint="Upload the report, log the QA date, and attach any amendment files." />}
        </div>
      </div>
    </div>
  );
}

export function CasesTab({ p, viewer, act }: { p: Any; viewer: string; act: Act }) {
  const cases: Any[] = ((p.client?.portal_prefs?.cases ?? []) as Any[]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandAll, setExpandAll] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [info, setInfo] = useState("");
  const [assigned, setAssigned] = useState("Sara");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const cur = cases.find((c: Any) => c.id === openId);
  if (cur) return <CaseDetail c={cur} act={act} viewer={viewer} onBack={() => setOpenId(null)} />;
  const addCase = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    const r = await act({ type: "caseAdd", title: title.trim(), info: info.trim(), assigned }, "Case created");
    setBusy(false);
    if (r !== null) { setAddOpen(false); setTitle(""); setInfo(""); setAssigned("Sara"); if (r?.id) setOpenId(r.id); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Cases</h2>
          <p className="mt-0.5 text-xs text-[#5e5e5e]">Every case &amp; family in one place</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="pm-btn h-10" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add new case</Button>
          <Button type="button" className="pm-btn-orange h-10" onClick={() => setExpandAll((o: boolean) => !o)} disabled={cases.length === 0}>{expandAll ? "Close all cases" : "Open all cases"}</Button>
        </div>
      </div>

      {cases.length === 0 ? (
        <div className="pmt-empty">No cases yet · tap "Add new case" to set up the first one.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {cases.map((c: Any) => {
            const prog = caseProgress(c);
            const notes: Any[] = Array.isArray(c.notes) ? c.notes : [];
            return (
              <div key={c.id} className="pm-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{c.title}</h3>
                  <span className={`pm-chip ${c.assigned === "Jermaine" ? "navy" : "orange"}`}>{c.assigned === "Jermaine" ? "Jermaine" : "Sara"}</span>
                </div>
                {(expandAll || !c.info) ? null : <p className="clamp2 mt-1.5 text-xs text-[#5e5e5e]">{c.info}</p>}
                {expandAll && c.info ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#4b5563]">{c.info}</p> : null}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-[#5e5e5e]">
                    <span>Checklist</span><span>{prog.done}/{prog.total}</span>
                  </div>
                  <div className="pm-case-progress mt-1"><span style={{ width: `${prog.total ? Math.round((prog.done / prog.total) * 100) : 0}%` }} /></div>
                </div>
                {c.filing_date ? <div className="mt-2 flex items-center justify-between text-[11px] text-[#5e5e5e]"><span>Days until filing</span><span className="font-semibold" style={{ color: daysUntil(c.filing_date) < 0 ? "#a3262b" : "#0d1c34" }}>{daysUntil(c.filing_date) < 0 ? `Filed ${Math.abs(daysUntil(c.filing_date))}d ago` : daysUntil(c.filing_date)}</span></div> : null}
                {expandAll && notes.length > 0 ? (
                  <div className="mt-3 border-t border-[#e6e8ea] pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5e5e5e]">Latest note</p>
                    <p className="clamp2 mt-1 text-xs text-[#4b5563]">{notes[0]?.text}</p>
                  </div>
                ) : null}
                <div className="mt-4 flex items-center gap-2">
                  <Button type="button" className="pm-btn h-9 flex-1" onClick={() => setOpenId(c.id)}>Open case</Button>
                  <IconBtn label="Delete case" danger={confirmDel === c.id} onClick={() => {
                    if (confirmDel === c.id) { act({ type: "caseDelete", id: c.id }, "Case deleted"); setConfirmDel(null); }
                    else { setConfirmDel(c.id); setTimeout(() => setConfirmDel((k: Any) => (k === c.id ? null : k)), 2600); }
                  }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add new case</DialogTitle></DialogHeader>
          <div className="mt-2 space-y-3">
            <div className="space-y-1.5"><Label>Case title</Label><Input autoFocus value={title} onChange={(e: Any) => setTitle(e.target.value)} placeholder="e.g. Smith family" maxLength={200} /></div>
            <div className="space-y-1.5"><Label>Basic info (optional)</Label><Textarea value={info} onChange={(e: Any) => setInfo(e.target.value)} rows={3} placeholder="Names, who's who, anything useful" /></div>
            <div className="space-y-1.5">
              <Label>Assigned to</Label>
              <select value={assigned} onChange={(e: Any) => setAssigned(e.target.value)} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="Sara">Sara</option>
                <option value="Jermaine">Jermaine</option>
              </select>
            </div>
            <Button type="button" className="pm-btn-orange h-10 w-full" disabled={busy} onClick={addCase}>{busy ? "Creating…" : "Create case"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- board ---------------- */

const MILEAGE_CAP = 10000;
const MILEAGE_RATE = 0.55;

export function MileageTab({ act, entries, files }: { act: Act; entries: Any[]; files?: Any[] }) {
  const docs = (files ?? []).filter((f: Any) => f.kind === "mileage-doc");
  const [docBusy, setDocBusy] = useState(false);
  const uploadDoc = async (f: File | undefined) => {
    if (!f || docBusy) return;
    setDocBusy(true);
    const dataUri = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(""); r.readAsDataURL(f); });
    try {
      await act({ type: "mileageDoc", dataUri, fileName: f.name }, "Document uploaded · Natalie can see it");
    } finally { setDocBusy(false); }
  };
  const list = (entries ?? []) as Any[];
  const [driver, setDriver] = useState("Sara");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [desc, setDesc] = useState("");
  const [miles, setMiles] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [mode, setMode] = useState<"manual" | "route">("manual");
  const [fromPc, setFromPc] = useState("");
  const [toPc, setToPc] = useState("");
  const [calc, setCalc] = useState<Any | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [roundTrip, setRoundTrip] = useState(false);
  const total = (name: string) => Math.round(list.filter((e) => e.driver === name).reduce((s, e) => s + Number(e.miles || 0), 0) * 10) / 10;
  const claim = (m: number) => Math.min(m, MILEAGE_CAP) * MILEAGE_RATE;
  const money = (n: number) => `£${n.toFixed(2)}`;
  const calcRoute = async () => {
    if (calcBusy) return;
    const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const f = clean(fromPc), t = clean(toPc);
    if (f.length < 5 || t.length < 5) { toast.error("Enter both postcodes."); return; }
    setCalcBusy(true);
    try {
      const geo = async (pc: string) => {
        const eps: string[] = [`https://api.postcodes.io/postcodes/${pc}`, `https://findthatpostcode.uk/postcodes/${pc}.json`];
        if (pc.length > 4) eps.push(`https://api.postcodes.io/outcodes/${pc.slice(0, -3)}`);
        for (const ep of eps) {
          try {
            const r = await fetch(ep).then((x: Any) => x.json());
            const raw = r?.result ?? r?.data;
            if (!raw) continue;
            const g = Array.isArray(raw) ? raw[0] : raw;
            const a2 = (g?.attributes ?? g) ?? {};
            const lat = Number(a2.latitude), lng = Number(a2.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              const apiPc = String(a2.postcode ?? "").trim();
              return { lat, lng, pc: apiPc || (pc.length > 4 ? pc.slice(0, -3) + " " + pc.slice(-3) : pc) };
            }
          } catch { continue; }
        }
        throw new Error("geo");
      };
      let A: Any, B: Any;
      try { A = await geo(f); B = await geo(t); } catch { toast.error("One of those postcodes doesn't look right · check them and try again."); return; }
      let mi = 0;
      for (const rp of ["https://router.project-osrm.org", "https://routing.openstreetmap.de/routed-car"]) {
        try {
          const r = await fetch(`${rp}/route/v1/driving/${A.lng},${A.lat};${B.lng},${B.lat}?overview=false`).then((x: Any) => x.json());
          const d = r?.routes?.[0]?.distance;
          if (d > 0) { mi = Math.round((d / 1609.344) * 10) / 10; break; }
        } catch { continue; }
      }
      if (!mi) {
        const R = 3958.7613;
        const dLat = (B.lat - A.lat) * Math.PI / 180, dLng = (B.lng - A.lng) * Math.PI / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * Math.PI / 180) * Math.cos(B.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        mi = Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.25 * 10) / 10;
      }
      setCalc({ miles: mi, from: A.pc, to: B.pc });
    } finally { setCalcBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {["Sara", "Kieron"].map((name) => {
          const t = total(name);
          const left = Math.max(0, MILEAGE_CAP - t);
          const over = Math.max(0, t - MILEAGE_CAP);
          return (
            <div key={name} className="pm-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{name}</h2>
                <span className="pm-circle orange"><Car className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">{money(claim(t))} <span className="text-lg font-medium text-[#5e5e5e]">claimed</span></p>
              <p className="mt-1 text-xs text-[#5e5e5e]">{t.toLocaleString()} of {MILEAGE_CAP.toLocaleString()} miles at 55p</p>
              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#e7eaee]">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (t / MILEAGE_CAP) * 100)}%`, background: "var(--pm-orange)" }} />
              </div>
              {over > 0
                ? <p className="mt-2 text-xs font-medium text-[var(--pm-orange-deep)]">{over.toLocaleString()} miles over allowance · rate to confirm with Natalie</p>
                : <p className="mt-2 text-xs text-[#5e5e5e]">{left.toLocaleString()} miles left at 55p</p>}
            </div>
          );
        })}
      </div>

      <div className="pm-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Mileage documents</h2>
            <p className="mt-1 text-xs text-[#5e5e5e]">Upload a sheet or document · Natalie works the mileage out with you</p>
          </div>
          <span className="pm-circle orange"><Upload className="h-4 w-4" /></span>
        </div>
        <input type="file" id="mileagedoc" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.doc,.docx" disabled={docBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ""; }} />
        <label htmlFor="mileagedoc" className={`pm-filebtn mt-4 cursor-pointer ${docBusy ? "opacity-60" : ""}`}><Upload className="h-3.5 w-3.5" /> {docBusy ? "Uploading…" : "Upload document"}</label>
        {docs.length > 0 && (
          <ul className="mt-3 space-y-2">
            {docs.map((f: Any) => (
              <li key={f.id} className="pm-row flex flex-wrap items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 flex-none text-[#d97406]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.title || f.file_name}</p>
                  <p className="text-xs text-[#5e5e5e]">Uploaded {fmtDate(f.created_at)}</p>
                </div>
                <button type="button" className="pm-filebtn navy" style={{ textDecoration: "none" }} onClick={async () => { const r = await act({ type: "fileGet", id: f.id }); if (r?.href || r?.url) openFileHref(r.href ?? r.url, f.file_name ?? f.title); }}>Open</button>
                <IconBtn label="Delete document" onClick={async () => { await act({ type: "deleteFile", id: f.id }, "Document removed"); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pm-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Log a journey</h2>
            <p className="mt-1 text-xs text-[#5e5e5e]">Add it once · totals update for both of you</p>
          </div>
          <span className="pm-circle orange"><Car className="h-4 w-4" /></span>
        </div>
        <form className="mt-4 grid gap-3 sm:grid-cols-12" onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const useMiles = mode === "route" ? (calc ? (roundTrip ? Math.round(calc.miles * 2 * 10) / 10 : calc.miles) : 0) : Number(miles);
          if (!useMiles || !(useMiles > 0)) { toast.error(mode === "route" ? "Work out the miles first." : "How many miles was the journey?"); return; }
          setBusy(true);
          const finalDesc = mode === "route" ? `${calc.from} to ${calc.to}${roundTrip ? " · return" : ""}${desc.trim() ? ` · ${desc.trim()}` : ""}` : desc.trim();
          const r = await act({ type: "mileageAdd", driver, date, description: finalDesc, miles: useMiles }, "Journey logged");
          if (r) { setDesc(""); setMiles(""); setCalc(null); setRoundTrip(false); }
          setBusy(false);
        }}>
          <div className="sm:col-span-3">
            <Label className="text-xs font-medium">Who drove</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl bg-[#eef0f2] p-1">
              {["Sara", "Kieron"].map((n) => (
                <button key={n} type="button" onClick={() => setDriver(n)} className={`h-9 rounded-lg text-sm font-semibold transition-colors ${driver === n ? "bg-[var(--pm-navy)] text-white" : "text-[#5e5e5e] hover:text-[#1f2630]"}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-3">
            <Label className="text-xs font-medium">Work out miles by</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl bg-[#eef0f2] p-1">
              <button type="button" onClick={() => setMode("manual")} className={`h-9 rounded-lg text-sm font-semibold transition-colors ${mode === "manual" ? "bg-[var(--pm-navy)] text-white" : "text-[#5e5e5e] hover:text-[#1f2630]"}`}>Manual miles</button>
              <button type="button" onClick={() => setMode("route")} className={`h-9 rounded-lg text-sm font-semibold transition-colors ${mode === "route" ? "bg-[var(--pm-navy)] text-white" : "text-[#5e5e5e] hover:text-[#1f2630]"}`}>Postcodes</button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs font-medium">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 h-9 text-sm" />
          </div>
          {mode === "manual" ? (
            <>
              <div className="sm:col-span-2">
                <Label className="text-xs font-medium">Miles</Label>
                <Input type="number" min="0.1" step="0.1" placeholder="e.g. 42" value={miles} onChange={(e) => setMiles(e.target.value)} className="mt-1.5 h-9 text-sm" />
              </div>
              <div className="sm:col-span-4">
                <Label className="text-xs font-medium">Journey</Label>
                <Input placeholder="Where to and why" value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1.5 h-9 text-sm" />
              </div>
            </>
          ) : (
            <>
              <div className="sm:col-span-2">
                <Label className="text-xs font-medium">From postcode</Label>
                <Input placeholder="e.g. S64 8PP" value={fromPc} onChange={(e) => { setFromPc(e.target.value); setCalc(null); }} className="mt-1.5 h-9 text-sm uppercase" />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-medium">To postcode</Label>
                <Input placeholder="e.g. DN1 1AA" value={toPc} onChange={(e) => { setToPc(e.target.value); setCalc(null); }} className="mt-1.5 h-9 text-sm uppercase" />
              </div>
              <div className="sm:col-span-4">
                <Label className="text-xs font-medium">Note (optional)</Label>
                <Input placeholder="What the trip was for" value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-1.5 h-9 text-sm" />
              </div>
            </>
          )}
          <div className="flex items-end gap-2 sm:col-span-2">
            {mode === "route" ? (
              <Button type="button" className="pm-btn h-9 w-full px-3" disabled={calcBusy || busy} onClick={calcRoute}>{calcBusy ? "Working it out..." : calc ? "Recalculate" : "Work out miles"}</Button>
            ) : null}
            <Button type="submit" className="pm-btn-orange h-9 flex-1 px-3" disabled={busy}>{busy ? "Saving..." : "Log journey"}</Button>
          </div>
        </form>
        {mode === "route" ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <label className="flex cursor-pointer items-center gap-2 text-[#5e5e5e]">
              <input type="checkbox" checked={roundTrip} onChange={(e) => setRoundTrip(e.target.checked)} className="h-4 w-4 accent-[var(--pm-orange)]" />
              There and back (double it)
            </label>
            {calc ? <span className="rounded-full bg-[rgba(245,154,43,.14)] px-3 py-1 font-semibold text-[#a35803]">{calc.miles} miles · {calc.from} to {calc.to}</span> : <span className="text-[#9aa0a6]">Road distance worked out automatically · UK postcodes only</span>}
          </div>
        ) : null}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#d5dade] px-4 py-10 text-center text-sm text-[#5e5e5e]">No journeys logged yet · they'll collect here.</div>
      ) : (
        <div className="pm-card overflow-hidden">
          <div className="flex items-center justify-between px-6 pb-1 pt-5">
            <h2 className="text-lg font-semibold">Journeys</h2>
            <p className="text-xs text-[#5e5e5e]">{list.length} {list.length === 1 ? "entry" : "entries"}</p>
          </div>
          <ul className="divide-y divide-[#e6e8ea] px-3 pb-3">
            {list.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${e.driver === "Kieron" ? "bg-[#e7eaee] text-[#1f2630]" : "bg-[rgba(245,154,43,.14)] text-[#a35803]"}`}>{e.driver}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.description || "Journey"}</p>
                  <p className="text-[11px] text-[#9aa0a6]">{fmtDate(e.date || e.at)}</p>
                </div>
                <span className="flex-none text-sm font-semibold">{e.miles} <span className="text-[11px] font-medium text-[#5e5e5e]">mi</span></span>
                <IconBtn label="Delete entry" danger={confirmDel === e.id} onClick={() => {
                  if (confirmDel === e.id) { act({ type: "mileageDelete", id: e.id }, "Entry deleted"); setConfirmDel(null); }
                  else { setConfirmDel(e.id); setTimeout(() => setConfirmDel((k) => (k === e.id ? null : k)), 2600); }
                }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Board({ p, viewer, act, go, autoAdd, onAutoAddDone, autoAddUrgent, onAutoAddUrgentDone }: { p: Any; viewer: string; act: Act; go: Any; autoAdd?: boolean; onAutoAddDone?: () => void; autoAddUrgent?: boolean; onAutoAddUrgentDone?: () => void }) {
  const cards: Any[] = p.board ?? [];
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [composer, setComposer] = useState<ColKey | null>(null);
  const [editing, setEditing] = useState<Any | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const [urgentStart, setUrgentStart] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (autoAdd) { setComposer("todo"); setUrgentStart(false); if (onAutoAddDone) onAutoAddDone(); }
  }, [autoAdd]);
  useEffect(() => {
    if (autoAddUrgent) { setComposer("todo"); setUrgentStart(true); if (onAutoAddUrgentDone) onAutoAddUrgentDone(); }
  }, [autoAddUrgent]);

  const colCards = (key: string) => cards.filter((c: Any) => c.status === key).sort((a: Any, b: Any) => ((b.important ? 1 : 0) - (a.important ? 1 : 0)) || a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)));

  async function dropInto(status: string, beforeId?: string) {
    if (!dragId) return;
    const ids = colCards(status).filter((c: Any) => c.id !== dragId).map((c: Any) => c.id);
    const idx = beforeId ? ids.indexOf(beforeId) : ids.length;
    ids.splice(idx < 0 ? ids.length : idx, 0, dragId);
    setOverCol(null); setDragId(null);
    await act({ type: "cardOrder", status, ids });
  }

  async function nudge(card: Any, dir: -1 | 1) {
    const order = COLUMNS.map((c) => c.key);
    const i = order.indexOf(card.status);
    const next = order[Math.min(order.length - 1, Math.max(0, i + dir))];
    if (!next || next === card.status) return;
    await act({ type: "cardEdit", id: card.id, status: next, actor: viewer }, `Moved to ${COLUMNS.find((c) => c.key === next)?.label}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Task board</h2>
          <p className="pm-drag-hint mt-0.5 text-xs text-[#5e5e5e]">Drag cards between columns · or use the arrows on each card</p>
          <p className="pm-drag-hide mt-0.5 text-xs text-[#5e5e5e]">Use the arrows on each card to move tasks</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button className="pm-btn" onClick={() => { setUrgentStart(false); setComposer("todo"); }}><Plus className="h-4 w-4" /> Add task</Button>
          <Button className="pm-btn-orange" onClick={() => { setUrgentStart(true); setComposer("todo"); }}><Flag className="h-4 w-4" /> Add urgent task</Button>
        </div>
      </div>

      <div className="pm-boardwrap grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = colCards(col.key);
          const isOver = overCol === col.key;
          return (
            <div key={col.key}
              className={`pm-col ${isOver ? "drop" : ""}`} style={{ background: "rgba(255,255,255,.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,.65)", borderRadius: 20, boxShadow: "0 8px 28px rgba(13,28,52,.08)" }}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => { e.preventDefault(); dropInto(col.key); }}>
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="pm-dot" style={{ background: COL_ACCENT[col.key] }} />
                  <h3 className="text-sm font-semibold uppercase tracking-wide">{col.label}</h3>
                  <span className="pm-chip">{list.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {col.key === "done" && list.length > 0 && (
                    <button type="button" onClick={() => setDoneOpen((o) => !o)} aria-label={doneOpen ? "Hide completed tasks" : "Show completed tasks"} className="flex h-8 items-center gap-1 rounded-full bg-[#eef0f2] px-3 text-xs font-medium text-[#0d1c34] transition-colors hover:bg-[#f59a2b] hover:text-[#3d2400]">
                      {doneOpen ? "Hide" : "Show"}<ChevronRight className={`h-3.5 w-3.5 transition-transform ${doneOpen ? "rotate-90" : ""}`} />
                    </button>
                  )}
                  <button type="button" onClick={() => setComposer(col.key)} aria-label={`Add to ${col.label}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0f2] text-[#0d1c34] transition-colors hover:bg-[#f59a2b] hover:text-[#3d2400]"><Plus className="h-4 w-4" /></button>
                </div>
              </div>

              {composer === col.key && <AddComposer col={col.key} startImportant={urgentStart} onCancel={() => setComposer(null)} onSubmit={async (title, notes, files, important) => {
                const r = await act({ type: "cardAdd", title, notes, status: col.key, actor: viewer, important: !!important }, important ? "Important task added" : "Task added");
                if (r?.id && files.length) await act({ type: "cardFiles", id: r.id, files, actor: viewer }, "File attached to task");
                if (r) setComposer(null);
                return r;
              }} />}

              {col.key === "done" && list.length > 0 && !doneOpen ? (
                <button type="button" onClick={() => setDoneOpen(true)} className="w-full rounded-xl border border-dashed border-[#d5dade] px-3 py-5 text-center text-xs text-[#5e5e5e] transition-colors hover:border-[#f59a2b] hover:text-[#a35803]">
                  {list.length} completed {list.length === 1 ? "task" : "tasks"} · tap to show
                </button>
              ) : (
              <div className="space-y-2.5">
                {list.length === 0 && composer !== col.key && <p className="rounded-xl border border-dashed border-[#d5dade] px-3 py-6 text-center text-xs text-[#5e5e5e]">Nothing here yet</p>}
                {list.map((c: Any) => (
                  <div key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onDragOver={(e) => { if (dragId && dragId !== c.id) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropInto(col.key, c.id); }}
                    onClick={() => setOpenId((o) => (o === c.id ? null : c.id))}
                    className={`pm-task cursor-grab p-3.5 active:cursor-grabbing ${openId === c.id ? "open" : ""} ${dragId === c.id ? "opacity-50" : ""} ${c.important ? "important" : ""}`} style={{ borderLeft: `4px solid ${c.important || (c.status !== "done" && c.due_date && dueState(c.due_date) === "over") ? "#e5484d" : c.status === "done" ? "#2e9e5b" : c.status === "doing" ? "#8fb8d8" : "#f59a2b"}` }}>
                    <div className={`flex items-start justify-between gap-2 ${openId === c.id ? "" : ""}`}>
                      <p className={`text-sm font-medium leading-snug ${c.status === "done" ? "text-[#5e5e5e] line-through" : ""}`}>{c.title}</p>
                      <AssignChip who={splitAssign(c.notes).who} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`pm-chip ${c.important ? "orange" : ""} flex-none`} style={c.important ? { background: "rgba(229,72,77,.12)", color: "#c53030" } : { background: "rgba(13,28,52,.07)", color: "#0d1c34" }}>
                        {c.important ? <><Flag className="h-3 w-3" /> High priority</> : <><Circle className="h-2.5 w-2.5" /> Normal</>}
                      </span>
                      <span className="ml-auto text-[10px] font-medium text-[#9aa0a6]">{c.status === "done" ? "100%" : c.status === "doing" ? "50%" : "0%"}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/80">
                      <span className="block h-full rounded-full transition-all" style={{ width: c.status === "done" ? "100%" : c.status === "doing" ? "50%" : "8%", background: c.status === "done" ? "#2e9e5b" : c.status === "doing" ? "#f59a2b" : "#c9ced6" }} />
                    </div>
                    <div className={`pm-task-more ${openId === c.id ? "open" : ""}`} onClick={(e) => e.stopPropagation()}>
                      <div>
                        <div className="pt-2.5">
                          {c.important ? <span className="pm-urgent-chip"><Flag className="h-3 w-3" /> Important</span> : null}
                          {c.status !== "done" && c.due_date && dueState(c.due_date) === "over" ? <span className="pm-urgent-chip" style={{ background: "#fdecec", color: "#c53030" }}><CalendarDays className="h-3 w-3" /> Overdue</span> : null}
                          {c.status !== "done" && c.due_date && dueState(c.due_date) !== "over" ? <span className="pm-chip"><CalendarDays className="h-3 w-3" /> Due {fmtDue(c.due_date)}</span> : null}
                          {splitAssign(c.notes).rest ? <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-[#5e5e5e]">{splitAssign(c.notes).rest}</p> : null}
                          {Array.isArray(c.files) && c.files.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {(c.files as Any[]).map((f: Any, kk: number) => (
                                <button key={kk} type="button" className="pm-filechip" title={`Download ${f.name}`} onClick={async () => { const r = await act({ type: "cardFilesGet", id: c.id }); const m = (r?.files ?? []).find((x: Any) => x?.name === f.name); if (m?.dataUri) openFileHref(m.dataUri, m.name); }}><Paperclip className="h-3 w-3 flex-none" /><span className="max-w-36 truncate">{f.name}</span></button>
                              ))}
                            </div>
                          )}
                          <div className="pm-taskactions mt-3 flex items-center gap-1 border-t border-[#e6e8ea] pt-2.5">
                            {c.status !== "done" && (
                              <button type="button" aria-label="Tick off · mark completed" title="Tick off · mark completed" className="pm-tickbtn" onClick={() => act({ type: "cardEdit", id: c.id, status: "done", actor: viewer }, "Ticked off · moved to Completed")}><Check className="h-3.5 w-3.5" /></button>
                            )}
                            <IconBtn label="Move left" onClick={() => nudge(c, -1)} disabled={c.status === "todo"}><ArrowLeft className="h-3.5 w-3.5" /></IconBtn>
                            <IconBtn label="Move right" onClick={() => nudge(c, 1)} disabled={c.status === "done"}><ArrowRight className="h-3.5 w-3.5" /></IconBtn>
                            <IconBtn label={c.important ? "Remove important flag" : "Mark as important"} onClick={() => act({ type: "cardEdit", id: c.id, important: !c.important, actor: viewer }, c.important ? "Important flag removed" : "Marked as important")}><Flag className={`h-3.5 w-3.5 ${c.important ? "pm-flag-on" : ""}`} /></IconBtn>
                            <IconBtn label="Edit task" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                            <span className="ml-auto text-[10px] text-[#9aa0a6]">{c.updated_at ? relDay(c.updated_at) : ""}</span>
                            <IconBtn label="Delete task" danger={confirmDel === c.id} onClick={() => {
                              if (confirmDel === c.id) { act({ type: "cardDelete", id: c.id, actor: viewer }, "Task removed"); setConfirmDel(null); }
                              else { setConfirmDel(c.id); setTimeout(() => setConfirmDel((k2) => (k2 === c.id ? null : k2)), 2600); }
                            }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          {editing && (
            <EditCard card={editing} onSave={async (title, notes) => {
              const r = await act({ type: "cardEdit", id: editing.id, title, notes, actor: viewer }, "Task updated");
              if (r) setEditing(null);
            }} onDelete={async () => {
              const r = await act({ type: "cardDelete", id: editing.id, actor: viewer }, "Task removed");
              if (r) setEditing(null);
            }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: Any; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-full text-[#5e5e5e] hover:bg-[#e7eaee] hover:text-[#0d1c34] disabled:opacity-30 ${danger ? "bg-[#fdecea] text-[#c0392b]" : ""}`}>
      {children}
    </button>
  );
}

function AddComposer({ col, onSubmit, onCancel, startImportant }: { col: string; onSubmit: (title: string, notes: string, files: Any[], important: boolean) => Promise<Any | null>; onCancel: () => void; startImportant?: boolean }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<Any[]>([]);
  const [important, setImportant] = useState(!!startImportant);
  const [assign, setAssign] = useState("");
  const [busy, setBusy] = useState(false);
  const readFile = (f: File) => new Promise<Any>((res) => { const r = new FileReader(); r.onload = () => res({ name: f.name, dataUri: String(r.result) }); r.onerror = () => res(null); r.readAsDataURL(f); });
  return (
    <form className="mb-2.5 rounded-xl border border-[#e6e8ea] bg-white p-3 shadow-sm" onSubmit={async (e) => {
      e.preventDefault(); if (!title.trim() || busy) return;
      const total = files.reduce((s, f) => s + (f?.dataUri?.length ?? 0), 0);
      if (total > 6_200_000) { toast.error("Those files are too large altogether · keep attachments under about 4 MB."); return; }
      setBusy(true);
      const read = await Promise.all(files.map(readFile));
      const clean = read.filter(Boolean);
      const r = await onSubmit(title.trim(), withAssign(assign, notes.trim()), clean, important);
      setBusy(false); if (!r) return;
      setTitle(""); setNotes(""); setFiles([]);
      setImportant(false); setAssign("");
    }}>
      <Input autoFocus placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" />
      <Textarea placeholder="Details (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-2 text-sm" />
      <button type="button" onClick={() => setImportant(!important)} aria-pressed={important} className="pm-urgent-toggle mt-2">
        <span className={`pm-urgent-box ${important ? "on" : ""}`}><Flag className="h-3 w-3" /></span>
        <span className="text-xs font-medium">Mark as important · jumps to the top</span>
      </button>
      <div className="mt-2 space-y-1.5">
        <Label>Assign to</Label>
        <select value={assign} onChange={(e) => setAssign(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
          <option value="">Unassigned</option>
          <option value="Sara">Sara</option>
          <option value="Natalie">Natalie</option>
        </select>
      </div>
      <div className="mt-2">
        <input type="file" multiple className="hidden" id={`taskfile-${col}`} onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 3)); if (e.target) e.target.value = ""; }} />
        <label htmlFor={`taskfile-${col}`} className="pm-filebtn cursor-pointer"><Paperclip className="h-3.5 w-3.5" /> Attach file{files.length ? ` (${files.length}/3)` : " (optional)"}</label>
        {files.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {files.map((f: Any, k: number) => (
              <span key={k} className="pm-filechip"><span className="max-w-36 truncate">{f.name}</span><button type="button" aria-label="Remove file" onClick={() => setFiles((prev) => prev.filter((_: Any, j: number) => j !== k))}><X className="h-3 w-3" /></button></span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2.5 flex gap-2">
        <Button type="submit" className="pm-btn-orange h-8 flex-1" disabled={busy}>Add task</Button>
        <Button type="button" variant="ghost" className="h-8 flex-1" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function EditCard({ card, onSave, onDelete }: { card: Any; onSave: (title: string, notes: string) => Promise<Any | null>; onDelete: () => Promise<Any | null> }) {
  const [title, setTitle] = useState(card.title ?? "");
  const _sp = splitAssign(card.notes);
  const [notes, setNotes] = useState(_sp.rest);
  const [assign, setAssign] = useState(_sp.who);
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      <DialogHeader><DialogTitle>Edit task</DialogTitle></DialogHeader>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Details</Label><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Assign to</Label>
          <select value={assign} onChange={(e) => setAssign(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">Unassigned</option>
            <option value="Sara">Sara</option>
            <option value="Natalie">Natalie</option>
          </select>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={async () => { if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 2600); return; } await onDelete(); }}>{confirm ? "Really delete?" : "Delete"}</Button>
        <Button type="button" className="pm-btn" onClick={async () => { if (!title.trim()) { toast.error("Title can't be empty."); return; } await onSave(title.trim(), withAssign(assign, notes.trim())); }}>Save changes</Button>
      </div>
    </div>
  );
}

/* ---------------- time ---------------- */

function TimeTab({ entries, running, unbilledMins, rate, viewer, act, cards, invoices: allInvoices, files, client }: Any) {
  const invoices = (allInvoices ?? []).filter((i: Any) => i.status !== "draft");
  const [viewInv, setViewInv] = useState<Any | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const unpaidInv = invoices.filter((i: Any) => effectiveStatus(i) !== "paid");
  const paidInv = invoices.filter((i: Any) => effectiveStatus(i) === "paid");
  const dueTotal = unpaidInv.reduce((t: number, i: Any) => t + invoiceTotals(i.items as LineItem[], i.tax_rate).total, 0);
  const isNat = viewer === "Natalie";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running?.id]);

  const todayKey = londonDay(new Date().toISOString());
  const groups = useMemo(() => {
    const map = new Map<string, Any[]>();
    for (const e of entries.filter((x: Any) => x.ended_at)) {
      const day = londonDay(e.started_at ?? e.created_at);
      (map.get(day) ?? map.set(day, []).get(day)!).push(e);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);
  const cardTitle = (id: string) => cards.find((c: Any) => c.id === id)?.title;
  const dayLabel = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });

  const secs = running ? Math.max(0, Math.floor((Date.now() - Date.parse(running.started_at)) / 1000)) : 0;
  const frac = running ? (secs % 480) / 480 : 0;

  return (
    <div className="space-y-5">
      {isNat && <div className="pm-card p-6 md:p-7">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex items-center gap-5">
            <Ring frac={running ? (secs % 480) / 480 : 0}>
              <span className="timer-num text-base font-semibold tracking-tight">{running ? hms(Date.now() - Date.parse(running.started_at)) : "00:00:00"}</span>
            </Ring>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d97406]">Time tracking</p>
              <p className="mt-1 text-sm text-[#5e5e5e]">{running ? (running.note ? `Tracking · ${running.note}` : "Tracking · no note added") : isNat ? "Ready when you are" : "Natalie's live work timer"}</p>
              {running && <p className="timer-num mt-1 text-3xl font-semibold tracking-tight md:text-4xl">{hms(Date.now() - Date.parse(running.started_at))}</p>}
            </div>
          </div>
          {isNat && (
            <div className="md:ml-auto">
              {running ? (
                <Button className="pm-btn h-11 px-7" disabled={busy} onClick={async () => { setBusy(true); await act({ type: "timeStop", id: running.id }, "Timer stopped · hours logged"); setBusy(false); }}>
                  <Square className="h-4 w-4" /> Stop timer
                </Button>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input placeholder="What are you working on? (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="h-11 w-full rounded-full sm:w-64" />
                  <Button className="pm-btn-orange h-11 px-6" disabled={busy} onClick={async () => { setBusy(true); await act({ type: "timeStart", note: note.trim() }, "Timer started"); setBusy(false); setNote(""); }}>
                    <Play className="h-4 w-4" /> Start
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>}

      {isNat && <div className="pm-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Unbilled work</h2>
            <p className="mt-0.5 text-xs text-[#5e5e5e]">Hours logged since the last invoice · {money(rate)} per hour</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight">{money((unbilledMins / 60) * rate)}</p>
            <p className="text-xs text-[#5e5e5e]">{fmtMins(unbilledMins)}</p>
          </div>
        </div>
        {isNat && unbilledMins > 0 && (
          <div className="mt-4 border-t border-[#f0f1f3] pt-4">
            <Button className="pm-btn-orange h-10" disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await act({ type: "timeInvoice" });
              setBusy(false);
              if (r?.number) toast.success(`Invoice ${r.number} created as a draft · review & send it in your studio`);
            }}><FileText className="h-4 w-4" /> Create invoice · {fmtMins(unbilledMins)} · {money((unbilledMins / 60) * rate)}</Button>
            <p className="mt-2 text-xs text-[#5e5e5e]">Creates a draft invoice (one line per day) in your studio · nothing is sent to Sara until you mark it sent.</p>
          </div>
        )}
        {!isNat && unbilledMins === 0 && <p className="mt-3 text-sm text-[#5e5e5e]">All logged hours have been invoiced.</p>}
      </div>}

      {isNat && <ManualLog act={act} cards={cards} todayKey={todayKey} />}

      {isNat && <div className="pm-card p-5">
        <h2 className="text-lg font-semibold">Work log</h2>
        {groups.length === 0 ? <p className="mt-3 text-sm text-[#5e5e5e]">No hours logged yet.</p> : (
          <div className="mt-4 space-y-5">
            {groups.map(([day, list]) => (
              <div key={day}>
                <div className="flex items-center justify-between border-b border-[#f0f1f3] pb-2">
                  <p className="text-sm font-semibold">{day === todayKey ? "Today" : dayLabel(day)}</p>
                  <span className="pm-chip">{fmtMins(list.reduce((s: number, e: Any) => s + Number(e.minutes), 0))}</span>
                </div>
                <ul className="mt-2.5 space-y-2">
                  {list.sort((a: Any, b: Any) => String(b.started_at ?? b.created_at).localeCompare(String(a.started_at ?? a.created_at))).map((e: Any) => (
                    <EntryRow key={e.id} e={e} cardTitle={cardTitle(e.card_id)} isNat={isNat} act={act} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>}

      <div className="pm-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Invoices</h2>
          {!isNat && invoices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="pm-chip orange">{unpaidInv.length} unpaid invoice{unpaidInv.length === 1 ? "" : "s"}</span>
              <span className="pm-chip navy">{money(dueTotal)} due</span>
            </div>
          )}
        </div>
        {invoices.length === 0 ? <p className="mt-3 text-sm text-[#5e5e5e]">Invoices raised for this work will appear here.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-[#5e5e5e]"><tr><th className="pb-2">Invoice</th><th className="pb-2">Issued</th><th className="pb-2">Due</th><th className="pb-2">Status</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">PDF</th></tr></thead>
              <tbody>
                {(isNat ? invoices : (showPaid ? [...unpaidInv, ...paidInv] : unpaidInv)).map((i: Any) => (
                  <tr key={i.id} className="border-t border-[#f0f1f3]">
                    <td className="py-2.5 font-medium">{i.number}</td>
                    <td className="py-2.5 text-[#5e5e5e]">{fmtDate(i.issue_date)}</td>
                    <td className="py-2.5 text-[#5e5e5e]">{fmtDate(i.due_date)}</td>
                    <td className="py-2.5"><StatusBadge status={effectiveStatus(i)} /></td>
                    <td className="py-2.5 text-right">{money(invoiceTotals(i.items as LineItem[], i.tax_rate).total)}</td>
                    <td className="py-2.5 text-right"><button type="button" className="pm-filebtn navy" onClick={() => setViewInv(i)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isNat && paidInv.length > 0 && (
          <button type="button" onClick={() => setShowPaid((o: boolean) => !o)} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--pm-line)] px-3.5 py-1.5 text-xs font-semibold text-[#5e5e5e] hover:border-[var(--pm-orange)]">
            {showPaid ? "Hide paid invoices" : `Show paid invoices (${paidInv.length})`}
          </button>
        )}
      </div>

      {files.filter((f: Any) => f.kind === "invoice").length > 0 && (
        <div className="pm-card p-5">
          <h2 className="text-lg font-semibold">Invoices &amp; documents from Natalie</h2>
          <p className="mt-1 text-xs text-[#5e5e5e]">Open to view in your browser · or download the PDF.</p>
          <ul className="mt-3 space-y-2">
            {files.filter((f: Any) => f.kind === "invoice").map((f: Any) => (
              <li key={f.id} className="pm-row flex flex-wrap items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 flex-none text-[#d97406]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{f.title || f.file_name}</p>
                  <p className="text-xs text-[#5e5e5e]">Shared {fmtDate(f.created_at)} · by Natalie</p>
                </div>
                <button type="button" className="pm-filebtn navy" style={{ textDecoration: "none" }} onClick={async () => { const r = await act({ type: "fileGet", id: f.id }); if (r?.href) openFileHref(r.href); }}>View</button>
                <button type="button" className="pm-filebtn" style={{ textDecoration: "none" }} onClick={async () => { const r = await act({ type: "fileGet", id: f.id }); if (r?.href) openFileHref(r.href, f.file_name || "invoice.pdf"); }}>Download</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!viewInv} onOpenChange={(o: boolean) => { if (!o) setViewInv(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Invoice {viewInv?.number}</DialogTitle></DialogHeader>
          <div className="mt-3 max-h-[65vh] overflow-y-auto">
            <InvoiceSheet inv={viewInv} client={client} />
          </div>
          <div className="no-print mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" className="pm-btn" onClick={() => setViewInv(null)}>Close</Button>
            <Button type="button" className="pm-btn-orange" onClick={async () => {
              try { await downloadInvoicePdf(document.querySelector(".pm-inv-sheet") as HTMLElement, `Invoice ${viewInv?.number || ""}.pdf`); toast.success("PDF downloaded"); }
              catch (err: Any) { toast.error(err?.message ?? "Couldn't build the PDF · try again."); }
            }}><FileDown className="h-4 w-4" /> Download PDF</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntryRow({ e, cardTitle, isNat, act }: Any) {
  const [open, setOpen] = useState(false);
  const [mins, setMins] = useState(String(Math.round(Number(e.minutes))));
  const [note, setNote] = useState(e.note ?? "");
  const [confirm, setConfirm] = useState(false);
  const billedChip = e.billed ? <span className="pm-chip line">Invoiced</span> : null;
  return (
    <li className="pm-row flex items-center gap-3 px-3 py-2.5">
      <span className="pm-dot" style={{ background: e.billed ? "#c6cbd1" : "#f59a2b" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{e.note || cardTitle || "Support work"}</p>
        {cardTitle && e.note ? <p className="truncate text-xs text-[#5e5e5e]">{cardTitle}</p> : null}
      </div>
      {billedChip}
      <span className="flex-none text-sm font-medium">{fmtMins(e.minutes)}</span>
      {isNat && (
        <span className="flex flex-none items-center gap-1">
          <IconBtn label="Edit entry" onClick={() => setOpen(true)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn label="Delete entry" danger={confirm} onClick={() => {
            if (confirm) { act({ type: "timeDelete", id: e.id }, "Entry removed"); setConfirm(false); }
            else { setConfirm(true); setTimeout(() => setConfirm(false), 2600); }
          }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </span>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit time entry</DialogTitle></DialogHeader>
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5"><Label>Minutes</Label><Input type="number" min="1" value={mins} onChange={(e) => setMins(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <Button type="button" className="pm-btn mt-5 w-full" onClick={async () => {
            const m = Math.round(Number(mins));
            if (!m || m <= 0) { toast.error("Enter the minutes worked."); return; }
            const r = await act({ type: "timeUpdate", id: e.id, minutes: m, note: note.trim() }, "Entry updated");
            if (r) setOpen(false);
          }}>Save entry</Button>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function ManualLog({ act, cards, todayKey }: Any) {
  const [date, setDate] = useState(todayKey);
  const [h, setH] = useState("");
  const [m, setM] = useState("");
  const [note, setNote] = useState("");
  const [cardId, setCardId] = useState("");
  const [busy, setBusy] = useState(false);
  const total = (Number(h) || 0) * 60 + (Number(m) || 0);
  const open = cards.filter((c: Any) => c.status !== "done").slice(0, 50);
  return (
    <form className="pm-card p-5" onSubmit={async (e) => {
      e.preventDefault();
      if (!total) { toast.error("Enter how long you worked."); return; }
      setBusy(true);
      const r = await act({ type: "timeAdd", date, minutes: total, note: note.trim(), cardId: cardId || undefined }, "Time logged");
      setBusy(false);
      if (r) { setH(""); setM(""); setNote(""); setCardId(""); }
    }}>
      <h2 className="text-lg font-semibold">Log time manually</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} max={todayKey} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Hours</Label><Input type="number" min="0" max="23" placeholder="0" value={h} onChange={(e) => setH(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Minutes</Label><Input type="number" min="0" max="59" placeholder="0" value={m} onChange={(e) => setM(e.target.value)} /></div>
        <div className="col-span-2 space-y-1.5"><Label>What was it for? (optional)</Label><Input placeholder="e.g. Blog graphics, inbox tidy-up" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1 space-y-1.5"><Label>Link to a board task (optional)</Label>
          <select value={cardId} onChange={(e) => setCardId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
            <option value="">No linked task</option>
            {open.map((c: Any) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <Button type="submit" className="pm-btn-orange h-9" disabled={busy}>Add entry</Button>
      </div>
    </form>
  );
}

export function InvoiceSheet({ inv, client }: Any) {
  if (!inv) return null;
  const accName = client?.company || client?.name || "Advanced Assessment & Solutions";
  const email = client?.email || "";
  return (
    <div className="pm-inv-sheet">
      <InvoiceDocument inv={{ ...inv, clientName: accName, clientCompany: client?.name ?? null, clientEmail: email }} />
    </div>
  );
}

/* ---------------- tasks tab ---------------- */

export function fmtDue(d: string) {
  try {
    return new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  } catch { return String(d); }
}

function dueState(d: string) {
  const key = String(d).slice(0, 10);
  const today = londonDay(new Date().toISOString());
  if (key < today) return "over";
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);
  if (key <= londonDay(soon.toISOString())) return "soon";
  return "";
}

const PMT_STYLES = `
.pmt-form { border-radius: 1rem; background: #fff; border: 1px solid #e6e8ea; padding: 1.25rem; box-shadow: 0 1px 2px rgba(13,28,52,.05); }
.pmt-row { border-radius: 1rem; background: #fff; border: 1px solid #e6e8ea; padding: 1rem 1.1rem; }
.pmt-row.done { opacity: .7; }
.pmt-detail { margin-top: .5rem; font-size: .82rem; line-height: 1.55; color: #4b5563; white-space: pre-wrap; overflow-wrap: anywhere; }
.pmt-meta { margin-top: .5rem; font-size: .68rem; color: #9aa0a6; }
.pmt-due { display: inline-flex; align-items: center; gap: .3rem; border-radius: 999px; background: rgba(13,28,52,.07); color: #0d1c34; font-size: .68rem; font-weight: 700; padding: .2rem .55rem; }
.pmt-due.soon { background: rgba(245,154,43,.16); color: #a35803; }
.pmt-due.over { background: rgba(192,57,43,.12); color: #c0392b; }
.pmt-empty { border-radius: 1rem; border: 1px dashed #d5dade; padding: 1.5rem 1rem; text-align: center; font-size: .78rem; color: #5e5e5e; }
`;

export function TasksTab({ p, viewer, act }: { p: Any; viewer: string; act: Act }) {
  const cards: Any[] = p.board ?? [];
  const [addOpen, setAddOpen] = useState(false);
  const [startUrgent, setStartUrgent] = useState(false);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [due, setDue] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState<Any[]>([]);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [assign, setAssign] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const readFile = (f: File) => new Promise<Any>((res) => { const r = new FileReader(); r.onload = () => res({ name: f.name, dataUri: String(r.result) }); r.onerror = () => res(null); r.readAsDataURL(f); });

  useEffect(() => { if (addOpen) setUrgent(startUrgent); }, [addOpen, startUrgent]);

  const notes: Any[] = ((p.client?.portal_prefs?.nat_notes ?? []) as Any[]);
  const open_ = cards.filter((c: Any) => c.status !== "done");
  const urg = open_.filter((c: Any) => c.important);
  const assigned = open_.filter((c: Any) => splitAssign(c.notes).who);
  const doneList = cards.filter((c: Any) => c.status === "done").sort((a: Any, b: Any) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const sortDue = (list: Any[]) => [...list].sort((a: Any, b: Any) => ((b.important ? 1 : 0) - (a.important ? 1 : 0)) || String(a.due_date ?? "9999-99-99").localeCompare(String(b.due_date ?? "9999-99-99")) || Number(a.position) - Number(b.position));

  const submit = async (e: Any) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    const total = files.reduce((s2, f) => s2 + (f?.dataUri?.length ?? 0), 0);
    if (total > 6_200_000) { toast.error("Those files are too large altogether · keep attachments under about 4 MB."); return; }
    setBusy(true);
    const read = await Promise.all(files.map(readFile));
    const clean = read.filter(Boolean);
    const r = await act({ type: "cardAdd", title: title.trim(), notes: withAssign(assign, details.trim()), status: "todo", actor: viewer, important: urgent, due_date: due || undefined }, urgent ? "Urgent task added · it's on the board" : "Task added · it's on the board");
    if (r?.id && clean.length) await act({ type: "cardFiles", id: r.id, files: clean, actor: viewer }, "Files attached to task");
    if (r) { setTitle(""); setDetails(""); setDue(""); setUrgent(false); setFiles([]); setAssign(""); setAddOpen(false); }
    setBusy(false);
  };

  const stat = (label: string, value: number | string, tone: string, icon: Any) => (
    <div className="pm-card flex items-center gap-3.5 p-4">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl" style={{ background: `${tone}1a`, color: tone }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold leading-none tracking-tight text-[#0d1c34]">{value}</p>
        <p className="mt-1.5 truncate text-xs font-medium text-[#5e5e5e]">{label}</p>
      </div>
    </div>
  );

  const tickRow = (c: Any) => (
    <div key={c.id} className="pmt-row">
      <div className="flex items-start gap-2.5">
        <button type="button" aria-label="Tick off · mark completed" onClick={async () => { await act({ type: "cardEdit", id: c.id, status: "done", actor: viewer }, "Ticked off · moved to Completed"); }} className="pm-tickbtn mt-0.5 flex-none"><Check className="h-3.5 w-3.5" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-semibold leading-snug text-[#0d1c34]">{c.title}</p>
            {c.important ? <span className="pm-urgent-chip"><Flag className="h-3 w-3" /> Urgent</span> : null}
            {splitAssign(c.notes).who ? <span className="pm-chip">{"\u2192"} {splitAssign(c.notes).who}</span> : null}
            {c.due_date ? <span className={`pmt-due ${dueState(c.due_date)}`}><CalendarDays className="h-3 w-3" /> Due {fmtDue(c.due_date)}</span> : null}
          </div>
          {splitAssign(c.notes).rest ? <p className="pmt-detail">{splitAssign(c.notes).rest}</p> : null}
          {Array.isArray(c.files) && c.files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(c.files as Any[]).map((f: Any, k: number) => (
                <button key={k} type="button" className="pm-filechip" title={`Download ${f.name}`} onClick={async () => { const r = await act({ type: "cardFilesGet", id: c.id }); const m = (r?.files ?? []).find((x: Any) => x?.name === f.name); if (m?.dataUri) openFileHref(m.dataUri, m.name); }}><Paperclip className="h-3 w-3 flex-none" /><span className="max-w-36 truncate">{f.name}</span></button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const doneRow = (c: Any) => (
    <div key={c.id} className="pmt-row done flex items-center gap-2.5">
      <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#2e9e5b] text-white"><Check className="h-3.5 w-3.5" /></span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-[#5e5e5e] line-through">{c.title}</p>
      <span className="flex-none text-xs text-[#9aa0a6]">{c.updated_at ? relDay(c.updated_at) : ""}</span>
    </div>
  );

  const panel = (label: string, sub: string, items: Any[], empty: string, tone: string) => (
    <div className="pm-card p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide"><span className="pm-dot" style={{ background: tone }} /> {label}</h3>
        <span className="pm-chip">{items.length}</span>
      </div>
      <p className="mt-1 text-xs text-[#5e5e5e]">{sub}</p>
      {items.length === 0 ? <p className="pmt-empty mt-3">{empty}</p> : <div className="mt-3 space-y-2">{items.slice(0, 8).map(tickRow)}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <style>{PMT_STYLES}</style>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Task List</h2>
          <p className="mt-0.5 text-xs text-[#5e5e5e]">Everything on the go · tick things off or drag them on the board</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="pm-btn-orange h-10" onClick={() => { setStartUrgent(false); setAddOpen(true); }}><Plus className="h-4 w-4" /> New Task</Button>
          <Button type="button" className="h-10 rounded-full bg-[#b3261e] px-4 text-sm font-medium text-white transition-colors hover:bg-[#9a1f18]" onClick={() => { setStartUrgent(true); setAddOpen(true); }}><Flag className="h-4 w-4" /> Urgent Task</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {stat("Urgent tasks", urg.length, "#e5484d", <Flag className="h-5 w-5" />)}
        {stat("Outstanding tasks", open_.length, "#0d1c34", <ClipboardList className="h-5 w-5" />)}
        {stat("Assigned tasks", assigned.length, "#f59a2b", <ListTodo className="h-5 w-5" />)}
        {stat("Completed tasks", doneList.length, "#2e9e5b", <Check className="h-5 w-5" />)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {panel("Assigned tasks", "Nearest due date first", sortDue(assigned), "Nothing assigned yet.", "#0d1c34")}
        {panel("Urgent tasks", "Flagged · do these first", sortDue(urg), "Nothing urgent · good news.", "#e5484d")}
      </div>

      <div className="pm-card p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide"><StickyNote className="h-4 w-4 text-[#d97406]" /> Private notepad</h3>
          <span className="pm-chip">{notes.length}</span>
        </div>
        <p className="mt-1 text-xs text-[#5e5e5e]">Only you can see this · quick jottings, reminders, links</p>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={async (e: Any) => { e.preventDefault(); if (!noteText.trim() || noteBusy) return; setNoteBusy(true); const r = await act({ type: "natNoteAdd", text: noteText }, "Noted"); setNoteBusy(false); if (r !== null) setNoteText(""); }}>
          <Input value={noteText} onChange={(e: Any) => setNoteText(e.target.value)} placeholder="Jot something down…" className="h-10" />
          <Button type="submit" className="pm-btn-orange h-10 px-6" disabled={noteBusy}>{noteBusy ? "…" : "Add"}</Button>
        </form>
        {notes.length === 0 ? <p className="pmt-empty mt-3">Your notepad is empty.</p> : (
          <ul className="mt-3 space-y-2">
            {notes.map((n: Any) => (
              <li key={n.id} className="pm-row flex items-start gap-2.5 px-3 py-2.5">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{n.text}</p>
                <span className="flex-none text-[11px] text-[#9aa0a6]">{relDay(n.at)}</span>
                <IconBtn label="Delete note" onClick={async () => { await act({ type: "natNoteDelete", id: n.id }, "Note deleted"); }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pm-card p-5">
        <button type="button" onClick={() => setShowDone((o) => !o)} className="flex w-full items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide"><span className="pm-dot" style={{ background: "#2e9e5b" }} /> Completed</h3>
          <span className="pm-chip">{doneList.length}{doneList.length ? (showDone ? " · hide" : " · show") : ""}</span>
        </button>
        {showDone && (doneList.length === 0 ? <p className="pmt-empty mt-3">Completed tasks will collect here.</p> : <div className="mt-3 space-y-2">{doneList.slice(0, 12).map(doneRow)}</div>)}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{urgent ? "Add urgent task" : "Add a task"}</DialogTitle></DialogHeader>
          <form className="mt-2 space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label>Task title</Label>
              <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Onboarding doc" className="h-10" maxLength={200} />
            </div>
            <button type="button" onClick={() => setUrgent(!urgent)} aria-pressed={urgent} className="pm-urgent-toggle">
              <span className={`pm-urgent-box ${urgent ? "on" : ""}`}><Flag className="h-3 w-3" /></span>
              <span className="text-xs font-medium">Flag as urgent · jumps to the top of the board</span>
            </button>
            <div className="space-y-1.5">
              <Label>Details</Label>
              <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What needs doing? Add any detail the task needs." rows={4} className="text-sm" maxLength={2000} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Due by (optional)</Label>
                <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Assign to</Label>
                <select value={assign} onChange={(e) => setAssign(e.target.value)} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="">Unassigned</option>
                  <option value="Sara">Sara</option>
                  <option value="Natalie">Natalie</option>
                </select>
              </div>
            </div>
            <div>
              <input type="file" multiple className="hidden" id="pmt-taskfile" onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 3)); if (e.target) e.target.value = ""; }} />
              <label htmlFor="pmt-taskfile" className="pm-filebtn cursor-pointer"><Paperclip className="h-3.5 w-3.5" /> Attach file{files.length ? ` (${files.length}/3)` : " (optional)"}</label>
              {files.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {files.map((f: Any, k: number) => (
                    <span key={k} className="pm-filechip"><span className="max-w-36 truncate">{f.name}</span><button type="button" aria-label="Remove file" onClick={() => setFiles((prev) => prev.filter((_: Any, j: number) => j !== k))}><X className="h-3 w-3" /></button></span>
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" className="pm-btn-orange h-11 w-full" disabled={busy}>
              {busy ? "Adding…" : <><Plus className="h-4 w-4" /> Add task</>}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Clock, FileText, Menu, Pencil, Play, Plus, Square, Trash2, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common";
import { supabase } from "@/integrations/supabase/client";
import { portalAction } from "@/lib/portal.functions";
import { effectiveStatus, fmtDate, invoiceTotals, money, type LineItem } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const COLUMNS = [
  { key: "todo", label: "To Do" },
  { key: "doing", label: "In Progress" },
  { key: "done", label: "Done" },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];

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

  const [tab, setTab] = useState<"dashboard" | "board" | "time" | "cal" | "notes">(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "board" || t === "time" || t === "cal" || t === "notes" ? t : "dashboard";
  });
  const [boardAdd, setBoardAdd] = useState(false);
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
    { v: "board", l: "To-Do Board" },
    { v: "time", l: "Time & Invoices" },
  ] : [
    { v: "dashboard", l: "Dashboard" },
    { v: "board", l: "To-Do Board" },
    { v: "cal", l: "Calendar" },
    { v: "notes", l: "Notes" },
  ];

  const first = (p.client.name ?? "").split(" ")[0] || "there";
  const welcome = viewer === "Natalie" ? "Natalie" : first;

  return (
    <div className="pm">
      <style>{PM_STYLES}</style>

      <div className="pm-navwrap">
        <nav className="pm-navbar" aria-label="Portal sections">
          <span className="pm-brand">
            {badge ? <img src={badge} alt="Advanced Assessment & Solutions" /> : <span className="pm-brand-fallback">AAS</span>}
          </span>
          <div className="pm-tabs pm-tabs-sara">
            {tabs.map((t) => (
              <button key={t.v} type="button" onClick={() => { setTab(t.v as Any); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`pm-tab ${t.v === tab ? "active" : ""}`}>
                {t.l}
              </button>
            ))}
          </div>
          <button type="button" className="pm-burger" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
        <div className={`pm-menu ${menuOpen ? "open" : ""}`}>
          {tabs.map((t) => (
            <button key={t.v} type="button" className={t.v === tab ? "active" : ""} onClick={() => { setMenuOpen(false); setTab(t.v as Any); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <main className="pm-main">
        <header className="mb-6">
          <h1 className="text-[1.65rem] font-semibold tracking-tight md:text-4xl">{viewer === "Natalie" ? "HQ Projects Portal" : "HQ Workspace"}</h1>
          {viewer === "Natalie"
            ? <p className="mt-1 text-[1.65rem] font-semibold tracking-tight text-[var(--pm-orange)] md:text-4xl">Hi, Natalie</p>
            : <p className="mt-1 text-[1.65rem] font-semibold tracking-tight text-[var(--pm-orange)] md:text-4xl">Welcome back, {welcome}</p>}
        </header>

        {tab === "dashboard" && (
          <Dashboard p={p} stats={stats} weeks={weeks} maxWeek={maxWeek} rate={rate} unbilledMins={unbilledMins} running={running} viewer={viewer} go={setTab} act={act} onQuickAdd={() => { setBoardAdd(true); setTab("board"); }} />
        )}
        {tab === "board" && <Board p={p} viewer={viewer} act={act} go={setTab} autoAdd={boardAdd} onAutoAddDone={() => setBoardAdd(false)} />}
        {tab === "time" && viewer === "Natalie" && <TimeTab entries={entries} running={running} unbilledMins={unbilledMins} rate={rate} viewer={viewer} act={act} cards={cards} invoices={p.invoices} files={p.deliverables ?? []} client={p.client} />}
        {tab === "cal" && viewer !== "Natalie" && <CalendarTab avail={(p.client?.portal_prefs?.availability ?? null) as Any} />}
        {tab === "notes" && viewer !== "Natalie" && <NotesTab act={act} notes={((p.client?.portal_prefs?.sara_notes ?? []) as Any[])} />}
      </main>

      <footer className="pm-foot">Advanced Assessment &amp; Solutions · HQ Portal - Crafted by Nine3 Designs</footer>
    </div>
  );
}

/* ---------------- styles ---------------- */

const PM_STYLES = `
.pm { --pm-navy:#0d1c34; --pm-navy2:#16294a; --pm-orange:#f59a2b; --pm-orange-deep:#d97406; --pm-soft:#eef0f2; --pm-soft2:#e7eaee; --pm-ink:#1f2630; --pm-muted:#5e5e5e; --pm-line:#e6e8ea; }
.pm { color: var(--pm-ink); font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif; }
.pm h1, .pm h2, .pm h3 { font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif; color: var(--pm-ink); font-weight: 600; }
.pm .pm-navwrap { position: sticky; top: 0; z-index: 40; padding: .9rem 0 .4rem; background: transparent; }
.pm .pm-navbar { display: flex; align-items: center; justify-content: center; gap: .5rem; background: rgba(13,28,52,.72); backdrop-filter: blur(14px) saturate(1.25); -webkit-backdrop-filter: blur(14px) saturate(1.25); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: .35rem; max-width: 62rem; margin: 0 auto; box-shadow: 0 14px 36px rgba(13,28,52,.28); overflow-x: auto; scrollbar-width: none; }
.pm .pm-navbar::-webkit-scrollbar { display: none; }
.pm .pm-brand { flex: none; display: inline-flex; align-items: center; background: #0d1c34; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; height: 2.55rem; padding: 0 1.15rem; }
.pm .pm-brand img { height: 1.35rem; width: auto; max-width: 200px; }
.pm .pm-brand-fallback { color: #fff; font-size: .8rem; font-weight: 600; letter-spacing: .08em; }
.pm .pm-tabs { display: flex; gap: .2rem; min-width: max-content; }
.pm .pm-tab { border-radius: 999px; padding: .68rem 1.35rem; font-size: .95rem; font-weight: 500; color: rgba(255,255,255,.72); white-space: nowrap; transition: color .15s ease, background .15s ease; }
.pm .pm-tab:hover { color: #fff; background: rgba(255,255,255,.10); }
.pm .pm-tab.active { background: rgba(255,255,255,.06); color: #fff; box-shadow: inset 0 0 0 1.5px var(--pm-orange), 0 0 14px rgba(245,154,43,.25); }
.pm .pm-dark h2 { color: var(--pm-orange); }
.pm .pm-col { background: linear-gradient(180deg, #ffffff 0%, #f4f6f8 100%); border: 1px solid var(--pm-line); border-top-width: 4px; box-shadow: 0 2px 6px rgba(13,28,52,.05), 0 14px 30px rgba(13,28,52,.07); }
.pm .pm-col:nth-child(1) { border-top-color: var(--pm-navy); }
.pm .pm-col:nth-child(2) { border-top-color: var(--pm-orange); }
.pm .pm-col:nth-child(3) { border-top-color: #3f7d4e; }
.pm .pm-col:nth-child(1) .pm-chip { background: rgba(13,28,52,.10); color: var(--pm-navy); }
.pm .pm-col:nth-child(2) .pm-chip { background: rgba(245,154,43,.18); color: #a35803; }
.pm .pm-col:nth-child(3) .pm-chip { background: rgba(63,125,78,.14); color: #2c5e39; }
.pm .pm-col .pm-task { box-shadow: 0 1px 2px rgba(13,28,52,.08); }
.pm .pm-main { max-width: 64rem; margin: 0 auto; padding: 1.5rem 1rem 0; }
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
.pm .pm-burger { display: none; }
.pm .pm-menu { display: none; }
.pm .pm-menu.open { display: block; position: absolute; top: calc(100% + .4rem); left: .5rem; right: .5rem; z-index: 50; background: rgba(13,28,52,.97); border: 1px solid rgba(255,255,255,.14); border-radius: 1.25rem; box-shadow: 0 18px 44px rgba(13,28,52,.35); overflow: hidden; }
.pm .pm-menu button { display: block; width: 100%; text-align: left; padding: .9rem 1.2rem; color: rgba(255,255,255,.85); font-size: .95rem; font-weight: 500; border-bottom: 1px solid rgba(255,255,255,.08); }
.pm .pm-menu button:last-child { border-bottom: none; }
.pm .pm-menu button.active { color: #fff; background: rgba(255,255,255,.06); box-shadow: inset 3px 0 0 var(--pm-orange); }
@media (max-width: 640px) {
  .pm .pm-main { padding-top: 1.1rem; }
  .pm .pm-card { border-radius: 1.3rem; }
  .pm .pm-tabs-sara { display: none; }
  .pm .pm-burger { display: inline-flex; align-items: center; justify-content: center; width: 2.55rem; height: 2.55rem; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #fff; flex: none; }
  .pm .pm-navbar { max-width: calc(100% - 1.5rem); justify-content: space-between; gap: .4rem; }
  .pm .pm-brand { padding: 0 .9rem; height: 2.55rem; }
  .pm .pm-brand img { height: 1.15rem; max-width: 140px; }
  .pm .pm-navwrap { padding-top: .7rem; }
}
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

function ChipStat({ label, value, tone }: { label: string; value: string; tone: "navy" | "orange" | "plain" | "line" }) {
  const cls = tone === "navy" ? "pm-chip navy" : tone === "orange" ? "pm-chip orange" : tone === "line" ? "pm-chip line" : "pm-chip";
  return (
    <div>
      <p className="text-xs font-medium text-[#5e5e5e]">{label}</p>
      <span className={`${cls} mt-1.5`}>{value}</span>
    </div>
  );
}

/* ---------------- dashboard ---------------- */

const BOARD_ICONS = [ClipboardList, CalendarDays, Clock];

export function Dashboard({ p, stats, weeks, maxWeek, rate, unbilledMins, running, viewer, go, act, onQuickAdd }: Any) {
  const cards: Any[] = p.board ?? [];
  const open_ = cards.filter((c: Any) => c.status !== "done");
  const upNext = open_.sort((a: Any, b: Any) => a.position - b.position).slice(0, 4);
  const doneList = cards.filter((c: Any) => c.status === "done").sort((a: Any, b: Any) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 5);
  const activity: Any[] = (p.activity ?? []).filter((a: Any) => {
    if (viewer === "Natalie") return true;
    const msg = String(a.message ?? "").toLowerCase();
    return msg.includes("task") || msg.startsWith("moved");
  }).slice(0, 6);
  const [busy, setBusy] = useState(false);
  const todoCount = cards.filter((c: Any) => c.status === "todo").length;
  const doingCount = cards.filter((c: Any) => c.status === "doing").length;
  const doneCount = cards.length - todoCount - doingCount;
  const todayMins = stats.today ?? 0;
  const frac = running ? (Date.now() - Date.parse(running.started_at)) / (8 * 3600000) : todayMins / 480;
  const isNat = viewer === "Natalie";
  const avail = (p.client?.portal_prefs?.availability ?? null) as Any;
  const myTasks: Any[] = (p.tasks ?? []).filter((t: Any) => t.status !== "done" && t.due_date).sort((a: Any, b: Any) => String(a.due_date).localeCompare(String(b.due_date))).slice(0, 6);
  const invLive: Any[] = (p.invoices ?? []).filter((i: Any) => i.status !== "draft");

  const boardCard = (
    <div className="pm-dark p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">On the board</h2>
        <span className="text-sm font-medium text-white/70">{stats.open} open</span>
      </div>
      {upNext.length === 0 ? <p className="mt-4 text-sm text-white/60">Nothing queued · add tasks on the board.</p> : (
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
                <span className="pm-dot" style={{ background: c.status === "doing" ? "#f59a2b" : "rgba(255,255,255,.25)" }} />
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={() => go("board")} className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#f59a2b] hover:underline">Open the board <ArrowUpRight className="h-3.5 w-3.5" /></button>
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={<ClipboardList className="h-5 w-5" />} tone="navy" label="Open tasks" value={String(stats.open)} sub="on the board" onClick={() => go("board")} />
        {isNat ? <Tile icon={<Clock className="h-5 w-5" />} label="This week" value={fmtMins(stats.week)} sub="hours logged" />
          : <Tile icon={<Play className="h-5 w-5" />} tone="dark" label="In progress" value={String(doingCount)} sub="tasks on the go" onClick={() => go("board")} />}
        {isNat ? <Tile icon={<CalendarDays className="h-5 w-5" />} tone="navy" label="This month" value={fmtMins(stats.month)} sub="hours logged" />
          : <Tile icon={<Check className="h-5 w-5" />} tone="navy" label="Completed" value={String(doneCount)} sub="tasks finished" onClick={() => go("board")} />}
        {isNat
          ? <Tile icon={<FileText className="h-5 w-5" />} label="Unbilled" value={money((unbilledMins / 60) * rate)} sub={`${fmtMins(unbilledMins)} · ${money(rate)}/hr`} />
          : <Tile icon={<FileText className="h-5 w-5" />} label="Invoices received" value={String(invLive.length)} sub={invLive.length ? "invoices received" : "none yet"} />}
      </div>

      <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-1">
        <ChipStat label="To do" value={String(todoCount)} tone="navy" />
        <ChipStat label="In progress" value={String(doingCount)} tone="orange" />
        <ChipStat label="Done" value={String(doneCount)} tone="plain" />
        <ChipStat label="This week" value={fmtMins(stats.week)} tone="line" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {isNat ? (
        <div className="pm-card p-6 lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">Progress</h2>
              <p className="mt-1 text-xs text-[#5e5e5e]">Working hours · last 6 weeks</p>
            </div>
            <button type="button" aria-label="Open time tracking" onClick={() => go("time")} className="pm-circle orange"><ArrowUpRight className="h-4 w-4" /></button>
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{(stats.week / 60).toFixed(1)} <span className="text-lg font-medium text-[#5e5e5e]">H</span></p>
          <div className="mt-5 flex items-end justify-between gap-3" style={{ height: 130 }}>
            {weeks.map((w) => (
              <div key={w.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] font-medium text-[#5e5e5e]">{w.mins ? fmtMins(w.mins) : ""}</span>
                <div className="flex flex-1 items-end" style={{ width: "100%" }}>
                  <div className={w.key === stats.thisWeek ? "pm-bar now" : "pm-bar"} style={{ height: `${Math.max(3, (w.mins / maxWeek) * 92)}%` }} />
                </div>
                <span className="pm-dot" style={{ background: w.key === stats.thisWeek ? "#f59a2b" : "#0d1c34" }} />
                <span className="text-center text-[10px] text-[#5e5e5e]">{w.label.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </div>
        ) : (
        <div className="pm-card self-start p-6 lg:col-span-2">
          <div>
            <h2 className="text-lg font-semibold">Quick actions</h2>
            <p className="mt-1 text-xs text-[#5e5e5e]">Jump straight to what you need</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <button type="button" onClick={onQuickAdd} className="flex flex-col items-start gap-2 rounded-2xl bg-[var(--pm-navy)] px-4 py-5 text-left text-white transition-transform hover:-translate-y-0.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><Plus className="h-4 w-4" /></span>
              <span className="text-sm font-semibold">Add new task</span>
              <span className="text-[11px] text-white/60">Put something on the board</span>
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
        </div>
        ) : (
        boardCard
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {isNat ? boardCard : <MonthCalCard avail={avail} />}
        {recentCard}
        {activityCard}
      {!isNat && (
        <div className="pm-dark p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Tasks due</h2>
            <button type="button" aria-label="Open the board" onClick={() => go("board")} className="pm-circle"><ClipboardList className="h-4 w-4" /></button>
          </div>
          {myTasks.length === 0 ? <p className="mt-3 text-sm text-white/60">No dated tasks right now.</p> : (
            <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
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
      )}
    </div>
  );
}

/* ---------------- monthly calendar ---------------- */

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const BOOK_CALL_URL = "https://calendar.google.com/calendar/u/0/r/eventedit?vcon=meet&dates=20261012T170000&hl=en&add=natalie@nine3designs.co.uk&text=Free%20discovery%20call%20with%20Nine3%20Designs&details=Free%2015-minute%20video%20call%20to%20discuss%20your%20project.%20Booked%20via%20nine3designs.co.uk";

function MonthCal({ avail, large }: { avail: Any; large?: boolean }) {
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
          return (
            <span key={d} className="flex flex-col items-center">
              <span className={`flex items-center justify-center rounded-full ${large ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs"} ${today ? "bg-[var(--pm-orange)] font-semibold text-[#3d2400]" : isAvail ? "bg-[rgba(245,154,43,.14)] font-semibold text-[#a35803]" : "text-[#5e5e5e]"}`}>{d}</span>
              <span className="pm-dot mt-0.5" style={{ width: ".4rem", height: ".4rem", background: isAvail ? "#f59a2b" : "transparent" }} />
            </span>
          );
        })())}
      </div>
      {availSet.size > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-[#5e5e5e]"><span className="pm-dot" style={{ background: "#f59a2b" }} /> Days Natalie is available</p>
      ) : null}
    </div>
  );
}

function MonthCalCard({ avail }: { avail: Any }) {
  return (
    <div className="pm-card flex flex-col p-6">
      <div className="flex w-full items-center justify-between">
        <h2 className="text-lg font-semibold">This month</h2>
        <span className="pm-circle"><CalendarDays className="h-4 w-4" /></span>
      </div>
      <div className="mt-3 flex-1">
        <MonthCal avail={avail} />
      </div>
      <a href={BOOK_CALL_URL} target="_blank" rel="noreferrer" className="pm-btn-orange mt-4 inline-flex h-10 items-center justify-center gap-2 px-5 text-sm no-underline">
        <CalendarDays className="h-4 w-4" /> Book a call with Natalie
      </a>
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
          {notes.map((n: Any) => (
            <div key={n.id} className="pm-card p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.text}</p>
              <div className="mt-3 flex items-center justify-between border-t border-[#e6e8ea] pt-2.5">
                <span className="text-[11px] text-[#9aa0a6]">{fmtDate(n.at)}</span>
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

/* ---------------- board ---------------- */

export function Board({ p, viewer, act, go, autoAdd, onAutoAddDone }: { p: Any; viewer: string; act: Act; go: Any; autoAdd?: boolean; onAutoAddDone?: () => void }) {
  const cards: Any[] = p.board ?? [];
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [composer, setComposer] = useState<ColKey | null>(null);
  const [editing, setEditing] = useState<Any | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  useEffect(() => {
    if (autoAdd) { setComposer("todo"); if (onAutoAddDone) onAutoAddDone(); }
  }, [autoAdd]);

  const colCards = (key: string) => cards.filter((c: Any) => c.status === key).sort((a: Any, b: Any) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)));

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
        <Button className="pm-btn" onClick={() => setComposer("todo")}><Plus className="h-4 w-4" /> Add task</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = colCards(col.key);
          const isOver = overCol === col.key;
          return (
            <div key={col.key}
              className={`pm-col ${isOver ? "drop" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.key); }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => { e.preventDefault(); dropInto(col.key); }}>
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{col.label}</h3>
                  <span className="pm-chip">{list.length}</span>
                </div>
                <button type="button" onClick={() => setComposer(col.key)} aria-label={`Add to ${col.label}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eef0f2] text-[#0d1c34] transition-colors hover:bg-[#f59a2b] hover:text-[#3d2400]"><Plus className="h-4 w-4" /></button>
              </div>

              {composer === col.key && <AddComposer col={col.key} onCancel={() => setComposer(null)} onSubmit={async (title, notes) => {
                const r = await act({ type: "cardAdd", title, notes, status: col.key, actor: viewer }, "Task added");
                if (r) setComposer(null);
              }} />}

              <div className="space-y-2.5">
                {list.length === 0 && composer !== col.key && <p className="rounded-xl border border-dashed border-[#d5dade] px-3 py-6 text-center text-xs text-[#5e5e5e]">Nothing here yet</p>}
                {list.map((c: Any) => (
                  <div key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onDragOver={(e) => { if (dragId && dragId !== c.id) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropInto(col.key, c.id); }}
                    className={`pm-task cursor-grab p-3.5 active:cursor-grabbing ${dragId === c.id ? "opacity-50" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium leading-snug ${c.status === "done" ? "text-[#5e5e5e] line-through" : ""}`}>{c.title}</p>
                      <span className={`pm-chip flex-none bg-white ${c.status === "doing" ? "orange" : ""}`}>{c.created_by === "Natalie" ? "Nat" : c.created_by?.split(" ")[0] ?? "·"}</span>
                    </div>
                    {c.notes ? <p className="clamp2 mt-1.5 text-xs text-[#5e5e5e]">{c.notes}</p> : null}
                    <div className="mt-3 flex items-center gap-1 border-t border-[#e6e8ea] pt-2.5">
                      <IconBtn label="Move left" onClick={() => nudge(c, -1)} disabled={c.status === "todo"}><ArrowLeft className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn label="Move right" onClick={() => nudge(c, 1)} disabled={c.status === "done"}><ArrowRight className="h-3.5 w-3.5" /></IconBtn>
                      <IconBtn label="Edit task" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                      <span className="ml-auto text-[10px] text-[#9aa0a6]">{c.updated_at ? relDay(c.updated_at) : ""}</span>
                      <IconBtn label="Delete task" danger={confirmDel === c.id} onClick={() => {
                        if (confirmDel === c.id) { act({ type: "cardDelete", id: c.id, actor: viewer }, "Task removed"); setConfirmDel(null); }
                        else { setConfirmDel(c.id); setTimeout(() => setConfirmDel((k) => (k === c.id ? null : k)), 2600); }
                      }}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                    </div>
                  </div>
                ))}
              </div>
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

function AddComposer({ col, onSubmit, onCancel }: { col: string; onSubmit: (title: string, notes: string) => Promise<Any | null>; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form className="mb-2.5 rounded-xl border border-[#e6e8ea] bg-white p-3 shadow-sm" onSubmit={async (e) => { e.preventDefault(); if (!title.trim() || busy) return; setBusy(true); await onSubmit(title.trim(), notes.trim()); setBusy(false); setTitle(""); setNotes(""); }}>
      <Input autoFocus placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" />
      <Textarea placeholder="Details (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-2 text-sm" />
      <div className="mt-2.5 flex gap-2">
        <Button type="submit" className="pm-btn-orange h-8 flex-1" disabled={busy}>Add task</Button>
        <Button type="button" variant="ghost" className="h-8 flex-1" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function EditCard({ card, onSave, onDelete }: { card: Any; onSave: (title: string, notes: string) => Promise<Any | null>; onDelete: () => Promise<Any | null> }) {
  const [title, setTitle] = useState(card.title ?? "");
  const [notes, setNotes] = useState(card.notes ?? "");
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      <DialogHeader><DialogTitle>Edit task</DialogTitle></DialogHeader>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Details</Label><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={async () => { if (!confirm) { setConfirm(true); setTimeout(() => setConfirm(false), 2600); return; } await onDelete(); }}>{confirm ? "Really delete?" : "Delete"}</Button>
        <Button type="button" className="pm-btn" onClick={async () => { if (!title.trim()) { toast.error("Title can't be empty."); return; } await onSave(title.trim(), notes.trim()); }}>Save changes</Button>
      </div>
    </div>
  );
}

/* ---------------- time ---------------- */

function TimeTab({ entries, running, unbilledMins, rate, viewer, act, cards, invoices: allInvoices, files, client }: Any) {
  const invoices = (allInvoices ?? []).filter((i: Any) => i.status !== "draft");
  const [viewInv, setViewInv] = useState<Any | null>(null);
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
      <div className="pm-card p-6 md:p-7">
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
      </div>

      <div className="pm-card p-5">
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
      </div>

      {isNat && <ManualLog act={act} cards={cards} todayKey={todayKey} />}

      <div className="pm-card p-5">
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
      </div>

      <div className="pm-card p-5">
        <h2 className="text-lg font-semibold">Invoices</h2>
        {invoices.length === 0 ? <p className="mt-3 text-sm text-[#5e5e5e]">Invoices raised for this work will appear here.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-[#5e5e5e]"><tr><th className="pb-2">Invoice</th><th className="pb-2">Issued</th><th className="pb-2">Due</th><th className="pb-2">Status</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">PDF</th></tr></thead>
              <tbody>
                {invoices.map((i: Any) => (
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
                <a href={f.file_path} target="_blank" rel="noreferrer" className="pm-filebtn navy" style={{ textDecoration: "none" }}>View</a>
                <a href={f.file_path} download={f.file_name || "invoice.pdf"} className="pm-filebtn" style={{ textDecoration: "none" }}>Download</a>
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
            <Button type="button" className="pm-btn-orange" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / save PDF</Button>
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

const BILLER = {
  name: "Nine3 Designs",
  contact: "natalie@nine3designs.co.uk",
  sort: "04-03-33",
  account: "40426946",
  terms: "Payment due within 7 days of invoice date",
};

export function InvoiceSheet({ inv, client }: Any) {
  if (!inv) return null;
  const items: LineItem[] = (inv.items ?? []) as LineItem[];
  const t = invoiceTotals(items, inv.tax_rate);
  const accName = client?.company || client?.name || "Advanced Assessment & Solutions";
  const email = client?.email || "";
  return (
    <div className="pm-inv-sheet rounded-xl bg-white p-6 text-sm md:p-8">
      <div className="-mx-6 -mt-6 mb-6 flex items-center justify-between rounded-t-xl px-6 py-5 md:-mx-8 md:-mt-8 md:px-8" style={{ background: "#0d1c34", color: "#fff" }}>
        <div>
          <p className="text-lg font-semibold tracking-tight">{BILLER.name}</p>
          <p className="text-xs text-white/70">{BILLER.contact}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tracking-[0.18em]">INVOICE</p>
          <p className="text-xs text-white/80">{inv.number}</p>
        </div>
      </div>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#5e5e5e]">Billed to</p>
          <p className="mt-1 font-medium">{accName}</p>
          {client?.name && client?.company ? <p className="text-xs text-[#5e5e5e]">{client.name}</p> : null}
          {email ? <p className="text-xs text-[#5e5e5e]">{email}</p> : null}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#5e5e5e]">Issued</p>
          <p className="mt-1">{fmtDate(inv.issue_date)}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#5e5e5e]">Due</p>
          <p className="mt-1">{fmtDate(inv.due_date)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#5e5e5e]">Status</p>
          <p className="mt-1"><StatusBadge status={effectiveStatus(inv)} /></p>
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#e6e8ea] text-left text-xs uppercase tracking-wider text-[#5e5e5e]">
            <th className="pb-2">Description</th>
            <th className="pb-2 text-right">Qty</th>
            <th className="pb-2 text-right">Rate</th>
            <th className="pb-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={idx} className="border-b border-[#f0f1f3]">
              <td className="py-2.5 pr-3">{it.description}</td>
              <td className="py-2.5 text-right text-[#5e5e5e]">{it.quantity}</td>
              <td className="py-2.5 text-right text-[#5e5e5e]">{money(it.rate)}</td>
              <td className="py-2.5 text-right font-medium">{money(Number(it.quantity) * Number(it.rate))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto max-w-56 space-y-1.5 text-sm">
        <div className="flex justify-between"><span className="text-[#5e5e5e]">Subtotal</span><span>{money(t.subtotal)}</span></div>
        {Number(inv.tax_rate) > 0 && <div className="flex justify-between"><span className="text-[#5e5e5e]">VAT ({inv.tax_rate}%)</span><span>{money(t.tax)}</span></div>}
        <div className="flex justify-between border-t border-[#1f2630] pt-1.5 text-base font-semibold"><span>Total</span><span>{money(t.total)}</span></div>
      </div>
      <div className="mt-6 rounded-xl bg-[#f6f8fa] p-4 text-xs leading-relaxed text-[#5e5e5e]">
        <p className="mb-1 font-semibold text-[#1f2630]">Payment details</p>
        <p>Bank transfer · Sort code {BILLER.sort} · Account {BILLER.account} · {BILLER.name}</p>
        <p>{BILLER.terms}. Questions? Email {BILLER.contact}.</p>
        {inv.notes ? <p className="mt-2">{inv.notes}</p> : null}
      </div>
    </div>
  );
}

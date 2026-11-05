import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Play, Square, Upload, Send, MailCheck, Plus, Trash2, ArrowLeft, Printer, ClipboardList, Clock, CalendarDays, Menu, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/portal/Wordmark";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/common";
import { supabase } from "@/integrations/supabase/client";
import { portalAction, getPortal } from "@/lib/portal.functions";
import { Dashboard, Board, InvoiceSheet } from "@/components/portal/PMPortal";
import { InvoiceDocument } from "@/components/portal/InvoiceDocument";
import { effectiveStatus, fmtDate, invoiceTotals, money, type LineItem } from "@/lib/format";
import { fmtMinsLabel, londonDayKey } from "@/lib/admin-utils";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "HQ Projects Portal · Advanced Assessment & Solutions" }] }),
  component: AdminPage,
});

const TOKEN = "SaraDawson";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const WEB3FORMS_KEY = "99ca148c-fefe-490c-886a-2ffbf3cc0963";

function nextMonday() {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() + (7 - dow));
  return londonDayKey(d);
}

function AdminPage() {
  const act0 = useServerFn(portalAction);
  const qp0 = useServerFn(getPortal);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "denied" | "ready">("checking");
  const [data, setData] = useState<Any>(null);

  const refresh = async () => {
    try { const d = await qp0({ data: { token: TOKEN } }); setData(d); } catch (e) { toast.error((e as Error).message); }
  };

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user?.id;
      if (!uid) { navigate({ to: "/auth" }); return; }
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) { setState("denied"); return; }
      setState("ready");
      await refresh();
    })();
  }, []);

  const act: Any = async (action: Any, success?: string) => {
    try {
      const r = await act0({ data: { token: TOKEN, action } });
      await refresh();
      if (success) toast.success(success);
      return r;
    } catch (e) { toast.error((e as Error).message); return null; }
  };

  if (state === "checking") return <div className="grid min-h-screen place-items-center bg-[#eef0f2] font-sans text-sm text-[#5e5e5e]">Checking your access…</div>;
  if (state === "denied") return (
    <div className="grid min-h-screen place-items-center bg-[#eef0f2] p-6 font-sans">
      <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow">
        <h1 className="text-lg font-semibold text-[#1f2630]">Admins only</h1>
        <p className="mt-2 text-sm text-[#5e5e5e]">This workspace is for Natalie's account.</p>
        <Button className="mt-5 h-10 rounded-full bg-[#0d1c34] px-6 text-white" onClick={() => navigate({ to: "/auth" })}>Go to sign in</Button>
      </div>
    </div>
  );
  if (!data) return <div className="grid min-h-screen place-items-center bg-[#eef0f2] font-sans text-sm text-[#5e5e5e]">Loading your workspace…</div>;

  const entries: Any[] = data.time ?? [];
  const cards: Any[] = data.board ?? [];
  const running = entries.find((e: Any) => !e.ended_at);
  const invoices: Any[] = data.invoices ?? [];

  return (
    <AdminShell
      act={act} data={data}
      onSignOut={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}
    />
  );
}

function AdminShell({ act, data, onSignOut }: Any) {
  const [tab, setTab] = useState<"dashboard" | "board" | "time" | "finance" | "availability">("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const entries: Any[] = data.time ?? [];
  const cards: Any[] = data.board ?? [];
  const running = entries.find((e: Any) => !e.ended_at);
  const invoices: Any[] = data.invoices ?? [];
  const doneEntries = entries.filter((e: Any) => e.ended_at && Number(e.minutes) > 0);
  const unbilled = doneEntries.filter((e: Any) => !e.billed);
  const unbilledMins = unbilled.reduce((s: number, e: Any) => s + Number(e.minutes), 0);
  const rate = Number(data.client?.portal_prefs?.rate ?? 17);
  const stats = useMemo(() => {
    const today = londonDayKey(new Date().toISOString());
    const thisWeek = weekStartKey(today);
    const thisMonth = today.slice(0, 7);
    let today_ = 0, week = 0, month = 0;
    for (const e of doneEntries) {
      const day = londonDayKey(new Date(e.started_at ?? e.created_at));
      if (day === today) today_ += Number(e.minutes);
      if (weekStartKey(day) === thisWeek) week += Number(e.minutes);
      if (day.slice(0, 7) === thisMonth) month += Number(e.minutes);
    }
    if (running) today_ += (Date.now() - Date.parse(running.started_at)) / 60000;
    const open = cards.filter((c: Any) => c.status !== "done").length;
    return { today: today_, week, month, open, thisWeek };
  }, [entries, cards, running?.id]);
  const weeks = useMemo(() => {
    const out: { key: string; label: string; mins: number }[] = [];
    const base = new Date(stats.thisWeek + "T12:00:00Z");
    for (let i = 5; i >= 0; i--) {
      const d = new Date(base); d.setUTCDate(d.getUTCDate() - i * 7);
      const key = d.toISOString().slice(0, 10);
      let mins = 0;
      for (const e of doneEntries) if (weekStartKey(londonDayKey(new Date(e.started_at ?? e.created_at))) === key) mins += Number(e.minutes);
      const start = new Date(key + "T12:00:00Z");
      out.push({ key, label: start.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" }) + " " + start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }), mins });
    }
    return out;
  }, [entries]);
  const maxWeek = Math.max(60, ...weeks.map((w) => w.mins));
  const tabs = [
    { v: "dashboard", l: "Dashboard" },
    { v: "board", l: "To-Do Board" },
    { v: "time", l: "Time Tracking" },
    { v: "finance", l: "Finance" },
    { v: "availability", l: "Availability" },
  ];
  return (
    <div className="pm min-h-screen bg-[#eef0f2]">
      <style>{ADMIN_STYLES}</style>
      <div className="pm-navwrap">
        <nav className="pm-navbar" aria-label="Workspace sections">
          <span className="pm-brand">
            <Wordmark variant="inline" />
          </span>
          <div className="pm-tabs">
            {tabs.map((t) => (
              <button key={t.v} type="button" onClick={() => { setTab(t.v as Any); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`pm-tab ${t.v === tab ? "active" : ""}`}>{t.l}</button>
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
          <div className="pm-menu-foot">
            <a href="/portal/SaraDawson">View Sara's portal</a>
            <button type="button" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </div>
      <main className="pm-main">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.65rem] font-semibold tracking-tight md:text-4xl">HQ Projects Portal</h1>
            <p className="mt-1 text-[1.65rem] font-semibold tracking-tight text-[var(--pm-orange)] md:text-4xl">Welcome back, Natalie</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/portal/SaraDawson" className="pm-linkbtn">View Sara's portal</a>
            <button type="button" onClick={onSignOut} className="pm-linkbtn">Sign out</button>
          </div>
        </header>
        {tab === "dashboard" && <Dashboard p={data} stats={stats} weeks={weeks} maxWeek={maxWeek} rate={rate} unbilledMins={unbilledMins} running={running} viewer="Natalie" go={setTab as Any} act={act} />}
        {tab === "board" && <Board p={data} viewer="Natalie" act={act} go={(t: string) => setTab((t === "board" ? "board" : "time") as Any)} />}
        {tab === "time" && <AdminTime act={act} entries={entries} running={running} cards={cards} unbilledMins={unbilledMins} rate={rate} />}
        {tab === "finance" && <Finance act={act} invoices={invoices} entries={doneEntries} unbilledMins={unbilledMins} rate={rate} client={data.client} />}
        {tab === "availability" && <Availability act={act} />}
      </main>
      <footer className="pm-foot">Advanced Assessment &amp; Solutions · HQ Projects Portal - Crafted by <a href="https://nine3designs.co.uk" target="_blank" rel="noreferrer">Nine3 Designs</a></footer>
    </div>
  );
}

function AdminTime({ act, entries, running, cards, unbilledMins, rate }: Any) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => { if (!running) return; const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, [running?.id]);
  const doneEntries = entries.filter((e: Any) => e.ended_at && Number(e.minutes) > 0);
  const todayKey = londonDayKey(new Date());
  const todayMins = doneEntries.filter((e: Any) => londonDayKey(new Date(e.started_at ?? e.created_at)) === todayKey).reduce((s: number, e: Any) => s + Number(e.minutes), 0);
  const weekKey = weekStartKey(todayKey);
  const weekMins = doneEntries.filter((e: Any) => weekStartKey(londonDayKey(new Date(e.started_at ?? e.created_at))) === weekKey).reduce((s: number, e: Any) => s + Number(e.minutes), 0);
  const hms = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  const secs = running ? Math.max(0, Math.floor((Date.now() - Date.parse(running.started_at)) / 1000)) : 0;
  const frac = running ? (secs % 480) / 480 : todayMins / 480;

  return (
    <div className="space-y-5">
      <div className="pm-card p-6 md:p-7">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <Ring frac={frac}>
            <span className="timer-num text-base font-semibold tracking-tight">{running ? hms(Date.now() - Date.parse(running.started_at)) : "00:00:00"}</span>
          </Ring>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d97406]">Time tracking</p>
            <p className="mt-1 text-sm text-[#5e5e5e]">{running ? (running.note ? `Tracking · ${running.note}` : "Tracking · no note added") : "Ready when you are"}</p>
            <p className="mt-2 text-sm text-[#5e5e5e]">Today <strong className="text-[#1f2630]">{fmtMinsLabel(todayMins)}</strong> · This week <strong className="text-[#1f2630]">{fmtMinsLabel(weekMins)}</strong> · Unbilled <strong className="text-[#1f2630]">{fmtMinsLabel(unbilledMins)}</strong></p>
          </div>
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
        </div>
      </div>

      <ManualLog act={act} cards={cards} todayKey={todayKey} />

      <WorkLog act={act} entries={doneEntries} cards={cards} todayKey={todayKey} />
    </div>
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
      const r = await act({ type: "timeAdd", date, minutes: total, note: note.trim(), cardId: cardId || undefined, actor: "Natalie" }, "Time logged");
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

function WorkLog({ act, entries, cards, todayKey }: Any) {
  const groups = useMemo(() => {
    const map = new Map<string, Any[]>();
    for (const e of entries) {
      const day = londonDayKey(new Date(e.started_at ?? e.created_at));
      (map.get(day) ?? map.set(day, []).get(day)!).push(e);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);
  const dayLabel = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  return (
    <div className="pm-card p-5">
      <h2 className="text-lg font-semibold">Work log</h2>
      {groups.length === 0 ? <p className="mt-3 text-sm text-[#5e5e5e]">No hours logged yet.</p> : (
        <div className="mt-4 space-y-5">
          {groups.map(([day, list]: Any) => (
            <div key={day}>
              <div className="flex items-center justify-between border-b border-[#f0f1f3] pb-2">
                <p className="text-sm font-semibold">{day === todayKey ? "Today" : dayLabel(day)}</p>
                <span className="pm-chip">{fmtMinsLabel(list.reduce((s: number, e: Any) => s + Number(e.minutes), 0))}</span>
              </div>
              <ul className="mt-2.5 space-y-2">
                {list.sort((a: Any, b: Any) => String(b.started_at ?? b.created_at).localeCompare(String(a.started_at ?? a.created_at))).map((e: Any) => (
                  <EntryRow key={e.id} e={e} cardTitle={cards.find((c: Any) => c.id === e.card_id)?.title} act={act} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({ e, cardTitle, act }: Any) {
  const [open, setOpen] = useState(false);
  const [mins, setMins] = useState(String(Math.round(Number(e.minutes))));
  const [note, setNote] = useState(e.note ?? "");
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="pm-row flex items-center gap-3 px-3 py-2.5">
      <span className="pm-dot" style={{ background: e.billed ? "#c6cbd1" : "#f59a2b" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{e.note || cardTitle || "Support work"}</p>
        {cardTitle && e.note ? <p className="truncate text-xs text-[#5e5e5e]">{cardTitle}</p> : null}
      </div>
      {e.billed ? <span className="pm-chip line">Invoiced</span> : null}
      <span className="flex-none text-sm font-medium">{fmtMinsLabel(e.minutes)}</span>
      <span className="flex flex-none items-center gap-1">
        <button type="button" className="pm-iconbtn" onClick={() => setOpen(true)} title="Edit entry">✎</button>
        <button type="button" className="pm-iconbtn" title="Delete entry" onClick={() => {
          if (confirm) { act({ type: "timeDelete", id: e.id }, "Entry removed"); setConfirm(false); }
          else { setConfirm(true); setTimeout(() => setConfirm(false), 2600); }
        }} style={confirm ? { background: "#b3372c", color: "#fff" } : undefined}>{confirm ? "Sure?" : "✕"}</button>
      </span>
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


function Finance({ act, invoices, unbilledMins, rate, client }: Any) {
  const [editId, setEditId] = useState<string | null>(null);
  const [viewInv, setViewInv] = useState<Any | null>(null);
  const editing = invoices.find((i: Any) => i.id === editId) ?? null;
  if (editing) return <InvoiceEditor inv={editing} client={client} act={act} onDone={() => setEditId(null)} />;
  return (
    <div className="space-y-5">
      <div className="pm-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Unbilled work</h2>
            <p className="mt-0.5 text-xs text-[#5e5e5e]">Hours logged since the last invoice · {money(rate)} per hour</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight">{money((unbilledMins / 60) * rate)}</p>
            <p className="text-xs text-[#5e5e5e]">{fmtMinsLabel(unbilledMins)}</p>
          </div>
        </div>
        {unbilledMins > 0 && (
          <div className="mt-4 border-t border-[#f0f1f3] pt-4">
            <Button className="pm-btn-orange h-10" onClick={async () => {
              const r = await act({ type: "timeInvoice" });
              if (r?.id) {
                toast.success(`Invoice ${r.number} drafted · nothing sent to Sara yet`, { action: { label: "Open draft", onClick: () => setEditId(r.id) }, duration: 12000 });
              }
            }}><FileText className="h-4 w-4" /> Create draft invoice · {fmtMinsLabel(unbilledMins)} · {money((unbilledMins / 60) * rate)}</Button>
            <p className="mt-2 text-xs text-[#5e5e5e]">One line per day from your logged hours · check it over, then send it to Sara's email.</p>
          </div>
        )}
      </div>

      <InvoiceUpload act={act} />

      <div className="pm-card p-5">
        <h2 className="text-lg font-semibold">Invoices</h2>
        {invoices.length === 0 ? <p className="mt-3 text-sm text-[#5e5e5e]">Invoices you create will collect here.</p> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-[#5e5e5e]"><tr><th className="pb-2">Invoice</th><th className="pb-2">Issued</th><th className="pb-2">Status</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">Actions</th></tr></thead>
              <tbody>
                {invoices.map((i: Any) => {
                  const isDraft = i.status === "draft";
                  return (
                    <tr key={i.id} className="border-t border-[#f0f1f3]">
                      <td className="py-2.5 font-medium">{i.number}{isDraft ? <span className="pm-chip orange ml-2">Draft</span> : null}</td>
                      <td className="py-2.5 text-[#5e5e5e]">{fmtDate(i.issue_date)}</td>
                      <td className="py-2.5"><StatusBadge status={effectiveStatus(i)} /></td>
                      <td className="py-2.5 text-right">{money(invoiceTotals(i.items as LineItem[], i.tax_rate).total)}</td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex justify-end gap-1.5">
                          {isDraft
                            ? <button type="button" className="pm-filebtn navy" onClick={() => setEditId(i.id)}>Edit draft</button>
                            : <button type="button" className="pm-filebtn navy" onClick={() => setViewInv(i)}>View</button>}
                          {i.status === "sent" && (
                            <button type="button" className="pm-filebtn" onClick={async () => {
                              await act({ type: "invoiceUpdate", id: i.id, number: i.number, issue_date: i.issue_date, due_date: i.due_date, tax_rate: i.tax_rate, items: i.items, notes: i.notes, status: "paid" }, "Marked as paid");
                            }}>Mark paid</button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!viewInv} onOpenChange={(o: boolean) => { if (!o) setViewInv(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Invoice {viewInv?.number}</DialogTitle></DialogHeader>
          <div className="mt-3 max-h-[65vh] overflow-y-auto"><InvoiceSheet inv={viewInv} /></div>
          <div className="no-print mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" className="pm-btn" onClick={() => setViewInv(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SARA_EMAIL = "advancedassessmentandsolutions@gmail.com";

function InvoiceEditor({ inv, client, act, onDone }: Any) {
  const [v, setV] = useState<Any>(() => ({ ...inv }));
  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { setV({ ...inv }); }, [inv?.id]);
  const items: LineItem[] = Array.isArray(v.items) ? v.items : [];
  const total = invoiceTotals(items, v.tax_rate).total;
  const setItem = (i: number, k: keyof LineItem, val: string) => {
    const next = [...items]; next[i] = { ...(next[i] as Any), [k]: k === "description" ? val : Number(val) }; setV({ ...v, items: next });
  };
  const save = async (extra: Any = {}) => {
    setBusy(true);
    const r = await act({ type: "invoiceUpdate", id: v.id, number: v.number, issue_date: v.issue_date, due_date: v.due_date, tax_rate: Number(v.tax_rate) || 0, items, notes: v.notes, ...extra });
    setBusy(false);
    return r;
  };
  const send = async () => {
    setBusy(true);
    const saved = await save();
    if (!saved) { setBusy(false); return; }
    const r = await act({ type: "invoiceSend", id: v.id });
    if (r) {
      const body = [
        "Hi Sara,", "",
        `Invoice ${v.number} from Nine3 Designs is ready · ${money(total)}, due ${fmtDate(v.due_date)}.`, "",
        "View it any time in your portal:", "https://portal.advancedassessmentandsolutions.co.uk/portal/SaraDawson?tab=time", "",
        "Payment details · Sort code 04-03-33 · Account 40426946", "Payment due within 7 days of invoice date.", "",
        "Natalie · Nine3 Designs",
      ].join("\n");
      const results = await Promise.allSettled([SARA_EMAIL, ...EMAILS].map((to) => fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject: `Invoice ${v.number} · Nine3 Designs`, from_name: "Nine3 Designs · Client Portal", message: body, replyto: "natalie@nine3designs.co.uk" }) })));
      if (results.some((x) => x.status === "fulfilled" && (x.value as Any).ok)) toast.success("Invoice sent to Sara's email");
      else toast.error("Marked as sent, but the email may not have gone out · check with Sara.");
      onDone();
    }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onDone} className="pm-linkbtn"><ArrowLeft className="mr-1 inline h-3.5 w-3.5" />Back to Finance</button>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="pm-btn-light" onClick={() => window.print()}><Printer className="h-4 w-4" /> PDF</Button>
          {v.status === "draft" && (
            <Button type="button" variant="outline" className="pm-btn-light" onClick={async () => {
              if (!confirmDel) { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 2800); return; }
              setBusy(true); const r = await act({ type: "invoiceDelete", id: v.id }, "Draft deleted · hours back in unbilled"); setBusy(false); if (r) onDone();
            }}>{confirmDel ? "Sure? Delete draft" : <><Trash2 className="h-4 w-4" /> Delete</>}</Button>
          )}
          {v.status === "draft" && (
            <Button type="button" className="pm-btn-orange" disabled={busy} onClick={() => { if (!confirmSend) { setConfirmSend(true); setTimeout(() => setConfirmSend(false), 3200); return; } send(); }}>
              {busy ? "Working…" : confirmSend ? "Send to Sara's email?" : <><Send className="h-4 w-4" /> Send to Sara</>}
            </Button>
          )}
          <Button type="button" className="pm-btn" disabled={busy} onClick={async () => { const r = await save(); if (r) onDone(); }}>Save</Button>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <section className="pm-card no-print space-y-4 self-start p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Number</Label><Input value={v.number ?? ""} onChange={(e) => setV({ ...v, number: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Status</Label><Input value={v.status ?? "draft"} disabled /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Issued</Label><Input type="date" value={v.issue_date ?? ""} onChange={(e) => setV({ ...v, issue_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Due</Label><Input type="date" value={v.due_date ?? ""} onChange={(e) => setV({ ...v, due_date: e.target.value || null })} /></div>
          </div>
          <div className="space-y-1.5"><Label>VAT %</Label><Input type="number" value={v.tax_rate ?? 0} onChange={(e) => setV({ ...v, tax_rate: Number(e.target.value) })} /></div>
          <div className="space-y-2">
            <Label>Line items</Label>
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_56px_76px_auto] gap-2">
                <Input value={it.description ?? ""} onChange={(e) => setItem(i, "description", e.target.value)} />
                <Input type="number" step="0.01" value={it.quantity ?? 0} onChange={(e) => setItem(i, "quantity", e.target.value)} />
                <Input type="number" step="0.01" value={it.rate ?? 0} onChange={(e) => setItem(i, "rate", e.target.value)} />
                <button type="button" className="pm-iconbtn" title="Remove line" onClick={() => setV({ ...v, items: items.filter((_: Any, k: number) => k !== i) })}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="pm-btn-light" onClick={() => setV({ ...v, items: [...items, { description: "", quantity: 1, rate }] })}><Plus className="h-4 w-4" /> Add line</Button>
          </div>
          <div className="space-y-1.5"><Label>Notes / payment details</Label><Textarea value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value })} className="min-h-20" /></div>
        </section>
        <div className="pm-doczoom">
          <InvoiceDocument inv={{ ...v, items, clientName: client?.name ?? "Sara Dawson", clientCompany: client?.company ?? "Advanced Assessment & Solutions", clientEmail: SARA_EMAIL }} />
        </div>
      </div>
    </div>
  );
}

function InvoiceUpload({ act }: Any) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const sizeOk = file ? file.size <= 4_500_000 : true;
  return (
    <form className="pm-card p-6 md:p-7" onSubmit={async (e) => {
      e.preventDefault();
      if (!file) { toast.error("Choose the invoice PDF first."); return; }
      if (!sizeOk) { toast.error("That PDF is over 4 MB · try exporting a lighter copy."); return; }
      setBusy(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const r = await act({ type: "uploadInvoice", fileName: file.name, title: title.trim() || file.name.replace(/\.pdf$/i, ""), dataUri: String(reader.result) }, "Invoice sent to Sara · she can view & download it in her portal");
        setBusy(false);
        if (r) { setFile(null); setTitle(""); if (fileRef.current) fileRef.current.value = ""; }
      };
      reader.onerror = () => { setBusy(false); toast.error("Could not read that file · try again."); };
      reader.readAsDataURL(file);
    }}>
      <h2 className="text-lg font-semibold">Send Sara an invoice</h2>
      <p className="mt-1 text-sm text-[#5e5e5e]">Upload your Nine3 invoice PDF and it appears in Sara's portal ready to view and download. She gets an activity note too.</p>
      <div className="mt-5 space-y-3">
        <div className="space-y-1.5"><Label>Invoice title (optional)</Label><Input placeholder="e.g. N3-2026-003 · November support" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Invoice PDF</Label>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full cursor-pointer rounded-xl border border-[#e6e8ea] bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[#0d1c34] file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-white" />
          {file && <p className="text-xs text-[#5e5e5e]">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB {sizeOk ? "" : "· too large (max ~4 MB)"}</p>}
        </div>
        <Button type="submit" className="pm-btn-orange h-11 px-6" disabled={busy || (!!file && !sizeOk)}>
          {busy ? "Uploading…" : <><Upload className="h-4 w-4" /> Send to Sara</>}
        </Button>
      </div>
    </form>
  );
}

const EMAILS = ["sara@advancedassessmentandsolutions.co.uk", "advancedassessmentandsolutions@gmail.com"];

function Availability({ act }: Any) {
  const [week, setWeek] = useState(nextMonday);
  const [rows, setRows] = useState(() => DAYS.map((d) => ({ day: d, available: false, note: "" })));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const available = rows.filter((r) => r.available);
  const weekLabel = (key: string) => new Date(key + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
  const dayDate = (i: number) => { const d = new Date(week + "T12:00:00Z"); d.setDate(d.getDate() + i); return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }); };
  const message = () => {
    const lines = rows.map((r, i) => `· ${r.day} ${dayDate(i)} - ${r.available ? `available${r.note ? ` (${r.note})` : ""}` : "not available"}`);
    return [
      "Hi Sara,",
      "",
      `Here's my availability for the week commencing Monday ${weekLabel(week)}:`,
      "",
      ...lines,
      notes.trim() ? "" : null,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
      "",
      "Reply to this email or give me a shout to lock anything in.",
      "",
      "Natalie · Nine3 Designs",
    ].filter((x) => x !== null).join("\n");
  };
  const weekStarts = useMemo(() => [0, 1, 2, 3].map((n) => { const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() + (7 - dow) + n * 7); return londonDayKey(d); }), []);
  return (
    <div className="space-y-5">
      <form className="pm-card p-6 md:p-7" onSubmit={async (e) => {
        e.preventDefault();
        if (available.length === 0) { toast.error("Tick at least one day you're available."); return; }
        setBusy(true);
        const r = await act({ type: "availabilitySave", week, days: rows, notes: notes.trim() }, "Availability saved");
        if (r) {
          const body = message();
          const results = await Promise.allSettled(EMAILS.map((to) => fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ access_key: WEB3FORMS_KEY, subject: `Your availability · w/c ${weekLabel(week)}`, from_name: "Nine3 Designs · Client Portal", message: body, replyto: "natalie@nine3designs.co.uk" }) })));
          if (results.some((x) => x.status === "fulfilled" && (x.value as Any).ok)) { toast.success("Sara has been emailed your availability"); setSent(true); }
          else toast.error("Saved, but the email may not have gone out · check with Sara.");
        }
        setBusy(false);
      }}>
        <h2 className="text-lg font-semibold">Submit your availability</h2>
        <p className="mt-1 text-sm text-[#5e5e5e]">Pick the week, tick your days and Sara gets an email straight away.</p>
        <div className="mt-5 space-y-1.5">
          <Label>Week commencing</Label>
          <div className="flex flex-wrap gap-2">
            {weekStarts.map((k, i) => (
              <button key={k} type="button" onClick={() => setWeek(k)} className={`pm-weekpick ${k === week ? "on" : ""}`}>{i === 0 ? "Next week" : `+${i} wk`} · {weekLabel(k).replace(/ \d{4}$/, "")}</button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {rows.map((r, i) => (
            <div key={r.day} className={`pm-dayrow ${r.available ? "on" : ""}`}>
              <button type="button" onClick={() => setRows(rows.map((x, j) => j === i ? { ...x, available: !x.available } : x))} className="pm-daycheck" aria-pressed={r.available}>
                <span className="pm-daybox">{r.available ? <Check className="h-3.5 w-3.5" /> : null}</span>
                <span className="text-sm font-medium">{r.day}</span>
                <span className="text-xs text-[#5e5e5e]">{dayDate(i)}</span>
              </button>
              {r.available && <input value={r.note} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} placeholder="e.g. from 9am, mornings only" className="pm-daynote" />}
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-1.5"><Label>Anything else? (optional)</Label><Textarea placeholder="e.g. Happy to do an evening call on Wednesday" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20" /></div>
        <Button type="submit" className="pm-btn-orange mt-4 h-11 px-7" disabled={busy}>
          {busy ? "Sending…" : <><Send className="h-4 w-4" /> Send to Sara</>}
        </Button>
        {sent && <p className="mt-2 flex items-center gap-1.5 text-xs text-[#5e5e5e]"><MailCheck className="h-3.5 w-3.5 text-[#d97406]" /> Email sent to Sara for {weekLabel(week)}</p>}
      </form>
      <p className="text-center text-xs text-[#5e5e5e]">Tip · availability is also saved in the portal so you can check back any time.</p>
    </div>
  );
}

function weekStartKey(dayKey: string) {
  const d = new Date(dayKey + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function Ring({ frac, children }: { frac: number; children?: Any }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  const f = Math.min(0.998, Math.max(0.002, Number(frac) || 0));
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" stroke="#c9ced4" strokeWidth="6" strokeDasharray="2 7" />
        <circle cx="64" cy="64" r={R} fill="none" stroke="#f59a2b" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - f)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

const ADMIN_STYLES = `
.pm { --pm-navy:#0d1c34; --pm-navy2:#16294a; --pm-orange:#f59a2b; --pm-orange-deep:#d97406; --pm-soft:#eef0f2; --pm-soft2:#e7eaee; --pm-ink:#1f2630; --pm-muted:#5e5e5e; --pm-line:#e6e8ea; }
.pm { color: var(--pm-ink); font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif; }
.pm h1, .pm h2, .pm h3 { font-family: 'Poppins', ui-sans-serif, system-ui, sans-serif; color: var(--pm-ink); font-weight: 600; }
.pm .pm-navwrap { position: sticky; top: 0; z-index: 40; padding: .9rem 0 .4rem; background: linear-gradient(to bottom, var(--pm-soft) 78%, transparent); }
.pm .pm-navbar { display: flex; align-items: center; gap: .4rem; background: #fff; border-radius: 999px; padding: .3rem; max-width: 46rem; margin: 0 auto; box-shadow: 0 12px 32px rgba(13,28,52,.10), 0 1px 2px rgba(13,28,52,.05); overflow-x: auto; scrollbar-width: none; }
.pm .pm-navbar::-webkit-scrollbar { display: none; }
.pm .pm-brand { flex: none; display: inline-flex; align-items: center; background: var(--pm-navy); border-radius: 999px; height: 2.55rem; padding: 0 1rem; }
.pm .pm-brand img { height: 1.05rem; width: auto; max-width: 170px; }
.pm .pm-tabs { display: flex; gap: .1rem; min-width: max-content; }
.pm .pm-tab { border-radius: 999px; padding: .6rem 1.05rem; font-size: .875rem; font-weight: 500; color: var(--pm-muted); white-space: nowrap; transition: color .15s ease, background .15s ease; }
.pm .pm-tab:hover { color: var(--pm-ink); background: var(--pm-soft2); }
.pm .pm-tab.active { background: var(--pm-navy); color: #fff; }
.pm .pm-main { max-width: 64rem; margin: 0 auto; padding: 1.5rem 1rem 0; }
.pm .pm-foot { max-width: 64rem; margin: 0 auto; padding: 2.2rem 1rem 2rem; text-align: center; font-size: .72rem; color: #9aa1a9; }
.pm .pm-card { background: #fff; border-radius: 1.5rem; box-shadow: 0 1px 2px rgba(13,28,52,.04), 0 12px 32px rgba(13,28,52,.06); transition: transform .18s ease, box-shadow .18s ease; }
.pm .pm-card:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(13,28,52,.05), 0 18px 44px rgba(13,28,52,.10); }
.pm .pm-btn { background: var(--pm-navy) !important; color: #fff !important; border-radius: 999px !important; font-weight: 500 !important; font-size: .875rem !important; transition: background .15s ease, transform .15s ease, box-shadow .15s ease !important; }
.pm .pm-btn:hover { background: var(--pm-navy2) !important; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(13,28,52,.25); }
.pm .pm-btn-orange { background: var(--pm-orange) !important; color: #3d2400 !important; border-radius: 999px !important; font-weight: 500 !important; font-size: .875rem !important; transition: background .15s ease, transform .15s ease, box-shadow .15s ease !important; }
.pm .pm-btn-orange:hover { background: var(--pm-orange-deep) !important; color: #fff !important; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(217,116,6,.30); }
.pm .pm-linkbtn { border-radius: 999px; border: 1px solid var(--pm-line); background: #fff; color: var(--pm-ink); font-size: .78rem; font-weight: 500; padding: .45rem 1rem; transition: border-color .15s ease, box-shadow .15s ease, color .15s ease; }
.pm .pm-linkbtn:hover { border-color: var(--pm-navy); color: var(--pm-navy); box-shadow: 0 4px 12px rgba(13,28,52,.10); }
.pm .pm-chip { display: inline-flex; align-items: center; gap: .35rem; border-radius: 999px; background: var(--pm-soft2); color: var(--pm-ink); font-size: .72rem; font-weight: 600; padding: .22rem .65rem; white-space: nowrap; }
.pm .pm-chip.orange { background: rgba(245,154,43,.16); color: #a35803; }
.pm .pm-chip.line { background: #fff; border: 1px solid var(--pm-line); color: var(--pm-muted); }
.pm .pm-row { background: var(--pm-soft); border-radius: 1.1rem; transition: background .15s ease; }
.pm .pm-row:hover { background: #e6e9ee; }
.pm .pm-dot { width: .55rem; height: .55rem; border-radius: 999px; flex: none; }
.pm .pm-circle { width: 2.4rem; height: 2.4rem; border-radius: 999px; background: #fff; box-shadow: 0 2px 8px rgba(13,28,52,.08); display: inline-flex; align-items: center; justify-content: center; color: var(--pm-muted); transition: color .15s ease; flex: none; }
.pm .pm-circle:hover { color: var(--pm-ink); }
.pm .pm-bar { background: var(--pm-navy); border-radius: 999px; min-height: 4px; width: 100%; max-width: .55rem; margin: 0 auto; }
.pm .pm-bar.now { background: var(--pm-orange); }
.pm .pm-dark { background: var(--pm-navy); border-radius: 1.5rem; color: #fff; box-shadow: 0 16px 40px rgba(13,28,52,.28); }
.pm .pm-iconbtn { width: 1.7rem; height: 1.7rem; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: .7rem; color: var(--pm-muted); transition: background .15s ease, color .15s ease; }
.pm .pm-iconbtn:hover { background: #fff; color: var(--pm-ink); box-shadow: 0 2px 8px rgba(13,28,52,.12); }
.pm .pm-weekpick { border-radius: 999px; border: 1px solid var(--pm-line); background: #fff; padding: .4rem .9rem; font-size: .78rem; font-weight: 500; color: var(--pm-muted); transition: all .15s ease; }
.pm .pm-weekpick:hover { border-color: var(--pm-orange); color: var(--pm-ink); }
.pm .pm-weekpick.on { background: var(--pm-navy); border-color: var(--pm-navy); color: #fff; }
.pm .pm-dayrow { display: flex; align-items: center; gap: .6rem; border: 1px solid var(--pm-line); border-radius: 1rem; padding: .55rem .75rem; background: #fff; transition: border-color .15s ease, background .15s ease, box-shadow .15s ease; }
.pm .pm-dayrow:hover { border-color: #d3d8de; box-shadow: 0 4px 14px rgba(13,28,52,.07); }
.pm .pm-dayrow.on { border-color: rgba(245,154,43,.5); background: #fffaf3; }
.pm .pm-daycheck { display: flex; align-items: center; gap: .55rem; flex: none; cursor: pointer; }
.pm .pm-daybox { width: 1.35rem; height: 1.35rem; border-radius: .5rem; border: 1.5px solid #cfd5db; display: inline-flex; align-items: center; justify-content: center; color: #fff; transition: all .15s ease; }
.pm .pm-dayrow.on .pm-daybox { background: var(--pm-orange); border-color: var(--pm-orange); }
.pm .pm-daynote { flex: 1; min-width: 0; border: 1px solid var(--pm-line); border-radius: .8rem; padding: .35rem .7rem; font-size: .8rem; background: #fff; }
.pm .pm-daynote:focus { outline: none; border-color: var(--pm-orange); box-shadow: 0 0 0 3px rgba(245,154,43,.15); }
.pm input, .pm textarea, .pm select { font-family: 'Poppins', sans-serif; }
.pm .pm-filebtn { display: inline-flex; align-items: center; gap: .3rem; border-radius: 999px; border: 1px solid var(--pm-line); background: #fff; color: var(--pm-ink); font-size: .72rem; font-weight: 600; padding: .3rem .7rem; transition: border-color .15s ease, color .15s ease, box-shadow .15s ease; }
.pm .pm-filebtn:hover { border-color: var(--pm-navy); color: var(--pm-navy); box-shadow: 0 4px 12px rgba(13,28,52,.10); }
.pm .pm-filebtn.navy { background: var(--pm-navy); border-color: var(--pm-navy); color: #fff; }
.pm .pm-filebtn.navy:hover { background: var(--pm-navy2); color: #fff; }
.pm { overflow-x: clip; }
@media (max-width: 640px) {
  .pm input, .pm textarea, .pm select { font-size: 16px !important; }
  .pm .pm-navbar { max-width: calc(100% - 1.25rem); }
}
@media (max-width: 719px) {
  .pm-doczoom { zoom: .45; width: 222%; max-width: none; }
}
@media print {
  @page { size: A4; margin: 10mm; }
  body * { visibility: hidden !important; }
  .no-print, .no-print * { display: none !important; }
  .pm-doczoom, .pm-doczoom * { visibility: visible !important; }
  .pm-doczoom { position: absolute !important; left: 0; top: 0; width: 100%; zoom: 1 !important; }
  .pm-doczoom .invoice-doc { box-shadow: none !important; border-radius: 0 !important; zoom: .8 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .pm-doczoom .invoice-doc * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .pm-doczoom .invoice-doc .avoid-break { break-inside: avoid; }
}
.pm .timer-num { font-variant-numeric: tabular-nums; letter-spacing: .02em; }
@media (max-width: 640px) { .pm .pm-main { padding-top: 1.1rem; } .pm .pm-card { border-radius: 1.3rem; } }

/* v3 polish: glass top bar · orange accents · bucket board · light buttons */
.pm .pm-navbar { max-width: 62rem; gap: .5rem; padding: .35rem; }
.pm .pm-brand { padding: 0 1.15rem; }
.pm .pm-tabs { gap: .2rem; }
.pm .pm-tab { padding: .68rem 1.35rem; font-size: .95rem; }
.pm .pm-btn-light { background: #fff !important; color: var(--pm-ink) !important; border: 1px solid var(--pm-line) !important; border-radius: 999px !important; font-weight: 500 !important; font-size: .875rem !important; transition: background .15s ease, transform .15s ease, box-shadow .15s ease !important; }
.pm .pm-btn-light:hover { border-color: var(--pm-navy) !important; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(13,28,52,.12); }
.pm .pm-navwrap { background: transparent; }
.pm .pm-navbar { background: rgba(13,28,52,.72); backdrop-filter: blur(14px) saturate(1.25); -webkit-backdrop-filter: blur(14px) saturate(1.25); border: 1px solid rgba(255,255,255,.14); box-shadow: 0 14px 36px rgba(13,28,52,.28); }
.pm .pm-brand { background: #0d1c34; border: 1px solid rgba(255,255,255,.16); }
.pm .pm-tab { color: rgba(255,255,255,.72); }
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
.pm .pm-burger { display: none; }
.pm .pm-menu { display: none; }
.pm .pm-menu.open { display: block; position: absolute; top: calc(100% + .4rem); left: .5rem; right: .5rem; z-index: 50; background: rgba(13,28,52,.97); border: 1px solid rgba(255,255,255,.14); border-radius: 1.25rem; box-shadow: 0 18px 44px rgba(13,28,52,.35); overflow: hidden; }
.pm .pm-menu button { display: block; width: 100%; text-align: left; padding: .9rem 1.2rem; color: rgba(255,255,255,.85); font-size: .95rem; font-weight: 500; border-bottom: 1px solid rgba(255,255,255,.08); background: none; }
.pm .pm-menu button:last-of-type { border-bottom: none; }
.pm .pm-menu button.active { color: #fff; background: rgba(255,255,255,.06); box-shadow: inset 3px 0 0 var(--pm-orange); }
.pm .pm-menu-foot { display: flex; align-items: center; justify-content: space-between; padding: .7rem 1.2rem; border-top: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.04); }
.pm .pm-menu-foot a, .pm .pm-menu-foot button { color: rgba(255,255,255,.75); font-size: .8rem; font-weight: 500; background: none; padding: .3rem 0; text-decoration: none; }
@media (max-width: 640px) {
  .pm .pm-taskactions button { width: 2.35rem !important; height: 2.35rem !important; font-size: .85rem; }
  .pm .pm-taskactions button svg { width: 1.1rem; height: 1.1rem; }
  .pm .pm-task { touch-action: pan-y; }
  .pm .pm-tabs { display: none; }
  .pm .pm-burger { display: inline-flex; align-items: center; justify-content: center; width: 2.55rem; height: 2.55rem; border-radius: 999px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); color: #fff; flex: none; cursor: pointer; }
  .pm .pm-navbar { max-width: calc(100% - 1.5rem); justify-content: space-between; gap: .4rem; overflow: visible; }
  .pm .pm-brand { padding: 0 .9rem; height: 2.55rem; }
  .pm .pm-brand img { height: 1.15rem; max-width: 140px; }
  .pm .pm-navwrap { padding-top: .7rem; }
}
`;

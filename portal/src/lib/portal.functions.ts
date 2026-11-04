import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { LineItem } from "@/lib/format";

type Access = { token?: string | null };

// Resolves which client the caller may see: a secure link token (link access)
// or a signed-in user whose email matches the client's portal email (email access).
async function resolveClient(access: Access) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (access.token) {
    const { data } = await supabaseAdmin.from("clients").select("*").eq("portal_token", access.token).eq("access_method", "link").eq("portal_enabled", true).maybeSingle();
    if (data) return { client: data, admin: supabaseAdmin };
    const slug = access.token.toLowerCase().replace(/[^a-z0-9]/g, "");
    const { data: candidates } = await supabaseAdmin.from("clients").select("*").eq("access_method", "link").eq("portal_enabled", true);
    const named = (candidates ?? []).find((c: { portal_prefs?: { slug?: string | null }; company?: string | null; name?: string | null }) => {
      const saved = String(c.portal_prefs?.slug ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return saved ? saved === slug : false;
    }) ?? (candidates ?? []).find((c: { company?: string | null; name?: string | null }) => String(c.company ?? c.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === slug);
    if (named) return { client: named, admin: supabaseAdmin };
    throw new Error("This portal link is not valid.");
  }
  const auth = getRequestHeader("authorization");
  const jwt = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!jwt) throw new Error("Please sign in to view your portal.");
  const { data: u } = await supabaseAdmin.auth.getUser(jwt);
  const email = u.user?.email?.toLowerCase();
  if (!email) throw new Error("Please sign in to view your portal.");
  const { data } = await supabaseAdmin.from("clients").select("*").ilike("portal_email", email).eq("access_method", "email").eq("portal_enabled", true).maybeSingle();
  if (!data) throw new Error("No portal is set up for this email address yet.");
  return { client: data, admin: supabaseAdmin };
}

export const getPortal = createServerFn({ method: "POST" })
  .inputValidator((d: Access) => ({ token: typeof d?.token === "string" ? d.token : null }))
  .handler(async ({ data }) => {
    const { client, admin } = await resolveClient(data);
    const cid = client.id;
    const grab = async (q: PromiseLike<Any>) => { try { const r = await q; return (r as Any).data ?? []; } catch { return []; } };
    const [onb, projects, files, invoices, proposals, fixtures, tasks, activity, board, time] = await Promise.all([
      admin.from("onboarding_items").select("*").eq("client_id", cid).order("position"),
      admin.from("projects").select("id, name, description, status, due_date, milestones(id, title, due_date, done, position)").eq("client_id", cid).order("created_at", { ascending: false }),
      admin.from("deliverables").select("*").eq("client_id", cid).order("created_at", { ascending: false }),
      admin.from("invoices").select("id, number, issue_date, due_date, status, items, tax_rate, paid_at").eq("client_id", cid).neq("status", "draft").order("issue_date", { ascending: false }),
      admin.from("proposals").select("id, kind, title, body, items, status, accepted_name, accepted_at, created_at").eq("client_id", cid).neq("status", "draft").order("created_at", { ascending: false }),
      admin.from("sports_fixtures").select("*").eq("client_id", cid).order("match_date"),
      admin.from("tasks").select("id, title, notes, status, priority, due_date").eq("client_id", cid).order("created_at"),
      admin.from("activity_log").select("id, message, actor, created_at").eq("client_id", cid).order("created_at", { ascending: false }).limit(15),
      grab(admin.from("board_cards").select("*").eq("client_id", cid).order("position").order("created_at")),
      grab(admin.from("time_entries").select("*").eq("client_id", cid).order("created_at", { ascending: false })),
    ]);
    const deliverables = await Promise.all((files.data ?? []).map(async (f) => {
      let url: string | null = null;
      if (f.file_path && (f.file_path.startsWith("http") || f.file_path.startsWith("data:"))) url = f.file_path;
      else if (f.file_path) url = (await admin.storage.from("files").createSignedUrl(f.file_path, 3600)).data?.signedUrl ?? null;
      const history = await Promise.all((((f as Any).history as Any[]) ?? []).map(async (h) => {
        let hurl: string | null = null;
        if (h?.path && (h.path.startsWith("http") || h.path.startsWith("data:"))) hurl = h.path;
        else if (h?.path) hurl = (await admin.storage.from("files").createSignedUrl(h.path, 3600)).data?.signedUrl ?? null;
        return { ...h, url: hurl };
      }));
      return { ...f, url, history };
    }));
    const fixtureRows = await Promise.all((fixtures.data ?? []).map(async (fx) => {
      const graphics = await Promise.all((((fx as Any).graphics as Any[]) ?? []).map(async (g: Any) => {
        if (!g?.path) return g;
        const u: string | null = String(g.path).startsWith("http") ? g.path : (await admin.storage.from("files").createSignedUrl(g.path, 3600)).data?.signedUrl ?? null;
        return { ...g, url: u };
      }));
      return { ...fx, graphics };
    }));
    return {
      client: { id: cid, name: client.name, company: client.company, portal_type: client.portal_type, home_kit: client.home_kit, away_kit: client.away_kit, monthly_fee: client.monthly_fee, notes: client.notes, portal_prefs: (client as Any).portal_prefs ?? null },
      onboarding: onb.data ?? [],
      projects: projects.data ?? [],
      deliverables,
      invoices: invoices.data ?? [],
      proposals: proposals.data ?? [],
      fixtures: fixtureRows,
      tasks: tasks.data ?? [],
      activity: activity.data ?? [],
      board,
      time,
      rate: Number(((client as Any).portal_prefs ?? {})?.rate ?? 17),
    };
  });

type Action =
  | { type: "onboarding"; id: string; done: boolean }
  | { type: "proof"; id: string; decision: "approved" | "revision"; feedback?: string }
  | { type: "accept"; id: string; name: string }
  | { type: "uploadUrl"; fileName: string }
  | { type: "recordUpload"; path: string; fileName: string; title?: string; kind?: string }
  | { type: "bookCall"; date: string; time?: string; kind?: string; name?: string; notes?: string }
  | { type: "questionnaire"; answers?: Record<string, string> }
  | { type: "favourite"; id: string; on: boolean }
  | { type: "fixtureSheet"; id: string; text?: string; path?: string; fileName?: string }
  | { type: "newRequest"; title: string; notes?: string }
  | { type: "taskAdd"; title: string }
  | { type: "taskDone"; id: string; done: boolean }
  | { type: "taskDelete"; id: string }
  | { type: "fixtureResult"; id: string; score: string }
  | { type: "clientNote"; text: string }
  | { type: "deleteFile"; id: string }
  | { type: "cardAdd"; title: string; notes?: string; status?: string; actor?: string }
  | { type: "cardEdit"; id: string; title?: string; notes?: string; status?: string; actor?: string }
  | { type: "cardOrder"; status: string; ids: string[] }
  | { type: "cardDelete"; id: string }
  | { type: "timeStart"; note?: string; cardId?: string }
  | { type: "timeStop"; id: string }
  | { type: "timeAdd"; date: string; minutes: number; note?: string; cardId?: string; actor?: string }
  | { type: "timeUpdate"; id: string; minutes: number; note?: string }
  | { type: "timeDelete"; id: string }
  | { type: "timeInvoice" };

export const portalAction = createServerFn({ method: "POST" })
  .inputValidator((d: Access & { action: Action }) => d)
  .handler(async ({ data }) => {
    const { client, admin } = await resolveClient({ token: data.token ?? null });
    const a = data.action;
    const cid = client.id;
    const log = (message: string) => admin.from("activity_log").insert({ client_id: cid, actor: "client", message });
    const now = () => new Date().toISOString();
    const CARD_STATUSES = ["todo", "doing", "done"];
    const fmtMins = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`; };

    if (a.type === "onboarding") {
      const { data: row } = await admin.from("onboarding_items").update({ done: !!a.done, done_at: a.done ? new Date().toISOString() : null }).eq("id", a.id).eq("client_id", cid).select("title").maybeSingle();
      if (row && a.done) await log(`Completed onboarding step: ${row.title}`);
      return { ok: true };
    }
    if (a.type === "proof") {
      if (a.decision !== "approved" && a.decision !== "revision") throw new Error("Invalid decision");
      if (a.decision === "revision" && !a.feedback?.trim()) throw new Error("Please tell us what to change.");
      const { data: row } = await admin.from("deliverables").update({ status: a.decision, feedback: a.feedback?.slice(0, 4000) ?? null }).eq("id", a.id).eq("client_id", cid).eq("kind", "proof").select("title").maybeSingle();
      if (!row) throw new Error("Proof not found");
      await log(a.decision === "approved" ? `Approved proof: ${row.title}` : `Requested revisions on: ${row.title}`);
      return { ok: true };
    }
    if (a.type === "accept") {
      const name = a.name?.trim();
      if (!name) throw new Error("Please type your full name to accept.");
      const { data: row } = await admin.from("proposals").update({ status: "accepted", accepted_name: name.slice(0, 200), accepted_at: new Date().toISOString() }).eq("id", a.id).eq("client_id", cid).eq("status", "sent").select("title, kind").maybeSingle();
      if (!row) throw new Error("This document can no longer be accepted.");
      await log(`Accepted ${row.kind}: ${row.title} (signed ${name})`);
      return { ok: true };
    }
    if (a.type === "uploadUrl") {
      const path = `${cid}/client-${crypto.randomUUID()}-${String(a.fileName).replace(/[^\w.-]+/g, "_").slice(0, 120)}`;
      const { data: up, error } = await admin.storage.from("files").createSignedUploadUrl(path);
      if (error || !up) throw new Error("Upload could not start");
      return { path, uploadToken: up.token };
    }
    if (a.type === "recordUpload") {
      if (!a.path.startsWith(`${cid}/client-`)) throw new Error("Invalid upload");
      const kind = ["resource", "photo"].includes(String(a.kind)) ? String(a.kind) : "upload";
      await admin.from("deliverables").insert({ client_id: cid, kind, title: (a.title || a.fileName).slice(0, 200), file_path: a.path, file_name: a.fileName.slice(0, 200), status: "shared", uploaded_by: "client", week_of: new Date().toISOString().slice(0, 10) });
      await log(`Uploaded ${kind === "resource" ? "resource photo" : "file"}: ${a.title || a.fileName}`);
      return { ok: true };
    }
    if (a.type === "bookCall") {
      if (!a.date) throw new Error("Pick a date for the call.");
      const kind = a.kind === "review" ? "design review" : "discovery call";
      const when = `${a.date}${a.time ? ` at ${a.time}` : ""}`;
      await admin.from("tasks").insert({
        client_id: cid,
        title: `Call request: ${kind} · ${when}`,
        notes: `Requested by ${(a.name || "client").slice(0, 120)}. Preferred time: ${when}.${a.notes ? ` Notes: ${String(a.notes).slice(0, 1500)}` : ""}`,
        priority: "medium",
        status: "todo",
        due_date: a.date,
      });
      await log(`Requested a ${kind} for ${when}`);
      return { ok: true };
    }
    if (a.type === "questionnaire") {
      const lines = Object.entries(a.answers ?? {}).filter(([, v]) => String(v ?? "").trim()).map(([k, v]) => `${k}: ${String(v).trim().slice(0, 600)}`);
      if (lines.length === 0) throw new Error("Please fill in at least one answer.");
      await admin.from("tasks").insert({
        client_id: cid,
        title: "Client questionnaire submitted",
        notes: lines.join("\n").slice(0, 4000),
        priority: "low",
        status: "todo",
      });
      await log("Submitted their brand questionnaire");
      return { ok: true };
    }
    if (a.type === "favourite") {
      const { data: cur } = await admin.from("clients").select("portal_prefs").eq("id", cid).maybeSingle();
      const prefs = (cur?.portal_prefs ?? {}) as Any;
      const list = new Set<string>(Array.isArray(prefs.favourites) ? prefs.favourites : []);
      if (a.on) list.add(a.id); else list.delete(a.id);
      const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, favourites: [...list] } }).eq("id", cid);
      if (error) throw new Error("Favourites aren't ready yet · please check back soon.");
      return { ok: true };
    }
    if (a.type === "fixtureSheet") {
      const { data: fx } = await admin.from("sports_fixtures").select("id, match_date, graphics").eq("id", a.id).eq("client_id", cid).maybeSingle();
      if (!fx) throw new Error("Fixture not found");
      const gfx = Array.isArray(fx.graphics) ? [...(fx.graphics as Any[])] : [];
      const hasText = !!a.text?.trim();
      const hasFile = !!a.path;
      if (!hasText && !hasFile) throw new Error("Add some info or a file first.");
      const entry: Any = { name: "Team sheet", done: true };
      if (hasText) entry.text = a.text!.slice(0, 4000);
      if (hasFile) {
        if (!a.path!.startsWith(`${cid}/client-`)) throw new Error("Invalid upload");
        entry.path = a.path;
        entry.fileName = (a.fileName || "team-sheet").slice(0, 200);
      }
      const idx = gfx.findIndex((x: Any) => x && x.name === "Team sheet");
      if (idx >= 0) gfx[idx] = { ...gfx[idx], ...entry }; else gfx.push(entry);
      const { error } = await admin.from("sports_fixtures").update({ graphics: gfx }).eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not save the team sheet.");
      await log(`Sent team sheet info for the fixture on ${fx.match_date}`);
      return { ok: true };
    }
    if (a.type === "newRequest") {
      const { error } = await admin.from("tasks").insert({ client_id: cid, title: a.title.slice(0, 200), notes: (a.notes ? a.notes.slice(0, 2000) + " · " : "") + "Requested via portal", status: "open", priority: "normal" });
      if (error) throw new Error("Could not send the request.");
      await log(`New graphic request: ${a.title.slice(0, 80)}`);
      return { ok: true };
    }
    if (a.type === "taskAdd") {
      const { error } = await admin.from("tasks").insert({ client_id: cid, title: a.title.slice(0, 200), status: "open", priority: "normal" });
      if (error) throw new Error("Could not add the item.");
      await log(`Client added to-do item: ${a.title.slice(0, 80)}`);
      return { ok: true };
    }
    if (a.type === "taskDone") {
      const { error } = await admin.from("tasks").update({ status: a.done ? "done" : "open" }).eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not update the item.");
      return { ok: true };
    }
    if (a.type === "taskDelete") {
      const { error } = await admin.from("tasks").delete().eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not remove the item.");
      await log(`Client removed a to-do item`);
      return { ok: true };
    }
    if (a.type === "fixtureResult") {
      const score = (a.score || "").trim().slice(0, 40);
      if (!score) throw new Error("Type the score first.");
      const { data: fx } = await admin.from("sports_fixtures").select("id, match_date, graphics").eq("id", a.id).eq("client_id", cid).maybeSingle();
      if (!fx) throw new Error("Fixture not found");
      const gfx = Array.isArray(fx.graphics) ? (fx.graphics as Any[]).filter((x: Any) => x && x.name !== "Result") : [];
      gfx.push({ name: "Result", done: true, text: score });
      const { error } = await admin.from("sports_fixtures").update({ graphics: gfx }).eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not save the score.");
      await log(`Submitted the score (${score}) for the fixture on ${fx.match_date}`);
      return { ok: true };
    }
    if (a.type === "clientNote") {
      const { error } = await admin.from("clients").update({ notes: (a.text || "").slice(0, 5000) }).eq("id", cid);
      if (error) throw new Error("Could not save the notes.");
      await log(`Client updated the notes`);
      return { ok: true };
    }
    if (a.type === "deleteFile") {
      const { data: row } = await admin.from("deliverables").delete().eq("id", a.id).eq("client_id", cid).select("title").maybeSingle();
      if (!row) throw new Error("File not found.");
      await log(`Client deleted file: ${row.title}`);
      return { ok: true };
    }
    if (a.type === "cardAdd") {
      const title = String(a.title ?? "").trim();
      if (!title) throw new Error("Give the task a title first.");
      const status = CARD_STATUSES.includes(String(a.status)) ? String(a.status) : "todo";
      const { data: last } = await admin.from("board_cards").select("position").eq("client_id", cid).eq("status", status).order("position", { ascending: false }).limit(1);
      const by = a.actor === "Natalie" ? "Natalie" : "Sara";
      const { error } = await admin.from("board_cards").insert({ client_id: cid, title: title.slice(0, 200), notes: a.notes ? String(a.notes).slice(0, 2000) : null, status, position: (Number((last as Any)?.[0]?.position) || 0) + 10, created_by: by });
      if (error) throw new Error("The task board isn't ready yet · please check back soon.");
      await admin.from("activity_log").insert({ client_id: cid, actor: by === "Natalie" ? "Natalie" : "client", message: `added a task: ${title.slice(0, 90)}` });
      return { ok: true };
    }
    if (a.type === "cardEdit") {
      const patch: Any = { updated_at: now() };
      if (typeof a.title === "string") { if (!a.title.trim()) throw new Error("The title can't be empty."); patch.title = a.title.trim().slice(0, 200); }
      if (typeof a.notes === "string") patch.notes = a.notes.slice(0, 2000) || null;
      if (a.status) {
        if (!CARD_STATUSES.includes(String(a.status))) throw new Error("Unknown column.");
        patch.status = String(a.status);
        const { data: last } = await admin.from("board_cards").select("position").eq("client_id", cid).eq("status", patch.status).neq("id", a.id).order("position", { ascending: false }).limit(1);
        patch.position = (Number((last as Any)?.[0]?.position) || 0) + 10;
      }
      const { data: row } = await admin.from("board_cards").update(patch).eq("id", a.id).eq("client_id", cid).select("title,status").maybeSingle();
      if (!row) throw new Error("Task not found.");
      if (a.status) await admin.from("activity_log").insert({ client_id: cid, actor: a.actor === "Natalie" ? "Natalie" : "client", message: `moved "${String(row.title).slice(0, 60)}" to ${row.status === "todo" ? "To Do" : row.status === "doing" ? "In Progress" : "Done"}` });
      return { ok: true };
    }
    if (a.type === "cardOrder") {
      if (!CARD_STATUSES.includes(String(a.status))) throw new Error("Unknown column.");
      const ids = Array.isArray(a.ids) ? a.ids.map(String).slice(0, 200) : [];
      for (let i = 0; i < ids.length; i++) {
        await admin.from("board_cards").update({ position: (i + 1) * 10, status: String(a.status), updated_at: now() }).eq("id", ids[i]).eq("client_id", cid);
      }
      return { ok: true };
    }
    if (a.type === "cardDelete") {
      const { data: row } = await admin.from("board_cards").delete().eq("id", a.id).eq("client_id", cid).select("title").maybeSingle();
      if (!row) throw new Error("Task not found.");
      await admin.from("activity_log").insert({ client_id: cid, actor: a.actor === "Natalie" ? "Natalie" : "client", message: `removed a task` });
      return { ok: true };
    }
    if (a.type === "timeStart") {
      const { data: runningList } = await admin.from("time_entries").select("id, started_at").eq("client_id", cid).is("ended_at", null).limit(1);
      const running = (runningList as Any)?.[0];
      if (running) {
        const ended = now();
        const mins = Math.max(1, Math.round((Date.parse(ended) - Date.parse(running.started_at)) / 60000));
        await admin.from("time_entries").update({ ended_at: ended, minutes: mins }).eq("id", running.id);
      }
      const { data: row, error } = await admin.from("time_entries").insert({ client_id: cid, card_id: a.cardId || null, started_at: now(), note: a.note ? String(a.note).slice(0, 300) : null, created_by: "Natalie" }).select("id").single();
      if (error || !row) throw new Error("Time tracking isn't ready yet · please check back soon.");
      await admin.from("activity_log").insert({ client_id: cid, actor: "Natalie", message: `started a work timer` });
      return { ok: true, id: row.id };
    }
    if (a.type === "timeStop") {
      const { data: row } = await admin.from("time_entries").select("id, started_at").eq("id", a.id).eq("client_id", cid).is("ended_at", null).maybeSingle();
      if (!row) throw new Error("That timer isn't running.");
      const ended = now();
      const mins = Math.max(1, Math.round((Date.parse(ended) - Date.parse((row as Any).started_at)) / 60000));
      await admin.from("time_entries").update({ ended_at: ended, minutes: mins }).eq("id", a.id).eq("client_id", cid);
      await admin.from("activity_log").insert({ client_id: cid, actor: "Natalie", message: `logged ${fmtMins(mins)} of work` });
      return { ok: true, minutes: mins };
    }
    if (a.type === "timeAdd") {
      const mins = Math.round(Number(a.minutes));
      if (!mins || mins <= 0) throw new Error("Enter how long you worked.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) throw new Error("Pick a date.");
      const { error } = await admin.from("time_entries").insert({ client_id: cid, card_id: a.cardId || null, started_at: `${a.date}T09:00:00Z`, ended_at: `${a.date}T09:00:00Z`, minutes: mins, note: a.note ? String(a.note).slice(0, 300) : null, created_by: a.actor === "Natalie" ? "Natalie" : "Sara" });
      if (error) throw new Error("Time tracking isn't ready yet · please check back soon.");
      await admin.from("activity_log").insert({ client_id: cid, actor: a.actor === "Natalie" ? "Natalie" : "client", message: `logged ${fmtMins(mins)} on ${a.date}` });
      return { ok: true };
    }
    if (a.type === "timeUpdate") {
      const mins = Math.round(Number(a.minutes));
      if (!mins || mins <= 0) throw new Error("Enter the minutes worked.");
      const { error } = await admin.from("time_entries").update({ minutes: mins, note: a.note ? String(a.note).slice(0, 300) : null }).eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not update the entry.");
      return { ok: true };
    }
    if (a.type === "timeDelete") {
      const { error } = await admin.from("time_entries").delete().eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not remove the entry.");
      return { ok: true };
    }
    if (a.type === "timeInvoice") {
      const { data: rows } = await admin.from("time_entries").select("id, started_at, created_at, minutes, note").eq("client_id", cid).eq("billed", false).order("created_at");
      const open = ((rows as Any[]) ?? []).filter((e) => Number(e.minutes) > 0);
      if (open.length === 0) throw new Error("No unbilled hours to invoice.");
      const prefs = ((client as Any).portal_prefs ?? {}) as Any;
      const rate = Number(prefs.rate ?? 17);
      const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });
      const byDay = new Map<string, { mins: number; notes: string[] }>();
      for (const e of open) {
        const iso = e.started_at ?? e.created_at;
        const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(iso));
        const g = byDay.get(key) ?? { mins: 0, notes: [] };
        g.mins += Number(e.minutes);
        if (e.note && !g.notes.includes(e.note)) g.notes.push(e.note);
        byDay.set(key, g);
      }
      const items: LineItem[] = [...byDay.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([key, g]) => ({
        description: `Design & admin support · ${dayFmt.format(new Date(key + "T12:00:00Z"))}${g.notes.length ? ` · ${g.notes.join("; ").slice(0, 180)}` : ""}`,
        quantity: Math.round((g.mins / 60) * 100) / 100,
        rate,
      }));
      const totalHours = Math.round(open.reduce((s, e) => s + Number(e.minutes), 0) / 60 * 100) / 100;
      const year = new Date().getFullYear();
      const { data: nums } = await admin.from("invoices").select("number").like("number", `N3-${year}-%`);
      let maxN = 0;
      for (const r of (nums as Any[]) ?? []) { const m = /^N3-\d{4}-(\d+)$/.exec(String(r.number ?? "")); if (m) maxN = Math.max(maxN, parseInt(m[1], 10)); }
      const number = `N3-${year}-${String(maxN + 1).padStart(3, "0")}`;
      const today = new Date().toISOString().slice(0, 10);
      const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const { data: inv, error } = await admin.from("invoices").insert({ client_id: cid, number, issue_date: today, due_date: due, status: "draft", items, tax_rate: 0, notes: `Generated from ${totalHours} logged hours at £${rate}/hour` }).select("id,number").single();
      if (error || !inv) throw new Error("Could not create the invoice · please try again.");
      await admin.from("time_entries").update({ billed: true, invoice_id: (inv as Any).id }).eq("client_id", cid).eq("billed", false);
      await admin.from("activity_log").insert({ client_id: cid, actor: "Natalie", message: `created invoice ${number} (${fmtMins(Math.round(totalHours * 60))})` });
      return { ok: true, number };
    }
    throw new Error("Unknown action");
  });

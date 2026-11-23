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
      admin.from("invoices").select("id, number, issue_date, due_date, status, items, tax_rate, notes, paid_at").eq("client_id", cid).order("issue_date", { ascending: false }),
      admin.from("proposals").select("id, kind, title, body, items, status, accepted_name, accepted_at, created_at").eq("client_id", cid).neq("status", "draft").order("created_at", { ascending: false }),
      admin.from("sports_fixtures").select("*").eq("client_id", cid).order("match_date"),
      admin.from("tasks").select("id, title, notes, status, priority, due_date").eq("client_id", cid).order("created_at"),
      admin.from("activity_log").select("id, message, actor, created_at").eq("client_id", cid).order("created_at", { ascending: false }).limit(15),
      grab(admin.from("board_cards").select("*").eq("client_id", cid).order("position").order("created_at")),
      grab(admin.from("time_entries").select("*").eq("client_id", cid).order("created_at", { ascending: false })),
    ]);
    const deliverables = await Promise.all((files.data ?? []).map(async (f) => {
      const isData = typeof f.file_path === "string" && f.file_path.startsWith("data:");
      let url: string | null = null;
      if (!isData && f.file_path && f.file_path.startsWith("http")) url = f.file_path;
      else if (!isData && f.file_path) url = (await admin.storage.from("files").createSignedUrl(f.file_path, 3600)).data?.signedUrl ?? null;
      const history = await Promise.all((((f as Any).history as Any[]) ?? []).map(async (h) => {
        const hData = typeof h?.path === "string" && h.path.startsWith("data:");
        let hurl: string | null = null;
        if (!hData && h?.path && h.path.startsWith("http")) hurl = h.path;
        else if (!hData && h?.path) hurl = (await admin.storage.from("files").createSignedUrl(h.path, 3600)).data?.signedUrl ?? null;
        return { ...h, path: hData ? null : h?.path, url: hurl };
      }));
      const { file_path: _stripped, ...rest } = f;
      return { ...rest, file_path: isData ? null : f.file_path, has_data: isData, url, history };
    }));
    const fixtureRows = await Promise.all((fixtures.data ?? []).map(async (fx) => {
      const graphics = await Promise.all((((fx as Any).graphics as Any[]) ?? []).map(async (g: Any) => {
        if (!g?.path) return g;
        const u: string | null = String(g.path).startsWith("http") ? g.path : (await admin.storage.from("files").createSignedUrl(g.path, 3600)).data?.signedUrl ?? null;
        return { ...g, url: u };
      }));
      return { ...fx, graphics };
    }));
    const boardSlim = ((board as Any[]) ?? []).map((c: Any) => ({
      ...c,
      files: Array.isArray(c.files) ? c.files.map((x: Any) => ({ name: String(x?.name ?? "file").slice(0, 200) })) : [],
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
      board: boardSlim,
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
  | { type: "cardAdd"; title: string; notes?: string; status?: string; actor?: string; important?: boolean; due_date?: string }
  | { type: "cardFiles"; id: string; files: { name: string; dataUri: string }[]; actor?: string }
  | { type: "cardEdit"; id: string; title?: string; notes?: string; status?: string; actor?: string; important?: boolean; due_date?: string | null }
  | { type: "cardOrder"; status: string; ids: string[] }
  | { type: "cardDelete"; id: string }
  | { type: "noteAdd"; text: string }
  | { type: "noteDelete"; id: string }
  | { type: "mileageAdd"; driver: string; date: string; description: string; miles: number }
  | { type: "mileageDelete"; id: string }
  | { type: "mileageCalc"; from: string; to: string }
  | { type: "timeStart"; note?: string; cardId?: string }
  | { type: "timeStop"; id: string }
  | { type: "timeAdd"; date: string; minutes: number; note?: string; cardId?: string; actor?: string }
  | { type: "timeUpdate"; id: string; minutes: number; note?: string }
  | { type: "timeDelete"; id: string }
  | { type: "timeInvoice"; entryIds?: string[]; tasks?: { id: string; title: string; notes?: string | null; rate: number }[] }
  | { type: "uploadInvoice"; fileName: string; title?: string; dataUri: string }
  | { type: "fileGet"; id: string }
  | { type: "cardFilesGet"; id: string }
  | { type: "availabilitySave"; week: string; days: { day: string; available: boolean; note?: string }[]; notes?: string }
  | { type: "caseAdd"; title: string; info?: string; assigned?: string }
  | { type: "caseUpdate"; id: string; title?: string; info?: string; assigned?: string }
  | { type: "caseDelete"; id: string }
  | { type: "caseSave"; id: string; key: string; content: string }
  | { type: "caseCheck"; id: string; key: string; done: boolean; na?: boolean }
  | { type: "caseMald"; id: string; item: number; who: string; colour?: string; notes?: string }
  | { type: "caseMaldChildRemove"; id: string; idx: number }
  | { type: "caseFormK"; id: string; item: string; done: boolean; date?: string }
  | { type: "notifSeen" }
  | { type: "caseNoteAdd"; id: string; text: string }
  | { type: "caseNoteDelete"; id: string; noteId: string }
  | { type: "caseLogAdd"; id: string; date: string; hours: number; note?: string }
  | { type: "caseLogDelete"; id: string; logId: string }
  | { type: "caseQaFiles"; id: string; slot: "interim" | "final"; kind: "report" | "amend"; files: { name: string; dataUri: string }[]; actor?: string }
  | { type: "caseQaFileDelete"; id: string; slot: "interim" | "final"; kind: "report" | "amend"; fileId: string }
  | { type: "natNoteAdd"; text: string }
  | { type: "natNoteDelete"; id: string }
  | { type: "mileageDoc"; dataUri: string; fileName: string };

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
    if (a.type === "fileGet") {
      const { data: f } = await admin.from("deliverables").select("file_path").eq("id", a.id).eq("client_id", cid).maybeSingle();
      if (!f || !(f as Any).file_path) throw new Error("File not found");
      const p = String((f as Any).file_path);
      if (p.startsWith("data:") || p.startsWith("http")) return { href: p };
      const s = await admin.storage.from("files").createSignedUrl(p, 600);
      return { href: s.data?.signedUrl ?? null };
    }
    if (a.type === "cardFilesGet") {
      const { data: c } = await admin.from("board_cards").select("files").eq("id", a.id).eq("client_id", cid).maybeSingle();
      return { files: Array.isArray((c as Any)?.files) ? (c as Any).files : [] };
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
      const payload: Any = { client_id: cid, title: title.slice(0, 200), notes: a.notes ? String(a.notes).slice(0, 2000) : null, status, position: (Number((last as Any)?.[0]?.position) || 0) + 10, created_by: by };
      if (a.important === true) payload.important = true;
      if (typeof a.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date)) payload.due_date = a.due_date;
      let inserted = await admin.from("board_cards").insert(payload).select("id").single();
      if (inserted.error && payload.important) { delete payload.important; inserted = await admin.from("board_cards").insert(payload).select("id").single(); }
      if (inserted.error && payload.due_date) { delete payload.due_date; inserted = await admin.from("board_cards").insert(payload).select("id").single(); }
      if (inserted.error && payload.important) { delete payload.important; inserted = await admin.from("board_cards").insert(payload).select("id").single(); }
      const { data: card, error } = inserted;
      if (error || !card) throw new Error("The task board isn't ready yet · please check back soon.");
      await admin.from("activity_log").insert({ client_id: cid, actor: by === "Natalie" ? "Natalie" : "client", message: `added ${a.important ? "an URGENT task" : "a task"}: ${title.slice(0, 90)}` });
      return { ok: true, id: card.id };
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
      if (typeof a.important === "boolean") patch.important = a.important;
      if (a.due_date === null) patch.due_date = null;
      else if (typeof a.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date)) patch.due_date = a.due_date;
      const doUpdate = (p: Any) => admin.from("board_cards").update(p).eq("id", a.id).eq("client_id", cid).select("title,status").maybeSingle();
      let res = await doUpdate(patch);
      if (res.error && typeof a.important === "boolean") { const p2 = { ...patch }; delete p2.important; res = await doUpdate(p2); }
      if (res.error && "due_date" in patch) { const p3 = { ...patch }; delete p3.due_date; res = await doUpdate(p3); }
      const { data: row } = res;
      if (!row) throw new Error("Task not found.");
      if (a.status) await admin.from("activity_log").insert({ client_id: cid, actor: a.actor === "Natalie" ? "Natalie" : "client", message: `moved "${String(row.title).slice(0, 60)}" to ${row.status === "todo" ? "To Do" : row.status === "doing" ? "In Progress" : "Done"}` });
      return { ok: true };
    }
    if (a.type === "cardFiles") {
      const files = Array.isArray(a.files) ? a.files.slice(0, 3) : [];
      const clean = files.map((f: Any) => ({ name: String(f?.name ?? "file").slice(0, 200), dataUri: String(f?.dataUri ?? "") })).filter((f: Any) => f.dataUri.startsWith("data:"));
      if (!clean.length) return { ok: true };
      if (clean.some((f: Any) => f.dataUri.length > 6_200_000)) throw new Error("A file is too large · keep attachments under about 4 MB.");
      const { data: row } = await admin.from("board_cards").select("title,files").eq("id", a.id).eq("client_id", cid).maybeSingle();
      if (!row) throw new Error("Task not found.");
      const merged = [...(Array.isArray((row as Any).files) ? (row as Any).files : []), ...clean].slice(0, 3);
      const { error } = await admin.from("board_cards").update({ files: merged }).eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Couldn't attach the file(s) · check the file sizes and try again.");
      await admin.from("activity_log").insert({ client_id: cid, actor: a.actor === "Natalie" ? "Natalie" : "client", message: `attached a file to task: ${String((row as Any).title ?? "").slice(0, 80)}` });
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
      const allOpen = ((rows as Any[]) ?? []).filter((e) => Number(e.minutes) > 0);
      const open = Array.isArray(a.entryIds) && a.entryIds.length ? allOpen.filter((e) => a.entryIds.includes(e.id)) : allOpen;
      const taskLines: LineItem[] = Array.isArray(a.tasks) ? a.tasks.slice(0, 40).map((t: Any) => ({
        description: `${String(t.title ?? "Task").slice(0, 200)}${t.notes ? ` · ${String(t.notes).slice(0, 140)}` : ""}`,
        quantity: 1,
        rate: Number(t.rate) || 0,
      })) : [];
      if (open.length === 0 && taskLines.length === 0) throw new Error("Nothing selected · tick at least one day or task.");
      const prefs = ((client as Any).portal_prefs ?? {}) as Any;
      const rate = Number(prefs.rate ?? 17);
      const periods: Any[] = (Array.isArray(prefs.rate_periods) ? prefs.rate_periods : []).slice(0, 50);
      const rateFor = (e: Any) => {
        const day = String(e?.started_at ?? e?.created_at ?? "").slice(0, 10);
        let r = 17;
        for (const p of periods) { const from = String(p?.from ?? ""); if (from && from <= day) r = Number(p.rate) || r; }
        return r;
      };
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
      const dayItems: LineItem[] = [...byDay.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([key, g]) => {
        const dayEntries = open.filter((e) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(e.started_at ?? e.created_at)) === key);
        const amount = dayEntries.reduce((sum, e) => sum + (Number(e.minutes) / 60) * rateFor(e), 0);
        const hours = Math.round((g.mins / 60) * 100) / 100;
        return {
          description: `Design & admin support · ${dayFmt.format(new Date(key + "T12:00:00Z"))}${g.notes.length ? ` · ${g.notes.join("; ").slice(0, 180)}` : ""}`,
          quantity: hours,
          rate: hours > 0 ? Math.round((amount / hours) * 100) / 100 : rate,
        };
      });
      const items: LineItem[] = [...dayItems, ...taskLines];
      if (items.length === 0) throw new Error("Nothing selected · tick at least one day or task.");
      const totalHours = Math.round(open.reduce((s, e) => s + Number(e.minutes), 0) / 60 * 100) / 100;
      const year = new Date().getFullYear();
      const { data: nums } = await admin.from("invoices").select("number").like("number", `N3-${year}-%`);
      let maxN = 0;
      for (const r of (nums as Any[]) ?? []) { const m = /^N3-\d{4}-(\d+)$/.exec(String(r.number ?? "")); if (m) maxN = Math.max(maxN, parseInt(m[1], 10)); }
      const number = `N3-${year}-${String(maxN + 1).padStart(3, "0")}`;
      const today = new Date().toISOString().slice(0, 10);
      const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const usedRates = [...new Set(open.map((e) => rateFor(e)))].sort((x, y) => x - y);
      const rateLabel = usedRates.length === 1 ? `at £${usedRates[0]}/hour` : `at mixed hourly rates (£${usedRates.join("/hr + £")}/hr)`;
      const draftNotes = `Generated from ${totalHours} logged hours ${rateLabel}` + (taskLines.length ? ` + ${taskLines.length} board ${taskLines.length === 1 ? "task" : "tasks"}` : "");
      const { data: inv, error } = await admin.from("invoices").insert({ client_id: cid, number, issue_date: today, due_date: due, status: "draft", items, tax_rate: 0, notes: draftNotes }).select("id,number").single();
      if (error || !inv) throw new Error("Could not create the invoice · please try again.");
      if (open.length) await admin.from("time_entries").update({ billed: true, invoice_id: (inv as Any).id }).in("id", open.map((e) => e.id));
      if (Array.isArray(a.tasks) && a.tasks.length) {
        const r2 = await admin.from("board_cards").update({ invoiced: true }).in("id", a.tasks.map((t: Any) => t.id));
        if (r2?.error) { /* invoiced column may not exist yet · task flags stay manual */ }
      }
      await admin.from("activity_log").insert({ client_id: cid, actor: "Natalie", message: `created invoice ${number} (${fmtMins(Math.round(totalHours * 60))}${taskLines.length ? ` + ${taskLines.length} task${taskLines.length === 1 ? "" : "s"}` : ""})` });
      return { ok: true, number, id: (inv as Any).id };
    }
    if (a.type === "invoiceUpdate") {
      const items = Array.isArray(a.items) ? a.items.slice(0, 60).map((it: Any) => ({ description: String(it.description ?? "").slice(0, 300), quantity: Number(it.quantity) || 0, rate: Number(it.rate) || 0 })) : [];
      const patch: Any = { items, tax_rate: Number(a.tax_rate) || 0, notes: String(a.notes ?? "").slice(0, 2000) || null };
      if (a.number) patch.number = String(a.number).slice(0, 40);
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(a.issue_date ?? ""))) patch.issue_date = a.issue_date;
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(a.due_date ?? ""))) patch.due_date = a.due_date;
      if (a.status === "draft" || a.status === "sent" || a.status === "paid") patch.status = a.status;
      if (a.status === "paid") patch.paid_at = new Date().toISOString().slice(0, 10);
      const { error } = await admin.from("invoices").update(patch).eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not save the invoice · please try again.");
      return { ok: true };
    }
    if (a.type === "invoiceSend") {
      const { data: inv } = await admin.from("invoices").select("id, number, status").eq("id", a.id).eq("client_id", cid).maybeSingle();
      if (!inv) throw new Error("Invoice not found.");
      if ((inv as Any).status !== "draft") throw new Error("Only drafts can be sent.");
      const { error } = await admin.from("invoices").update({ status: "sent" }).eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not send the invoice.");
      await admin.from("activity_log").insert({ client_id: cid, actor: "Natalie", message: `sent invoice ${(inv as Any).number} to Sara` });
      return { ok: true, number: (inv as Any).number };
    }
    if (a.type === "invoiceDelete") {
      const { data: inv } = await admin.from("invoices").select("id, number, status").eq("id", a.id).eq("client_id", cid).maybeSingle();
      if (!inv) throw new Error("Invoice not found.");
      if ((inv as Any).status !== "draft") throw new Error("Only drafts can be deleted.");
      await admin.from("time_entries").update({ billed: false, invoice_id: null }).eq("invoice_id", a.id);
      const { error } = await admin.from("invoices").delete().eq("id", a.id).eq("client_id", cid);
      if (error) throw new Error("Could not delete the draft.");
      await admin.from("activity_log").insert({ client_id: cid, actor: "Natalie", message: `deleted draft invoice ${(inv as Any).number} · hours back in unbilled` });
      return { ok: true };
    }
    if (a.type === "uploadInvoice") {
      if (!String(a.dataUri ?? "").startsWith("data:application/pdf")) throw new Error("Please upload a PDF file.");
      if (String(a.dataUri).length > 6_500_000) throw new Error("That PDF is too large · please keep it under about 4 MB.");
      const title = String(a.title || a.fileName || "Invoice").slice(0, 200);
      const { error } = await admin.from("deliverables").insert({ client_id: cid, kind: "invoice", title, file_path: a.dataUri, file_name: String(a.fileName || "invoice.pdf").slice(0, 200), status: "shared", uploaded_by: "Natalie", week_of: now().slice(0, 10) });
      if (error) throw new Error("Could not save the invoice · please try again.");
      await admin.from("activity_log").insert({ client_id: cid, actor: "Natalie", message: `shared invoice: ${title.slice(0, 80)}` });
      return { ok: true };
    }
    if (a.type === "notifSeen") {
      const prefs = ((client as Any).portal_prefs ?? {}) as Any;
      prefs.notif_seen = now();
      const { error } = await admin.from("clients").update({ portal_prefs: prefs }).eq("id", cid);
      if (error) throw new Error("Could not update notifications · please try again.");
      return { ok: true };
    }
    if (a.type === "availabilitySave") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.week))) throw new Error("Pick a week first.");
      const prefs = ((client as Any).portal_prefs ?? {}) as Any;
      prefs.availability = {
        week_start: a.week,
        days: Array.isArray(a.days) ? a.days.slice(0, 7) : [],
        notes: String(a.notes ?? "").slice(0, 1000),
        submitted_at: now(),
      };
      const { error } = await admin.from("clients").update({ portal_prefs: prefs }).eq("id", cid);
      if (error) throw new Error("Could not save availability · please try again.");
      await admin.from("activity_log").insert({ client_id: cid, actor: "Natalie", message: `shared availability for w/c ${a.week}` });
      return { ok: true };
    }
    if (a.type === "noteAdd") {
      const text = String(a.text ?? "").trim();
      if (!text) throw new Error("Write something first.");
      const { data: cur } = await admin.from("clients").select("portal_prefs").eq("id", cid).maybeSingle();
      const prefs = (cur?.portal_prefs ?? {}) as Any;
      const list = Array.isArray(prefs.sara_notes) ? prefs.sara_notes : [];
      const item = { id: crypto.randomUUID(), text: text.slice(0, 2000), at: now() };
      const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, sara_notes: [item, ...list].slice(0, 200) } }).eq("id", cid);
      if (error) throw new Error("Notes aren't ready yet · please check back soon.");
      return { ok: true };
    }
    if (a.type === "noteDelete") {
      const { data: cur } = await admin.from("clients").select("portal_prefs").eq("id", cid).maybeSingle();
      const prefs = (cur?.portal_prefs ?? {}) as Any;
      const list = (Array.isArray(prefs.sara_notes) ? prefs.sara_notes : []).filter((n: Any) => n?.id !== a.id);
      const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, sara_notes: list } }).eq("id", cid);
      if (error) throw new Error("Could not delete that note · please try again.");
      return { ok: true };
    }
    if (a.type === "natNoteAdd") {
      const text = String(a.text ?? "").trim();
      if (!text) throw new Error("Write something first.");
      const { data: cur } = await admin.from("clients").select("portal_prefs").eq("id", cid).maybeSingle();
      const prefs = (cur?.portal_prefs ?? {}) as Any;
      const list = Array.isArray(prefs.nat_notes) ? prefs.nat_notes : [];
      const item = { id: crypto.randomUUID(), text: text.slice(0, 2000), at: now() };
      const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, nat_notes: [item, ...list].slice(0, 200) } }).eq("id", cid);
      if (error) throw new Error("Notes aren't ready yet · please check back soon.");
      return { ok: true };
    }
    if (a.type === "natNoteDelete") {
      const { data: cur } = await admin.from("clients").select("portal_prefs").eq("id", cid).maybeSingle();
      const prefs = (cur?.portal_prefs ?? {}) as Any;
      const list = (Array.isArray(prefs.nat_notes) ? prefs.nat_notes : []).filter((n: Any) => n?.id !== a.id);
      const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, nat_notes: list } }).eq("id", cid);
      if (error) throw new Error("Could not delete that note · please try again.");
      return { ok: true };
    }
    if (a.type.startsWith("case")) {
      const { data: cur } = await admin.from("clients").select("portal_prefs").eq("id", cid).maybeSingle();
      const prefs = (cur?.portal_prefs ?? {}) as Any;
      const list = Array.isArray(prefs.cases) ? prefs.cases : [];
      const mutate = async (id: string, fn: (c: Any) => Any | null) => {
        const idx = list.findIndex((x: Any) => x?.id === id);
        if (idx < 0) throw new Error("That case couldn't be found.");
        const item = fn(list[idx]);
        if (!item) list.splice(idx, 1);
        else { item.updated_at = now(); list[idx] = item; }
        const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, cases: list } }).eq("id", cid);
        if (error) throw new Error("Could not save the case · please try again.");
        return { ok: true };
      };
      if (a.type === "caseAdd") {
        const title = String(a.title ?? "").trim().slice(0, 200);
        if (!title) throw new Error("Give the case a title.");
        const item = { id: crypto.randomUUID(), title, info: String(a.info ?? "").slice(0, 4000), assigned: a.assigned === "Jermaine" ? "Jermaine" : "Sara", form_k: !!a.form_k, sections: {} as Any, checks: {} as Any, notes: [] as Any[], log: [] as Any[], created_at: now(), updated_at: now() };
        const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, cases: [item, ...list].slice(0, 100) } }).eq("id", cid);
        if (error) throw new Error("Cases aren't ready yet · please check back soon.");
        await admin.from("activity_log").insert({ client_id: cid, actor: "client", message: `added case: ${title}` });
        return { id: item.id };
      }
      if (a.type === "caseUpdate") return await mutate(String(a.id), (c: Any) => {
        if (a.title != null) c.title = String(a.title).trim().slice(0, 200) || c.title;
        if (a.info != null) c.info = String(a.info).slice(0, 4000);
        if (a.assigned != null) c.assigned = a.assigned === "Jermaine" ? "Jermaine" : "Sara";
        return c;
      });
      if (a.type === "caseDelete") return await mutate(String(a.id), () => null);
      if (a.type === "caseSave") return await mutate(String(a.id), (c: Any) => {
        const key = String(a.key).slice(0, 60);
        if (key === "date_boxes") {
          try { c.date_boxes = JSON.parse(String(a.content ?? "[]")); } catch { c.date_boxes = []; }
          if (!Array.isArray(c.date_boxes)) c.date_boxes = [];
          c.date_boxes = c.date_boxes.slice(0, 10).map((d: Any) => ({ date: String(d?.date ?? "").slice(0, 10), note: String(d?.note ?? "").slice(0, 500) }));
          return c;
        }
        if (key === "filing_date") { c.filing_date = String(a.content ?? "").slice(0, 10); return c; }
        if (key === "people") {
          try { c.people = JSON.parse(String(a.content ?? "[]")); } catch { c.people = []; }
          if (!Array.isArray(c.people)) c.people = [];
          c.people = c.people.slice(0, 12).map((d: Any) => ({ role: d?.role === "adult" ? "adult" : "child", name: String(d?.name ?? "").slice(0, 120), dob: String(d?.dob ?? "").slice(0, 10), address: String(d?.address ?? "").slice(0, 500) }));
          return c;
        }
        if (key === "mald_children") {
          try { c.mald_children = JSON.parse(String(a.content ?? "[]")); } catch { c.mald_children = []; }
          if (!Array.isArray(c.mald_children)) c.mald_children = [];
          c.mald_children = c.mald_children.slice(0, 12).map((n: Any) => String(n ?? "").trim().slice(0, 60)).filter((n: string) => n.length > 0);
          return c;
        }
        if (key === "form_k") { c.form_k = String(a.content ?? "") === "1"; return c; }
        if (key === "travel") {
          try { c.travel = JSON.parse(String(a.content ?? "[]")); } catch { c.travel = []; }
          if (!Array.isArray(c.travel)) c.travel = [];
          c.travel = c.travel.slice(0, 400).map((t: Any) => ({ id: String(t?.id ?? "").slice(0, 40), date: String(t?.date ?? "").slice(0, 10), activity: String(t?.activity ?? "").slice(0, 200), prof: Math.max(0, Math.min(3000, Number(t?.prof) || 0)), travel: Math.max(0, Math.min(3000, Number(t?.travel) || 0)), miles: Math.max(0, Math.min(2000, Number(t?.miles) || 0)), from: String(t?.from ?? "").slice(0, 12).toUpperCase(), to: String(t?.to ?? "").slice(0, 12).toUpperCase(), trip: t?.trip === "return" ? "return" : "single" }));
          return c;
        }
        if (key.startsWith("qa:") && key.endsWith(":date")) {
          c.qa = c.qa ?? {};
          c.qa[key.slice(3)] = String(a.content ?? "").slice(0, 10);
          return c;
        }
        c.sections = c.sections ?? {};
        c.sections[key] = String(a.content ?? "").slice(0, 30000);
        return c;
      });
      if (a.type === "caseCheck") return await mutate(String(a.id), (c: Any) => {
        c.checks = c.checks ?? {};
        c.checks[String(a.key).slice(0, 60)] = a.na ? "na" : !!a.done;
        return c;
      });
      if (a.type === "caseFormK") return await mutate(String(a.id), (c: Any) => {
        c.formk = c.formk ?? {};
        const item = ["dbs", "medical", "refs"].includes(String(a.item)) ? String(a.item) : "dbs";
        c.formk[item] = { done: !!a.done, date: String(a.date ?? "").slice(0, 10) };
        return c;
      });
      if (a.type === "caseMald") return await mutate(String(a.id), (c: Any) => {
        c.mald = c.mald ?? {};
        const rawItem = String(a.item ?? "");
        const i = /^[a-z0-9]{1,8}$/i.test(rawItem) ? rawItem.toLowerCase() : String(Math.max(0, Math.min(200, Number(a.item) || 0)));
        const e = c.mald[i] ?? {};
        const wm = String(a.who ?? "mum");
        const who = wm === "dad" ? "dad" : wm === "all" ? "all" : /^child:\d{1,2}$/.test(wm) ? wm : "mum";
        const slot = (e[who] = e[who] ?? {});
        if (a.colour != null) slot.colour = ["green", "amber", "red", ""].includes(String(a.colour)) ? String(a.colour) : "";
        if (a.notes != null) slot.notes = String(a.notes).slice(0, 5000);
        c.mald[i] = e;
        return c;
      });
      if (a.type === "caseMaldChildRemove") return await mutate(String(a.id), (c: Any) => {
        const idx = Math.max(0, Math.min(11, Number(a.idx) || 0));
        c.mald_children = (Array.isArray(c.mald_children) ? c.mald_children : []).filter((_x: Any, i: number) => i !== idx).map((n: Any) => String(n ?? "").trim().slice(0, 60)).filter((n: string) => n.length > 0);
        c.mald = c.mald ?? {};
        for (const ik of Object.keys(c.mald)) {
          const e = c.mald[ik] ?? {};
          delete e[`child:${idx}`];
          for (let j = idx + 1; j < 12; j++) { if (e[`child:${j}`]) { e[`child:${j - 1}`] = e[`child:${j}`]; } delete e[`child:${j}`]; }
          c.mald[ik] = e;
        }
        return c;
      });
      if (a.type === "caseNoteAdd") {
        const text = String(a.text ?? "").trim();
        if (!text) throw new Error("Write something first.");
        return await mutate(String(a.id), (c: Any) => {
          c.notes = [{ id: crypto.randomUUID(), text: text.slice(0, 4000), at: now() }, ...(Array.isArray(c.notes) ? c.notes : [])].slice(0, 200);
          return c;
        });
      }
      if (a.type === "caseNoteDelete") return await mutate(String(a.id), (c: Any) => {
        c.notes = (Array.isArray(c.notes) ? c.notes : []).filter((n: Any) => n?.id !== a.noteId);
        return c;
      });
      if (a.type === "caseQaFiles") {
        const slot = a.slot === "final" ? "final" : "interim";
        const kind = a.kind === "amend" ? "amend" : "report";
        const clean: Any[] = [];
        for (const f of (Array.isArray(a.files) ? a.files : [])) {
          const uri = String(f?.dataUri ?? "");
          const ok = /^(data:application\/pdf|data:image\/(png|jpe?g|webp)|data:text\/plain|data:application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))/.test(uri);
          if (!ok) throw new Error("Upload a PDF, Word, image or text file.");
          if (uri.length > 6_500_000) throw new Error("That file is too large · please keep it under about 4 MB.");
          clean.push({ id: crypto.randomUUID(), name: String(f?.name ?? "file").slice(0, 200), dataUri: uri, at: now() });
        }
        if (!clean.length) throw new Error("Choose a file first.");
        return await mutate(String(a.id), (c: Any) => {
          c.qa = c.qa ?? {};
          c.qa[`${slot}:${kind}`] = [...((c.qa[`${slot}:${kind}`] as Any[]) ?? []), ...clean].slice(-6);
          return c;
        });
      }
      if (a.type === "caseQaFileDelete") {
        const slot = a.slot === "final" ? "final" : "interim";
        const kind = a.kind === "amend" ? "amend" : "report";
        return await mutate(String(a.id), (c: Any) => {
          if (c.qa?.[`${slot}:${kind}`]) c.qa[`${slot}:${kind}`] = (c.qa[`${slot}:${kind}`] as Any[]).filter((x: Any) => x?.id !== a.fileId);
          return c;
        });
      }
      if (a.type === "caseLogAdd") {
        const hours = Math.round(Number(a.hours) * 100) / 100;
        if (!hours || hours <= 0) throw new Error("Enter the hours for that entry.");
        return await mutate(String(a.id), (c: Any) => {
          c.log = [{ id: crypto.randomUUID(), date: String(a.date ?? "").slice(0, 10), hours, note: String(a.note ?? "").slice(0, 500) }, ...(Array.isArray(c.log) ? c.log : [])].slice(0, 500);
          return c;
        });
      }
      if (a.type === "caseLogDelete") return await mutate(String(a.id), (c: Any) => {
        c.log = (Array.isArray(c.log) ? c.log : []).filter((n: Any) => n?.id !== a.logId);
        return c;
      });
      throw new Error("Unknown case action.");
    }
    if (a.type === "mileageDoc") {
      const ok = /^(data:application\/pdf|data:image\/(png|jpe?g|webp)|data:text\/plain)/.test(String(a.dataUri ?? ""));
      if (!ok) throw new Error("Upload a PDF, image or text file.");
      if (String(a.dataUri).length > 6_500_000) throw new Error("That file is too large · please keep it under about 4 MB.");
      const title = String(a.fileName || "Mileage document").slice(0, 200);
      const { error } = await admin.from("deliverables").insert({ client_id: cid, kind: "mileage-doc", title, file_path: a.dataUri, file_name: String(a.fileName || "document").slice(0, 200), status: "shared", uploaded_by: "client", week_of: new Date().toISOString().slice(0, 10) });
      if (error) throw new Error("Could not save that document · please try again.");
      await admin.from("activity_log").insert({ client_id: cid, actor: "client", message: `uploaded mileage document: ${title}` });
      return { ok: true };
    }
    if (a.type === "mileageAdd") {
      const miles = Math.round(Number(a.miles) * 10) / 10;
      if (!miles || miles <= 0) throw new Error("Enter the miles for that journey.");
      const { data: cur } = await admin.from("clients").select("portal_prefs").eq("id", cid).maybeSingle();
      const prefs = (cur?.portal_prefs ?? {}) as Any;
      const list = Array.isArray(prefs.mileage) ? prefs.mileage : [];
      const item = { id: crypto.randomUUID(), driver: a.driver === "Kieron" ? "Kieron" : "Sara", date: String(a.date ?? "").slice(0, 10), description: String(a.description ?? "").slice(0, 300), miles, at: now() };
      const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, mileage: [item, ...list].slice(0, 500) } }).eq("id", cid);
      if (error) throw new Error("Mileage isn't ready yet · please check back soon.");
      log(`logged mileage · ${item.miles} miles (${item.driver})`);
      return { ok: true };
    }
    if (a.type === "mileageDelete") {
      const { data: cur } = await admin.from("clients").select("portal_prefs").eq("id", cid).maybeSingle();
      const prefs = (cur?.portal_prefs ?? {}) as Any;
      const list = (Array.isArray(prefs.mileage) ? prefs.mileage : []).filter((n: Any) => n?.id !== a.id);
      const { error } = await admin.from("clients").update({ portal_prefs: { ...prefs, mileage: list } }).eq("id", cid);
      if (error) throw new Error("Could not delete that entry · please try again.");
      return { ok: true };
    }
    if (a.type === "mileageCalc") {
      const clean = (s: string) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const f = clean(a.from), t = clean(a.to);
      if (f.length < 5 || t.length < 5) throw new Error("Enter both postcodes.");
      const geo = async (pc: string) => {
        const eps = [
          `https://api.postcodes.io/postcodes/${pc}`,
          `https://findthatpostcode.uk/postcodes/${pc}.json`,
        ];
        if (pc.length > 4) eps.push(`https://api.postcodes.io/outcodes/${pc.slice(0, -3)}`);
        for (const ep of eps) {
          try {
            const r = await fetch(ep, { signal: AbortSignal.timeout(8000) }).then((x: Any) => x.json());
            const raw = r?.result ?? r?.data;
            if (!raw) continue;
            const g = Array.isArray(raw) ? raw[0] : raw;
            const a = (g?.attributes ?? g) ?? {};
            const lat = Number(a.latitude), lng = Number(a.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const apiPc = String(a.postcode ?? "").trim();
          const shown = apiPc || (pc.length > 4 ? pc.slice(0, -3) + " " + pc.slice(-3) : pc);
          return { lat, lng, pc: shown };
        }
          } catch { continue; }
        }
        throw new Error("geo failed");
      };
      let A: Any, B: Any;
      try { A = await geo(f); B = await geo(t); } catch { throw new Error("One of those postcodes doesn't look right · check them and try again."); }
      let miles = 0;
      for (const rp of ["https://router.project-osrm.org", "https://routing.openstreetmap.de/routed-car"]) {
        try {
          const r = await fetch(`${rp}/route/v1/driving/${A.lng},${A.lat};${B.lng},${B.lat}?overview=false`, { signal: AbortSignal.timeout(8000) }).then((x: Any) => x.json());
          const d = r?.routes?.[0]?.distance;
          if (d > 0) { miles = Math.round((d / 1609.344) * 10) / 10; break; }
        } catch { continue; }
      }
      if (!miles) {
        const R = 3958.7613;
        const dLat = (B.lat - A.lat) * Math.PI / 180, dLng = (B.lng - A.lng) * Math.PI / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * Math.PI / 180) * Math.cos(B.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        miles = Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.25 * 10) / 10;
      }
      return { ok: true, miles, from: A.pc, to: B.pc };
    }
    throw new Error("Unknown action");
  });

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Loosely typed handle for generic studio CRUD screens.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as any;

type ListOpts = { select?: string; order?: string; asc?: boolean; eq?: [string, unknown] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRows<T = any>(table: string, opts: ListOpts = {}) {
  return useQuery({
    queryKey: [table, opts],
    queryFn: async () => {
      let q = db.from(table).select(opts.select ?? "*");
      if (opts.eq) q = q.eq(opts.eq[0], opts.eq[1]);
      q = q.order(opts.order ?? "created_at", { ascending: opts.asc ?? false });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function useSave(table: string, success?: string) {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (row: any) => {
      const { id, ...rest } = row;
      const res = id
        ? await db.from(table).update(rest).eq("id", id).select().single()
        : await db.from(table).insert(rest).select().single();
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries();
      if (success) toast.success(success);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemove(table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  });
}

export async function logActivity(client_id: string | null, message: string, actor = "studio") {
  await db.from("activity_log").insert({ client_id, message, actor });
}

export async function uploadFile(clientId: string, file: File) {
  const path = `${clientId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
  const { error } = await supabase.storage.from("files").upload(path, file);
  if (error) throw error;
  return path;
}

export async function openFile(path: string) {
  const { data, error } = await supabase.storage.from("files").createSignedUrl(path, 600);
  if (error) { toast.error(error.message); return; }
  window.open(data.signedUrl, "_blank");
}

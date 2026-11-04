import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-heading text-3xl font-bold tracking-tight text-primary-deep md:text-4xl">{title}</h1>
        <div className="dash-underline mt-2" />
        {subtitle && <p className="mt-2.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const tone: Record<string, string> = {
  paid: "bg-success/15 text-success",
  approved: "bg-success/15 text-success",
  accepted: "bg-success/15 text-success",
  done: "bg-success/15 text-success",
  completed: "bg-success/15 text-success",
  overdue: "bg-destructive/15 text-destructive",
  revision: "bg-destructive/15 text-destructive",
  declined: "bg-destructive/15 text-destructive",
  sent: "bg-gold/20 text-primary-deep",
  pending: "bg-gold/20 text-primary-deep",
  in_progress: "bg-gold/20 text-primary-deep",
  active: "bg-primary/10 text-primary",
  on_hold: "bg-gold/15 text-primary-deep",
  quote_draft: "bg-muted text-muted-foreground",
  quote_sent: "bg-primary/10 text-primary",
  quote_accepted: "bg-success/15 text-success",
  quote_declined: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", tone[status] ?? "bg-muted text-muted-foreground")}>
      {status.replace("_", " ")}
    </Badge>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "email";
  options?: { value: string; label: string }[];
  required?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Values = Record<string, any>;

export function QuickForm({ fields, initial = {}, onSubmit, submitLabel = "Save" }: { fields: Field[]; initial?: Values; onSubmit: (v: Values) => void | Promise<void>; submitLabel?: string }) {
  const [v, setV] = useState<Values>(initial);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const out: Values = { ...v };
        fields.forEach((f) => {
          if (f.type === "number") out[f.name] = out[f.name] === "" || out[f.name] == null ? null : Number(out[f.name]);
          if (f.type === "date" && !out[f.name]) out[f.name] = null;
        });
        await onSubmit(out);
      }}
    >
      {fields.map((f) => (
        <div key={f.name} className="space-y-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          {f.type === "textarea" ? (
            <Textarea id={f.name} rows={4} value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
          ) : f.type === "select" ? (
            <select
              id={f.name}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={v[f.name] ?? ""}
              required={f.required}
              onChange={(e) => setV({ ...v, [f.name]: e.target.value || null })}
            >
              {!f.required && <option value="">·</option>}
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <Input id={f.name} type={f.type ?? "text"} step={f.type === "number" ? "0.01" : undefined} required={f.required} value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
          )}
        </div>
      ))}
      <Button type="submit" className="w-full">{submitLabel}</Button>
    </form>
  );
}

export function FormDialog({ trigger, title, open, onOpenChange, children }: { trigger?: ReactNode; title: string; open?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode }) {
  return (
    <Dialog {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-light text-primary-deep">{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="zd-card relative rounded-2xl border border-white/60 bg-white/70 p-5 shadow-[0_10px_30px_-18px_rgba(23,75,80,.35)] backdrop-blur">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 font-heading text-3xl font-bold tabular-nums tracking-tight text-primary-deep">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

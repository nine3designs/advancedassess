export function londonDayKey(d: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(typeof d === "string" ? new Date(d) : d);
}

export function fmtMinsLabel(mins: number) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}

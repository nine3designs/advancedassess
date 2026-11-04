import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortal } from "@/lib/portal.functions";
import { PMPortal } from "@/components/portal/PMPortal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function PortalView({ token }: { token: string | null }) {
  const fetchPortal = useServerFn(getPortal);
  const q = useQuery({ queryKey: ["portal", token], queryFn: () => fetchPortal({ data: { token } }), retry: false, refetchInterval: 30000, refetchOnWindowFocus: true });
  return (
    <div className="min-h-screen bg-[#eef0f2] px-3 py-2 md:px-6 md:py-3">
      {q.isLoading ? <PortalLoader /> : q.error ? (
        <div className="mx-auto mt-24 max-w-md text-center">
          <h1 className="text-xl font-semibold text-[#1f2630]">Portal unavailable</h1>
          <p className="mt-2 text-sm text-[#5e5e5e]">{(q.error as Error).message}</p>
        </div>
      ) : (q.data!.client.portal_type !== "pm") ? (
        <div className="mx-auto mt-24 max-w-md text-center">
          <h1 className="text-xl font-semibold text-[#1f2630]">Portal unavailable</h1>
          <p className="mt-2 text-sm text-[#5e5e5e]">This portal type isn't hosted here.</p>
        </div>
      ) : (
        <PMPortal p={q.data!} token={token} />
      )}
    </div>
  );
}

function PortalLoader() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4 pt-6">
      <div className="mx-auto h-14 w-full max-w-lg rounded-full bg-white/80" />
      <div className="h-9 w-64 rounded-2xl bg-white/70" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-3xl bg-white/70" />)}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-56 rounded-3xl bg-white/70 lg:col-span-2" />
        <div className="h-56 rounded-3xl bg-white/70" />
      </div>
    </div>
  );
}

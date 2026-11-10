import { createFileRoute } from "@tanstack/react-router";
import { PortalView } from "@/components/portal/PortalView";

export const Route = createFileRoute("/portal/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Client Portal · Advanced Assessment & Solutions" },
      { name: "description", content: "Project portal for Advanced Assessment & Solutions." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Client Portal · Advanced Assessment & Solutions" },
      { property: "og:description", content: "Project portal for Advanced Assessment & Solutions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TokenPortal,
});

function TokenPortal() {
  const { token } = Route.useParams();
  return <PortalView token={token} />;
}

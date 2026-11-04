import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({ component: HomeRedirect });

function HomeRedirect() {
  const nav = useNavigate();
  useEffect(() => {
    nav({ to: "/portal/$token", params: { token: "SaraDawson" }, replace: true });
  }, [nav]);
  return null;
}

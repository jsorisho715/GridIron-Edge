import { createFileRoute } from "@tanstack/react-router";
import { Connections } from "../components/gridiron/Connections";
import connectionStyles from "../connections.css?url";
export const Route = createFileRoute("/connections")({
  head: () => ({ meta: [{ title: "Secure connections | Gridiron Edge" }, { name: "robots", content: "noindex, nofollow" }], links: [{ rel: "stylesheet", href: connectionStyles }] }),
  component: Connections
});

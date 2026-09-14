import { createFileRoute } from "@tanstack/react-router";
const handle = async ({ request }: { request: Request }) => {
  const { connectionResponse } = await import("../../../lib/espn-runtime.server");
  return connectionResponse(request);
};
export const Route = createFileRoute("/api/gridiron/connection")({
  server: { handlers: { GET: handle, POST: handle } }
});

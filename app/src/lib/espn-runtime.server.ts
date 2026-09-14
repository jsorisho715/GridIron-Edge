import { handleConnection } from "./espn-connection.server";
export async function connectionResponse(request: Request) {
  // Local Vite previews intentionally have no production secrets or live connection.
  if (import.meta.env.DEV) return handleConnection(request, {});
  const { bindings } = await import("./bindings.server");
  return handleConnection(request, bindings());
}

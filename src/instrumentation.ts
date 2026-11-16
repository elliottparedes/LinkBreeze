/**
 * Next.js Instrumentation — runs ONCE when the server boots, before any
 * request is served.
 *
 * Node-only work (SECRET_KEY bootstrap, DB migrations) lives in
 * instrumentation-node.ts and is dynamically imported here so the Edge
 * instrumentation bundle never traces fs/sqlite/crypto.
 *
 * @see instrumentation-node.ts for behavior details
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { bootstrapNodeServer } = await import("./instrumentation-node");
  await bootstrapNodeServer();
}
/**
 * Runs once when the server starts. Background jobs live in a Node-only
 * module so they never load in other runtimes.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./lib/jobs");
  }
}

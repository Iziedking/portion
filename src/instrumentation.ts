// No PayPal webhooks in this build: there is no public URL. Instead a timer
// retries unsure payout posts and reads open batches back every 20 seconds.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __portionTimer?: NodeJS.Timeout };
  if (g.__portionTimer) return;
  const { tick } = await import("./lib/engine");
  let running = false;
  g.__portionTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error("portion tick failed:", (err as Error).message);
    } finally {
      running = false;
    }
  }, 20_000);
  g.__portionTimer.unref?.();
}

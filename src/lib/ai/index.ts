import { ClaudeAdvisor } from "./claude";
import { PreviewAdvisor } from "./preview";
import type { Advisor } from "./types";

export * from "./types";
export { nudgeTemplate } from "./preview";

const g = globalThis as unknown as { __portionAdvisor?: Advisor };

export function getAdvisor(): Advisor {
  if (!g.__portionAdvisor) {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    const limit = Number(process.env.AI_DAILY_CALL_LIMIT ?? "60");
    const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
    g.__portionAdvisor = key && limit > 0 ? new ClaudeAdvisor(key, model, limit) : new PreviewAdvisor();
  }
  return g.__portionAdvisor;
}

/** Tests swap in their own advisor. */
export function setAdvisor(advisor: Advisor | undefined) {
  g.__portionAdvisor = advisor;
}

export const previewAdvisor = new PreviewAdvisor();

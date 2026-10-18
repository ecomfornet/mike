import { setTimeout as sleep } from "node:timers/promises";

import { BraveSearchError, searchBrave } from "./brave";

export type WebSearchResult = { url: string; title: string; snippet: string };

export class WebSearchUnavailableError extends Error {
    constructor(
        readonly code: "not_configured" | "rejected" | "failed",
        options?: ErrorOptions,
    ) {
        super(`Web search unavailable: ${code}`, options);
        this.name = "WebSearchUnavailableError";
    }
}

// A free Brave Search key allows one request a second, and a turn's searches
// run in parallel. The deployment's key is shared by everyone without their
// own, so the wait for a turn is capped.
const REQUEST_SPACING_MS = 1_100;
const MAX_QUEUE_WAIT_MS = 10_000;

type Deps = {
    fetch: typeof fetch;
    now: () => number;
    sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
};

export function createWebSearch(deps: Deps) {
    const nextSlotAt = new Map<string, number>();

    async function waitForSlot(apiKey: string, signal?: AbortSignal) {
        const now = deps.now();
        const slot = Math.max(now, nextSlotAt.get(apiKey) ?? now);
        if (slot - now > MAX_QUEUE_WAIT_MS) {
            throw new WebSearchUnavailableError("failed");
        }
        nextSlotAt.set(apiKey, slot + REQUEST_SPACING_MS);
        if (slot > now) await deps.sleep(slot - now, signal);
    }

    return async function searchWeb(
        query: string,
        options: { apiKey: string | null | undefined; signal?: AbortSignal },
    ): Promise<WebSearchResult[]> {
        const { apiKey, signal } = options;
        if (!apiKey) throw new WebSearchUnavailableError("not_configured");

        await waitForSlot(apiKey, signal);
        try {
            return await searchBrave(query, apiKey, { fetch: deps.fetch, signal });
        } catch (error) {
            if (signal?.aborted) throw error;
            const rejected = error instanceof BraveSearchError && error.rejected;
            throw new WebSearchUnavailableError(rejected ? "rejected" : "failed", {
                cause: error,
            });
        }
    };
}

export const searchWeb = createWebSearch({
    fetch,
    now: Date.now,
    sleep: (ms, signal) => sleep(ms, undefined, { signal }),
});

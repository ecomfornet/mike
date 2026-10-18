import { withTimeout } from "./http";
import type { WebSearchResult } from "./search";

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
// Brave refuses longer queries.
const MAX_QUERY_CHARS = 400;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESULTS = 10;

export class BraveSearchError extends Error {
    constructor(readonly status: number) {
        super(`Brave Search answered with HTTP ${status}`);
        this.name = "BraveSearchError";
    }

    // Brave answers 422 for an invalid subscription token. A 429 is only the
    // per-second limit, so it is not counted as a refused key.
    get rejected(): boolean {
        return [401, 403, 422].includes(this.status);
    }
}

type SearchApiDeps = {
    fetch: typeof fetch;
    signal?: AbortSignal;
};

type BraveResult = {
    url?: unknown;
    title?: unknown;
    description?: unknown;
    extra_snippets?: unknown;
};

const ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#x27;": "'",
    "&#39;": "'",
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const decoded = (value: unknown) =>
    text(value).replace(/&(?:amp|lt|gt|quot|#x27|#39);/g, (entity) => ENTITIES[entity]!);

const snippetOf = (result: BraveResult) =>
    [
        decoded(result.description),
        ...(Array.isArray(result.extra_snippets)
            ? result.extra_snippets.map(decoded)
            : []),
    ]
        .filter(Boolean)
        .join(" … ");

export async function searchBrave(
    query: string,
    apiKey: string,
    deps: SearchApiDeps,
): Promise<WebSearchResult[]> {
    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.set("q", query.slice(0, MAX_QUERY_CHARS));
    url.searchParams.set("count", String(MAX_RESULTS));
    url.searchParams.set("extra_snippets", "true");
    url.searchParams.set("text_decorations", "false");
    const response = await deps.fetch(url, {
        headers: { accept: "application/json", "x-subscription-token": apiKey },
        signal: withTimeout(deps.signal, REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new BraveSearchError(response.status);
    }
    const body = (await response.json()) as { web?: { results?: unknown } };
    const results = Array.isArray(body.web?.results) ? body.web.results : [];
    return (results as BraveResult[])
        .filter((r) => /^https?:\/\//.test(text(r.url)))
        .map((r) => ({
            url: text(r.url),
            title: decoded(r.title),
            snippet: snippetOf(r),
        }));
}

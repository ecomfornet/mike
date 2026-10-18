import { describe, expect, it, vi } from "vitest";

import { createWebSearch } from "../search";

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

const BRAVE_RESULTS = {
    web: {
        results: [
            {
                url: "https://www.legislation.gov.uk/ukpga/2006/46/section/172",
                title: "Companies Act 2006, s 172 &amp; s 174",
                description: "Duty to promote the &quot;success&quot; of the company.",
                extra_snippets: ["A director&#x27;s duty..."],
            },
            { url: "javascript:alert(1)", title: "Not a page" },
        ],
    },
};

const apiKey = "brave-key";

function harness(responses: Response[]) {
    const fetch = vi.fn(async (_url: unknown, _init?: unknown) => responses.shift()!);
    const sleep = vi.fn(async (_ms: number, _signal?: AbortSignal) => {});
    const search = createWebSearch({ fetch: fetch as never, now: () => 1_000_000, sleep });
    return { search, fetch, sleep };
}

describe("Mike's web search", () => {
    it("needs a key", async () => {
        const { search, fetch } = harness([]);

        await expect(search("s172", { apiKey: null })).rejects.toMatchObject({
            code: "not_configured",
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("searches Brave with its key, keeps only web pages and decodes entities", async () => {
        const { search, fetch } = harness([json(BRAVE_RESULTS)]);

        const results = await search("directors duties s172", { apiKey });

        expect(results).toEqual([
            {
                url: "https://www.legislation.gov.uk/ukpga/2006/46/section/172",
                title: "Companies Act 2006, s 172 & s 174",
                snippet:
                    "Duty to promote the \"success\" of the company. … A director's duty...",
            },
        ]);
        const [url, init] = fetch.mock.calls[0] as [URL, RequestInit];
        expect(String(url)).toContain("https://api.search.brave.com/res/v1/web/search");
        expect(url.searchParams.get("q")).toBe("directors duties s172");
        expect(init.headers).toMatchObject({ "x-subscription-token": "brave-key" });
    });

    it.each([
        [401, "rejected"],
        [422, "rejected"],
        [429, "failed"],
    ])("reports HTTP %s as %s", async (status, code) => {
        const { search } = harness([json({}, status)]);

        await expect(search("q", { apiKey })).rejects.toMatchObject({ code });
    });

    it("spaces out parallel requests made with the same key", async () => {
        const { search, fetch, sleep } = harness([
            json(BRAVE_RESULTS),
            json(BRAVE_RESULTS),
        ]);
        const signal = new AbortController().signal;

        await Promise.all([
            search("one", { apiKey }),
            search("two", { apiKey, signal }),
        ]);

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledOnce();
        expect(sleep).toHaveBeenCalledWith(1_100, signal);
    });
});

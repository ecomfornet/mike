import { beforeEach, describe, expect, it, vi } from "vitest";

const { guardedFetch, extractPdfTextForModel } = vi.hoisted(() => ({
    guardedFetch: vi.fn(),
    extractPdfTextForModel: vi.fn(),
}));

vi.mock("../../mcp/client", () => ({ guardedFetch }));
vi.mock("../../pdfText", () => ({ extractPdfTextForModel }));

import { BlockedDestinationError } from "../../blockedDestination";
import { WebPageUnreadableError, readWebPage } from "../pageReader";

const ARTICLE = `<!doctype html>
<html>
<head><title>Section 172 duties | Example Law</title></head>
<body>
<nav><a href="/">Home</a> <a href="/about">About</a></nav>
<main>
<article>
<h1>Section 172 duties</h1>
<p>A director must act in the way they consider, in good faith, would be most likely to promote the success of the company for the benefit of its members as a whole.</p>
<p>See the <a href="https://www.legislation.gov.uk/ukpga/2006/46/section/172">statutory text</a> for the full list of factors.</p>
</article>
</main>
<footer>Copyright Example Law</footer>
</body>
</html>`;

const page = (body: BodyInit, contentType: string) =>
    new Response(body, { headers: { "content-type": contentType } });

async function unreadable(promise: Promise<unknown>): Promise<string> {
    const error = await promise.catch((err: unknown) => err);
    expect(error).toBeInstanceOf(WebPageUnreadableError);
    return (error as Error).message;
}

beforeEach(() => {
    guardedFetch.mockReset();
});

describe("readWebPage", () => {
    it("returns an HTML page's article as markdown, without the page chrome", async () => {
        guardedFetch.mockResolvedValue(page(ARTICLE, "text/html; charset=utf-8"));

        const result = await readWebPage("https://example.test/s172");

        expect(result.title).toContain("Section 172 duties");
        expect(result.text).toContain("promote the success of the company");
        expect(result.text).toContain(
            "[statutory text](https://www.legislation.gov.uk/ukpga/2006/46/section/172)",
        );
        expect(result.text).not.toContain("Copyright Example Law");
    });

    it("reads a PDF served as a generic binary file", async () => {
        guardedFetch.mockResolvedValue(
            page("%PDF-1.7 ...", "application/octet-stream"),
        );
        extractPdfTextForModel.mockResolvedValue("Order adopting rules.");

        const result = await readWebPage("https://files.example.test/filing");

        expect(result.text).toBe("Order adopting rules.");
    });

    it("refuses file types it cannot read", async () => {
        guardedFetch.mockResolvedValue(page("zip", "application/zip"));

        await expect(unreadable(readWebPage("https://example.test/a.zip"))).resolves.toBe(
            "This kind of file cannot be read as a web page.",
        );
    });

    it("explains a blocked address", async () => {
        guardedFetch.mockRejectedValue(
            new BlockedDestinationError("Web page URL resolves to a blocked network address."),
        );

        await expect(unreadable(readWebPage("http://10.0.0.1/"))).resolves.toBe(
            "That address is not a public web page.",
        );
    });
});

import { isBlockedDestinationError } from "../blockedDestination";
import { guardedFetch } from "../mcp/client";
import { extractPdfTextForModel } from "../pdfText";
import { withTimeout } from "./http";

export type WebPage = {
    url: string;
    title: string | null;
    text: string;
};

/** A page that could not be read; the message is safe to show the model. */
export class WebPageUnreadableError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "WebPageUnreadableError";
    }
}

const REQUEST_HEADERS = {
    "user-agent": "Mozilla/5.0 (compatible; MikeBot/1.0)",
    "accept-language": "en-US,en;q=0.9",
    accept: "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.5",
};

// Pages are parsed on the main thread, so keep them small. Anything that is
// not text may still be a PDF, which needs more room.
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

// Some sites serve PDFs as application/octet-stream.
const isPdf = (contentType: string, body: ArrayBuffer) =>
    contentType === "application/pdf" ||
    new TextDecoder().decode(body.slice(0, 5)) === "%PDF-";

const tooLarge = () =>
    new WebPageUnreadableError("The page is too large to read.");

const isText = (contentType: string) =>
    contentType.startsWith("text/") || contentType === "application/xhtml+xml";

async function readCapped(
    response: Response,
    maxBytes: number,
): Promise<ArrayBuffer> {
    if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw tooLarge();
    }
    const reader = response.body?.getReader();
    if (!reader) return new ArrayBuffer(0);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw tooLarge();
        }
        chunks.push(value);
    }
    return new Blob(chunks).arrayBuffer();
}

async function htmlToMarkdown(
    html: string,
    url: string,
): Promise<{ title: string | null; text: string }> {
    const [{ parseHTML }, { Defuddle }] = await Promise.all([
        import("linkedom"),
        import("defuddle/node"),
    ]);
    const { document } = parseHTML(html);
    const page = await Defuddle(document as unknown as Document, url, {
        markdown: true,
    });
    return { title: page.title?.trim() || null, text: page.content ?? "" };
}

async function fetchPage(url: string, signal: AbortSignal | undefined) {
    try {
        const response = await guardedFetch(
            url,
            {
                headers: REQUEST_HEADERS,
                signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
            },
            { label: "Web page URL", allowHttp: true },
        );
        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            throw new WebPageUnreadableError(
                `The page answered with HTTP ${response.status}.`,
            );
        }
        const contentType = (response.headers.get("content-type") ?? "")
            .split(";")[0]
            .trim()
            .toLowerCase();
        return {
            finalUrl: response.url || url,
            contentType,
            body: await readCapped(
                response,
                isText(contentType) ? MAX_TEXT_BYTES : MAX_PDF_BYTES,
            ),
        };
    } catch (error) {
        if (signal?.aborted || error instanceof WebPageUnreadableError) {
            throw error;
        }
        if (isBlockedDestinationError(error)) {
            throw new WebPageUnreadableError(
                "That address is not a public web page.",
                { cause: error },
            );
        }
        throw new WebPageUnreadableError("The page could not be reached.", {
            cause: error,
        });
    }
}

/**
 * Fetches a public web page and returns its main text: article content as
 * markdown for HTML, the text layer for a PDF. Private and internal
 * addresses are refused, redirects included.
 */
export async function readWebPage(
    url: string,
    options: { signal?: AbortSignal } = {},
): Promise<WebPage> {
    const { finalUrl, contentType, body } = await fetchPage(url, options.signal);
    let page: { title: string | null; text: string };
    if (isPdf(contentType, body)) {
        page = { title: null, text: await extractPdfTextForModel(body) };
    } else if (
        contentType === "text/html" ||
        contentType === "application/xhtml+xml"
    ) {
        page = await htmlToMarkdown(new TextDecoder().decode(body), finalUrl);
    } else if (contentType.startsWith("text/")) {
        page = { title: null, text: new TextDecoder().decode(body) };
    } else {
        throw new WebPageUnreadableError(
            "This kind of file cannot be read as a web page.",
        );
    }

    const text = page.text.trim();
    if (!text) {
        throw new WebPageUnreadableError("The page has no readable text.");
    }
    return { url: finalUrl, title: page.title, text };
}

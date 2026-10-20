import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastViewportUI, clearToasts } from "@/shared/ui/ToastUI";
import { AssistantMessage } from "./AssistantMessage";

describe("AssistantMessage copy", () => {
    beforeEach(() => clearToasts());

    afterEach(() => {
        clearToasts();
        vi.restoreAllMocks();
    });

    it("tells the user when the clipboard refuses the copy", async () => {
        const user = userEvent.setup();
        // jsdom has no ClipboardItem; give the handler one so the failure
        // under test is the clipboard write itself, as it is in a browser.
        vi.stubGlobal(
            "ClipboardItem",
            class {
                constructor(public items: Record<string, Blob>) {}
            },
        );
        const write = vi
            .fn()
            .mockRejectedValue(
                new DOMException("Write permission denied.", "NotAllowedError"),
            );
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { ...navigator.clipboard, write },
        });

        render(
            <>
                <AssistantMessage
                    events={[{ type: "content", text: "The answer." }]}
                />
                <ToastViewportUI />
            </>,
        );

        await user.click(screen.getByRole("button", { name: "Copy response" }));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Couldn't copy this answer");
        expect(alert).toHaveTextContent("clipboard permission");
        expect(alert).not.toHaveTextContent("Write permission denied.");
        expect(
            screen.queryByRole("button", { name: "Response copied" }),
        ).not.toBeInTheDocument();
        vi.unstubAllGlobals();
    });
});

describe("AssistantMessage copy with web sources", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("adds the cited web pages to the copied answer", async () => {
        const user = userEvent.setup();
        const items: Record<string, Blob>[] = [];
        vi.stubGlobal(
            "ClipboardItem",
            class {
                constructor(public items: Record<string, Blob>) {}
            },
        );
        const write = vi.fn(async (clipboardItems: { items: Record<string, Blob> }[]) => {
            items.push(clipboardItems[0].items);
        });
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { ...navigator.clipboard, write },
        });

        render(
            <AssistantMessage
                events={[
                    { type: "content", text: "The answer." },
                    {
                        type: "web_sources",
                        sources: [{ url: "https://law.test/s172", title: "Section 172" }],
                    },
                ]}
            />,
        );
        await user.click(screen.getByRole("button", { name: "Copy response" }));

        const text = await items[0]["text/plain"].text();
        expect(text).toContain("The answer.");
        expect(text).toContain("Sources\nSection 172 https://law.test/s172");
    });
});

describe("AssistantMessage web sources", () => {
    it("lists a page cited by several steps once, keeping its title", async () => {
        const user = userEvent.setup();
        render(
            <AssistantMessage
                events={[
                    {
                        type: "web_sources",
                        sources: [{ url: "https://law.test/s172" }],
                    },
                    { type: "content", text: "The answer." },
                    {
                        type: "web_sources",
                        sources: [
                            { url: "https://law.test/s172", title: "Section 172" },
                            { url: "https://law.test/s171", title: "Section 171" },
                        ],
                    },
                ]}
            />,
        );

        const toggle = screen.getByRole("button", { name: /Sources/ });
        expect(toggle).toHaveTextContent("2 web pages");
        await user.click(toggle);
        expect(screen.getByText("Section 172")).toBeInTheDocument();
    });
});

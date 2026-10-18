import { providerForModel } from "../llm/models";
import type {
    WebSearchBackend,
    WebSearchFamily,
    WebSearchSettings,
} from "./settings";

export type WebSearchPlan = "provider" | WebSearchBackend;

export type WebSearchKeys = Partial<Record<WebSearchBackend, string | null>>;

// Gemini has a search tool too, but Google requires its search suggestions to
// be shown wherever results are used, so Mike does not offer it.
function familyOf(model: string): WebSearchFamily {
    try {
        const provider = providerForModel(model);
        if (provider === "claude" || provider === "openai") return provider;
    } catch {
        // An unknown model has no provider search of its own.
    }
    return "other";
}

export function webSearchPlanFor(
    settings: WebSearchSettings,
    model: string,
    keys: WebSearchKeys | null | undefined,
): WebSearchPlan | null {
    if (!settings.enabled) return null;
    const choice = settings[familyOf(model)];
    if (choice === "off") return null;
    if (choice === "provider") return "provider";
    return keys?.[choice] ? choice : null;
}

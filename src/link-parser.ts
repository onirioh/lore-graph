import { LINK_PATTERN } from './constants';
import { type LinkMatch, type LookupResult, type WorldLookupItem } from './types';

/**
 * Parse all [text](ID:n) links from a content string.
 */
export function parseLinks(content: string): LinkMatch[] {
    const matches: LinkMatch[] = [];
    LINK_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_PATTERN.exec(content)) !== null) {
        matches.push({
            displayText: m[1],
            targetUid: parseInt(m[2], 10),
            fullMatch: m[0],
        });
    }
    return matches;
}

/**
 * Transform all [text](ID:n) links to [text](ID:n;WORLD:world) format.
 */
export function transformLinksToWorldAware(content: string, world: string): string {
    LINK_PATTERN.lastIndex = 0;
    return content.replace(LINK_PATTERN, (_, text: string, uid: string) =>
        `[${text}](ID:${uid};WORLD:${world})`);
}

/**
 * Get the names of all currently active lorebooks across all sources.
 */
async function getActiveLorebookNames(): Promise<string[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();
    const names = new Set<string>();

    // 1. Global lorebooks
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error webpackIgnore runtime import
        const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js');
        if (Array.isArray(wi.selected_world_info)) {
            for (const name of wi.selected_world_info) names.add(name);
        }
    } catch (e) {
        console.warn('[LoreGraph] Could not access selected_world_info', e);
    }

    // 2. Character lorebook (primary + auxiliary)
    try {
        const chId = ctx.characterId;
        if (chId !== undefined && chId !== null) {
            const character = ctx.characters?.[chId];
            if (character?.data?.extensions?.world) {
                names.add(character.data.extensions.world);
            }
            // Auxiliary books
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error webpackIgnore runtime import
            const wi = await import(/* webpackIgnore: true */ '/scripts/world-info.js');
            const charLore = wi.world_info?.charLore;
            if (Array.isArray(charLore)) {
                const charFilename = typeof character?.getFileName === 'function'
                    ? character.getFileName()
                    : null;
                if (charFilename) {
                    const entry = charLore.find(
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (e: any) => e.name === charFilename,
                    );
                    if (entry?.extraBooks) {
                        for (const name of entry.extraBooks) names.add(name);
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[LoreGraph] Could not access character lore', e);
    }

    // 3. Chat lorebook
    try {
        const chatMeta = ctx.chatMetadata;
        if (chatMeta?.world_info) {
            names.add(chatMeta.world_info);
        }
    } catch (e) {
        console.warn('[LoreGraph] Could not access chat lore', e);
    }

    // 4. Persona lorebook — stored in power_user settings, not directly in context
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error webpackIgnore runtime import
        const wi = await import(/* webpackIgnore: true */ '/scripts/power-user.js');
        if (wi.power_user?.persona_description_lorebook) {
            names.add(wi.power_user.persona_description_lorebook);
        }
    } catch (e) {
        // power-user.js may not export what we need; skip silently
    }

    return [...names];
}

/**
 * Look up an entry by UID in a specific lorebook.
 * Returns the entry content and title if found, null otherwise.
 */
export async function findEntryByUid(
    uid: number,
    world: string,
): Promise<LookupResult | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();
    const loadWorldInfo: (name: string) => Promise<{
        entries: Record<number, { uid: number; comment: string; content: string }>;
    } | undefined> = ctx.loadWorldInfo;

    if (!loadWorldInfo) {
        console.warn('[LoreGraph] loadWorldInfo not available');
        return null;
    }

    try {
        const data = await loadWorldInfo(world);
        if (!data?.entries) return null;
        const entry = data.entries[uid];
        if (entry) {
            return {
                uid: entry.uid,
                title: entry.comment || '',
                content: entry.content || '',
            };
        }
    } catch {
        // Book not found or failed to load
    }

    return null;
}

/**
 * Look up entries by {id, world} pairs.
 */
export async function findEntriesByLookups(
    lookups: WorldLookupItem[],
): Promise<LookupResult[]> {
    const results: LookupResult[] = [];
    for (const { id, world } of lookups) {
        const entry = await findEntryByUid(id, world);
        if (entry) {
            results.push(entry);
        }
    }
    return results;
}

/**
 * An entry returned by term-based search, including the lorebook name.
 */
export interface SearchResult extends LookupResult {
    world: string;
    comment: string;
    keys: string[];
}

/**
 * Search active lorebooks for entries whose comment (title) or activation
 * keys match any of the given search terms (case-insensitive substring match).
 */
export async function searchEntriesByTerms(
    terms: string[],
): Promise<SearchResult[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();
    const loadWorldInfo: (name: string) => Promise<{
        entries: Record<number, { uid: number; comment: string; content: string; key: string[] }>;
    } | undefined> = ctx.loadWorldInfo;

    if (!loadWorldInfo) return [];

    const bookNames = await getActiveLorebookNames();
    if (bookNames.length === 0) return [];

    const lowerTerms = terms.map(t => t.toLowerCase());
    const results: SearchResult[] = [];
    const seenUids = new Set<string>();

    for (const world of bookNames) {
        try {
            const data = await loadWorldInfo(world);
            if (!data?.entries) continue;

            for (const entry of Object.values(data.entries)) {
                if (!entry || seenUids.has(`${world}:${entry.uid}`)) continue;

                const comment = (entry.comment || '').toLowerCase();

                if (lowerTerms.some(term =>
                    comment === term || entry.key.some(k => k.toLowerCase() === term),
                )) {
                    seenUids.add(`${world}:${entry.uid}`);
                    results.push({
                        uid: entry.uid,
                        world,
                        title: entry.comment || '',
                        content: entry.content || '',
                        comment: entry.comment || '',
                        keys: entry.key || [],
                    });
                }
            }
        } catch {
            // Skip books that fail to load
        }
    }

    return results;
}

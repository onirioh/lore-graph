import { TOOL_NAME, SEARCH_TOOL_NAME } from './constants';
import { getSettings } from './settings';
import { findEntriesByLookups, searchEntriesByTerms } from './link-parser';
import { type LookupResult } from './types';
import { type SearchResult } from './link-parser';
import { queuePendingActivations } from './activation-manager';

let lookupRegistered = false;
let searchRegistered = false;

function formatLookupResults(results: LookupResult[]): string {
    if (results.length === 0) {
        return 'No lore entries found for the provided IDs.';
    }
    return results
        .map(r => {
            const label = r.title ? `${r.title} (UID: ${r.uid})` : `UID: ${r.uid}`;
            return `${label}\n---\n${r.content}`;
        })
        .join('\n\n===\n\n');
}

function formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
        return 'No lore entries found matching the given terms.';
    }
    return results
        .map(r => {
            const label = r.title
                ? `${r.title} (UID: ${r.uid}, in "${r.world}")`
                : `UID: ${r.uid} (in "${r.world}")`;
            return `${label}\n---\n${r.content}`;
        })
        .join('\n\n===\n\n');
}

function registerLookupTool(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();

    if (lookupRegistered) {
        ctx.unregisterFunctionTool(TOOL_NAME);
        lookupRegistered = false;
    }

    const settings = getSettings();
    if (!settings.toolEnabled) return;

    ctx.registerFunctionTool({
        name: TOOL_NAME,
        displayName: 'Look Up Lore',
        description: settings.lookupToolDescription,
        parameters: Object.freeze({
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {
                lookups: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer', description: 'Numeric UID of the lore entry' },
                            world: { type: 'string', description: 'Lorebook/world name containing this entry' },
                        },
                        required: ['id', 'world'],
                    },
                    description:
                        'Array of {id, world} lookups, e.g. [{"id":1,"world":"MyWorld"},{"id":5,"world":"OtherWorld"}]',
                },
            },
            required: ['lookups'],
        }),
        action: async (args: { lookups?: Array<{ id: number; world: string }> }) => {
            const lookups = args?.lookups;
            if (!Array.isArray(lookups) || lookups.length === 0) {
                return 'Error: No lookups provided. Please provide an array of {id, world} objects.';
            }

            const results = await findEntriesByLookups(lookups);
            const uidToWorld = new Map(lookups.map(l => [l.id, l.world]));
            queuePendingActivations(
                results.map(r => ({
                    uid: r.uid,
                    world: uidToWorld.get(r.uid) || '',
                    title: r.title,
                    content: r.content,
                })),
            );
            return formatLookupResults(results);
        },
        formatMessage: ({ lookups }: { lookups?: Array<{ id: number; world: string }> }) => {
            const count = Array.isArray(lookups) ? lookups.length : 1;
            return `Looking up ${count} lore entr${count === 1 ? 'y' : 'ies'}...`;
        },
        shouldRegister: () => getSettings().toolEnabled,
        get stealth() {
            return getSettings().stealth;
        },
    });

    lookupRegistered = true;
    console.log('[LoreGraph] lookup_lore tool registered');
}

function registerSearchTool(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();

    if (searchRegistered) {
        ctx.unregisterFunctionTool(SEARCH_TOOL_NAME);
        searchRegistered = false;
    }

    const settings = getSettings();
    if (!settings.searchToolEnabled) return;

    ctx.registerFunctionTool({
        name: SEARCH_TOOL_NAME,
        displayName: 'Search Lore',
        description: settings.searchToolDescription,
        parameters: Object.freeze({
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {
                terms: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        'Search terms to look up in lore entry titles and keywords, e.g. ["John", "Middle Earth"]',
                },
            },
            required: ['terms'],
        }),
        action: async (args: { terms?: string[] }) => {
            const terms = args?.terms;
            if (!Array.isArray(terms) || terms.length === 0) {
                return 'Error: No search terms provided. Please provide an array of strings.';
            }

            const results = await searchEntriesByTerms(terms);
            queuePendingActivations(
                results.map(r => ({
                    uid: r.uid,
                    world: r.world,
                    title: r.title,
                    content: r.content,
                })),
            );
            return formatSearchResults(results);
        },
        formatMessage: ({ terms }: { terms?: string[] }) => {
            const count = Array.isArray(terms) ? terms.length : 0;
            return `Searching lore for ${count} term${count === 1 ? '' : 's'}...`;
        },
        shouldRegister: () => getSettings().searchToolEnabled,
        get stealth() {
            return getSettings().stealth;
        },
    });

    searchRegistered = true;
    console.log('[LoreGraph] search_lore tool registered');
}

/**
 * Register both lookup_lore and search_lore function tools.
 */
export function registerTools(): void {
    registerLookupTool();
    registerSearchTool();
}

/** @deprecated Use registerTools() instead. */
export function registerTool(): void {
    registerLookupTool();
}

/**
 * Unregister both function tools.
 */
export function unregisterTools(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();
    ctx.unregisterFunctionTool(TOOL_NAME);
    ctx.unregisterFunctionTool(SEARCH_TOOL_NAME);
    lookupRegistered = false;
    searchRegistered = false;
    console.log('[LoreGraph] Function tools unregistered');
}

/** @deprecated Use unregisterTools() instead. */
export function unregisterTool(): void {
    unregisterTools();
}

import { TOOL_NAME } from './constants';
import { getSettings } from './settings';
import { findEntriesByUids } from './link-parser';
import { type LookupResult } from './types';

let isRegistered = false;

function formatResults(results: LookupResult[]): string {
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

export function registerTool(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();

    // Unregister first for idempotency
    if (isRegistered) {
        ctx.unregisterFunctionTool(TOOL_NAME);
        isRegistered = false;
    }

    const settings = getSettings();
    if (!settings.toolEnabled) return;

    ctx.registerFunctionTool({
        name: TOOL_NAME,
        displayName: 'Look Up Lore',
        description: [
            'Look up additional lore information by numeric ID.',
            'When you see text in lore or world info that contains references like [Name](ID:123),',
            'call this tool with the numeric ID(s) to retrieve the complete entry content.',
            'You can pass multiple IDs at once (e.g., [1, 5, 12]) to look up several entries.',
            'Use this when more details about a referenced person, place, item, or concept would',
            'improve your response.',
        ].join(' '),
        parameters: Object.freeze({
            $schema: 'http://json-schema.org/draft-04/schema#',
            type: 'object',
            properties: {
                ids: {
                    type: 'array',
                    items: { type: 'integer' },
                    description: 'Array of lore entry UIDs to look up, e.g. [1, 5, 12]',
                },
            },
            required: ['ids'],
        }),
        action: async (args: { ids?: number[] }) => {
            const ids = args?.ids;
            if (!Array.isArray(ids) || ids.length === 0) {
                return 'Error: No IDs provided. Please provide an array of numeric IDs.';
            }

            const results = await findEntriesByUids(ids, settings.crossBookLookup);
            return formatResults(results);
        },
        formatMessage: ({ ids }: { ids?: number[] }) => {
            const count = Array.isArray(ids) ? ids.length : 1;
            return `Looking up ${count} lore entr${count === 1 ? 'y' : 'ies'}...`;
        },
        shouldRegister: () => getSettings().toolEnabled,
        get stealth() {
            return getSettings().stealth;
        },
    });

    isRegistered = true;
    console.log('[LoreGraph] Function tool registered');
}

export function unregisterTool(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();
    ctx.unregisterFunctionTool(TOOL_NAME);
    isRegistered = false;
    console.log('[LoreGraph] Function tool unregistered');
}

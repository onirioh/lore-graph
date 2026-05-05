export const MODULE_NAME = 'lore_graph';

export const LINK_PATTERN = /\[([^\]]+)\]\(ID:(\d+)\)/g;
export const LINK_REGEX = /\[([^\]]+)\]\(ID:(\d+)\)/;

export const SELECTORS = {
    WORLD_POPUP: '#world_popup',
    WORLD_POPUP_ENTRIES: '#world_popup_entries_list',
    ENTRY_CONTENT_TEXTAREA: 'textarea[name="content"]',
    ENTRY_CONTAINER: '.world_entry',
    ENTRY_EDIT_DRAWER: '.world_entry_edit .inline-drawer-content',
    EDITOR_SELECT: '#world_editor_select',
    EXTENSIONS_SETTINGS: '#extensions_settings2',
    SETTINGS_CONTAINER: '#lore_graph_container',
} as const;

export const DEFAULT_SETTINGS = Object.freeze({
    toolEnabled: true,
    searchToolEnabled: true,
    stealth: false,
    stripLinksFromPrompt: false,
    crossBookLookup: true,
    lookupToolDescription: [
        'Look up additional lore information by numeric ID.',
        'When you see text in lore or world info that contains references like [Name](ID:123),',
        'call this tool with the numeric ID(s) to retrieve the complete entry content.',
        'You can pass multiple IDs at once (e.g., [1, 5, 12]) to look up several entries.',
        'Use this when more details about a referenced person, place, item, or concept would',
        'improve your response.',
    ].join(' '),
    searchToolDescription: [
        'Search for lore entries by name or keyword.',
        'Pass one or more search terms and the tool will return any lorebook entries whose',
        'title or activation keywords match them.',
        'Use this when you want to discover lore about a person, place, item, or concept',
        'that might not be explicitly linked but could exist in the lorebooks.',
    ].join(' '),
});

export const TOOL_NAME = 'lookup_lore';
export const SEARCH_TOOL_NAME = 'search_lore';

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
    stealth: false,
    stripLinksFromPrompt: false,
    crossBookLookup: true,
});

export const TOOL_NAME = 'lookup_lore';

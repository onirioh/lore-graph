import { type LoreGraphSettings } from './types';
import { MODULE_NAME, DEFAULT_SETTINGS, SELECTORS, TOOL_NAME, SEARCH_TOOL_NAME } from './constants';

let settings: LoreGraphSettings = { ...DEFAULT_SETTINGS };

export function getSettings(): LoreGraphSettings {
    return settings;
}

export function loadSettings(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { extensionSettings } = (globalThis as any).SillyTavern.getContext();

    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }

    // Merge to catch new keys added in updates
    const merged = { ...DEFAULT_SETTINGS, ...extensionSettings[MODULE_NAME] };
    extensionSettings[MODULE_NAME] = merged;
    settings = merged;
}

function saveSettings(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { extensionSettings, saveSettingsDebounced } = (globalThis as any).SillyTavern.getContext();
    extensionSettings[MODULE_NAME] = { ...settings };
    saveSettingsDebounced();
}

export async function renderSettingsPanel(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { renderExtensionTemplateAsync } = (globalThis as any).SillyTavern.getContext();

    const html = await renderExtensionTemplateAsync(
        'lore-graph',
        'settings',
        {
            enableExtension: settings.enableExtension,
            hardcoreMode: settings.hardcoreMode,
            toolEnabled: settings.toolEnabled,
            searchToolEnabled: settings.searchToolEnabled,
            crossBookLookup: settings.crossBookLookup,
            stripLinksFromPrompt: settings.stripLinksFromPrompt,
            stealth: settings.stealth,
            lookupToolDescription: settings.lookupToolDescription,
            searchToolDescription: settings.searchToolDescription,
        },
    );

    let container = document.querySelector(SELECTORS.SETTINGS_CONTAINER);
    if (!container) {
        container = document.createElement('div');
        container.id = 'lore_graph_container';
        document.querySelector(SELECTORS.EXTENSIONS_SETTINGS)?.appendChild(container);
    }
    container.innerHTML = html;
    bindSettingsUI();
}

function reregisterTools(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { unregisterFunctionTool } = (globalThis as any).SillyTavern.getContext();
    unregisterFunctionTool(TOOL_NAME);
    unregisterFunctionTool(SEARCH_TOOL_NAME);
    import('./function-tool').then(m => m.registerTools());
}

function syncExtensionState(): void {
    if (!settings.enableExtension) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { unregisterFunctionTool } = (globalThis as any).SillyTavern.getContext();
        unregisterFunctionTool(TOOL_NAME);
        unregisterFunctionTool(SEARCH_TOOL_NAME);
        import('./link-editor').then(m => m.destroyObserver());
    } else {
        reregisterTools();
        import('./link-editor').then(m => m.initLinkEditorObserver());
    }
}

function bindSettingsUI(): void {
    const enableCheckbox = document.getElementById('lg_enable_extension') as HTMLInputElement | null;
    const hardcoreCheckbox = document.getElementById('lg_hardcore_mode') as HTMLInputElement | null;
    const toolCheckbox = document.getElementById('lg_tool_enabled') as HTMLInputElement | null;
    const searchToolCheckbox = document.getElementById('lg_search_tool_enabled') as HTMLInputElement | null;
    const crossBookCheckbox = document.getElementById('lg_cross_book') as HTMLInputElement | null;
    const stripLinksCheckbox = document.getElementById('lg_strip_links') as HTMLInputElement | null;
    const stealthCheckbox = document.getElementById('lg_stealth') as HTMLInputElement | null;

    const lookupDescTextarea = document.getElementById('lg_lookup_description') as HTMLTextAreaElement | null;
    const searchDescTextarea = document.getElementById('lg_search_description') as HTMLTextAreaElement | null;

    enableCheckbox?.addEventListener('change', () => {
        settings.enableExtension = enableCheckbox.checked;
        saveSettings();
        syncExtensionState();
    });

    hardcoreCheckbox?.addEventListener('change', () => {
        settings.hardcoreMode = hardcoreCheckbox.checked;
        saveSettings();
    });

    toolCheckbox?.addEventListener('change', () => {
        settings.toolEnabled = toolCheckbox.checked;
        saveSettings();
        reregisterTools();
    });

    searchToolCheckbox?.addEventListener('change', () => {
        settings.searchToolEnabled = searchToolCheckbox.checked;
        saveSettings();
        reregisterTools();
    });

    crossBookCheckbox?.addEventListener('change', () => {
        settings.crossBookLookup = crossBookCheckbox.checked;
        saveSettings();
    });

    stripLinksCheckbox?.addEventListener('change', () => {
        settings.stripLinksFromPrompt = stripLinksCheckbox.checked;
        saveSettings();
    });

    stealthCheckbox?.addEventListener('change', () => {
        settings.stealth = stealthCheckbox.checked;
        saveSettings();
        reregisterTools();
    });

    lookupDescTextarea?.addEventListener('change', () => {
        settings.lookupToolDescription = lookupDescTextarea.value;
        saveSettings();
        reregisterTools();
    });

    searchDescTextarea?.addEventListener('change', () => {
        settings.searchToolDescription = searchDescTextarea.value;
        saveSettings();
        reregisterTools();
    });

    // Revert buttons
    document.querySelectorAll<HTMLButtonElement>('.lg-revert-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.lgRevert;
            if (target === 'lookup') {
                settings.lookupToolDescription = DEFAULT_SETTINGS.lookupToolDescription;
                if (lookupDescTextarea) lookupDescTextarea.value = settings.lookupToolDescription;
            } else if (target === 'search') {
                settings.searchToolDescription = DEFAULT_SETTINGS.searchToolDescription;
                if (searchDescTextarea) searchDescTextarea.value = settings.searchToolDescription;
            }
            saveSettings();
            reregisterTools();
        });
    });
}

import { type LoreGraphSettings } from './types';
import { MODULE_NAME, DEFAULT_SETTINGS, SELECTORS, TOOL_NAME } from './constants';

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
            toolEnabled: settings.toolEnabled,
            crossBookLookup: settings.crossBookLookup,
            stripLinksFromPrompt: settings.stripLinksFromPrompt,
            stealth: settings.stealth,
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

function bindSettingsUI(): void {
    const toolCheckbox = document.getElementById('lg_tool_enabled') as HTMLInputElement | null;
    const crossBookCheckbox = document.getElementById('lg_cross_book') as HTMLInputElement | null;
    const stripLinksCheckbox = document.getElementById('lg_strip_links') as HTMLInputElement | null;
    const stealthCheckbox = document.getElementById('lg_stealth') as HTMLInputElement | null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { registerFunctionTool, unregisterFunctionTool } = (globalThis as any).SillyTavern.getContext();

    toolCheckbox?.addEventListener('change', () => {
        settings.toolEnabled = toolCheckbox.checked;
        saveSettings();
        // Re-register the tool with updated settings
        if (settings.toolEnabled) {
            // Will be handled by re-registering in function-tool.ts via shouldRegister
            unregisterFunctionTool(TOOL_NAME);
            // Dynamic import to trigger re-registration
            import('./function-tool').then(m => m.registerTool());
        } else {
            unregisterFunctionTool(TOOL_NAME);
        }
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
        // Re-register tool to pick up stealth change
        unregisterFunctionTool(TOOL_NAME);
        import('./function-tool').then(m => m.registerTool());
    });
}

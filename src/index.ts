import './style.css';
import { MODULE_NAME } from './constants';
import { loadSettings, getSettings, renderSettingsPanel } from './settings';
import { registerTools, unregisterTools } from './function-tool';
import { initLinkEditorObserver, destroyObserver, injectLinkButtons } from './link-editor';
import { resolveLinks } from './link-parser';

let initialized = false;

async function init(): Promise<void> {
    if (initialized) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();

    // 1. Load settings with defaults
    loadSettings();

    // 2. Render settings panel (always available regardless of disable state)
    try {
        await renderSettingsPanel();
    } catch (e) {
        console.warn(`[${MODULE_NAME}] Could not render settings panel`, e);
    }

    // 3. If extension is disabled, skip activation of features
    if (!getSettings().enableExtension) {
        initialized = true;
        console.log(`[${MODULE_NAME}] Extension initialized (disabled)`);
        return;
    }

    // 4. Register function tools
    try {
        registerTools();
    } catch (e) {
        console.warn(`[${MODULE_NAME}] Could not register function tools`, e);
    }

    // 5. Set up editor link button injection
    try {
        initLinkEditorObserver();
    } catch (e) {
        console.warn(`[${MODULE_NAME}] Could not init link editor observer`, e);
    }

    // 6. Modify activated lore entries during scan
    if (ctx.eventSource) {
        ctx.eventSource.on(ctx.event_types.WORLDINFO_SCAN_DONE, (args: {
            activated?: { entries?: Map<string, { constant?: boolean; content?: string }> };
        }) => {
            const settings = getSettings();
            if (!settings.hardcoreMode && !settings.stripLinksFromPrompt) return;
            const allSet = args?.activated?.entries;
            if (!(allSet instanceof Map)) return;
            for (const [key,entry] of allSet) {
                // Strip [text](ID:n) links leaving only display text
                if (settings.stripLinksFromPrompt && typeof entry.content === 'string') {
                    entry.content = resolveLinks(entry.content);
                }
                // Hardcore mode: remove non-constant entries
                if (settings.hardcoreMode && !entry.constant) {
                    allSet.delete(key);
                }
            }
        });

        ctx.eventSource.on(ctx.event_types.WORLDINFO_UPDATED, () => {
            injectLinkButtons();
        });
        ctx.eventSource.on(ctx.event_types.WORLDINFO_SETTINGS_UPDATED, () => {
            injectLinkButtons();
        });
        ctx.eventSource.on(ctx.event_types.SETTINGS_UPDATED, () => {
            loadSettings();
            if (getSettings().enableExtension) {
                registerTools();
            } else {
                unregisterTools();
            }
        });
    }

    initialized = true;
    console.log(`[${MODULE_NAME}] Extension initialized`);
}

/**
 * Called when the extension is activated during page load.
 */
export async function onActivate(): Promise<void> {
    await init();
}

/**
 * Called when the extension is enabled by the user.
 */
export function onEnable(): void {
    loadSettings();
    if (getSettings().enableExtension) {
        registerTools();
        if (getSettings().toolEnabled) {
            initLinkEditorObserver();
        }
    }
    console.log(`[${MODULE_NAME}] Extension enabled`);
}

/**
 * Called when the extension is disabled by the user.
 */
export function onDisable(): void {
    unregisterTools();
    destroyObserver();
    console.log(`[${MODULE_NAME}] Extension disabled`);
}

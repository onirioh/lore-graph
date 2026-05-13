import './style.css';
import { MODULE_NAME, LINK_PATTERN, LINK_WORLD_PATTERN } from './constants';
import { loadSettings, getSettings, renderSettingsPanel } from './settings';
import { registerTools, unregisterTools } from './function-tool';
import { initLinkEditorObserver, destroyObserver, injectLinkButtons } from './link-editor';
import { transformLinksToWorldAware } from './link-parser';

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
            const allSet = args?.activated?.entries;
            if (!(allSet instanceof Map)) return;
            for (const [key, entry] of allSet) {
                if (typeof entry.content !== 'string') continue;

                // Transform [text](ID:n) to [text](ID:n;WORLD:world) for AI context
                if (!settings.stripLinksFromPrompt) {
                    const lastDot = key.lastIndexOf('.');
                    const sourceWorld = lastDot >= 0 ? key.substring(0, lastDot) : key;
                    entry.content = transformLinksToWorldAware(entry.content, sourceWorld);
                } else {
                    // Strip links: remove both old and world-aware link formats
                    LINK_PATTERN.lastIndex = 0;
                    LINK_WORLD_PATTERN.lastIndex = 0;
                    entry.content = entry.content
                        .replace(LINK_WORLD_PATTERN, '$1')
                        .replace(LINK_PATTERN, '$1');
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

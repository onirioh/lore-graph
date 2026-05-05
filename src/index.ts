import './style.css';
import { MODULE_NAME } from './constants';
import { loadSettings, getSettings, renderSettingsPanel } from './settings';
import { registerTools, unregisterTools } from './function-tool';
import { initLinkEditorObserver, destroyObserver, injectLinkButtons } from './link-editor';

let initialized = false;

async function init(): Promise<void> {
    if (initialized) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (globalThis as any).SillyTavern.getContext();

    // 1. Load settings with defaults
    loadSettings();

    // 2. Render settings panel in Extensions settings
    try {
        await renderSettingsPanel();
    } catch (e) {
        console.warn(`[${MODULE_NAME}] Could not render settings panel`, e);
    }

    // 3. Register the function tool
    try {
        registerTools();
    } catch (e) {
        console.warn(`[${MODULE_NAME}] Could not register function tool`, e);
    }

    // 4. Set up editor link button injection (delayed until editor is in DOM)
    try {
        initLinkEditorObserver();
    } catch (e) {
        console.warn(`[${MODULE_NAME}] Could not init link editor observer`, e);
    }

    // 5. Listen for world info events to re-inject editor buttons
    if (ctx.eventSource) {
        ctx.eventSource.on(ctx.event_types.WORLDINFO_UPDATED, () => {
            injectLinkButtons();
        });
        ctx.eventSource.on(ctx.event_types.WORLDINFO_SETTINGS_UPDATED, () => {
            injectLinkButtons();
        });
        ctx.eventSource.on(ctx.event_types.SETTINGS_UPDATED, () => {
            loadSettings();
            registerTools();
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
    registerTools();
    if (getSettings().toolEnabled) {
        initLinkEditorObserver();
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

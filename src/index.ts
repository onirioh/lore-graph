import './style.css';
import { MODULE_NAME, LINK_PATTERN, LINK_WORLD_PATTERN, TOOL_NAME, SEARCH_TOOL_NAME } from './constants';
import { loadSettings, getSettings, renderSettingsPanel } from './settings';
import { registerTools, unregisterTools } from './function-tool';
import { initLinkEditorObserver, destroyObserver, injectLinkButtons } from './link-editor';
import { transformLinksToWorldAware } from './link-parser';
import {
    drainPendingActivations,
    activateEntries,
    getEntriesForScan,
    saveState,
    loadState,
    incrementTurn,
    rebuildFromMessages,
    clearState,
} from './activation-manager';

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
        ctx.eventSource.on(ctx.event_types.WORLDINFO_SCAN_DONE, async (args: {
            activated?: { entries?: Map<string, { constant?: boolean; content?: string; _lg_toolActivated?: boolean }> };
        }) => {
            const settings = getSettings();
            const allSet = args?.activated?.entries;
            if (!(allSet instanceof Map)) return;

            // Inject tool-activated entries so they flow through the story string
            if (settings.persistToolActivations) {
                const toInject = await getEntriesForScan(ctx, allSet);
                for (const { key, entry } of toInject) {
                    allSet.set(key, entry);
                }
            }

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

                // Hardcore mode: remove non-constant entries (but keep tool-activated ones)
                if (settings.hardcoreMode && !entry.constant && !entry._lg_toolActivated) {
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
                clearState();
            }
        });

        ctx.eventSource.on(ctx.event_types.MESSAGE_SENT, () => {
            if (!getSettings().enableExtension) return;
            incrementTurn();
            saveState(ctx);
            import('./activation-ui').then(m => m.updateAllTTLTexts());
        });

        ctx.eventSource.on(ctx.event_types.CHAT_CHANGED, async () => {
            if (!getSettings().enableExtension) return;
            loadState(ctx);
            rebuildFromMessages(ctx.chat, getSettings().toolActivationTtl);
            import('./activation-ui').then(m => m.updateAllBlocks());
        });

        ctx.eventSource.on(ctx.event_types.MESSAGE_SWIPED, () => {
            if (!getSettings().enableExtension) return;
            rebuildFromMessages(ctx.chat, getSettings().toolActivationTtl);
            saveState(ctx);
            import('./activation-ui').then(m => m.updateAllBlocks());
        });

        ctx.eventSource.on(ctx.event_types.MESSAGE_DELETED, () => {
            if (!getSettings().enableExtension) return;
            rebuildFromMessages(ctx.chat, getSettings().toolActivationTtl);
            saveState(ctx);
            import('./activation-ui').then(m => m.updateAllBlocks());
        });

        ctx.eventSource.on(ctx.event_types.MESSAGE_UPDATED, (messageId: number) => {
            if (!getSettings().enableExtension) return;
            import('./activation-ui').then(m => m.renderActivationBlock(messageId));
        });

        ctx.eventSource.on(ctx.event_types.GENERATION_ENDED, async () => {
            const settings = getSettings();
            if (!settings.enableExtension) return;

            const chat = ctx.chat;
            if (!Array.isArray(chat) || chat.length === 0) return;

            // Check if this is the final end (non-recursive tool calling)
            const lastMsg = chat[chat.length - 1];
            if (lastMsg?.is_system && Array.isArray(lastMsg?.extra?.tool_invocations)) {
                return; // recursive tool call round — more generation coming
            }

            // Final end — process pending activations
            const pending = drainPendingActivations();
            if (pending.length === 0) return;

            // Find tool-call system messages from our tools (scan backwards)
            const toolMsgIndices: number[] = [];
            for (let i = chat.length - 1; i >= 0; i--) {
                const msg = chat[i];
                if (!msg?.is_system) continue;
                const invs = msg?.extra?.tool_invocations;
                if (!Array.isArray(invs)) continue;
                if (invs.some((inv: any) => inv.name === TOOL_NAME || inv.name === SEARCH_TOOL_NAME)) {
                    toolMsgIndices.push(i);
                }
            }

            // Find the AI response to attach activation records to
            let aiMessageIndex = -1;
            for (let i = chat.length - 1; i >= 0; i--) {
                const msg = chat[i];
                if (!msg.is_system) {
                    aiMessageIndex = i;
                    break;
                }
            }

            // Store activation record on the message
            if (aiMessageIndex >= 0) {
                const aiMsg = chat[aiMessageIndex];
                aiMsg.extra = aiMsg.extra || {};
                if (!Array.isArray(aiMsg.extra.loreGraphActivations)) {
                    aiMsg.extra.loreGraphActivations = [];
                }
                aiMsg.extra.loreGraphActivations.push({
                    entries: pending.map(e => ({
                        key: `${e.world}.${e.uid}`,
                        uid: e.uid,
                        world: e.world,
                        title: e.title,
                    })),
                    timestamp: Date.now(),
                });
            }

            // Activate entries for future scans
            await activateEntries(
                ctx,
                pending,
                settings.toolActivationTtl,
                aiMessageIndex >= 0 ? aiMessageIndex : chat.length - 1,
            );

            saveState(ctx);

            // Render activation UI block BEFORE deleting tool messages
            // (deletion shifts indices, so the block must be rendered first)
            if (settings.showActivationBlocks && !settings.stealth && aiMessageIndex >= 0) {
                const { renderActivationBlock } = await import('./activation-ui');
                renderActivationBlock(aiMessageIndex);
            }

            // Remove tool call system messages (reverse order to preserve indices)
            if (!settings.stealth && toolMsgIndices.length > 0) {
                for (const idx of toolMsgIndices.sort((a, b) => b - a)) {
                    ctx.deleteMessage(idx);
                }
            }

            await ctx.saveChat();
        });

        ctx.eventSource.on(ctx.event_types.GENERATION_STOPPED, () => {
            // Discard pending activations from interrupted generation
            drainPendingActivations();
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (globalThis as any).SillyTavern.getContext();
        loadState(ctx);
        if (Array.isArray(ctx.chat)) {
            rebuildFromMessages(ctx.chat, getSettings().toolActivationTtl);
        }
        import('./activation-ui').then(m => m.updateAllBlocks());
    }
    console.log(`[${MODULE_NAME}] Extension enabled`);
}

export function onDisable(): void {
    unregisterTools();
    destroyObserver();
    clearState();
    document.querySelectorAll('.lg-activation-bar').forEach(el => el.remove());
    console.log(`[${MODULE_NAME}] Extension disabled`);
}


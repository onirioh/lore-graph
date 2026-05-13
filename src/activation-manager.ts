import { type PendingActivation, type ActiveToolEntry, type MessageActivationRecord } from './types';

// In-memory state
const pendingQueue: PendingActivation[] = [];
const activeEntries: Map<string, ActiveToolEntry> = new Map();
let currentTurn = 0;

export function queuePendingActivations(entries: PendingActivation[]): void {
    pendingQueue.push(...entries);
}

export function drainPendingActivations(): PendingActivation[] {
    const drained = [...pendingQueue];
    pendingQueue.length = 0;
    return drained;
}

export function incrementTurn(): void {
    currentTurn++;
}

export function getCurrentTurn(): number {
    return currentTurn;
}

export async function activateEntries(
    ctx: any,
    entries: PendingActivation[],
    ttl: number,
    activatedAtMessageId: number,
): Promise<void> {
    const toActivate: Array<{ world: string; uid: number }> = [];
    const expiresAtTurn = currentTurn + ttl;

    for (const entry of entries) {
        const key = `${entry.world}.${entry.uid}`;

        if (activeEntries.has(key)) {
            const existing = activeEntries.get(key)!;
            existing.expiresAtTurn = expiresAtTurn;
            existing.title = entry.title;
            existing.content = entry.content;
            existing.isManuallyDeactivated = false;
            existing.activatedAtMessageId = activatedAtMessageId;
        } else {
            activeEntries.set(key, {
                key,
                uid: entry.uid,
                world: entry.world,
                title: entry.title,
                content: entry.content,
                expiresAtTurn,
                permanent: false,
                activatedAtMessageId,
                isManuallyDeactivated: false,
            });
        }

        toActivate.push({ world: entry.world, uid: entry.uid });
    }

    if (toActivate.length > 0 && ctx.eventSource) {
        await ctx.eventSource.emit(ctx.event_types.WORLDINFO_FORCE_ACTIVATE, toActivate);
    }
}

export async function getEntriesForScan(
    ctx: any,
    allActivated: Map<string, any>,
): Promise<Array<{ key: string; entry: Record<string, any> }>> {
    const toInject: Array<{ key: string; entry: Record<string, any> }> = [];
    for (const [key, toolEntry] of activeEntries) {
        if (toolEntry.isManuallyDeactivated) continue;
        if (!toolEntry.permanent && currentTurn >= toolEntry.expiresAtTurn) continue;
        if (allActivated.has(key)) continue;

        try {
            const data = await ctx.loadWorldInfo(toolEntry.world);
            const loreEntry = data?.entries?.[toolEntry.uid];
            if (loreEntry) {
                toolEntry.content = loreEntry.content || '';
                toolEntry.title = loreEntry.comment || '';
                toInject.push({
                    key,
                    entry: {
                        uid: loreEntry.uid,
                        comment: loreEntry.comment || '',
                        content: loreEntry.content || '',
                        position: loreEntry.position ?? 0,
                        constant: false,
                        key: loreEntry.key || [],
                        order: loreEntry.order ?? 100,
                        depth: loreEntry.depth ?? null,
                        role: loreEntry.role ?? null,
                        _lg_toolActivated: true,
                    },
                });
            } else {
                toInject.push({
                    key,
                    entry: {
                        uid: toolEntry.uid,
                        comment: toolEntry.title,
                        content: toolEntry.content,
                        position: 0,
                        constant: false,
                        _lg_toolActivated: true,
                    },
                });
            }
        } catch {
            toInject.push({
                key,
                entry: {
                    uid: toolEntry.uid,
                    comment: toolEntry.title,
                    content: toolEntry.content,
                    position: 0,
                    constant: false,
                    _lg_toolActivated: true,
                },
            });
        }
    }

    return toInject;
}

export function deactivateEntry(key: string): void {
    const entry = activeEntries.get(key);
    if (entry) {
        entry.isManuallyDeactivated = true;
    }
}

export function reactivateEntry(key: string): void {
    const entry = activeEntries.get(key);
    if (entry) {
        entry.isManuallyDeactivated = false;
    }
}

export function changeExpiry(key: string, delta: number): void {
    const entry = activeEntries.get(key);
    if (entry) {
        entry.permanent = false;
        entry.expiresAtTurn = Math.max(currentTurn, entry.expiresAtTurn + delta);
    }
}

export function setPermanent(key: string, value: boolean): void {
    const entry = activeEntries.get(key);
    if (entry) {
        entry.permanent = value;
    }
}

export function saveState(ctx: any): void {
    const serializable: Record<string, any> = {};
    for (const [key, entry] of activeEntries) {
        serializable[key] = { ...entry };
    }
    ctx.chatMetadata['loreGraphActiveEntries'] = serializable;
    ctx.saveMetadata();
}

export function loadState(ctx: any): void {
    activeEntries.clear();
    const saved = ctx.chatMetadata['loreGraphActiveEntries'];
    if (saved && typeof saved === 'object') {
        for (const [key, data] of Object.entries(saved)) {
            activeEntries.set(key, data as ActiveToolEntry);
        }
    }
}

export function rebuildFromMessages(chat: any[], ttl: number): void {
    activeEntries.clear();
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        const records: MessageActivationRecord[] = msg?.extra?.loreGraphActivations;
        if (!Array.isArray(records)) continue;
        for (const record of records) {
            for (const entry of record.entries) {
                const key = entry.key;
                if (!activeEntries.has(key)) {
                    const turnsElapsed = Math.floor((chat.length - 1 - i) / 2);
                    const expiresAtTurn = currentTurn + Math.max(0, ttl - turnsElapsed);
                    activeEntries.set(key, {
                        key,
                        uid: entry.uid,
                        world: entry.world,
                        title: entry.title,
                        content: '',
                        expiresAtTurn,
                        permanent: false,
                        activatedAtMessageId: i,
                        isManuallyDeactivated: false,
                    });
                }
            }
        }
    }
}

export function getActiveEntries(): ActiveToolEntry[] {
    return Array.from(activeEntries.values());
}

export function getEntry(key: string): ActiveToolEntry | undefined {
    return activeEntries.get(key);
}

export function clearState(): void {
    activeEntries.clear();
    pendingQueue.length = 0;
}

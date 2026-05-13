import { getEntry, deactivateEntry, reactivateEntry, changeExpiry, setPermanent, saveState, getCurrentTurn } from './activation-manager';
import { getSettings } from './settings';

function getCtx(): any {
    return (globalThis as any).SillyTavern.getContext();
}

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Render an activation info bar below a chat message.
 * Shows which entries were activated and provides deactivation controls.
 */
export function renderActivationBlock(messageId: number): void {
    const ctx = getCtx();
    const settings = getSettings();
    if (!settings.showActivationBlocks || settings.stealth) return;

    const chat = ctx.chat;
    const msg = chat[messageId];
    if (!msg || msg.is_system) return;

    const records = msg?.extra?.loreGraphActivations;
    if (!Array.isArray(records) || records.length === 0) return;

    // Collect unique entries across all records on this message
    const seen = new Set<string>();
    const entries: Array<{ key: string; title: string; world: string; uid: number }> = [];
    for (const record of records) {
        for (const entry of record.entries || []) {
            if (!seen.has(entry.key)) {
                seen.add(entry.key);
                entries.push(entry);
            }
        }
    }
    if (entries.length === 0) return;

    // Remove existing bar for this message
    removeBar(messageId);

    const mesElem = document.querySelector(`.mes[mesid="${messageId}"]`);
    if (!mesElem) return;

    const bar = document.createElement('div');
    bar.className = 'lg-activation-bar';
    bar.setAttribute('data-lg-mes-id', String(messageId));

    // Compute the block's remaining turns
    let blockRemaining = 0;
    let isPermanent = false;
    const turn = getCurrentTurn();
    for (const entry of entries) {
        const state = getEntry(entry.key);
        if (state) {
            if (state.permanent) {
                isPermanent = true;
            } else {
                const remaining = Math.max(0, state.expiresAtTurn - turn);
                if (remaining > blockRemaining) blockRemaining = remaining;
            }
        }
    }

    const ttlBadge = document.createElement('span');
    ttlBadge.className = 'lg-block-ttl';
    if (isPermanent) {
        ttlBadge.innerHTML = `
            <button class="lg-ttl-btn" data-lg-delta="0" data-lg-permanent="true" title="Remove permanent status">&infin;</button>
            <span class="lg-ttl-text">forever</span>
        `;
    } else {
        ttlBadge.innerHTML = `
            <button class="lg-ttl-btn" data-lg-delta="-1" title="Shorten duration">-</button>
            <span class="lg-ttl-text">${blockRemaining} turn${blockRemaining === 1 ? '' : 's'} left</span>
            <button class="lg-ttl-btn" data-lg-delta="1" title="Extend duration">+</button>
            <button class="lg-ttl-btn" data-lg-delta="999" data-lg-permanent="true" title="Make permanent">&infin;</button>
        `;
    }
    bar.appendChild(ttlBadge);

    for (const entry of entries) {
        const currentState = getEntry(entry.key);
        const isDeactivated = currentState?.isManuallyDeactivated ?? false;

        const chip = document.createElement('span');
        chip.className = 'lg-activation-entry';
        if (isDeactivated) {
            chip.classList.add('lg-manually-deactivated');
        }
        chip.dataset.lgKey = entry.key;

        const title = entry.title || `UID:${entry.uid}`;
        const action = isDeactivated ? 'reactivate' : 'deactivate';
        const icon = isDeactivated ? 'fa-rotate-right' : 'fa-ban';
        const tooltip = isDeactivated ? 'Reactivate entry' : 'Deactivate entry';

        chip.innerHTML = `
            <span class="lg-entry-title">${escapeHtml(title)}</span>
            <small class="lg-entry-world">${escapeHtml(entry.world)}</small>
            <button class="lg-deactivate-btn" data-lg-action="${action}"
                    data-lg-key="${escapeHtml(entry.key)}" title="${tooltip}">
                <i class="fa-solid ${icon}"></i>
            </button>
        `;

        bar.appendChild(chip);
    }

    // Bind deactivate/reactivate handlers
    bar.querySelectorAll('.lg-deactivate-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const target = e.currentTarget as HTMLElement;
            const key = target.dataset.lgKey;
            const action = target.dataset.lgAction;

            if (!key) return;

            if (action === 'deactivate') {
                deactivateEntry(key);
            } else {
                reactivateEntry(key);
            }

            saveState(getCtx());
            renderActivationBlock(messageId);
        });
    });

    // Bind TTL adjustment handlers
    bar.querySelectorAll('.lg-ttl-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const el = e.currentTarget as HTMLElement;
            const permanent = el.dataset.lgPermanent === 'true';
            const delta = parseInt(el.dataset.lgDelta || '0', 10);

            for (const entry of entries) {
                if (permanent) {
                    setPermanent(entry.key, !isPermanent);
                } else {
                    changeExpiry(entry.key, delta);
                }
            }
            saveState(getCtx());
            renderActivationBlock(messageId);
        });
    });

    // Insert bar after message text
    const mesText = mesElem.querySelector('.mes_text');
    if (mesText) {
        mesText.insertAdjacentElement('afterend', bar);
    }
}

function removeBar(messageId: number): void {
    const bar = document.querySelector(`.lg-activation-bar[data-lg-mes-id="${messageId}"]`);
    if (bar) bar.remove();
    // Also handle legacy bars without the attribute
    const mesElem = document.querySelector(`.mes[mesid="${messageId}"]`);
    const existing = mesElem?.querySelector('.lg-activation-bar');
    if (existing) existing.remove();
}

/**
 * Re-render all activation blocks for the current chat.
 */
/**
 * Update only the TTL counter text on all rendered bars without full re-render.
 */
export function updateAllTTLTexts(): void {
    const bars = document.querySelectorAll('.lg-activation-bar');
    const turn = getCurrentTurn();

    bars.forEach(bar => {
        const chips = bar.querySelectorAll('.lg-activation-entry');
        let minRemaining = Infinity;
        let anyPermanent = false;

        chips.forEach(chip => {
            const key = (chip as HTMLElement).dataset.lgKey;
            if (!key) return;
            const state = getEntry(key);
            if (!state) return;
            if (state.permanent) {
                anyPermanent = true;
            } else {
                const remaining = Math.max(0, state.expiresAtTurn - turn);
                if (remaining < minRemaining) minRemaining = remaining;
            }
        });

        const ttlText = bar.querySelector('.lg-ttl-text');
        if (!ttlText) return;

        if (anyPermanent && minRemaining === Infinity) {
            ttlText.textContent = 'forever';
        } else {
            const remaining = anyPermanent ? minRemaining : (minRemaining === Infinity ? 0 : minRemaining);
            ttlText.textContent = `${remaining} turn${remaining === 1 ? '' : 's'} left`;
        }
    });
}

export function updateAllBlocks(): void {
    const ctx = getCtx();
    const settings = getSettings();
    if (!settings.showActivationBlocks || settings.stealth) return;

    const chat = ctx.chat;
    if (!Array.isArray(chat)) return;

    // Set data-lg-mes-id on any existing bars that lack it, then find and remove all
    document.querySelectorAll('.lg-activation-bar').forEach(el => {
        if (!el.hasAttribute('data-lg-mes-id')) {
            const mes = el.closest('.mes');
            const id = mes?.getAttribute('mesid');
            if (id) el.setAttribute('data-lg-mes-id', id);
        }
    });
    document.querySelectorAll('.lg-activation-bar').forEach(el => el.remove());

    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg || msg.is_system) continue;
        const records = msg?.extra?.loreGraphActivations;
        if (Array.isArray(records) && records.length > 0) {
            renderActivationBlock(i);
        }
    }
}

import { SELECTORS, LINK_PATTERN, LINK_WORLD_PATTERN } from './constants';

let observer: MutationObserver | null = null;

/**
 * Set up a MutationObserver on the world info editor to inject
 * "Create Link" buttons whenever entries are rendered or re-rendered.
 */
export function initLinkEditorObserver(): void {
    const target =
        document.querySelector(SELECTORS.WORLD_POPUP_ENTRIES) ||
        document.querySelector(SELECTORS.WORLD_POPUP);

    if (!target) {
        console.log('[LoreGraph] World info editor not in DOM yet; retrying on APP_READY');
        return;
    }

    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver(() => {
        injectLinkButtons();
    });

    observer.observe(target, {
        childList: true,
        subtree: true,
    });

    // Initial injection
    injectLinkButtons();
    injectExportCleanButton();
}

/**
 * Disconnect the MutationObserver (on extension disable).
 */
export function destroyObserver(): void {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

/**
 * Inject the "Export Clean" button next to the existing Export button.
 * Strips all [text](ID:n) links from entry content before exporting.
 */
export function injectExportCleanButton(): void {
    const exportBtn = document.querySelector('#world_popup_export');
    if (!exportBtn) return;

    // Don't double-inject
    if (exportBtn.nextElementSibling?.classList.contains('lg-export-clean')) return;

    const button = document.createElement('div');
    button.className = 'menu_button fa-solid fa-file-export lg-export-clean';
    button.title = 'Export World Info without links (text only)';

    exportBtn.insertAdjacentElement('afterend', button);

    button.addEventListener('click', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { loadWorldInfo } = (globalThis as any).SillyTavern.getContext();

        const name = getCurrentLorebookName();
        if (!name) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).toastr?.error?.('No lorebook open in editor.');
            return;
        }

        const data = await loadWorldInfo(name);
        if (!data?.entries) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).toastr?.error?.('Could not load lorebook data.');
            return;
        }

        // Deep clone and strip links from all entries
        const clean = structuredClone(data);
        for (const entry of Object.values(clean.entries) as Array<{ content?: string }>) {
            if (entry.content) {
                LINK_PATTERN.lastIndex = 0;
                LINK_WORLD_PATTERN.lastIndex = 0;
                entry.content = entry.content
                    .replace(LINK_WORLD_PATTERN, '$1')
                    .replace(LINK_PATTERN, '$1');
            }
        }

        const jsonValue = JSON.stringify(clean, null, 2);
        const fileName = `${name}_clean.json`;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error webpackIgnore runtime import
        const { download } = await import(/* webpackIgnore: true */ '/scripts/utils.js');
        download(jsonValue, fileName, 'application/json');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).toastr?.success?.(`Exported ${fileName}`);
    });
}

/**
 * Find all content textareas in the world editor that haven't been
 * injected yet, and add a "Create Link" button to each.
 */
export function injectLinkButtons(): void {
    const textareas = document.querySelectorAll<HTMLTextAreaElement>(
        `#world_popup_entries_list ${SELECTORS.ENTRY_CONTENT_TEXTAREA}, #world_popup ${SELECTORS.ENTRY_CONTENT_TEXTAREA}`,
    );

    textareas.forEach((textarea) => {
        if (textarea.dataset.lgInjected === 'true') return;
        textarea.dataset.lgInjected = 'true';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu_button lg-create-link';
        button.innerHTML = '<i class="fa-solid fa-link"></i> Create Link';
        button.title = 'Convert selected text into a lore link';

        // Insert after the textarea's parent container
        const drawerContent = textarea.closest('.inline-drawer-content');
        if (drawerContent) {
            // Append to the drawer content after a wrapping div if present
            const wrapDiv = textarea.closest('div');
            if (wrapDiv && wrapDiv.parentElement === drawerContent) {
                wrapDiv.insertAdjacentElement('afterend', button);
            } else {
                textarea.insertAdjacentElement('afterend', button);
            }
        } else {
            textarea.insertAdjacentElement('afterend', button);
        }

        button.addEventListener('click', () => handleCreateLink(textarea));
    });

    injectExportCleanButton();
}

/**
 * Get the currently open lorebook name from the editor dropdown.
 */
function getCurrentLorebookName(): string | null {
    const select = document.querySelector(SELECTORS.EDITOR_SELECT) as HTMLSelectElement | null;
    if (!select) return null;
    return select.options[select.selectedIndex]?.text || null;
}

/**
 * Handle the "Create Link" button click for a specific textarea.
 */
async function handleCreateLink(textarea: HTMLTextAreaElement): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Popup, POPUP_TYPE, POPUP_RESULT, renderExtensionTemplateAsync, loadWorldInfo } =
        (globalThis as any).SillyTavern.getContext();

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end).trim();

    if (!selectedText) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).toastr?.warning?.('Select text in the entry content to create a link.');
        return;
    }

    const bookName = getCurrentLorebookName();
    if (!bookName) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).toastr?.error?.('Could not determine current lorebook. Open a lorebook in the editor first.');
        return;
    }

    const data = await loadWorldInfo(bookName);
    if (!data?.entries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).toastr?.error?.('Could not load lorebook entries.');
        return;
    }

    // Build entry list sorted by order for the picker
    const entries = Object.values(data.entries as Record<number, {
        uid: number;
        comment: string;
        order: number;
    }>)
        .filter((e: { uid: unknown }) => e.uid !== undefined)
        .sort((a: { order: number }, b: { order: number }) => (a.order ?? 100) - (b.order ?? 100));

    if (entries.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).toastr?.warning?.('No entries in this lorebook to link to.');
        return;
    }

    const html = await renderExtensionTemplateAsync('lore-graph', 'link-picker', { entries });

    // Track selection via event listener since Popup removes DOM before show() resolves
    let selectedUid: string | null = null;
    const container = document.createElement('div');
    container.innerHTML = html;

    // Search filter
    const searchInput = container.querySelector<HTMLInputElement>('.lg-search-input');
    const entryList = container.querySelector('.lg-entry-list');
    const searchCount = container.querySelector('.lg-search-count');
    const updateCount = () => {
        if (!searchCount || !entryList) return;
        const visible = entryList.querySelectorAll<HTMLElement>('.lg-entry-option:not([hidden])').length;
        searchCount.textContent = `${visible} of ${entries.length}`;
    };
    updateCount();

    searchInput?.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        entryList?.querySelectorAll<HTMLElement>('.lg-entry-option').forEach(option => {
            const text = (option.dataset.lgSearch || '').toLowerCase();
            const matched = !query || text.includes(query);
            option.hidden = !matched;
            // Deselect if hidden
            if (!matched) {
                const radio = option.querySelector<HTMLInputElement>('input[name="lg_target"]');
                if (radio) radio.checked = false;
            }
        });
        updateCount();
    });

    container.querySelectorAll<HTMLInputElement>('input[name="lg_target"]').forEach(radio => {
        radio.addEventListener('change', () => {
            selectedUid = radio.value;
        });
    });

    const popup = new Popup(container, POPUP_TYPE.TEXT, '', {
        okButton: 'Link',
        cancelButton: 'Cancel',
        allowVerticalScrolling: true,
    });

    const result = await popup.show();
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    if (!selectedUid) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).toastr?.warning?.('Select a target entry to link to.');
        return;
    }

    const targetUid = selectedUid;

    // Replace selected text with link syntax
    const linkText = `[${selectedText}](ID:${targetUid})`;
    textarea.setRangeText(linkText, start, end, 'end');

    // Trigger input event so the lorebook editor saves the change
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).toastr?.success?.(`Link to "${selectedText}" created.`);
}

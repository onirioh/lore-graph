export interface LoreGraphSettings {
    enableExtension: boolean;
    hardcoreMode: boolean;
    toolEnabled: boolean;
    searchToolEnabled: boolean;
    stealth: boolean;
    stripLinksFromPrompt: boolean;
    lookupToolDescription: string;
    searchToolDescription: string;
    persistToolActivations: boolean;
    toolActivationTtl: number;
    showActivationBlocks: boolean;
}

export interface LinkMatch {
    displayText: string;
    targetUid: number;
    fullMatch: string;
}

export interface ActiveLoreEntry {
    uid: number;
    world: string;
    comment: string;
    content: string;
    key: string[];
}

export interface WorldLookupItem {
    id: number;
    world: string;
}

export interface LookupResult {
    uid: number;
    title: string;
    content: string;
}

export interface PendingActivation {
    uid: number;
    world: string;
    title: string;
    content: string;
}

export interface ActiveToolEntry {
    key: string;
    uid: number;
    world: string;
    title: string;
    content: string;
    expiresAtTurn: number;
    permanent: boolean;
    activatedAtMessageId: number;
    isManuallyDeactivated: boolean;
}

export interface MessageActivationRecord {
    entries: Array<{
        key: string;
        uid: number;
        world: string;
        title: string;
    }>;
    timestamp: number;
}

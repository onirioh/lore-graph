export interface LoreGraphSettings {
    toolEnabled: boolean;
    stealth: boolean;
    stripLinksFromPrompt: boolean;
    crossBookLookup: boolean;
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

export interface LookupResult {
    uid: number;
    title: string;
    content: string;
}

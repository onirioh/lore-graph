export interface LoreGraphSettings {
    toolEnabled: boolean;
    searchToolEnabled: boolean;
    stealth: boolean;
    stripLinksFromPrompt: boolean;
    crossBookLookup: boolean;
    lookupToolDescription: string;
    searchToolDescription: string;
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

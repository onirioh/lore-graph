export {};

// 1. Import when extension is user-scoped
import '../../../global';
// 2. Import when extension is server-scoped
import '../../../../global';

// Runtime-only dynamic imports (webpackIgnore bypasses bundling)
declare module '/scripts/world-info.js' {
    export let selected_world_info: string[];
    export let world_info: {
        globalSelect: string[];
        charLore: Array<{ name: string; extraBooks: string[] }>;
    };
    export function loadWorldInfo(name: string): Promise<{
        entries: Record<number, { uid: number; comment: string; content: string; order: number }>;
    } | undefined>;
}

declare module '/scripts/power-user.js' {
    export const power_user: {
        persona_description_lorebook: string;
    };
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toastr: any;
}

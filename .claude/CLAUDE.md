# Lore Graph — SillyTavern Extension

Webpack + TypeScript SillyTavern extension that adds hyperlinks between lorebook entries and AI tool-call lookup for intelligent lore discovery.

## Purpose

An extension for the SillyTavern project (an AI chatbot front end). This extension aims to improve the lorebook feature and make its context usage more efficient by allowing the AI to intelligently query needed information.

### Justification / Current shortcomings

Currently, lorebook (world info) entries are triggered and added to the context as certain keywords come up during conversation, but this could miss related entries that will be important later. This also makes it difficult for the AI to bring up certain lore concepts since they have to be mentioned first.

### Project Idea:

Lorebook entries can contain `[display text](ID:uid)` hyperlinks to other entries from the same lorebook. In the editor, links are stored in this short format. When entries are injected into the AI prompt, links are automatically transformed to `[text](ID:uid;WORLD:worldname)` so the AI knows which lorebook each linked entry belongs to. The AI can then call `lookup_lore` / `search_lore` function tools to retrieve full entry content on demand. A "Create Link" button in the lorebook editor lets users convert selected text into links via a popup picker.

---
Editor: Lucas is a 19 year old boy, first son of [Eldric](ID:001).
In context: Lucas is a 19 year old boy, first son of [Eldric](ID:001;WORLD:Characters).
[…]
Editor: He learned [Fire Magic](ID:096) from the wizard [Raul](ID:068)
In context: He learned [Fire Magic](ID:096;WORLD:Characters) from the wizard [Raul](ID:068;WORLD:Characters)
---

These links point to other lorebook entries within the same lorebook. This lets the AI discover related facts intelligently. It can avoid bringing irrelevant information into context or do a deep dive into the lore if necessary.

This extension must work alongside the current lorebook functionality. Constant entries must always be activated regardless, and there has to be an option for entries to also be injected the old way, by keyword matching.

The lorebook editor would have some UI to create these links. When the user is editing a lore entry, they can highlight some text and press a button to create a link, selecting a target entry from that lorebook and replacing the highlighted text with a link where the link's text is the text that was highlighted and the ID is the selected entry's ID.

## File structure

### Project directories

The project directory is "C:\Users\helius\SillyTavern\public\scripts\extensions\lore-graph". You may look at the SillyTavern client-side code at "C:\Users\helius\SillyTavern\public" for reference, but you can't look anywhere outside of the SillyTavern directory.

I've provided some official documentation (.claude\function-calling.md and .claude\ui-extensions.md). They're all in the extension's directory.

### Files

```
manifest.json          — Extension metadata, lifecycle hooks
settings.html          — Handlebars template for settings panel (inline-drawer)
link-picker.html       — Handlebars template for link target selection popup
webpack.config.js      — Webpack config (ES module output, ts/css/html loaders)
globals.d.ts           — Ambient type declarations for SillyTavern globals + runtime imports
tsconfig.json          — TypeScript config
src/
  index.ts             — Entry point, lifecycle hooks, event listeners
  constants.ts         — MODULE_NAME, LINK_PATTERN regex, CSS selectors, DEFAULT_SETTINGS, tool names
  types.ts             — TypeScript interfaces (LoreGraphSettings, LinkMatch, LookupResult, etc.)
  settings.ts          — Settings load/save, settings panel rendering, UI bindings
  function-tool.ts     — lookup_lore + search_lore function tool registration
  link-parser.ts       — Parse links, transform to world-aware format, resolve UIDs by world, term search
  link-editor.ts       — DOM injection: "Create Link" button, searchable picker popup, export-clean button
  style.css            — All extension styles
  html.d.ts            — Module declaration for html-loader imports
dist/
  index.js             — Built bundle (ES module)
```

## Build

```bash
npm install
npm run build
```

Output is `dist/index.js` (ES module, minified). The manifest points `js` to `dist/index.js`.

## Architecture

### Link format

**Editor format** (stored in lorebook data):
```
[Text](ID:001)
```
Regex `\[([^\]]+)\]\(ID:(\d+)\)` — matched by `LINK_PATTERN`.

**Context format** (injected into AI prompts, transformed from editor format):
```
[Text](ID:001;WORLD:MyWorld)
```
Regex `\[([^\]]+)\]\(ID:(\d+);WORLD:([^;)]+)\)` — matched by `LINK_WORLD_PATTERN`.

Transformation happens in `WORLDINFO_SCAN_DONE` handler via `transformLinksToWorldAware()`. The world name is extracted from the activated entry's Map key (`"world.uid"` → split on last `.`). Links are always intra-book by default — the world is the containing entry's own lorebook.

### Function tools

Both registered via `SillyTavern.getContext().registerFunctionTool()`:
- **`lookup_lore`** — batch lookup by `{id, world}` pairs (`lookups: Array<{id: integer, world: string}>`). Looks up each entry in its specified lorebook directly.
- **`search_lore`** — exact match search by term (`terms: string[]`). Case-insensitive exact match against entry `comment` (title) and `key` (activation keywords). Searches all active lorebooks.

Both respect `shouldRegister` and `stealth` from settings. Descriptions are editable in settings.

### Entry resolution

`link-parser.ts` uses `import(/* webpackIgnore: true */ '/scripts/world-info.js')` to access `selected_world_info`, `world_info.charLore`, and `loadWorldInfo`. Also imports from `/scripts/power-user.js` for persona lorebooks. These are runtime-only dynamic imports bypassing webpack bundling.

### Editor UI injection

`link-editor.ts` uses a `MutationObserver` on `#world_popup_entries_list` to detect when entry editors render. Injects:
- **"Create Link" button** next to each content textarea (checked via `data-lg-injected`)
- **"Export Clean" button** next to `#world_popup_export` (checked via class)

The link picker popup uses `Popup` class. Before showing the popup, `change` event listeners on radio buttons capture the selected UID in a closure variable — needed because Popup destroys its DOM before `show()` resolves.

### Prompt interception

The extension listens to `WORLDINFO_SCAN_DONE` event to modify activated entries before the prompt is built:
- **Default**: transforms `[text](ID:n)` → `[text](ID:n;WORLD:world)` for all activated entries, using each entry's own lorebook name (extracted from the Map key `"world_name.uid"` via `lastIndexOf('.')`)
- If `stripLinksFromPrompt` is on: strips both `[text](ID:n;WORLD:world)` and `[text](ID:n)` formats, leaving only display text
- If `hardcoreMode` is on: removes non-constant entries from the activated set

## Gotchas discovered

### Core function access
This is a bundled extension — cannot statically import from SillyTavern core. Use:
- `SillyTavern.getContext()` for most APIs (loadWorldInfo, extensionSettings, renderExtensionTemplateAsync, etc.)
- `import(/* webpackIgnore: true */ '/scripts/world-info.js')` for `selected_world_info` and `world_info.charLore`
- `import(/* webpackIgnore: true */ '/scripts/utils.js')` for the `download()` function
- `(globalThis as any).toastr` for toast notifications

### `WORLDINFO_SCAN_DONE` event structure
The event passes `{ activated: { entries: Map, text: string }, state: {...}, new: {...}, ... }`. The entries are at `args.activated.entries` (not `args.allActivatedEntries`). The entries are a **Map** (not Set) keyed by `"world_name.uid"` strings. Deleting from the Map uses `map.delete(key)`, not `set.delete(entry)`.

### `@ts-expect-error` on runtime imports
TypeScript doesn't know about `/scripts/world-info.js` or `/scripts/utils.js` as modules. Use `// @ts-expect-error webpackIgnore runtime import` on the line before each `import(/* webpackIgnore: true */ ...)` call.

### Popup DOM lifecycle
`Popup.show()` removes its DOM before returning. Don't query the popup's DOM after `popup.show()` resolves — capture values beforehand via event listeners on a detached container.

### `renderExtensionTemplateAsync` paths
The extension lives at `scripts/extensions/lore-graph/`. Templates at the extension root are loaded with `renderExtensionTemplateAsync('lore-graph', 'template-name')`. Templates at root level (not in `src/`) because they're fetched at runtime via HTTP, not bundled by webpack.

### Webpack ES module output
Must set `output.library.type: 'module'` and `experiments.outputModule: true` in webpack config. Otherwise the bundle is an IIFE with no exports, and SillyTavern's lifecycle hooks (`onActivate`, `onEnable`, `onDisable`) won't be found.

## Settings reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enableExtension` | boolean | true | Master toggle — disables tools, editor injection, and event hooks |
| `hardcoreMode` | boolean | false | Only constant entries activate; all keyword-based activation suppressed |
| `toolEnabled` | boolean | true | Enable lookup_lore tool |
| `searchToolEnabled` | boolean | true | Enable search_lore tool |
| `stealth` | boolean | false | Hide tool call results from chat |
| `stripLinksFromPrompt` | boolean | false | Strip all link markup from prompts (show only text) |
| `lookupToolDescription` | string | (see constants.ts) | Custom description for lookup_lore |
| `searchToolDescription` | string | (see constants.ts) | Custom description for search_lore |

## Key SillyTavern APIs used

- `SillyTavern.getContext()` — main API accessor
- `registerFunctionTool()` / `unregisterFunctionTool()` — function tool lifecycle
- `renderExtensionTemplateAsync(name, template, data)` — Handlebars template rendering
- `loadWorldInfo(name)` — load a lorebook by name (with caching)
- `extensionSettings` / `saveSettingsDebounced()` — persistent settings
- `eventSource.on(event_types.WORLDINFO_SCAN_DONE, ...)` — world info scan hook
- `eventSource.on(event_types.WORLDINFO_UPDATED, ...)` — editor re-render hook
- `Popup` / `POPUP_TYPE` / `POPUP_RESULT` — modal dialogs

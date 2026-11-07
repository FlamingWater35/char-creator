# AGENTS.md

Orientation for anyone (human or agent) changing this repository.

## What this is

A local-first character-card studio for roleplay. SvelteKit 3 + Svelte 5 (runes),
Tailwind v4, Dexie/IndexedDB, OpenAI SDK. There is no backend database and no
account system: characters, avatars and assets live in the browser, and the two
API routes are thin proxies to an LLM provider.

## Commands

```bash
npm run dev            # dev server (Vite), http://localhost:5173
npm run check          # svelte-check: types + a11y. Must stay at 0 errors, 0 warnings.
npm test               # unit tests, node:test (Node 22+)
npm run test:browser   # browser regression suite (needs `npm run dev` running)
npm run build          # production build
```

`npm test` only matches `tests/*.test.ts`. `tests/browser.test.mjs` is
deliberately excluded: it needs a running dev server and a browser, and CI does
not provision one. It exits 0 with a skip notice when Playwright is absent.

Baseline before you start: `npm run check` reports 0 errors and 0 warnings, and
all 78 unit tests pass. Do not leave either worse than you found it.

## Layout

```
src/
  env.ts                 # server env vars declared via defineEnvVars (SvelteKit 3)
  lib/
    backup.ts            # validates untrusted backup JSON into db.ts shapes
    card.ts              # V2/V3 spec mapping, field preservation, dialogue parsing
    db.ts                # Dexie schema + versioned migrations
    errors.ts            # errorMessage() / isBenignSaveAbort() helpers
    png.ts               # PNG chunk read/write, image compression, thumbnails
    prompts.ts           # editable enhance/regenerate templates + placeholder renderer
    reasoning.ts         # strips chain-of-thought blocks from model output
    settings.svelte.ts   # localStorage-backed settings store (class with $state)
    dialogs.svelte.ts    # promise-based alert()/confirm() controller
    autoresize.ts        # `use:autoresize` textarea action
    server/providers.ts  # provider allowlist, SSRF guard, secret redaction
    components/
      editor/            # AiFieldActions, SubfieldSection, Subfields,
                         # FirstGreetings, ExampleDialogues, Lorebook, MediaAssets
      settings/          # PromptTemplateEditor
  routes/
    +page.svelte         # dashboard: create, import, delete
    editor/[id]/         # the character editor
    settings/            # appearance, AI engine, prompts, backup/restore
    api/generate/        # completion proxy
    api/models/          # model list proxy
  service-worker.ts      # offline cache
tests/                   # node:test unit tests; fixtures.ts builds PNGs in memory
```

Two things about the runtime that shape everything:

- **SSR is off.** `src/routes/+layout.ts` is `export const ssr = false`. The app
  is browser-only because IndexedDB and `localStorage` back all state. Do not add
  server-side data loading.
- **Runes are forced.** `vite.config.ts` passes `compilerOptions.runes` to the
  `sveltekit()` plugin for everything outside `node_modules`, so use
  `$state`/`$derived`/`$props` — the old `export let` / `$:` syntax is not
  available in `.svelte` files.

## Conventions

**Indentation is mixed, and that is not an accident to fix.** There is no
Prettier or ESLint config in this repo. Files split roughly by age:

- Tabs: `card.ts`, `reasoning.ts`, `server/providers.ts`, `api/**/+server.ts`,
  `service-worker.ts`, `tests/*.test.ts`
- Two spaces: `db.ts`, `png.ts`, `settings.svelte.ts`, `dialogs.svelte.ts`,
  `autoresize.ts`, `env.ts`, `prompts.ts`, every `.svelte` file

Match the file you are editing. Never reformat a whole file to your own taste —
it buries the real change in a diff nobody can review.

Other conventions:

- Comments explain *why*, not *what*. Several non-obvious decisions in this
  codebase are load-bearing and are commented at the point of the decision; keep
  that style when you add something surprising.
- Relative imports inside `src/lib` (`./prompts`), `#lib/...` elsewhere.
- `dialogs.alert()` / `dialogs.confirm()` rather than `window.alert`/`confirm`.
- Destructive or irreversible actions ask first.

## Invariants worth breaking the build over

**Prompt templates are data.** The wording of the Enhance and Regenerate actions
lives in `src/lib/prompts.ts`, not inline in the editor, because users can edit
it in Settings → Advanced. If you add a third action, add a template and a
placeholder entry there too, and wire it through `runFieldAction`.

**Regenerate must not receive `{content}`.** This is the whole point of having
two buttons: Enhance refines what is there, Regenerate writes fresh so a weak
first draft cannot anchor the rewrite. `DEFAULT_REGENERATE_PROMPT` deliberately
omits the token. `tests/prompts.test.ts` guards this — do not "helpfully" add it.

**Undo only restores text that existed.** `runFieldAction` records the undo
buffer only when the field was non-empty. Undoing a first generation would mean
writing an empty string over real output.

**One component owns the action buttons.** `AiFieldActions.svelte` renders
Enhance / Regenerate / Cancel / Undo for every field. It is used in four places
— the editor page (Description), `SubfieldSection` (the four optional
subfields), `FirstGreetings` and `ExampleDialogues`. Do not hand-roll these
buttons in a new section; pass the callbacks from `fieldBinding()` in the editor
page. Before this component existed, each section carried its own copy of the
Enhance/Cancel markup, which is exactly how their behaviour drifted apart.

**Imported card fields must survive a round-trip.** `data.cardMeta` holds every
spec field the editor does not expose (`tags`, `creator`, `creator_notes`,
`system_prompt`, `post_history_instructions`, unknown lorebook keys, …), and
`buildCardPayload` merges them back on export. Adding a field to the editor
means adding it to `OWNED_CARD_FIELDS` in `card.ts`; otherwise it will be
exported twice — once from the editor and once from the preserved blob.

**Dexie migrations are append-only.** Never edit a shipped `this.version(n)`
block; existing users have already run it. Add `this.version(n + 1)` with an
`upgrade()` that fills in the new field. Note the comment in v8: an async
callback inside `modify()` is treated as the new record value, so read-then-write
instead.

**The proxy must stay an allowlist.** `src/lib/server/providers.ts` hard-codes
base URLs for known providers and gates the custom provider behind an explicit
opt-in plus an SSRF check (metadata endpoints, link-local, `0.0.0.0`). Without
it a public deployment is an open relay that can reach its own private network.
Do not add a "just pass the URL through" path.

**Never put the API key in a backup.** Settings → Database exports plain JSON
that people copy around. Importing a backup also refuses to apply a key from the
file, and asks before changing the provider or base URL.

**Backups are parsed, never trusted.** `src/lib/backup.ts` narrows the file into
`db.ts` shapes and drops rows it cannot use. Do not read `JSON.parse(file)`
fields directly in a component again: an unvalidated `exampleMessages` row
without an `id` used to reach a keyed `{#each}` and throw at render time, and a
hand-edited `firstMessages: []` produced an editor with no greeting at all.

## Gotchas that cost real time

**SvelteKit 3 removed several things this repo used.** Each has a replacement,
and the migration is done — do not reintroduce the old form:

- `svelte.config.js` is gone. Configuration lives in the `sveltekit({...})` call
  in `vite.config.ts`.
- `$lib` is no longer a built-in alias. It is now `#lib`, declared as Node
  subpath imports in `package.json` (`"imports": { "#lib": ..., "#lib/*": ... }`)
  and mirrored in `tsconfig.json` `compilerOptions.paths` because TypeScript
  needs the explicit mapping.
- `$service-worker` is gone. `src/service-worker.ts` uses `immutable`/`assets`
  from `$app/manifest` and `version` from `$app/env`. The manifest arrays hold
  `{ path }` objects, not strings.
- `$app/stores` is gone; use `page` from `$app/state` (no `$` prefix).
- `$env/dynamic/private` is gone; declare variables in `src/env.ts` with
  `defineEnvVars` and import them from `$app/env/private`.

**`@lucide/svelte` has no per-icon files.** Exports live in
`dist/icons/index.js` (core) and `dist/aliases/aliases.js` (aliases such as
`Edit`, `Loader2`, `CircleHelp`, `Grid2x2`). Check the index before assuming an
icon name exists — a wrong name is a build-time error that is easy to avoid.

**`class="{expr}"` on a component triggers `attribute_quoted`.** Write
`class={expr}`. This is a warning, and the repo holds the 0-warning baseline.

**Do not use a controlled `<textarea>` for a long text.** `value={x}` plus
`oninput` resets the caret to the end on every keystroke, which makes editing a
1200-character prompt impossible. Use `bind:value` (see `PromptTemplateEditor`).

**Tailwind v4 has no `xs` breakpoint by default.** This project defines
`--breakpoint-xs: 30rem` in `src/routes/layout.css`.

**Row layouts with buttons need `flex-wrap`.** The Enhance/Regenerate pair plus
a label overflows a 375px viewport and scrolls the whole page sideways. This was
a real bug; `AiFieldActions` wraps its buttons for that reason.

**`localStorage` keys are prefixed `or_`** and read/written in
`settings.svelte.ts` (`or_key`, `or_model`, `or_enhance_prompt`, …). Private
browsing throws on access, so every read and write is wrapped in try/catch —
keep it that way.

**`$props<T>()` is no longer accepted.** Write
`let { x }: { x: T } = $props();` — the type argument form was removed in
Svelte 5.57.

**Placeholder text is pinned on purpose.** Tailwind v4's preflight colours
`::placeholder` with `color-mix(in oklab, currentcolor 50%, transparent)`.
Browsers that interpolate that mix in non-premultiplied space (Chromium) paint
the result with a purple cast, so the search bar and the field hints looked
violet instead of white/black. `src/routes/layout.css` overrides it with
`color: var(--foreground); opacity: 0.5`. Removing that override brings the
purple back on Chromium while Firefox stays grey — a browser-specific bug that
is easy to misdiagnose.

## Testing

Unit tests are DOM-free and import `.ts` modules directly with explicit
extensions (`import { renderPrompt } from '../src/lib/prompts.ts'`), because
Node runs them without a bundler.

`tests/browser.test.mjs` drives the editor in a real browser with
`/api/generate` intercepted, so no key and no model are needed. It exists
because the interesting failures are wiring failures: whether clicking
Regenerate actually sends a prompt without the stale draft, whether Undo really
restores the text, whether a custom template reaches the request. Static checks
cannot see any of that. Extend it when you touch the editor's AI actions.

Playwright is not a dependency. The suite resolves it from the project, then
from `PW_PATH`, then from the npx cache, and picks whichever of Chromium or
Firefox is actually installed. If none is, it skips with exit code 0.

## Known issues

**`npm test` can fail with `spawn EPERM`** in a sandboxed Windows shell, because
Node spawns one child per test file. Running a file directly
(`node tests/card.test.ts`) exercises the same assertions. `npm run build` can
fail the same way: Vite calls `net use` to resolve drive mappings on Windows.

## When you add an AI-actionable field

1. Add the field to `Character['data']` in `src/lib/db.ts`, with a new schema
   version and an `upgrade()` if existing records need it.
2. Render it with `AiFieldActions` plus `{...fieldBinding('Label', value, apply)}`
   in the editor page, or forward the props through a child section.
3. Use a field name that `buildPromptContext` can match, so the prompt's
   `{context}` block includes or excludes it sensibly.
4. Add a unit test for the prompt context and, if it is user-visible, an
   assertion in `tests/browser.test.mjs`.

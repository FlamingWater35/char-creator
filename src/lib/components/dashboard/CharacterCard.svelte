<script lang="ts">
  import type { Character } from "$lib/db";
  import {
    firstLine,
    formatTokens,
    initials,
    relativeTime,
    summarizeCharacter,
  } from "$lib/format";
  import {
    Edit,
    Trash2,
    Layers,
    MessageSquare,
    BookOpen,
    ArrowUpRight,
  } from "@lucide/svelte";

  /**
   * One character in the dashboard, in either grid or list form.
   *
   * Both layouts share this component so the two views can never disagree about
   * what a character's metadata says.
   */
  let {
    char,
    view = "grid",
    ondelete,
  }: {
    char: Character;
    view?: "grid" | "list";
    ondelete: (id: string) => void;
  } = $props();

  let summary = $derived(summarizeCharacter(char));
  let accent = $derived(hueFor(char.name || "character"));
  let edited = $derived(relativeTime(char.updatedAt));
  // A concept with a leading blank line would otherwise render an empty preview.
  let concept = $derived(firstLine(char.data.mainPrompt, 220));

  /**
   * Stable hue per character, so the same name always gets the same colour and
   * the dashboard feels like a set of distinct people rather than a grey list.
   */
  function hueFor(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) % 360;
    }
    return Math.abs(hash);
  }

  let gradient = $derived(
    `linear-gradient(135deg, hsl(${accent} 68% 58%), hsl(${(accent + 38) % 360} 72% 46%))`,
  );

  let chip =
    "inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground";
</script>

{#if view === "grid"}
  <article
    class="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-muted-foreground/30 hover:shadow-lg focus-within:border-muted-foreground/30 focus-within:shadow-lg"
  >
    <!-- Identity stripe: the only place the per-character colour appears at full strength. -->
    <div class="h-1 w-full" style="background-image: {gradient}"></div>

    <div class="flex flex-1 flex-col p-5">
      <div class="flex items-start gap-3.5">
        <div
          class="relative w-14 h-14 shrink-0 overflow-hidden rounded-2xl border border-black/5 shadow-sm flex items-center justify-center"
          style={char.data.thumbnail ? undefined : `background-image: ${gradient}`}
        >
          {#if char.data.thumbnail}
            <img
              src={char.data.thumbnail}
              alt=""
              class="w-full h-full object-cover"
              loading="lazy"
            />
          {:else}
            <span class="text-lg font-black text-white tracking-tight"
              >{initials(char.name)}</span
            >
          {/if}
        </div>

        <div class="min-w-0 flex-1">
          <a
            href="/editor/{char.id}"
            class="block truncate text-lg font-bold leading-tight hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none focus-visible:underline"
          >
            {char.name || "Unnamed Character"}
          </a>
          <p
            class="mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-muted-foreground/40"></span>
            Edited {edited}
          </p>
        </div>
      </div>

      <p
        class="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground min-h-[3.9em]"
      >
        {concept || "No core concept provided yet."}
      </p>

      <div class="mt-4 flex flex-wrap gap-1.5">
        <span class={chip} title="Estimated context tokens">
          <Layers class="w-3 h-3" /> {formatTokens(summary.tokens)}
        </span>
        <span
          class={chip}
          title="{summary.filledSections} of {summary.totalSections} prose fields filled"
        >
          {summary.filledSections}/{summary.totalSections} fields
        </span>
        {#if summary.greetings > 0}
          <span class={chip} title="Greetings written">
            <MessageSquare class="w-3 h-3" /> {summary.greetings}
          </span>
        {/if}
        {#if summary.loreEntries > 0}
          <span
            class={chip}
            title="{summary.activeLoreEntries} of {summary.loreEntries} lore entries active"
          >
            <BookOpen class="w-3 h-3" /> {summary.loreEntries}
          </span>
        {/if}
      </div>
    </div>

    <div class="flex items-center gap-2 border-t bg-secondary/20 px-4 py-2.5">
      <a
        href="/editor/{char.id}"
        aria-label="Edit {char.name}"
        class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-bold transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Edit class="w-3.5 h-3.5" /> Open
        <ArrowUpRight
          class="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition-all"
        />
      </a>
      <button
        type="button"
        onclick={() => ondelete(char.id)}
        aria-label="Delete {char.name}"
        title="Delete character"
        class="p-2 rounded-lg text-muted-foreground border border-transparent transition-colors hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer"
      >
        <Trash2 class="w-3.5 h-3.5" />
      </button>
    </div>
  </article>
{:else}
  <div
    class="group flex items-center gap-4 rounded-xl border bg-card px-4 py-3 shadow-sm transition-colors hover:border-muted-foreground/30 hover:bg-secondary/20"
  >
    <div
      class="w-10 h-10 shrink-0 overflow-hidden rounded-xl border border-black/5 flex items-center justify-center"
      style={char.data.thumbnail ? undefined : `background-image: ${gradient}`}
    >
      {#if char.data.thumbnail}
        <img
          src={char.data.thumbnail}
          alt=""
          class="w-full h-full object-cover"
          loading="lazy"
        />
      {:else}
        <span class="text-xs font-black text-white">{initials(char.name)}</span>
      {/if}
    </div>

    <div class="min-w-0 flex-1">
      <a
        href="/editor/{char.id}"
        class="block truncate font-bold leading-tight hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        {char.name || "Unnamed Character"}
      </a>
      <p class="truncate text-xs text-muted-foreground">
        {concept || "No core concept provided yet."}
      </p>
    </div>

    <div class="hidden md:flex items-center gap-1.5 shrink-0">
      <span class={chip}><Layers class="w-3 h-3" /> {formatTokens(summary.tokens)}</span>
      <span class={chip}>{summary.filledSections}/{summary.totalSections} fields</span>
      {#if summary.loreEntries > 0}
        <span class={chip}><BookOpen class="w-3 h-3" /> {summary.loreEntries}</span>
      {/if}
    </div>

    <span
      class="hidden sm:block w-20 shrink-0 text-right text-[11px] font-medium text-muted-foreground"
      >{edited}</span
    >

    <div class="flex items-center gap-1 shrink-0">
      <a
        href="/editor/{char.id}"
        aria-label="Edit {char.name}"
        class="p-2 rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Edit class="w-4 h-4" />
      </a>
      <button
        type="button"
        onclick={() => ondelete(char.id)}
        aria-label="Delete {char.name}"
        class="p-2 rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive cursor-pointer"
      >
        <Trash2 class="w-4 h-4" />
      </button>
    </div>
  </div>
{/if}

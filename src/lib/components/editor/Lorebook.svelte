<script lang="ts">
  import type { CharacterBook } from "$lib/db";
  import { autoresize } from "$lib/autoresize";
  import { slide } from "svelte/transition";
  import {
    Plus,
    Trash2,
    BookOpen,
    CheckSquare,
    Square,
    X,
    FileText,
    ChevronDown,
    ChevronUp,
  } from "@lucide/svelte";

  let {
    characterBook = $bindable({ name: "", description: "", entries: [] }),
    worldInfo = $bindable(""),
    generatingAll = false,
    activeGeneratingField = null,
  }: {
    characterBook: CharacterBook;
    worldInfo: string;
    generatingAll: boolean;
    activeGeneratingField: string | null;
  } = $props();

  let expandedEntries = $state<Record<string, boolean>>({});

  let lorebookSearchQuery = $state("");
  let filteredLorebookEntries = $derived(
    characterBook.entries.filter(
      (entry) =>
        entry.keys.some((k) =>
          k.toLowerCase().includes(lorebookSearchQuery.toLowerCase()),
        ) ||
        entry.content
          .toLowerCase()
          .includes(lorebookSearchQuery.toLowerCase()) ||
        (entry.comment || "")
          .toLowerCase()
          .includes(lorebookSearchQuery.toLowerCase()),
    ) || [],
  );

  /**
   * Appends an empty structured fact record to the character's memory layout book.
   */
  function addLorebookEntry() {
    const newId = crypto.randomUUID();
    characterBook.entries = [
      ...characterBook.entries,
      {
        id: newId,
        keys: [],
        secondary_keys: [],
        content: "",
        enabled: true,
        priority: 10,
        comment: "",
        constant: false,
      },
    ];
    expandedEntries[newId] = true;
  }

  /**
   * Purges a fact record entry based on target database ID.
   */
  function removeLorebookEntry(id: string) {
    characterBook.entries = characterBook.entries.filter((e) => e.id !== id);
  }

  /**
   * Expands or collapses a targeted metadata entry card section.
   */
  function toggleExpand(id: string) {
    expandedEntries[id] = !expandedEntries[id];
  }
</script>

<div class="bg-card border rounded-2xl p-4 sm:p-6 shadow-sm space-y-6">
  <div
    class="flex flex-col sm:flex-row justify-between sm:items-center gap-4 animate-fade-in"
  >
    <div class="flex items-center gap-3">
      <div class="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
        <BookOpen class="w-6 h-6" />
      </div>
      <div>
        <h3 class="text-2xl font-black">
          Contextual Knowledge Base (World Info & Lorebook)
        </h3>
        <p class="text-xs text-muted-foreground">
          Saves context tokens by conditionally injecting background facts only
          when trigger keywords appear in chat.
        </p>
      </div>
    </div>
    <button
      onclick={addLorebookEntry}
      disabled={generatingAll || activeGeneratingField !== null}
      class="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground border hover:bg-secondary/80 font-bold px-4 py-2 rounded-xl text-xs transition-colors cursor-pointer disabled:opacity-50"
    >
      <Plus class="w-4 h-4" /> Add Memory Entry
    </button>
  </div>

  <div
    class="p-4 bg-muted/30 rounded-xl border border-dashed border-border/80 space-y-3"
  >
    <div class="flex items-center gap-2 text-sm font-bold text-foreground">
      <FileText class="w-4 h-4 text-blue-500" />
      <span>Standalone / External Lorebook Reference</span>
    </div>
    <p class="text-xs text-muted-foreground leading-relaxed">
      Instead of or in addition to embedding lore inside this card, you can link
      an external lorebook file. Entering a name here saves a reference to
      <code class="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]"
        >extensions.world_info</code
      >
      which third-party platforms (like SillyTavern) will automatically resolve.
    </p>
    <input
      type="text"
      bind:value={worldInfo}
      disabled={generatingAll || activeGeneratingField !== null}
      class="w-full border rounded-xl px-4 py-2.5 bg-background text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all disabled:opacity-50"
      placeholder="e.g. Camelot_Forest_Lore"
    />
  </div>

  <div
    class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-border"
  >
    <div class="space-y-1">
      <label
        for="lorebook-title"
        class="text-xs font-bold uppercase text-muted-foreground tracking-wider"
        >Embedded Lorebook Name</label
      >
      <input
        id="lorebook-title"
        type="text"
        bind:value={characterBook.name}
        disabled={generatingAll || activeGeneratingField !== null}
        class="w-full border rounded-xl px-4 py-2.5 bg-background text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all disabled:opacity-50"
        placeholder="e.g. Merlin's Grimoire"
      />
    </div>
    <div class="space-y-1">
      <label
        for="lorebook-desc"
        class="text-xs font-bold uppercase text-muted-foreground tracking-wider"
        >Embedded Book Description</label
      >
      <input
        id="lorebook-desc"
        type="text"
        bind:value={characterBook.description}
        disabled={generatingAll || activeGeneratingField !== null}
        class="w-full border rounded-xl px-4 py-2.5 bg-background text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all disabled:opacity-50"
        placeholder="e.g. Merlin's collection of ancient Camelot spells"
      />
    </div>
  </div>

  {#if characterBook.entries.length > 0}
    <div
      class="relative h-10 flex items-center bg-secondary/10 border rounded-xl px-3 focus-within:ring-2 focus-within:ring-blue-500"
    >
      <input
        type="text"
        bind:value={lorebookSearchQuery}
        placeholder="Search active triggers, comments or entry content..."
        class="w-full h-full text-xs bg-transparent focus:outline-none text-foreground"
      />
      {#if lorebookSearchQuery}
        <button
          onclick={() => (lorebookSearchQuery = "")}
          class="p-1 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      {/if}
    </div>
  {/if}

  <div class="space-y-4">
    {#if characterBook.entries.length === 0}
      <div
        class="text-center py-10 border rounded-xl border-dashed text-sm text-muted-foreground bg-secondary/10"
      >
        No embedded lore entries. Click "Add Memory Entry" or link an external
        world file above.
      </div>
    {:else if filteredLorebookEntries.length === 0}
      <div
        class="text-center py-10 border rounded-xl border-dashed text-sm text-muted-foreground bg-secondary/10"
      >
        No matching memory triggers found.
      </div>
    {:else}
      {#each filteredLorebookEntries as entry, idx (entry.id)}
        <div
          class="border rounded-xl bg-secondary/10 shadow-sm relative group overflow-hidden"
        >
          <div
            class="w-full text-left p-4 sm:p-5 flex justify-between items-center gap-4 hover:bg-secondary/20 transition-colors cursor-pointer"
            role="button"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") toggleExpand(entry.id);
            }}
            onclick={() => toggleExpand(entry.id)}
          >
            <div class="flex items-center gap-3 overflow-hidden">
              <span
                class="text-xs font-bold text-muted-foreground uppercase tracking-widest shrink-0"
              >
                Entry #{idx + 1}
              </span>

              {#if !entry.enabled}
                <span
                  class="bg-destructive/10 text-destructive px-2 py-0.5 rounded text-[10px] font-bold border border-destructive/20 shrink-0"
                  >Disabled</span
                >
              {/if}

              {#if entry.constant}
                <span
                  class="bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded text-[10px] font-bold border border-purple-500/20 shrink-0"
                  >Constant</span
                >
              {/if}

              <div
                class="flex flex-wrap gap-1.5 items-center max-w-full overflow-hidden"
              >
                {#each entry.keys as key}
                  <span
                    class="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-500/20 truncate"
                    >{key}</span
                  >
                {/each}
                {#each entry.secondary_keys || [] as key}
                  <span
                    class="bg-primary/10 text-primary/70 px-2 py-0.5 rounded text-[10px] font-bold border border-border truncate"
                    >{key}</span
                  >
                {/each}
                {#if entry.keys.length === 0}
                  <span class="text-xs text-muted-foreground italic truncate"
                    >No triggers defined</span
                  >
                {/if}
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <button
                onclick={(e) => {
                  e.stopPropagation();
                  removeLorebookEntry(entry.id);
                }}
                disabled={generatingAll || activeGeneratingField !== null}
                class="sm:opacity-0 group-hover:opacity-100 p-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md transition-all cursor-pointer"
                aria-label="Remove Lore Entry"
              >
                <Trash2 class="w-4 h-4" />
              </button>
              {#if expandedEntries[entry.id]}
                <ChevronUp class="w-5 h-5 text-muted-foreground" />
              {:else}
                <ChevronDown class="w-5 h-5 text-muted-foreground" />
              {/if}
            </div>
          </div>

          {#if expandedEntries[entry.id]}
            <div
              class="p-4 sm:p-5 border-t border-border/50 space-y-4 bg-background/50"
              transition:slide={{ duration: 200 }}
            >
              <div
                class="flex flex-wrap items-center gap-3 pb-3 border-b border-border/50"
              >
                <button
                  onclick={() => (entry.enabled = !entry.enabled)}
                  disabled={generatingAll || activeGeneratingField !== null}
                  class="flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer {entry.enabled
                    ? 'text-blue-500'
                    : 'text-muted-foreground'}"
                >
                  {#if entry.enabled}
                    <CheckSquare class="w-4 h-4" /> Trigger Active
                  {:else}
                    <Square class="w-4 h-4" /> Trigger Bypassed
                  {/if}
                </button>

                <button
                  onclick={() => (entry.constant = !entry.constant)}
                  disabled={generatingAll || activeGeneratingField !== null}
                  class="flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer {entry.constant
                    ? 'text-purple-500'
                    : 'text-muted-foreground'}"
                >
                  {#if entry.constant}
                    <CheckSquare class="w-4 h-4" /> Always Injected
                  {:else}
                    <Square class="w-4 h-4" /> Keyword Gated
                  {/if}
                </button>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label
                    for="entry-keys-{idx}"
                    class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
                    >Primary Keyword Triggers (Comma-separated)</label
                  >
                  <input
                    id="entry-keys-{idx}"
                    type="text"
                    value={entry.keys.join(", ")}
                    oninput={(e) => {
                      entry.keys = e.currentTarget.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                    }}
                    disabled={generatingAll || activeGeneratingField !== null}
                    class="w-full border rounded-lg px-3 py-1.5 bg-background text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                    placeholder="e.g. Fireball, spell casting"
                  />
                </div>
                <div class="space-y-1">
                  <label
                    for="entry-sec-keys-{idx}"
                    class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
                    >Secondary Co-Triggers (Requires both to trigger)</label
                  >
                  <input
                    id="entry-sec-keys-{idx}"
                    type="text"
                    value={(entry.secondary_keys || []).join(", ")}
                    oninput={(e) => {
                      entry.secondary_keys = e.currentTarget.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                    }}
                    disabled={generatingAll || activeGeneratingField !== null}
                    class="w-full border rounded-lg px-3 py-1.5 bg-background text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                    placeholder="e.g. wand, spellbook"
                  />
                </div>
              </div>

              <div class="space-y-1">
                <label
                  for="entry-content-{idx}"
                  class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
                  >Injected Lore Fact (Injected on trigger match)</label
                >
                <textarea
                  id="entry-content-{idx}"
                  use:autoresize={entry.content}
                  bind:value={entry.content}
                  disabled={generatingAll || activeGeneratingField !== null}
                  class="w-full border rounded-lg p-3 bg-background text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none min-h-16 disabled:opacity-50"
                  placeholder="e.g. Fireball is an evocation spell conjuring a sphere of flame. Merlin teaches this to advanced seekers..."
                ></textarea>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="space-y-1">
                  <label
                    for="entry-comment-{idx}"
                    class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
                    >Developer Notes</label
                  >
                  <input
                    id="entry-comment-{idx}"
                    type="text"
                    bind:value={entry.comment}
                    disabled={generatingAll || activeGeneratingField !== null}
                    class="w-full border rounded-lg px-3 py-1.5 bg-background text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                    placeholder="e.g. Background for Merlin's magical academy"
                  />
                </div>
                <div class="space-y-1">
                  <label
                    for="entry-priority-{idx}"
                    class="text-[10px] font-bold uppercase text-muted-foreground tracking-wider"
                    >Activation Priority Rank</label
                  >
                  <input
                    id="entry-priority-{idx}"
                    type="number"
                    bind:value={entry.priority}
                    disabled={generatingAll || activeGeneratingField !== null}
                    class="w-full border rounded-lg px-3 py-1.5 bg-background text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                    placeholder="e.g. 10 (higher numbers activate first)"
                  />
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

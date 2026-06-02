<script lang="ts">
  import type { CharacterBook } from "$lib/db";
  import { autoresize } from "$lib/autoresize";
  import {
    Plus,
    Trash2,
    BookOpen,
    CheckSquare,
    Square,
    X,
    FileText,
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

  function addLorebookEntry() {
    characterBook.entries = [
      ...characterBook.entries,
      {
        id: crypto.randomUUID(),
        keys: [],
        secondary_keys: [],
        content: "",
        enabled: true,
        priority: 10,
        comment: "",
        constant: false,
      },
    ];
  }

  function removeLorebookEntry(id: string) {
    characterBook.entries = characterBook.entries.filter((e) => e.id !== id);
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

  <!-- Standalone External Lorebooks Reference -->
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
      placeholder="e.g. My_World_Lore_File"
    />
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
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
        placeholder="e.g. Knowledge base of spells and creatures"
      />
    </div>
  </div>

  <!-- Lore Entries Live filter search -->
  {#if characterBook.entries.length > 0}
    <div
      class="relative flex items-center mb-4 bg-secondary/10 border rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-blue-500"
    >
      <input
        type="text"
        bind:value={lorebookSearchQuery}
        placeholder="Search active triggers, comments or entry content..."
        class="w-full text-xs bg-transparent focus:outline-none py-1 text-foreground"
      />
      {#if lorebookSearchQuery}
        <button
          onclick={() => (lorebookSearchQuery = "")}
          class="p-1 text-muted-foreground hover:text-foreground"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      {/if}
    </div>
  {/if}

  <div class="space-y-4">
    {#if characterBook.entries.length === 0}
      <div
        class="text-center py-10 border rounded-xl border-dashed text-sm text-muted-foreground bg-secondary/10 animate-pulse"
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
          class="border rounded-xl p-4 sm:p-5 bg-secondary/10 space-y-4 shadow-sm relative group"
        >
          <div
            class="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b pb-3 border-border/50"
          >
            <div class="flex flex-wrap items-center gap-3">
              <span
                class="text-xs font-bold text-muted-foreground uppercase tracking-widest"
              >
                Memory Entry #{idx + 1}
              </span>
              <!-- Enabled Toggle -->
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

              <!-- Constant Toggle -->
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

            <button
              onclick={() => removeLorebookEntry(entry.id)}
              disabled={generatingAll || activeGeneratingField !== null}
              class="sm:opacity-0 group-hover:opacity-100 p-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-md transition-all self-end sm:self-auto cursor-pointer"
              aria-label="Remove Lore Entry"
            >
              <Trash2 class="w-4 h-4" />
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
                placeholder="e.g. library, ancient books, spell workshop"
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
                placeholder="e.g. shadows, magic"
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
              placeholder="e.g. The Library of Shadows houses cursed magical tomes forbidden to apprentices..."
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
      {/each}
    {/if}
  </div>
</div>

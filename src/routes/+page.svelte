<script lang="ts">
  import { onMount } from "svelte";
  import { db, type Character, type CharacterBook } from "$lib/db";
  import { dialogs } from "$lib/dialogs.svelte";
  import { goto } from "$app/navigation";
  import {
    Plus,
    FileUp,
    Search,
    X,
    LayoutGrid,
    Rows3,
    Loader2,
    Sparkles,
    Layers,
    BookOpen,
    ArrowUpDown,
    ChevronRight,
    Wand,
  } from "@lucide/svelte";
  import { fade, slide } from "svelte/transition";
  import {
    extractCharacterCardMetadata,
    generateThumbnail,
    compressImage,
  } from "$lib/png";
  import {
    buildCardMeta,
    buildBookExtra,
    buildEntryExtra,
    extractSection,
    parseExampleMessages,
  } from "$lib/card";
  import { formatTokens, summarizeCharacter } from "$lib/format";
  import CharacterCard from "$lib/components/dashboard/CharacterCard.svelte";

  type ViewMode = "grid" | "list";
  type SortMode = "recent" | "name" | "tokens";

  const VIEW_KEY = "or_dashboard_view";
  const SORT_KEY = "or_dashboard_sort";

  let characters = $state<Character[]>([]);
  let searchQuery = $state("");
  let loading = $state(true);
  let isImporting = $state(false);
  let fileInputImport = $state<HTMLInputElement>();

  let view = $state<ViewMode>("grid");
  let sort = $state<SortMode>("recent");
  /** Set once the stored preferences are read, so the writer cannot clobber them. */
  let prefsLoaded = $state(false);

  let normalizedQuery = $derived(searchQuery.trim().toLowerCase());

  /**
   * Token counts are computed once per character per change rather than inside
   * the sort comparator, which would re-walk every field O(n log n) times.
   */
  let tokenCounts = $derived.by(() => {
    const map = new Map<string, number>();
    for (const c of characters) map.set(c.id, summarizeCharacter(c).tokens);
    return map;
  });

  let filteredCharacters = $derived.by(() => {
    const matched = characters.filter((c) => {
      if (!normalizedQuery) return true;
      // Searching the concept as well as the name is what people actually
      // expect: they remember "the dragon one", not the character's name.
      return (
        c.name.toLowerCase().includes(normalizedQuery) ||
        (c.data.mainPrompt ?? "").toLowerCase().includes(normalizedQuery)
      );
    });

    return [...matched].sort((a, b) => {
      if (sort === "name") {
        return (a.name || "").localeCompare(b.name || "", undefined, {
          sensitivity: "base",
        });
      }
      if (sort === "tokens") {
        return (tokenCounts.get(b.id) ?? 0) - (tokenCounts.get(a.id) ?? 0);
      }
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });
  });

  let totals = $derived.by(() => {
    let tokens = 0;
    let lore = 0;
    for (const c of characters) {
      const s = summarizeCharacter(c);
      tokens += s.tokens;
      lore += s.loreEntries;
    }
    return { tokens, lore };
  });

  /**
   * Fetches initial character list safely.
   */
  onMount(async () => {
    try {
      const savedView = localStorage.getItem(VIEW_KEY);
      if (savedView === "grid" || savedView === "list") view = savedView;

      const savedSort = localStorage.getItem(SORT_KEY);
      if (savedSort === "recent" || savedSort === "name" || savedSort === "tokens")
        sort = savedSort;

      prefsLoaded = true;
      characters = await db.characters.orderBy("updatedAt").reverse().toArray();
    } catch (err: any) {
      console.error("Failed to query characters:", err);
      dialogs.alert(
        "Could not load character records from database: " + err.message,
        "Database Error",
      );
    } finally {
      loading = false;
    }
  });

  // Persisting the view choice is a convenience, never a hard failure: private
  // browsing modes throw on localStorage. Skipped until the read completes so
  // the defaults cannot overwrite a stored preference.
  $effect(() => {
    if (!prefsLoaded) return;
    try {
      localStorage.setItem(VIEW_KEY, view);
      localStorage.setItem(SORT_KEY, sort);
    } catch {
      /* Preference will not survive a reload. */
    }
  });

  /**
   * Initializes a blank default character template and redirects to editor.
   */
  async function createNew() {
    const id = crypto.randomUUID();
    const newChar: Character = {
      id,
      name: "New Character",
      createdAt: new Date(),
      updatedAt: new Date(),
      data: {
        mainPrompt: "",
        description: "",
        personality: "",
        scenario: "",
        backstory: "",
        relatedCharacters: "",
        firstMessages: [""],
        exampleMessages: [],
        thumbnail: null,
        characterBook: { name: "", description: "", entries: [] },
        worldInfo: "",
      },
    };

    try {
      await db.characters.add(newChar);
      goto(`/editor/${id}`);
    } catch (err: any) {
      console.error("Insertion failed:", err);
      dialogs.alert(
        "Could not initialize character file: " + err.message,
        "Error",
      );
    }
  }

  /**
   * Drops a character entry and all dependencies from local IndexedDB.
   */
  async function deleteChar(id: string) {
    const confirmed = await dialogs.confirm(
      "Are you sure you want to delete this character? This cannot be undone.",
    );
    if (!confirmed) return;

    try {
      await db.transaction(
        "rw",
        db.characters,
        db.characterImages,
        db.characterAssets,
        async () => {
          await db.characters.delete(id);
          await db.characterImages.delete(id);
          await db.characterAssets.where("characterId").equals(id).delete();
        },
      );

      characters = await db.characters.orderBy("updatedAt").reverse().toArray();
    } catch (err: any) {
      console.error("Deletion failed:", err);
      dialogs.alert("Failed to wipe record: " + err.message, "Wipe Failed");
    }
  }

  /**
   * Decodes embedded metadata from PNG imports, configures a character object,
   * compresses the image to prevent quota issues, and transactions it to IndexedDB.
   */
  async function handleImportCard(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    isImporting = true;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const metadata = await extractCharacterCardMetadata(arrayBuffer);
      if (!metadata) {
        await dialogs.alert(
          "No valid character card metadata (chara or ccv3) found in this image.",
          "Invalid Card",
        );
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(metadata);
      } catch (err) {
        throw new Error(
          "Failed to parse card metadata JSON. The file structure might be corrupted.",
        );
      }

      const data = (parsed.data || parsed) as Record<string, any>;
      const name = data.name || "Imported Character";
      let mainPrompt = data.extensions?.char_creator?.mainPrompt || "";

      let fullDesc = data.description || "";
      let personality = (data.personality || "").trim();
      let scenario = (data.scenario || "").trim();
      let backstory = "";
      let relatedCharacters = "";

      let extraction = extractSection(fullDesc, "Personality");
      if (extraction.content) {
        if (!personality) personality = extraction.content;
        fullDesc = extraction.cleanedText;
      }

      extraction = extractSection(fullDesc, "Scenario");
      if (extraction.content) {
        if (!scenario) scenario = extraction.content;
        fullDesc = extraction.cleanedText;
      }

      extraction = extractSection(fullDesc, "Backstory");
      if (extraction.content) {
        backstory = extraction.content;
        fullDesc = extraction.cleanedText;
      }

      extraction = extractSection(fullDesc, "Related Characters");
      if (extraction.content) {
        relatedCharacters = extraction.content;
        fullDesc = extraction.cleanedText;
      }

      const description = fullDesc.trim();
      if (!mainPrompt) mainPrompt = description.substring(0, 150) || name;

      const base64Image = await compressImage(file, {
        maxWidth: 1024,
        maxHeight: 1024,
        type: "image/jpeg",
        quality: 0.9,
      });

      const thumbnail = base64Image
        ? await generateThumbnail(base64Image).catch(() => null)
        : null;

      const firstMessages = [data.first_mes || ""];
      if (Array.isArray(data.alternate_greetings)) {
        firstMessages.push(...data.alternate_greetings.filter(Boolean));
      }

      const exampleMessages = parseExampleMessages(data.mes_example);
      let assets: any[] = [];

      if (Array.isArray(data.assets)) {
        assets = data.assets
          .map((asset: any) => ({
            id: crypto.randomUUID(),
            name: asset.name || "unnamed_asset",
            type:
              asset.type === "avatar" || asset.type === "voice"
                ? asset.type
                : "image",
            uri: asset.uri || "",
            ext: asset.ext || "png",
          }))
          .filter((asset: any) => asset.uri);
      } else if (data.extensions?.assets) {
        const v2Assets = data.extensions.assets;
        if (typeof v2Assets === "object") {
          Object.entries(v2Assets).forEach(([key, val]) => {
            if (typeof val === "string" && val.startsWith("data:")) {
              let type: "image" | "avatar" | "voice" = "image";
              if (key.includes("voice") || key.includes("audio"))
                type = "voice";
              else if (key.includes("avatar")) type = "avatar";

              let ext = "png";
              const match = val.match(
                /data:[a-zA-Z0-9+]+\/([a-zA-Z0-9+]+);base64/,
              );
              if (match) ext = match[1];

              assets.push({
                id: crypto.randomUUID(),
                name: key,
                type,
                uri: val,
                ext,
              });
            }
          });
        }
      }

      let characterBook: CharacterBook = {
        name: "",
        description: "",
        entries: [],
      };
      if (data.character_book && typeof data.character_book === "object") {
        const cb = data.character_book as Record<string, any>;
        characterBook = {
          name: cb.name || "",
          description: cb.description || "",
          extra: buildBookExtra(cb),
          entries: Array.isArray(cb.entries)
            ? cb.entries.map((entry: Record<string, any>) => {
                // SillyTavern world info uses `key`/`keysecondary`; the card
                // spec uses `keys`/`secondary_keys`. Accept both.
                const primary = Array.isArray(entry.keys)
                  ? entry.keys
                  : Array.isArray(entry.key)
                    ? entry.key
                    : typeof entry.keys === "string"
                      ? [entry.keys]
                      : typeof entry.key === "string"
                        ? [entry.key]
                        : [];

                const secondary = Array.isArray(entry.secondary_keys)
                  ? entry.secondary_keys
                  : Array.isArray(entry.keysecondary)
                    ? entry.keysecondary
                    : [];

                return {
                  id: crypto.randomUUID(),
                  keys: primary.map(String).filter(Boolean),
                  secondary_keys: secondary.map(String).filter(Boolean),
                  content: entry.content || "",
                  enabled: entry.enabled !== false && entry.disable !== true,
                  priority:
                    typeof entry.priority === "number"
                      ? entry.priority
                      : typeof entry.order === "number"
                        ? entry.order
                        : 10,
                  comment: entry.comment || "",
                  constant: entry.constant === true,
                  extra: buildEntryExtra(entry),
                };
              })
            : [],
        };
      }

      let worldInfo =
        typeof data.extensions?.world_info === "string"
          ? data.extensions.world_info
          : data.extensions?.world_info
            ? JSON.stringify(data.extensions.world_info)
            : "";

      const id = crypto.randomUUID();
      const newChar: Character = {
        id,
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
        data: {
          mainPrompt,
          description,
          personality,
          scenario,
          backstory,
          relatedCharacters,
          firstMessages,
          exampleMessages,
          thumbnail,
          characterBook,
          worldInfo,
          // Unmodelled spec fields (tags, creator, creator_notes, system_prompt,
          // post_history_instructions, ...) survive until the next export.
          cardMeta: buildCardMeta(data),
        },
      };

      await db.transaction(
        "rw",
        db.characters,
        db.characterImages,
        db.characterAssets,
        async () => {
          await db.characters.add(newChar);
          if (base64Image)
            await db.characterImages.put({ id, image: base64Image });
          if (assets.length > 0) {
            await db.characterAssets.bulkPut(
              assets.map((a) => ({ ...a, characterId: id })),
            );
          }
        },
      );

      characters = await db.characters.orderBy("updatedAt").reverse().toArray();
      await dialogs.alert(
        `Character "${name}" imported successfully with ${assets.length} extra media assets and ${characterBook.entries.length} Lorebook entries!`,
        "Import Successful",
      );
    } catch (error: any) {
      console.error("Import failure:", error);
      dialogs.alert(
        error.message || "Failed to import character card.",
        "Import Failed",
      );
    } finally {
      isImporting = false;
      if (fileInputImport) fileInputImport.value = "";
    }
  }
</script>

<svelte:head>
  <title>Char Creator - Dashboard</title>
</svelte:head>

<div class="animate-fade-in space-y-6">
  <!-- Header: identity on the left, primary actions on the right. -->
  <div
    class="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-border/60 pb-6"
  >
    <div class="space-y-2">
      <div
        class="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400"
      >
        <Sparkles class="w-3 h-3" /> Local-first studio
      </div>
      <h1 class="text-3xl sm:text-4xl font-black tracking-tight">
        Your Characters
      </h1>
      <p class="text-sm text-muted-foreground">
        {#if loading}
          Loading your library…
        {:else if characters.length === 0}
          Build roleplay personalities that live entirely in this browser.
        {:else}
          {characters.length} character{characters.length === 1 ? "" : "s"} ·
          ~{formatTokens(totals.tokens)} context tokens · {totals.lore} lore
          entr{totals.lore === 1 ? "y" : "ies"}
        {/if}
      </p>
    </div>

    <div class="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
      <button
        type="button"
        onclick={() => fileInputImport?.click()}
        disabled={isImporting}
        class="inline-flex items-center justify-center gap-2 rounded-xl border bg-secondary/60 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 cursor-pointer"
      >
        {#if isImporting}
          <Loader2 class="w-4 h-4 animate-spin" /> Importing…
        {:else}
          <FileUp class="w-4 h-4" /> Import PNG Card
        {/if}
      </button>
      <button
        type="button"
        onclick={createNew}
        class="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
      >
        <Plus class="w-4 h-4" /> New Character
      </button>
    </div>
  </div>

  <input
    type="file"
    accept="image/png"
    class="hidden"
    bind:this={fileInputImport}
    onchange={handleImportCard}
  />

  <!-- Toolbar: search, sort and layout. Only shown once there is a library. -->
  {#if !loading && characters.length > 0}
    <div
      class="flex flex-col sm:flex-row sm:items-center gap-2"
      transition:slide={{ duration: 150 }}
    >
      <div
        class="group relative flex h-11 flex-1 items-center rounded-xl border bg-card px-3 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500/50"
      >
        <Search
          class="w-4 h-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-blue-500"
          aria-hidden="true"
        />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search by name or concept…"
          aria-label="Search characters"
          class="h-full w-full bg-transparent px-2.5 text-sm font-medium focus:outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
        />
        {#if searchQuery}
          <button
            type="button"
            onclick={() => (searchQuery = "")}
            class="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
            aria-label="Clear search query"
          >
            <X class="w-4 h-4" />
          </button>
        {/if}
      </div>

      <div class="flex items-center gap-2">
        <label class="sr-only" for="sort-mode">Sort characters</label>
        <div
          class="relative flex h-11 items-center rounded-xl border bg-card shadow-sm"
        >
          <ArrowUpDown
            class="pointer-events-none absolute left-3 w-3.5 h-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <select
            id="sort-mode"
            bind:value={sort}
            class="h-full appearance-none rounded-xl bg-transparent pl-8 pr-8 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="tokens">Size</option>
          </select>
          <ChevronRight
            class="pointer-events-none absolute right-2.5 w-3.5 h-3.5 rotate-90 text-muted-foreground"
            aria-hidden="true"
          />
        </div>

        <div
          class="flex h-11 items-center gap-0.5 rounded-xl border bg-card p-1 shadow-sm"
          role="group"
          aria-label="Layout"
        >
          <button
            type="button"
            onclick={() => (view = "grid")}
            aria-pressed={view === "grid"}
            aria-label="Grid layout"
            title="Grid layout"
            class="flex h-full items-center justify-center rounded-lg px-2.5 transition-colors cursor-pointer {view ===
            'grid'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground'}"
          >
            <LayoutGrid class="w-4 h-4" />
          </button>
          <button
            type="button"
            onclick={() => (view = "list")}
            aria-pressed={view === "list"}
            aria-label="List layout"
            title="List layout"
            class="flex h-full items-center justify-center rounded-lg px-2.5 transition-colors cursor-pointer {view ===
            'list'
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground'}"
          >
            <Rows3 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  {/if}

  <div aria-live="polite" aria-busy={loading}>
    {#if loading}
      <div
        in:fade={{ duration: 200 }}
        class="flex flex-col items-center justify-center py-28 text-muted-foreground"
        role="status"
      >
        <Loader2 class="w-7 h-7 animate-spin mb-4" aria-hidden="true" />
        <p class="text-sm font-medium">Loading characters…</p>
      </div>
    {:else if characters.length === 0}
      <div
        in:fade={{ duration: 200 }}
        class="relative overflow-hidden rounded-3xl border border-dashed bg-card px-6 py-16 text-center shadow-sm"
      >
        <div
          class="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-blue-500/10 to-transparent blur-2xl"
        ></div>
        <div
          class="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400"
        >
          <Wand class="w-7 h-7" />
        </div>
        <h2 class="relative text-2xl font-black tracking-tight">
          Your library is empty
        </h2>
        <p
          class="relative mx-auto mt-2 mb-7 max-w-md text-sm text-muted-foreground"
        >
          Start from a single sentence — a concept is enough to generate a full
          sheet with description, personality, greetings and lore. Or bring in a
          card you already have.
        </p>
        <div
          class="relative flex flex-col sm:flex-row items-center justify-center gap-2"
        >
          <button
            type="button"
            onclick={createNew}
            class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 cursor-pointer"
          >
            <Plus class="w-4 h-4" /> Create your first character
          </button>
          <button
            type="button"
            onclick={() => fileInputImport?.click()}
            class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border bg-secondary/60 px-5 py-2.5 text-sm font-bold transition-colors hover:bg-secondary cursor-pointer"
          >
            <FileUp class="w-4 h-4" /> Import PNG Card
          </button>
        </div>
        <div
          class="relative mx-auto mt-10 grid max-w-lg grid-cols-1 sm:grid-cols-3 gap-3 text-left"
        >
          {#each [{ icon: Sparkles, title: "Generate", text: "One concept, a whole sheet." }, { icon: Layers, title: "Refine", text: "Enhance or regenerate any field." }, { icon: BookOpen, title: "Export", text: "Spec-compliant V2/V3 PNG." }] as step (step.title)}
            <div class="rounded-xl border bg-background/60 p-3">
              <step.icon class="w-4 h-4 text-blue-500 mb-2" />
              <div class="text-xs font-bold">{step.title}</div>
              <div class="text-[11px] text-muted-foreground leading-snug">
                {step.text}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else if filteredCharacters.length === 0}
      <div
        in:fade={{ duration: 200 }}
        class="rounded-2xl border border-dashed bg-card px-6 py-16 text-center"
      >
        <Search class="w-6 h-6 mx-auto mb-3 text-muted-foreground/60" />
        <p class="font-bold">No matches for “{searchQuery.trim()}”</p>
        <p class="mt-1 text-sm text-muted-foreground">
          Search covers character names and their core concepts.
        </p>
        <button
          type="button"
          onclick={() => (searchQuery = "")}
          class="mt-4 inline-flex items-center gap-1.5 rounded-lg border bg-secondary/60 px-3 py-2 text-xs font-bold transition-colors hover:bg-secondary cursor-pointer"
        >
          <X class="w-3.5 h-3.5" /> Clear search
        </button>
      </div>
    {:else if view === "grid"}
      <div
        in:fade={{ duration: 200 }}
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {#each filteredCharacters as char (char.id)}
          <CharacterCard {char} view="grid" ondelete={deleteChar} />
        {/each}
      </div>
    {:else}
      <div in:fade={{ duration: 200 }} class="space-y-2">
        {#each filteredCharacters as char (char.id)}
          <CharacterCard {char} view="list" ondelete={deleteChar} />
        {/each}
      </div>
    {/if}
  </div>
</div>

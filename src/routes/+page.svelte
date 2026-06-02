<script lang="ts">
  import { onMount } from "svelte";
  import {
    db,
    type Character,
    type ExampleMessage,
    type CharacterAsset,
    type CharacterBook,
  } from "$lib/db";
  import { dialogs } from "$lib/dialogs.svelte";
  import { goto } from "$app/navigation";
  import {
    Plus,
    Trash2,
    Edit,
    Loader2,
    FileUp,
    Search,
    X,
  } from "@lucide/svelte";
  import { fade } from "svelte/transition";
  import { extractCharacterCardMetadata, generateThumbnail } from "$lib/png";

  let characters = $state<Character[]>([]);
  let searchQuery = $state("");
  let loading = $state(true);
  let fileInputImport = $state<HTMLInputElement>();

  // Real-time local search derived state
  let filteredCharacters = $derived(
    characters.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  onMount(async () => {
    try {
      // Fast, lightweight query that omits heavy base64 assets
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

  /**
   * Initializes and commits a default character template to IndexedDB.
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
        characterBook: {
          name: "",
          description: "",
          entries: [],
        },
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
   * Wipes a character and all its decoupled binary/asset dependencies.
   * @param id Character UUID.
   */
  async function deleteChar(id: string) {
    const confirmed = await dialogs.confirm(
      "Are you sure you want to delete this character? This cannot be undone.",
    );
    if (!confirmed) return;

    try {
      await db.characters.delete(id);
      await db.characterImages.delete(id);
      await db.characterAssets.where("characterId").equals(id).delete();
      characters = await db.characters.orderBy("updatedAt").reverse().toArray();
    } catch (err: any) {
      console.error("Deletion failed:", err);
      dialogs.alert("Failed to wipe record: " + err.message, "Wipe Failed");
    }
  }

  /**
   * Parses legacy Tavern greeting text blocks into structured example messages.
   * @param mesExample Text block payload.
   */
  function parseExampleMessages(
    mesExample: string | undefined | null,
  ): ExampleMessage[] {
    if (!mesExample) return [];
    const examples: ExampleMessage[] = [];
    const blocks = mesExample.split(/<START>/i);
    for (const block of blocks) {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) continue;

      const lines = trimmedBlock.split("\n");
      let userText = "";
      let charText = "";

      for (const line of lines) {
        const lower = line.trim().toLowerCase();
        if (lower.startsWith("{{user}}:")) {
          userText = line.substring(line.indexOf(":") + 1).trim();
        } else if (lower.startsWith("{{char}}:")) {
          if (charText) charText += "\n";
          charText += line.substring(line.indexOf(":") + 1).trim();
        } else {
          if (charText) {
            charText += "\n" + line.trim();
          } else if (userText) {
            userText += "\n" + line.trim();
          } else {
            charText = line.trim();
          }
        }
      }

      if (charText || userText) {
        examples.push({
          id: crypto.randomUUID(),
          user: userText,
          character: charText,
        });
      }
    }
    return examples;
  }

  /**
   * Cleans and splits composite description payloads on import.
   */
  function extractSection(
    text: string,
    header: string,
  ): { content: string; cleanedText: string } {
    const regex = new RegExp(
      `(?:^|\\n)${header}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:Personality|Scenario|Backstory|Related Characters)\\s*:|$)`,
      "i",
    );
    const match = text.match(regex);
    if (match) {
      const content = match[1].trim();
      const cleanedText = text.replace(match[0], "").trim();
      return { content, cleanedText };
    }
    return { content: "", cleanedText: text };
  }

  /**
   * Imports a PNG character card, processes its metadata payload,
   * auto-generates thumbnails, and splits binary data into separate tables.
   */
  async function handleImportCard(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

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
        await dialogs.alert(
          "Failed to parse card metadata. The file structure might be corrupted.",
          "Invalid Data",
        );
        return;
      }

      const data = parsed.data || parsed;
      const name = data.name || "Imported Character";

      let mainPrompt = "";
      if (data.extensions?.char_creator?.mainPrompt) {
        mainPrompt = data.extensions.char_creator.mainPrompt;
      }

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
      if (!mainPrompt) {
        mainPrompt = description.substring(0, 150) || name;
      }

      const reader = new FileReader();
      const base64Image = await new Promise<string>((resolve) => {
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });

      const thumbnail = base64Image
        ? await generateThumbnail(base64Image)
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
        if (Array.isArray(v2Assets)) {
          assets = v2Assets
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
        } else if (typeof v2Assets === "object") {
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
        const cb = data.character_book;
        characterBook = {
          name: cb.name || "",
          description: cb.description || "",
          entries: Array.isArray(cb.entries)
            ? cb.entries.map((entry: any) => ({
                id: crypto.randomUUID(),
                keys: Array.isArray(entry.keys)
                  ? entry.keys.map(String)
                  : typeof entry.keys === "string"
                    ? [entry.keys]
                    : [],
                secondary_keys: Array.isArray(entry.secondary_keys)
                  ? entry.secondary_keys.map(String)
                  : [],
                content: entry.content || "",
                enabled: entry.enabled !== false,
                priority:
                  typeof entry.priority === "number" ? entry.priority : 10,
                comment: entry.comment || "",
                constant: entry.constant === true,
              }))
            : [],
        };
      }

      let worldInfo = "";
      if (typeof data.extensions?.world_info === "string") {
        worldInfo = data.extensions.world_info;
      } else if (data.extensions?.world_info) {
        worldInfo = JSON.stringify(data.extensions.world_info);
      }

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
        },
      };

      await db.characters.add(newChar);
      if (base64Image) {
        await db.characterImages.put({ id, image: base64Image });
      }
      if (assets.length > 0) {
        await db.characterAssets.bulkPut(
          assets.map((a) => ({ ...a, characterId: id })),
        );
      }

      characters = await db.characters.orderBy("updatedAt").reverse().toArray();
      await dialogs.alert(
        `Character "${name}" imported successfully with ${assets.length} extra media assets and ${characterBook.entries.length} Lorebook entries!`,
        "Import Successful",
      );
    } catch (error: any) {
      console.error("Import failure:", error);
      dialogs.alert(
        "Failed to import character card: " + error.message,
        "Import Failed",
      );
    } finally {
      if (fileInputImport) fileInputImport.value = "";
    }
  }
</script>

<svelte:head>
  <title>Char Creator - Dashboard</title>
</svelte:head>

<div
  class="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4 animate-fade-in"
>
  <h1 class="text-3xl font-bold tracking-tight">Your Characters</h1>
  <div
    class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto"
  >
    <button
      onclick={() => fileInputImport?.click()}
      class="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground border px-4 py-2 rounded-md hover:bg-secondary/80 font-medium transition-colors w-full sm:w-auto cursor-pointer shadow-sm"
    >
      <FileUp class="w-4 h-4" /> Import PNG Card
    </button>
    <button
      onclick={createNew}
      class="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 font-medium transition-opacity w-full sm:w-auto cursor-pointer shadow-sm"
    >
      <Plus class="w-4 h-4" /> Create New Character
    </button>
  </div>
</div>

<!-- Instant filter search input -->
{#if characters.length > 0}
  <div
    class="mb-6 relative flex items-center bg-card border rounded-xl px-4 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-500 transition-all"
  >
    <Search class="w-5 h-5 text-muted-foreground mr-3" />
    <input
      type="text"
      bind:value={searchQuery}
      placeholder="Search characters by name..."
      class="w-full bg-transparent focus:outline-none text-sm font-medium text-foreground"
    />
    {#if searchQuery}
      <button
        onclick={() => (searchQuery = "")}
        class="p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-label="Clear Search Query"
      >
        <X class="w-4 h-4" />
      </button>
    {/if}
  </div>
{/if}

<input
  type="file"
  accept="image/png"
  class="hidden"
  bind:this={fileInputImport}
  onchange={handleImportCard}
/>

{#if loading}
  <div
    in:fade={{ duration: 200 }}
    class="flex flex-col items-center justify-center py-32 text-muted-foreground"
  >
    <Loader2 class="w-8 h-8 animate-spin mb-4" />
    <p>Loading characters...</p>
  </div>
{:else if characters.length === 0}
  <div
    in:fade={{ duration: 200 }}
    class="text-center py-20 border border-dashed rounded-lg bg-card px-4 shadow-sm"
  >
    <h2 class="text-xl font-semibold mb-2">No characters found</h2>
    <p class="text-muted-foreground mb-6">
      Start building your first roleplay personality.
    </p>
    <div
      class="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-sm mx-auto"
    >
      <button
        onclick={createNew}
        class="w-full sm:w-auto bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 font-medium cursor-pointer shadow-sm"
        >Get Started</button
      >
      <button
        onclick={() => fileInputImport?.click()}
        class="w-full sm:w-auto bg-secondary text-secondary-foreground border px-4 py-2 rounded-md hover:bg-secondary/80 font-medium cursor-pointer shadow-sm"
        >Import Card</button
      >
    </div>
  </div>
{:else if filteredCharacters.length === 0}
  <div
    in:fade={{ duration: 200 }}
    class="text-center py-20 border border-dashed rounded-lg bg-card px-4"
  >
    <p class="text-muted-foreground">No characters match your search query.</p>
  </div>
{:else}
  <div
    in:fade={{ duration: 200 }}
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  >
    {#each filteredCharacters as char (char.id)}
      <div
        class="border rounded-xl p-6 flex flex-col justify-between bg-card text-card-foreground shadow-sm hover:shadow-md transition-all"
      >
        <div>
          <div class="flex items-center gap-4 mb-4">
            <div
              class="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-border bg-secondary flex items-center justify-center"
            >
              {#if char.data.thumbnail}
                <img
                  src={char.data.thumbnail}
                  alt={char.name}
                  class="w-full h-full object-cover"
                />
              {:else}
                <span class="text-xl">🎭</span>
              {/if}
            </div>
            <h2 class="text-xl font-semibold line-clamp-1">
              {char.name || "Unnamed Character"}
            </h2>
          </div>
          <p class="text-sm text-muted-foreground mb-4 line-clamp-3">
            {char.data.mainPrompt || "No core concept provided."}
          </p>
        </div>
        <div class="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          <a
            href="/editor/{char.id}"
            class="flex-1 flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-2 rounded-md hover:bg-secondary/80 transition-colors border shadow-sm font-medium"
          >
            <Edit class="w-4 h-4" /> Edit
          </a>
          <button
            onclick={() => deleteChar(char.id)}
            class="p-2 text-destructive border border-transparent hover:border-destructive/20 hover:bg-destructive/10 rounded-md transition-colors cursor-pointer"
            aria-label="Delete"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

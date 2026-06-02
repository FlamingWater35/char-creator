<script lang="ts">
  import { onMount } from "svelte";
  import { db, type Character, type ExampleMessage } from "$lib/db";
  import { dialogs } from "$lib/dialogs.svelte";
  import { goto } from "$app/navigation";
  import { Plus, Trash2, Edit, Loader2, FileUp } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import { extractCharacterCardMetadata } from "$lib/png";

  let characters = $state<Character[]>([]);
  let loading = $state(true);
  let fileInputImport = $state<HTMLInputElement>();

  onMount(async () => {
    characters = await db.characters.orderBy("updatedAt").reverse().toArray();
    loading = false;
  });

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
        image: null,
      },
    };
    await db.characters.add(newChar);
    goto(`/editor/${id}`);
  }

  async function deleteChar(id: string) {
    const confirmed = await dialogs.confirm(
      "Are you sure you want to delete this character? This cannot be undone.",
    );
    if (confirmed) {
      await db.characters.delete(id);
      characters = await db.characters.orderBy("updatedAt").reverse().toArray();
    }
  }

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

  async function handleImportCard(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const metadata = extractCharacterCardMetadata(arrayBuffer);
      if (!metadata) {
        await dialogs.alert(
          "No character card metadata (chara or ccv3) found in this image.",
          "Invalid Card",
        );
        return;
      }

      const parsed = JSON.parse(metadata);
      const data = parsed.data || parsed;

      const name = data.name || "Imported Character";
      const fullDesc = data.description || "";
      let description = fullDesc;
      let backstory = "";

      const backstoryIndex = fullDesc.toLowerCase().indexOf("backstory:");
      if (backstoryIndex !== -1) {
        description = fullDesc.substring(0, backstoryIndex).trim();
        backstory = fullDesc.substring(backstoryIndex + 10).trim();
      }

      let relatedCharacters = "";
      const relCharIndex = fullDesc
        .toLowerCase()
        .indexOf("related characters:");
      if (relCharIndex !== -1) {
        const beforeRel = fullDesc.substring(0, relCharIndex).trim();
        const afterRel = fullDesc.substring(relCharIndex + 19).trim();
        relatedCharacters = afterRel;

        const bstIndex = beforeRel.toLowerCase().indexOf("backstory:");
        if (bstIndex !== -1) {
          description = beforeRel.substring(0, bstIndex).trim();
          backstory = beforeRel.substring(bstIndex + 10).trim();
        } else {
          description = beforeRel;
        }
      }

      const reader = new FileReader();
      const base64Image = await new Promise<string>((resolve) => {
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.readAsDataURL(file);
      });

      const firstMessages = [data.first_mes || ""];
      if (Array.isArray(data.alternate_greetings)) {
        firstMessages.push(...data.alternate_greetings.filter(Boolean));
      }

      const exampleMessages = parseExampleMessages(data.mes_example);

      const newChar: Character = {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date(),
        updatedAt: new Date(),
        data: {
          mainPrompt: description.substring(0, 150) || name,
          description,
          personality: data.personality || "",
          scenario: data.scenario || "",
          backstory,
          relatedCharacters,
          firstMessages,
          exampleMessages,
          image: base64Image || null,
        },
      };

      await db.characters.add(newChar);
      characters = await db.characters.orderBy("updatedAt").reverse().toArray();
      await dialogs.alert(
        `Character "${name}" imported successfully!`,
        "Import Successful",
      );
    } catch (error: any) {
      console.error(error);
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
  class="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4"
>
  <h1 class="text-3xl font-bold tracking-tight">Your Characters</h1>
  <div
    class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto"
  >
    <button
      onclick={() => fileInputImport?.click()}
      class="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground border px-4 py-2 rounded-md hover:bg-secondary/80 font-medium transition-colors w-full sm:w-auto cursor-pointer"
    >
      <FileUp class="w-4 h-4" />
      Import PNG Card
    </button>
    <button
      onclick={createNew}
      class="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 font-medium transition-opacity w-full sm:w-auto cursor-pointer"
    >
      <Plus class="w-4 h-4" />
      Create New Character
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
    class="text-center py-20 border border-dashed rounded-lg bg-card px-4"
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
        class="w-full sm:w-auto bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 font-medium cursor-pointer"
        >Get Started</button
      >
      <button
        onclick={() => fileInputImport?.click()}
        class="w-full sm:w-auto bg-secondary text-secondary-foreground border px-4 py-2 rounded-md hover:bg-secondary/80 font-medium cursor-pointer"
        >Import Card</button
      >
    </div>
  </div>
{:else}
  <div
    in:fade={{ duration: 200 }}
    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  >
    {#each characters as char (char.id)}
      <div
        class="border rounded-xl p-6 flex flex-col justify-between bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow"
      >
        <div>
          <div class="flex items-center gap-4 mb-4">
            <div
              class="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-border bg-secondary flex items-center justify-center"
            >
              {#if char.data.image}
                <img
                  src={char.data.image}
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

<script lang="ts">
  import { onMount } from "svelte";
  import { db, type Character } from "$lib/db";
  import { dialogs } from "$lib/dialogs.svelte";
  import { goto } from "$app/navigation";
  import { Plus, Trash2, Edit, Loader2, ImagePlus } from "lucide-svelte";
  import { fade } from "svelte/transition";

  let characters = $state<Character[]>([]);
  let loading = $state(true);

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
</script>

<svelte:head>
  <title>Char Creator - Dashboard</title>
</svelte:head>

<div
  class="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4"
>
  <h1 class="text-3xl font-bold tracking-tight">Your Characters</h1>
  <button
    onclick={createNew}
    class="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 font-medium transition-opacity w-full md:w-auto justify-center"
  >
    <Plus class="w-4 h-4" />
    Create New Character
  </button>
</div>

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
    <button
      onclick={createNew}
      class="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 font-medium"
      >Get Started</button
    >
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
            class="p-2 text-destructive border border-transparent hover:border-destructive/20 hover:bg-destructive/10 rounded-md transition-colors"
            aria-label="Delete"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

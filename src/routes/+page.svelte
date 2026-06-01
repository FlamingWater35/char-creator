<script lang="ts">
  import { onMount } from "svelte";
  import { db, type Character } from "$lib/db";
  import { goto } from "$app/navigation";
  import { Plus, Trash2, Edit } from "lucide-svelte";

  let characters = $state<Character[]>([]);

  onMount(async () => {
    characters = await db.characters.orderBy("updatedAt").reverse().toArray();
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
      },
    };
    await db.characters.add(newChar);
    goto(`/editor/${id}`);
  }

  async function deleteChar(id: string) {
    if (confirm("Are you sure you want to delete this character?")) {
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
    class="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 font-medium transition-opacity"
  >
    <Plus class="w-4 h-4" />
    Create New Character
  </button>
</div>

{#if characters.length === 0}
  <div class="text-center py-20 border border-dashed rounded-lg bg-card">
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
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each characters as char (char.id)}
      <div
        class="border rounded-xl p-6 flex flex-col justify-between bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow"
      >
        <div>
          <h2 class="text-xl font-semibold mb-2 line-clamp-1">
            {char.name || "Unnamed Character"}
          </h2>
          <p class="text-sm text-muted-foreground mb-4 line-clamp-3">
            {char.data.mainPrompt || "No core concept provided."}
          </p>
        </div>
        <div class="flex items-center gap-2 mt-4 pt-4 border-t border-border">
          <a
            href="/editor/{char.id}"
            class="flex-1 flex items-center justify-center gap-2 bg-secondary text-secondary-foreground py-2 rounded-md hover:opacity-80 transition-opacity font-medium"
          >
            <Edit class="w-4 h-4" /> Edit
          </a>
          <button
            onclick={() => deleteChar(char.id)}
            class="p-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Delete"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

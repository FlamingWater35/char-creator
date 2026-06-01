<script lang="ts">
  import { settings } from "$lib/settings.svelte";
  import { onMount } from "svelte";
  import { Save, Loader2, Search, ChevronDown, Check } from "lucide-svelte";

  let models = $state<{ id: string; name: string }[]>([]);
  let loadingModels = $state(false);
  let saved = $state(false);

  // Searchable dropdown state
  let dropdownOpen = $state(false);
  let searchQuery = $state("");

  let filteredModels = $derived(
    models.filter(
      (m) =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  let selectedModelName = $derived(
    models.find((m) => m.id === settings.model)?.name || settings.model,
  );

  onMount(async () => {
    loadingModels = true;
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      const data = await res.json();
      models = data.data || [];
    } catch (e) {
      console.error("Failed to fetch OpenRouter models", e);
    } finally {
      loadingModels = false;
    }
  });

  function saveSettings() {
    settings.save();
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }

  function selectModel(id: string) {
    settings.model = id;
    dropdownOpen = false;
    searchQuery = "";
  }
</script>

<svelte:head>
  <title>Settings - Char Creator</title>
</svelte:head>

<div class="max-w-2xl mx-auto space-y-8">
  <div>
    <h1 class="text-3xl font-bold tracking-tight mb-2">Settings</h1>
    <p class="text-muted-foreground">
      Manage your AI configurations and preferences.
    </p>
  </div>

  <div class="space-y-6 bg-card border rounded-xl p-6 shadow-sm">
    <div class="flex flex-col gap-3">
      <label for="apiKey" class="font-medium">OpenRouter API Key</label>
      <input
        type="password"
        id="apiKey"
        bind:value={settings.apiKey}
        class="border rounded-md px-4 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
        placeholder="sk-or-v1-..."
      />
      <p class="text-sm text-muted-foreground">
        Your key is stored locally in your browser's LocalStorage and is never
        sent to our servers.
      </p>
    </div>

    <div class="flex flex-col gap-3">
      <label class="font-medium">Default Generation Model</label>
      {#if loadingModels}
        <div class="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 class="w-4 h-4 animate-spin" /> Loading models from OpenRouter...
        </div>
      {:else}
        <div class="relative w-full">
          <!-- Dropdown Trigger -->
          <button
            type="button"
            onclick={() => (dropdownOpen = !dropdownOpen)}
            class="w-full flex items-center justify-between border rounded-md px-4 py-2 bg-background hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
          >
            <span class="truncate">{selectedModelName}</span>
            <ChevronDown class="w-4 h-4 opacity-50 shrink-0" />
          </button>

          <!-- Dropdown Menu -->
          {#if dropdownOpen}
            <!-- Invisible backdrop to close on click outside -->
            <button
              type="button"
              class="fixed inset-0 z-40 cursor-default"
              aria-label="Close dropdown"
              onclick={() => (dropdownOpen = false)}
            ></button>

            <div
              class="absolute top-full left-0 w-full z-50 bg-popover border border-border mt-1 rounded-md shadow-lg overflow-hidden flex flex-col max-h-80"
            >
              <div
                class="p-2 border-b border-border flex items-center gap-2 bg-background"
              >
                <Search class="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  bind:value={searchQuery}
                  placeholder="Search models..."
                  class="w-full bg-transparent focus:outline-none text-sm py-1"
                  autocomplete="off"
                />
              </div>

              <div class="overflow-y-auto flex-1 p-1">
                {#if filteredModels.length === 0}
                  <div class="p-4 text-center text-sm text-muted-foreground">
                    No models found.
                  </div>
                {/if}
                {#each filteredModels as model}
                  <button
                    type="button"
                    onclick={() => selectModel(model.id)}
                    class="w-full flex items-center justify-between text-left px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors {settings.model ===
                    model.id
                      ? 'bg-accent/50'
                      : ''}"
                  >
                    <div class="flex flex-col truncate pr-4">
                      <span class="font-medium truncate">{model.name}</span>
                      <span class="text-xs text-muted-foreground truncate"
                        >{model.id}</span
                      >
                    </div>
                    {#if settings.model === model.id}
                      <Check class="w-4 h-4 shrink-0" />
                    {/if}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        <p class="text-sm text-muted-foreground">
          Select the model used for sparking ideas and generating fields.
        </p>
      {/if}
    </div>

    <div class="pt-4 border-t border-border flex justify-end">
      <button
        onclick={saveSettings}
        class="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md hover:opacity-90 transition-opacity font-medium"
      >
        <Save class="w-4 h-4" />
        {saved ? "Saved Successfully!" : "Save Settings"}
      </button>
    </div>
  </div>
</div>

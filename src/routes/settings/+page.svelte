<script lang="ts">
  import { settings } from "$lib/settings.svelte";
  import { onMount } from "svelte";
  import { Save, Loader2, Search, ChevronDown, Check } from "lucide-svelte";
  import { setMode, resetMode } from "mode-watcher";

  let models = $state<{ id: string; name: string }[]>([]);
  let loadingModels = $state(false);
  let saved = $state(false);

  let dropdownOpen = $state(false);
  let searchQuery = $state("");

  let themePreference = $state("system");

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
    themePreference = localStorage.getItem("mode-watcher-mode") || "system";

    loadingModels = true;
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models");
      const data = await res.json();
      models = data.data || [];
    } catch (e) {
      console.error("Failed to fetch models", e);
    } finally {
      loadingModels = false;
    }
  });

  function updateTheme() {
    if (themePreference === "system") {
      resetMode();
    } else {
      setMode(themePreference as "light" | "dark");
    }
  }

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

<div class="max-w-2xl mx-auto space-y-8 pb-20">
  <div>
    <h1 class="text-3xl font-bold tracking-tight mb-2">Settings</h1>
    <p class="text-muted-foreground">
      Manage your AI configurations and preferences.
    </p>
  </div>

  <!-- General Settings -->
  <div class="space-y-6 bg-card border rounded-xl p-6 shadow-sm">
    <h2 class="text-xl font-bold border-b border-border pb-2">General</h2>

    <div class="flex flex-col gap-3">
      <label class="font-medium" for="theme">Appearance</label>
      <select
        id="theme"
        bind:value={themePreference}
        onchange={updateTheme}
        class="border rounded-md px-4 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
      >
        <option value="system">Automatic (System)</option>
        <option value="light">Light Mode</option>
        <option value="dark">Dark Mode</option>
      </select>
    </div>
  </div>

  <!-- AI Settings -->
  <div class="space-y-6 bg-card border rounded-xl p-6 shadow-sm">
    <h2 class="text-xl font-bold border-b border-border pb-2">
      AI Configuration
    </h2>

    <div class="flex flex-col gap-3">
      <label for="apiKey" class="font-medium">OpenRouter API Key</label>
      <input
        type="password"
        id="apiKey"
        bind:value={settings.apiKey}
        class="border rounded-md px-4 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
        placeholder="sk-or-v1-..."
      />
    </div>

    <div class="flex flex-col gap-3">
      <label class="font-medium">Generation Model</label>
      {#if loadingModels}
        <div class="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 class="w-4 h-4 animate-spin" /> Loading models...
        </div>
      {:else}
        <div class="relative w-full">
          <button
            type="button"
            onclick={() => (dropdownOpen = !dropdownOpen)}
            class="w-full flex items-center justify-between border rounded-md px-4 py-2 bg-background hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
          >
            <span class="truncate">{selectedModelName}</span>
            <ChevronDown class="w-4 h-4 opacity-50 shrink-0" />
          </button>

          {#if dropdownOpen}
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
      {/if}
    </div>

    <!-- Parameters -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
      <div class="flex flex-col gap-2">
        <div class="flex justify-between">
          <label class="font-medium text-sm" for="temp">Temperature</label>
          <span class="text-sm font-mono"
            >{settings.temperature.toFixed(2)}</span
          >
        </div>
        <input
          id="temp"
          type="range"
          min="0"
          max="2"
          step="0.05"
          bind:value={settings.temperature}
          class="w-full"
        />
        <p class="text-xs text-muted-foreground">
          Higher values make output more random, lower values make it more
          focused.
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex justify-between">
          <label class="font-medium text-sm" for="freq"
            >Repetition (Frequency) Penalty</label
          >
          <span class="text-sm font-mono"
            >{settings.frequencyPenalty.toFixed(2)}</span
          >
        </div>
        <input
          id="freq"
          type="range"
          min="-2"
          max="2"
          step="0.05"
          bind:value={settings.frequencyPenalty}
          class="w-full"
        />
        <p class="text-xs text-muted-foreground">
          Positive values penalize new tokens based on their existing frequency.
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <div class="flex justify-between">
          <label class="font-medium text-sm" for="pres">Presence Penalty</label>
          <span class="text-sm font-mono"
            >{settings.presencePenalty.toFixed(2)}</span
          >
        </div>
        <input
          id="pres"
          type="range"
          min="-2"
          max="2"
          step="0.05"
          bind:value={settings.presencePenalty}
          class="w-full"
        />
        <p class="text-xs text-muted-foreground">
          Positive values penalize tokens if they have already appeared at all.
        </p>
      </div>
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

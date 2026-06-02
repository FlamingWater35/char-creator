<script lang="ts">
  import { settings } from "$lib/settings.svelte";
  import { onMount } from "svelte";
  import {
    Save,
    Loader2,
    Search,
    ChevronDown,
    Check,
    Eye,
    EyeOff,
    ChevronUp,
  } from "lucide-svelte";
  import { setMode, resetMode } from "mode-watcher";
  import { slide } from "svelte/transition";

  let models = $state<{ id: string; name: string }[]>([]);
  let loadingModels = $state(false);
  let saved = $state(false);

  let dropdownOpen = $state(false);
  let searchQuery = $state("");
  let themePreference = $state("system");

  let showApiKey = $state(false);
  let advancedOpen = $state(false);

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
    settings.load();

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
        class="border rounded-md px-4 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full cursor-pointer"
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
      <div class="relative flex items-center">
        <input
          type={showApiKey ? "text" : "password"}
          id="apiKey"
          bind:value={settings.apiKey}
          class="border rounded-md pl-4 pr-12 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          placeholder="sk-or-v1-..."
        />
        <button
          type="button"
          onclick={() => (showApiKey = !showApiKey)}
          class="absolute right-3 p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={showApiKey ? "Hide API Key" : "Show API Key"}
        >
          {#if showApiKey}
            <EyeOff class="w-5 h-5" />
          {:else}
            <Eye class="w-5 h-5" />
          {/if}
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-3">
      <div id="model-label" class="font-medium">Generation Model</div>
      {#if loadingModels}
        <div class="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 class="w-4 h-4 animate-spin" /> Loading models...
        </div>
      {:else}
        <div class="relative w-full">
          <button
            type="button"
            aria-labelledby="model-label"
            onclick={() => (dropdownOpen = !dropdownOpen)}
            class="w-full flex items-center justify-between border rounded-md px-4 py-2 bg-background hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 text-left cursor-pointer"
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
              class="absolute top-full left-0 w-full z-50 bg-popover border border-border mt-1 rounded-md shadow-lg overflow-hidden flex flex-col max-h-80 animate-in fade-in slide-in-from-top-2 duration-150"
            >
              <div
                class="p-2 border-b border-border flex items-center gap-2 bg-background"
              >
                <Search class="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  bind:value={searchQuery}
                  placeholder="Search models..."
                  aria-label="Search models"
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

    <!-- Generation Parameters -->
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
          class="w-full cursor-pointer"
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
          class="w-full cursor-pointer"
        />
      </div>
    </div>

    <!-- Collapsible Advanced Settings -->
    <div class="border-t pt-4">
      <button
        type="button"
        onclick={() => (advancedOpen = !advancedOpen)}
        class="w-full flex items-center justify-between font-bold text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <span>Advanced AI Parameters</span>
        {#if advancedOpen}
          <ChevronUp class="w-5 h-5" />
        {:else}
          <ChevronDown class="w-5 h-5" />
        {/if}
      </button>

      {#if advancedOpen}
        <div transition:slide class="space-y-6 pt-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="flex flex-col gap-2">
              <div class="flex justify-between">
                <label class="font-medium text-sm" for="topP">Top P</label>
                <span class="text-sm font-mono">{settings.topP.toFixed(2)}</span
                >
              </div>
              <input
                id="topP"
                type="range"
                min="0"
                max="1"
                step="0.05"
                bind:value={settings.topP}
                class="w-full cursor-pointer"
              />
              <p class="text-xs text-muted-foreground">
                Controls nucleus sampling. Lower values limit selection to
                highly probable tokens.
              </p>
            </div>

            <div class="flex flex-col gap-2">
              <div class="flex justify-between">
                <label class="font-medium text-sm" for="maxTokens"
                  >Max Tokens</label
                >
                <span class="text-sm font-mono">{settings.maxTokens}</span>
              </div>
              <input
                id="maxTokens"
                type="number"
                min="0"
                max="8192"
                step="64"
                bind:value={settings.maxTokens}
                class="border rounded-md px-3 py-1.5 bg-background text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <p class="text-xs text-muted-foreground">
                Sets maximum completion tokens generated.
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <div class="flex justify-between">
              <label class="font-medium text-sm" for="pres"
                >Presence Penalty</label
              >
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
              class="w-full cursor-pointer"
            />
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Concept Field Generator Configuration -->
  <div class="space-y-6 bg-card border rounded-xl p-6 shadow-sm">
    <h2 class="text-xl font-bold border-b border-border pb-2">
      Concept Generation Toggles
    </h2>
    <p class="text-sm text-muted-foreground">
      Select which elements of the profile should be requested and overwritten
      when clicking "Generate All Fields".
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label
        class="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/30 transition-all select-none"
      >
        <input
          type="checkbox"
          bind:checked={settings.genName}
          class="accent-blue-600 rounded border-border"
        />
        <span class="text-sm font-medium">Character Name</span>
      </label>

      <label
        class="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/30 transition-all select-none"
      >
        <input
          type="checkbox"
          bind:checked={settings.genDescription}
          class="accent-blue-600 rounded border-border"
        />
        <span class="text-sm font-medium">Description</span>
      </label>

      <label
        class="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/30 transition-all select-none"
      >
        <input
          type="checkbox"
          bind:checked={settings.genPersonality}
          class="accent-blue-600 rounded border-border"
        />
        <span class="text-sm font-medium">Personality</span>
      </label>

      <label
        class="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/30 transition-all select-none"
      >
        <input
          type="checkbox"
          bind:checked={settings.genScenario}
          class="accent-blue-600 rounded border-border"
        />
        <span class="text-sm font-medium">Scenario</span>
      </label>

      <label
        class="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/30 transition-all select-none"
      >
        <input
          type="checkbox"
          bind:checked={settings.genBackstory}
          class="accent-blue-600 rounded border-border"
        />
        <span class="text-sm font-medium">Backstory</span>
      </label>

      <label
        class="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/30 transition-all select-none"
      >
        <input
          type="checkbox"
          bind:checked={settings.genFirstMessages}
          class="accent-blue-600 rounded border-border"
        />
        <span class="text-sm font-medium">First Messages</span>
      </label>

      <label
        class="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/30 transition-all select-none"
      >
        <input
          type="checkbox"
          bind:checked={settings.genExampleMessages}
          class="accent-blue-600 rounded border-border"
        />
        <span class="text-sm font-medium">Example Messages</span>
      </label>

      <label
        class="flex items-center gap-3 cursor-pointer p-3 border rounded-lg hover:bg-muted/30 transition-all select-none"
      >
        <input
          type="checkbox"
          bind:checked={settings.genRelatedCharacters}
          class="accent-blue-600 rounded border-border"
        />
        <span class="text-sm font-medium">Related Characters</span>
      </label>
    </div>

    <div class="pt-4 border-t border-border flex justify-end">
      <button
        onclick={saveSettings}
        class="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md hover:opacity-90 transition-opacity font-medium cursor-pointer"
      >
        <Save class="w-4 h-4" />
        {saved ? "Saved Successfully!" : "Save Settings"}
      </button>
    </div>
  </div>
</div>

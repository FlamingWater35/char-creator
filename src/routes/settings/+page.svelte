<script lang="ts">
  import { settings } from "$lib/settings.svelte";
  import { onMount } from "svelte";
  import {
    Save,
    Loader2,
    Search,
    ChevronDown,
    Eye,
    EyeOff,
    ChevronUp,
    Palette,
    Cpu,
    Settings2,
    Sparkles,
  } from "lucide-svelte";
  import { setMode, resetMode } from "mode-watcher";
  import { slide, fade } from "svelte/transition";

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

<div class="max-w-3xl mx-auto space-y-8 pb-32">
  <div>
    <h1 class="text-4xl font-black tracking-tight mb-2">Settings</h1>
    <p class="text-muted-foreground text-lg">
      Configure your AI model and application preferences.
    </p>
  </div>

  <section class="space-y-4">
    <div
      class="flex items-center gap-2 text-muted-foreground font-semibold uppercase tracking-wider text-xs"
    >
      <Palette class="w-4 h-4" /> Appearance
    </div>
    <div class="bg-card border rounded-2xl p-6 shadow-sm">
      <div
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h3 class="text-lg font-bold">Theme Mode</h3>
          <p class="text-sm text-muted-foreground">
            Switch between light, dark, or system default.
          </p>
        </div>
        <div
          class="flex bg-secondary p-1 rounded-xl w-fit"
          role="group"
          aria-label="Theme preference"
        >
          {#each ["system", "light", "dark"] as mode}
            <button
              onclick={() => {
                themePreference = mode;
                updateTheme();
              }}
              aria-pressed={themePreference === mode}
              class="px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer {themePreference ===
              mode
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <section class="space-y-4">
    <div
      class="flex items-center gap-2 text-muted-foreground font-semibold uppercase tracking-wider text-xs"
    >
      <Settings2 class="w-4 h-4" /> Application Configuration
    </div>

    <div
      class="bg-card border rounded-2xl shadow-sm overflow-hidden divide-y divide-border"
    >
      <div class="p-6 space-y-6">
        <div class="flex items-center gap-3 mb-2">
          <div class="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
            <Cpu class="w-5 h-5" />
          </div>
          <h2 class="text-xl font-bold">AI Engine</h2>
        </div>

        <div class="flex flex-col gap-3">
          <label for="apiKey" class="font-bold text-sm"
            >OpenRouter API Key</label
          >
          <div class="relative flex items-center">
            <input
              type={showApiKey ? "text" : "password"}
              id="apiKey"
              bind:value={settings.apiKey}
              class="border rounded-xl pl-4 pr-12 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full transition-all"
              placeholder="sk-or-v1-..."
            />
            <button
              type="button"
              onclick={() => (showApiKey = !showApiKey)}
              class="absolute right-3 p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
          <div id="model-label" class="font-bold text-sm">Active Model</div>
          {#if loadingModels}
            <div
              class="flex items-center gap-3 py-3 px-4 bg-muted rounded-xl animate-pulse"
              aria-busy="true"
            >
              <Loader2 class="w-4 h-4 animate-spin" />
              <span class="text-sm">Fetching available models...</span>
            </div>
          {:else}
            <div class="relative w-full">
              <button
                type="button"
                aria-labelledby="model-label"
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                onclick={() => (dropdownOpen = !dropdownOpen)}
                class="w-full flex items-center justify-between border rounded-xl px-4 py-3 bg-background hover:bg-muted/50 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 text-left cursor-pointer"
              >
                <span class="truncate font-medium">{selectedModelName}</span>
                <ChevronDown class="w-4 h-4 opacity-50 shrink-0" />
              </button>

              {#if dropdownOpen}
                <button
                  type="button"
                  class="fixed inset-0 z-40"
                  onclick={() => (dropdownOpen = false)}
                  aria-label="Close model selector"
                ></button>
                <div
                  class="absolute top-full left-0 w-full z-50 bg-popover border border-border mt-2 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-80 animate-in fade-in slide-in-from-top-2 duration-200"
                  role="listbox"
                >
                  <div
                    class="p-3 border-b border-border flex items-center gap-2 bg-muted/30"
                  >
                    <Search class="w-4 h-4 text-muted-foreground" />
                    <input
                      bind:value={searchQuery}
                      aria-label="Filter models"
                      placeholder="Filter models..."
                      class="w-full bg-transparent focus:outline-none text-sm py-1"
                      autocomplete="off"
                    />
                  </div>
                  <div class="overflow-y-auto flex-1 p-2">
                    {#each filteredModels as model}
                      <button
                        type="button"
                        role="option"
                        aria-selected={settings.model === model.id}
                        onclick={() => selectModel(model.id)}
                        class="w-full flex flex-col text-left px-3 py-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors {settings.model ===
                        model.id
                          ? 'bg-accent/50'
                          : ''}"
                      >
                        <span class="font-bold text-sm">{model.name}</span>
                        <span class="text-[10px] opacity-60 font-mono truncate"
                          >{model.id}</span
                        >
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
          <div class="space-y-4">
            <div class="flex justify-between">
              <label class="font-bold text-sm" for="temp">Temperature</label>
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
              class="w-full accent-blue-500 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div class="space-y-4">
            <div class="flex justify-between">
              <label class="font-bold text-sm" for="freq"
                >Frequency Penalty</label
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
              class="w-full accent-orange-500 h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        <div class="bg-secondary/30 rounded-xl px-4 py-2">
          <button
            type="button"
            aria-expanded={advancedOpen}
            onclick={() => (advancedOpen = !advancedOpen)}
            class="w-full flex items-center justify-between py-2 font-bold text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <span>ADVANCED ENGINE PARAMETERS</span>
            {#if advancedOpen}
              <ChevronUp class="w-4 h-4" />
            {:else}
              <ChevronDown class="w-4 h-4" />
            {/if}
          </button>

          {#if advancedOpen}
            <div transition:slide class="space-y-6 pb-4 pt-2">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-3">
                  <div class="flex justify-between">
                    <label class="font-bold text-xs" for="topP">Top P</label>
                    <span class="text-xs font-mono"
                      >{settings.topP.toFixed(2)}</span
                    >
                  </div>
                  <input
                    id="topP"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    bind:value={settings.topP}
                    class="w-full accent-primary"
                  />
                </div>
                <div class="space-y-3">
                  <label class="font-bold text-xs" for="maxTokens"
                    >Max Completion Tokens</label
                  >
                  <input
                    id="maxTokens"
                    type="number"
                    bind:value={settings.maxTokens}
                    class="w-full border rounded-lg px-3 py-2 bg-background text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <label class="font-bold text-xs" for="pres"
                    >Presence Penalty</label
                  >
                  <span class="text-xs font-mono"
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
                  class="w-full accent-primary"
                />
              </div>
            </div>
          {/if}
        </div>
      </div>

      <div class="p-6 bg-muted/10 space-y-6">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-purple-500/10 text-purple-500 rounded-lg">
            <Sparkles class="w-5 h-5" />
          </div>
          <h2 class="text-xl font-bold">Concept Generation</h2>
        </div>

        <div
          class="grid grid-cols-1 sm:grid-cols-2 gap-3"
          role="group"
          aria-label="Prompt generation toggles"
        >
          {#each [{ key: "genName", label: "Name" }, { key: "genDescription", label: "Description" }, { key: "genPersonality", label: "Personality" }, { key: "genScenario", label: "Scenario" }, { key: "genBackstory", label: "Backstory" }, { key: "genFirstMessages", label: "Greetings" }, { key: "genExampleMessages", label: "Examples" }, { key: "genRelatedCharacters", label: "Relations" }] as toggle}
            <button
              role="switch"
              aria-checked={(settings as any)[toggle.key]}
              onclick={() =>
                ((settings as any)[toggle.key] = !(settings as any)[
                  toggle.key
                ])}
              class="flex items-center justify-between p-4 border rounded-xl bg-background hover:border-primary transition-all group cursor-pointer text-left shadow-sm"
            >
              <span
                class="text-sm font-bold group-hover:text-primary transition-colors"
                >{toggle.label}</span
              >
              <div
                class="w-10 h-6 rounded-full relative transition-colors {(
                  settings as any
                )[toggle.key]
                  ? 'bg-blue-600'
                  : 'bg-muted'}"
              >
                <div
                  class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform {(
                    settings as any
                  )[toggle.key]
                    ? 'translate-x-4'
                    : 'translate-x-0'} shadow-sm"
                ></div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </section>
</div>

<div class="fixed bottom-8 right-8 z-50">
  {#if saved}
    <div
      in:fade
      out:fade
      role="status"
      class="absolute bottom-full right-0 mb-4 bg-emerald-500 text-white px-4 py-2 rounded-xl shadow-lg font-bold text-sm whitespace-nowrap"
    >
      Settings Saved!
    </div>
  {/if}

  <button
    onclick={saveSettings}
    class="flex items-center gap-3 bg-primary text-primary-foreground px-6 py-4 rounded-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all font-black text-base cursor-pointer group"
  >
    <Save class="w-6 h-6 group-hover:rotate-12 transition-transform" />
    Save Settings
  </button>
</div>

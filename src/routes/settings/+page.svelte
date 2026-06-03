<script lang="ts">
  import { settings } from "$lib/settings.svelte";
  import { db } from "$lib/db";
  import { dialogs } from "$lib/dialogs.svelte";
  import { onMount } from "svelte";
  import {
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
    FileDown,
    FileUp,
    Trash2,
    RotateCcw,
  } from "@lucide/svelte";
  import { setMode, resetMode } from "mode-watcher";
  import { slide } from "svelte/transition";

  let models = $state<{ id: string; name: string }[]>([]);
  let loadingModels = $state(false);

  let dropdownOpen = $state(false);
  let searchQuery = $state("");
  let themePreference = $state("system");

  let showApiKey = $state(false);
  let advancedOpen = $state(false);

  let fileInputImportDB = $state<HTMLInputElement>();
  let autosaveStatus = $state("Synced");

  const providerDefaults: Record<string, string> = {
    openrouter: "openai/gpt-chat-latest",
    openai: "gpt-4o-mini",
    deepseek: "deepseek-chat",
    groq: "llama3-8b-8192",
    together: "meta-llama/Llama-3-8b-chat-hf",
  };

  let filteredModels = $derived(
    models.filter(
      (m) =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.id.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  let selectedModelName = $derived(
    models.find((m) => m.id === settings.model)?.name ||
      settings.model ||
      (models.length === 0
        ? "No models loaded (Check API connection)"
        : "Select a model..."),
  );

  onMount(async () => {
    settings.load();
    themePreference = localStorage.getItem("mode-watcher-mode") || "system";
    await fetchModels();
  });

  $effect(() => {
    const _ = {
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature,
      frequencyPenalty: settings.frequencyPenalty,
      presencePenalty: settings.presencePenalty,
      topP: settings.topP,
      maxTokens: settings.maxTokens,
      systemPrompt: settings.systemPrompt,
      provider: settings.provider,
      customBaseUrl: settings.customBaseUrl,
      genName: settings.genName,
      genDescription: settings.genDescription,
      genPersonality: settings.genPersonality,
      genScenario: settings.genScenario,
      genBackstory: settings.genBackstory,
      genFirstMessages: settings.genFirstMessages,
      genExampleMessages: settings.genExampleMessages,
      genRelatedCharacters: settings.genRelatedCharacters,
      mergeTraitsOnExport: settings.mergeTraitsOnExport,
      exportVersion: settings.exportVersion,
    };

    settings.save();
    autosaveStatus = "Saving changes...";
    const t = setTimeout(() => {
      autosaveStatus = "All changes saved locally";
    }, 1000);
    return () => clearTimeout(t);
  });

  async function fetchModels() {
    loadingModels = true;
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: settings.provider,
          customBaseUrl: settings.customBaseUrl,
          apiKey: settings.apiKey,
        }),
      });
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        models = data.models;

        const preferredDefault = providerDefaults[settings.provider];
        const preferredExists = preferredDefault
          ? models.some((m) => m.id === preferredDefault)
          : false;
        const currentExists = models.some((m) => m.id === settings.model);

        if (!currentExists) {
          if (preferredExists && preferredDefault) {
            settings.model = preferredDefault;
          } else {
            settings.model = models[0].id;
          }
        }
      } else {
        models = [];
      }
    } catch (e) {
      console.error("Failed to load models:", e);
      models = [];
    } finally {
      loadingModels = false;
    }
  }

  function handleProviderChange() {
    settings.model = "";
    fetchModels();
  }

  function updateTheme() {
    if (themePreference === "system") {
      resetMode();
    } else {
      setMode(themePreference as "light" | "dark");
    }
  }

  function selectModel(id: string) {
    settings.model = id;
    dropdownOpen = false;
    searchQuery = "";
  }

  async function exportDatabase() {
    try {
      const allCharacters = await db.characters.toArray();
      const allImages = await db.characterImages.toArray();
      const allAssets = await db.characterAssets.toArray();

      const backup = {
        app: "char-creator",
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: {
          apiKey: settings.apiKey,
          model: settings.model,
          temperature: settings.temperature,
          frequencyPenalty: settings.frequencyPenalty,
          presencePenalty: settings.presencePenalty,
          topP: settings.topP,
          maxTokens: settings.maxTokens,
          systemPrompt: settings.systemPrompt,
          provider: settings.provider,
          customBaseUrl: settings.customBaseUrl,
          genName: settings.genName,
          genDescription: settings.genDescription,
          genPersonality: settings.genPersonality,
          genScenario: settings.genScenario,
          genBackstory: settings.genBackstory,
          genFirstMessages: settings.genFirstMessages,
          genExampleMessages: settings.genExampleMessages,
          genRelatedCharacters: settings.genRelatedCharacters,
          mergeTraitsOnExport: settings.mergeTraitsOnExport,
          exportVersion: settings.exportVersion,
        },
        characters: allCharacters,
        characterImages: allImages,
        characterAssets: allAssets,
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `char_creator_backup_${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      dialogs.alert("Export failed: " + e.message, "Export Error");
    }
  }

  async function importDatabase(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const confirmed = await dialogs.confirm(
      "Importing database will overwrite current configuration settings and merge characters. Proceed with import?",
      "Import Backup Data",
    );
    if (!confirmed) {
      if (fileInputImportDB) fileInputImportDB.value = "";
      return;
    }

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (backup.app !== "char-creator") {
        const proceedAnyway = await dialogs.confirm(
          "This file does not match Char Creator standards. Attempt import anyway?",
          "Format Warning",
        );
        if (!proceedAnyway) {
          if (fileInputImportDB) fileInputImportDB.value = "";
          return;
        }
      }

      if (backup.settings) {
        const s = backup.settings;
        if (typeof s.apiKey === "string") settings.apiKey = s.apiKey;
        if (typeof s.model === "string") settings.model = s.model;
        if (typeof s.temperature === "number")
          settings.temperature = s.temperature;
        if (typeof s.frequencyPenalty === "number")
          settings.frequencyPenalty = s.frequencyPenalty;
        if (typeof s.presencePenalty === "number")
          settings.presencePenalty = s.presencePenalty;
        if (typeof s.topP === "number") settings.topP = s.topP;
        if (typeof s.maxTokens === "number") settings.maxTokens = s.maxTokens;
        if (typeof s.systemPrompt === "string")
          settings.systemPrompt = s.systemPrompt;
        if (typeof s.provider === "string") settings.provider = s.provider;
        if (typeof s.customBaseUrl === "string")
          settings.customBaseUrl = s.customBaseUrl;
        if (typeof s.genName === "boolean") settings.genName = s.genName;
        if (typeof s.genDescription === "boolean")
          settings.genDescription = s.genDescription;
        if (typeof s.genPersonality === "boolean")
          settings.genPersonality = s.genPersonality;
        if (typeof s.genScenario === "boolean")
          settings.genScenario = s.genScenario;
        if (typeof s.genBackstory === "boolean")
          settings.genBackstory = s.genBackstory;
        if (typeof s.genFirstMessages === "boolean")
          settings.genFirstMessages = s.genFirstMessages;
        if (typeof s.genExampleMessages === "boolean")
          settings.genExampleMessages = s.genExampleMessages;
        if (typeof s.genRelatedCharacters === "boolean")
          settings.genRelatedCharacters = s.genRelatedCharacters;
        if (typeof s.mergeTraitsOnExport === "boolean")
          settings.mergeTraitsOnExport = s.mergeTraitsOnExport;
        if (s.exportVersion === "v2" || s.exportVersion === "v3")
          settings.exportVersion = s.exportVersion;

        settings.save();
      }

      let importedCount = 0;
      if (Array.isArray(backup.characters)) {
        for (const char of backup.characters) {
          if (!char.id || !char.name) continue;

          let fallbackImage = null;
          let fallbackAssets = [];
          if (char.data.image) {
            fallbackImage = char.data.image;
            delete char.data.image;
          }
          if (char.data.assets) {
            fallbackAssets = char.data.assets;
            delete char.data.assets;
          }

          const finalChar = {
            id: char.id,
            name: char.name,
            createdAt: char.createdAt ? new Date(char.createdAt) : new Date(),
            updatedAt: char.updatedAt ? new Date(char.updatedAt) : new Date(),
            data: {
              mainPrompt: char.data?.mainPrompt || "",
              description: char.data?.description || "",
              personality: char.data?.personality || "",
              scenario: char.data?.scenario || "",
              backstory: char.data?.backstory || "",
              firstMessages: Array.isArray(char.data?.firstMessages)
                ? char.data.firstMessages
                : [""],
              exampleMessages: Array.isArray(char.data?.exampleMessages)
                ? char.data.exampleMessages
                : [],
              thumbnail: char.data?.thumbnail || null,
              relatedCharacters: char.data?.relatedCharacters || "",
              characterBook: char.data?.characterBook
                ? {
                    name: char.data.characterBook.name || "",
                    description: char.data.characterBook.description || "",
                    entries: Array.isArray(char.data.characterBook.entries)
                      ? char.data.characterBook.entries
                      : [],
                  }
                : { name: "", description: "", entries: [] },
              worldInfo: char.data?.worldInfo || "",
            },
          };

          await db.characters.put(finalChar);
          importedCount++;

          if (fallbackImage) {
            await db.characterImages.put({ id: char.id, image: fallbackImage });
          }
          if (fallbackAssets.length > 0) {
            for (const asset of fallbackAssets) {
              await db.characterAssets.put({ ...asset, characterId: char.id });
            }
          }
        }

        if (Array.isArray(backup.characterImages)) {
          await db.characterImages.bulkPut(backup.characterImages);
        }
        if (Array.isArray(backup.characterAssets)) {
          await db.characterAssets.bulkPut(backup.characterAssets);
        }

        await dialogs.alert(
          `Successfully updated configurations and loaded ${importedCount} characters.`,
          "Database Restored",
        );
      } else {
        await dialogs.alert(
          "Restored settings. No characters found to load.",
          "Database Restored",
        );
      }

      await fetchModels();
    } catch (error: any) {
      console.error(error);
      dialogs.alert("Error importing file: " + error.message, "Import failed");
    } finally {
      if (fileInputImportDB) fileInputImportDB.value = "";
    }
  }

  async function handleDeleteAll() {
    const confirmed = await dialogs.confirm(
      "Are you sure you want to delete ALL characters? This action is permanent and cannot be undone.",
      "Dangerous Action",
    );
    if (confirmed) {
      const doubleCheck = await dialogs.confirm(
        "Please confirm again. Do you really want to permanently delete all your characters?",
        "Final Confirmation",
      );
      if (doubleCheck) {
        await db.characters.clear();
        await db.characterImages.clear();
        await db.characterAssets.clear();
        await dialogs.alert("All character files deleted.", "Clear Completed");
      }
    }
  }

  async function handleResetSettings() {
    const confirmed = await dialogs.confirm(
      "Are you sure you want to reset all configurations to standard defaults?",
      "Reset Defaults",
    );
    if (confirmed) {
      settings.resetToDefaults();
      await fetchModels();
      await dialogs.alert("Settings restored to defaults.", "Reset Successful");
    }
  }
</script>

<svelte:head>
  <title>Settings - Char Creator</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-8 pb-32">
  <div>
    <h1 class="text-4xl font-black tracking-tight mb-2">Settings</h1>
    <p class="text-muted-foreground text-lg">
      Configure your AI model and database files.
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
              class="px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer {themePreference ===
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
        <div class="flex items-center gap-3 mb-6">
          <div class="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
            <Cpu class="w-5 h-5" />
          </div>
          <h2 class="text-xl font-bold">AI Engine</h2>
        </div>

        <div class="flex flex-col gap-3 pt-2">
          <label class="font-bold text-sm" for="provider">API Provider</label>
          <select
            id="provider"
            bind:value={settings.provider}
            onchange={handleProviderChange}
            class="border rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full cursor-pointer transition-all text-base sm:text-sm"
          >
            <option value="openrouter">OpenRouter (Default)</option>
            <option value="openai">OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="groq">Groq</option>
            <option value="together">Together AI</option>
            <option value="custom"
              >Custom / Local API (Ollama, LM Studio...)</option
            >
          </select>
        </div>

        {#if settings.provider === "custom"}
          <div transition:slide class="flex flex-col gap-3">
            <label for="customBaseUrl" class="font-bold text-sm"
              >Custom API Base URL</label
            >
            <input
              type="text"
              id="customBaseUrl"
              bind:value={settings.customBaseUrl}
              class="border rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full transition-all text-base sm:text-sm"
              placeholder="e.g. http://localhost:11434/v1"
            />
            <p class="text-xs text-muted-foreground">
              Requires an OpenAI-compatible endpoint structure.
            </p>
          </div>
        {/if}

        <div class="flex flex-col gap-3">
          <label for="apiKey" class="font-bold text-sm">
            {settings.provider === "custom" ? "API Key (Optional)" : "API Key"}
          </label>
          <div class="relative flex items-center">
            <input
              type={showApiKey ? "text" : "password"}
              id="apiKey"
              bind:value={settings.apiKey}
              class="border rounded-xl pl-4 pr-12 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full transition-all text-base sm:text-sm"
              placeholder={settings.provider === "custom"
                ? "Optional key"
                : "sk-..."}
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
          <div class="flex justify-between items-center">
            <div id="model-label" class="font-bold text-sm">Active Model</div>
            <button
              type="button"
              onclick={fetchModels}
              disabled={loadingModels}
              class="text-xs text-blue-500 hover:text-blue-600 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              Refresh List
            </button>
          </div>
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
                disabled={models.length === 0 && !settings.model}
                onclick={() => (dropdownOpen = !dropdownOpen)}
                class="w-full flex items-center justify-between border rounded-xl px-4 py-3 bg-background hover:bg-muted/50 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 text-left cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-sm"
              >
                <span class="truncate font-medium">{selectedModelName}</span>
                <ChevronDown class="w-4 h-4 opacity-50 shrink-0" />
              </button>

              {#if dropdownOpen && models.length > 0}
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
                      class="w-full bg-transparent focus:outline-none text-base sm:text-sm py-1"
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
              class="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-blue-500 my-4"
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
              class="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-orange-500 my-4"
            />
          </div>
        </div>

        <div class="bg-secondary/30 rounded-xl px-4 py-2">
          <button
            type="button"
            aria-expanded={advancedOpen}
            onclick={() => (advancedOpen = !advancedOpen)}
            class="w-full flex items-center justify-between py-3 font-bold text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                    class="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary my-4"
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
                    class="w-full border rounded-lg px-3 py-2.5 bg-background text-base sm:text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                  class="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary my-4"
                />
              </div>

              <!-- Interactive System Prompt text editor configuration -->
              <div class="space-y-3 pt-4 border-t border-border/30">
                <div class="flex justify-between items-center">
                  <label class="font-bold text-xs" for="systemPrompt"
                    >AI System Prompt (Custom Base Instruction)</label
                  >
                  <button
                    type="button"
                    onclick={() => settings.resetSystemPrompt()}
                    class="text-[10px] text-blue-500 hover:text-blue-600 font-bold transition-colors cursor-pointer p-1"
                  >
                    Reset Prompt
                  </button>
                </div>
                <textarea
                  id="systemPrompt"
                  bind:value={settings.systemPrompt}
                  class="w-full border rounded-xl px-4 py-3 bg-background text-base sm:text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y min-h-95 leading-relaxed"
                  placeholder="System prompt instructions..."
                ></textarea>
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
              class="flex items-center justify-between p-4 border rounded-xl bg-background hover:border-primary transition-all group cursor-pointer text-left shadow-sm min-h-14"
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

      <div class="p-6 bg-secondary/10 space-y-6">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-blue-500/10 text-blue-500 rounded-lg">
            <FileDown class="w-5 h-5" />
          </div>
          <h2 class="text-xl font-bold">Export Compatibility</h2>
        </div>

        <div
          class="flex flex-col gap-3 p-4 border rounded-xl bg-background shadow-sm"
        >
          <label class="font-bold text-sm" for="exportVersion"
            >Export Character Card Format</label
          >
          <select
            id="exportVersion"
            bind:value={settings.exportVersion}
            class="border rounded-xl px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 w-full cursor-pointer transition-all text-base sm:text-sm"
          >
            <option value="v3">SillyTavern V3 (Standard / Recommended)</option>
            <option value="v2">SillyTavern V2 (Legacy Compatibility)</option>
          </select>
          <p class="text-[11px] text-muted-foreground">
            V3 encodes extra layered multimedia assets inside a native array. V2
            encodes assets inside the extensions envelope.
          </p>
        </div>

        <button
          role="switch"
          aria-checked={settings.mergeTraitsOnExport}
          onclick={() =>
            (settings.mergeTraitsOnExport = !settings.mergeTraitsOnExport)}
          class="flex items-center justify-between p-4 border rounded-xl bg-background hover:border-primary transition-all group cursor-pointer text-left shadow-sm w-full min-h-18"
        >
          <div class="space-y-1 pr-4">
            <span
              class="text-sm font-bold group-hover:text-primary transition-colors block"
              >Merge Traits on Export</span
            >
            <span class="text-xs text-muted-foreground block"
              >Appends personality and scenario to description inside exported
              PNG cards.</span
            >
          </div>
          <div
            class="w-10 h-6 rounded-full relative transition-colors shrink-0 {settings.mergeTraitsOnExport
              ? 'bg-blue-600'
              : 'bg-muted'}"
          >
            <div
              class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform {settings.mergeTraitsOnExport
                ? 'translate-x-4'
                : 'translate-x-0'} shadow-sm"
            ></div>
          </div>
        </button>
      </div>

      <div class="p-6 space-y-6 bg-card">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-destructive/10 text-destructive rounded-lg">
            <Settings2 class="w-5 h-5" />
          </div>
          <h2 class="text-xl font-bold">Database & Maintenance</h2>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onclick={exportDatabase}
            class="flex items-center justify-center gap-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-3.5 rounded-xl text-sm font-bold transition-colors cursor-pointer min-h-12"
          >
            <FileDown class="w-4 h-4 text-blue-500" /> Export Database JSON
          </button>
          <button
            onclick={() => fileInputImportDB?.click()}
            class="flex items-center justify-center gap-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-3.5 rounded-xl text-sm font-bold transition-colors cursor-pointer min-h-12"
          >
            <FileUp class="w-4 h-4 text-purple-500" /> Import Database JSON
          </button>
          <button
            onclick={handleResetSettings}
            class="flex items-center justify-center gap-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground px-4 py-3.5 rounded-xl text-sm font-bold transition-colors cursor-pointer min-h-12"
          >
            <RotateCcw class="w-4 h-4 text-yellow-500" /> Reset Settings Defaults
          </button>
          <button
            onclick={handleDeleteAll}
            class="flex items-center justify-center gap-2 border border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20 px-4 py-3.5 rounded-xl text-sm font-bold transition-colors cursor-pointer animate-pulse min-h-12"
          >
            <Trash2 class="w-4 h-4" /> Wipe Character Database
          </button>
        </div>

        <input
          type="file"
          accept="application/json"
          class="hidden"
          bind:this={fileInputImportDB}
          onchange={importDatabase}
        />
      </div>
    </div>
  </section>
</div>

<div
  class="fixed bottom-6 right-6 z-40 bg-card border px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-semibold text-muted-foreground"
>
  <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
  <span>{autosaveStatus}</span>
</div>

<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, onDestroy } from "svelte";
  import { db, type Character, type ExampleMessage } from "$lib/db";
  import { settings } from "$lib/settings.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { autoresize } from "$lib/autoresize";
  import { fade } from "svelte/transition";
  import {
    injectCharacterCardMetadata,
    generateDefaultBlackPNG,
  } from "$lib/png";
  import {
    Sparkles,
    Loader2,
    Save,
    ArrowLeft,
    Plus,
    Trash2,
    Copy,
    Check,
    X,
    ImagePlus,
    Download,
  } from "@lucide/svelte";
  import { goto } from "$app/navigation";

  let characterId = $derived($page.params.id as string);

  let character = $state<Character | null>(null);
  let loading = $state(true);
  let generatingAll = $state(false);
  let copied = $state(false);

  let saveState = $state<"idle" | "waiting" | "saving">("idle");
  let isInitialLoad = true;
  let saveTimeout: ReturnType<typeof setTimeout>;

  let activeGeneratingField = $state<string | null>(null);
  let aiAbortController = $state<AbortController | null>(null);

  let fileInput = $state<HTMLInputElement>();

  onMount(async () => {
    if (!characterId) return goto("/");
    const char = await db.characters.get(characterId);
    if (char) {
      character = char;
    } else {
      goto("/");
    }
    loading = false;

    window.addEventListener("beforeunload", forceImmediateSave);
  });

  onDestroy(() => {
    forceImmediateSave();
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", forceImmediateSave);
    }
  });

  $effect(() => {
    if (character) {
      JSON.stringify(character);

      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      saveState = "waiting";
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveCharacter();
      }, 1000);
    }
  });

  function saveCharacter() {
    if (!character) return;
    saveState = "saving";

    const snap = $state.snapshot(character);
    snap.updatedAt = new Date();

    db.characters
      .put(snap)
      .then(() => {
        if (saveState === "saving") {
          setTimeout(() => {
            saveState = "idle";
          }, 1000);
        }
      })
      .catch((err) => {
        console.error("Autosave failed:", err);
        saveState = "idle";
      });
  }

  function forceImmediateSave() {
    if (saveState === "waiting" && character) {
      clearTimeout(saveTimeout);
      saveCharacter();
    }
  }

  async function handleImageUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const needsCompression = file.size > 2 * 1024 * 1024;
    const needsConversion = file.type !== "image/png";

    if (needsCompression || needsConversion) {
      await dialogs.alert(
        "Your image will be automatically compressed and converted to PNG.",
        "Processing Image",
      );
    }

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;
          const MAX_SIZE = 1024;

          if (width > MAX_SIZE || height > MAX_SIZE) {
            const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
            width *= ratio;
            height *= ratio;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/png", 0.9);
            if (character) character.data.image = dataUrl;
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      dialogs.alert("Failed to process image.", "Error");
    }
  }

  function cancelGeneration() {
    if (aiAbortController) {
      aiAbortController.abort();
      aiAbortController = null;
      activeGeneratingField = null;
      generatingAll = false;
    }
  }

  async function callAI(prompt: string, system?: string) {
    if (!settings.apiKey && settings.provider !== "custom") {
      dialogs.alert(
        "Please set your API key in settings first.",
        "Missing API Key",
      );
      return null;
    }

    cancelGeneration();
    aiAbortController = new AbortController();

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: aiAbortController.signal,
        body: JSON.stringify({
          prompt,
          system,
          model: settings.model,
          apiKey: settings.apiKey,
          temperature: settings.temperature,
          frequencyPenalty: settings.frequencyPenalty,
          presencePenalty: settings.presencePenalty,
          topP: settings.topP,
          maxTokens: settings.maxTokens,
          provider: settings.provider,
          customBaseUrl: settings.customBaseUrl,
        }),
      });

      const data = await res.json();
      if (data.error) {
        dialogs.alert("API Error: " + data.error, "Generation Failed");
        return null;
      }
      return data.result;
    } catch (e: any) {
      if (e.name === "AbortError") {
        return null;
      }
      dialogs.alert("Network error while calling AI.", "Error");
      return null;
    } finally {
      aiAbortController = null;
    }
  }

  async function enhanceField(
    fieldName: string,
    currentContent: string,
    updateCb: (val: string) => void,
  ) {
    if (!character) return;
    activeGeneratingField = fieldName;

    const prompt = `You are an expert roleplay character creator.
The main concept for this character is: ${character.data.mainPrompt}

Please expand, refine, and improve the following field [${fieldName}]:
${currentContent || "(No content yet)"}

Respond ONLY with the improved content. Do not include any meta-commentary, markdown formatting (unless it's just plain text paragraphs), or explanations. Keep the tone appropriate for character definitions.`;

    const result = await callAI(prompt);
    if (result) updateCb(result.trim());

    if (activeGeneratingField === fieldName) {
      activeGeneratingField = null;
    }
  }

  async function generateAll() {
    if (!character) return;
    if (!character.data.mainPrompt) {
      dialogs.alert(
        "Please enter a core concept (Main Prompt) first.",
        "Concept Missing",
      );
      return;
    }

    generatingAll = true;

    const schemaObj: Record<string, string> = {};
    if (settings.genName) schemaObj["name"] = "Character name";
    if (settings.genDescription)
      schemaObj["description"] = "General description and physical appearance";
    if (settings.genPersonality)
      schemaObj["personality"] = "Personality traits, likes, dislikes, quirks";
    if (settings.genScenario)
      schemaObj["scenario"] =
        "The setting or context where a roleplay might start";
    if (settings.genBackstory)
      schemaObj["backstory"] = "Their history, origin, and background details";
    if (settings.genFirstMessages)
      schemaObj["firstMessages"] =
        "Array of strings containing: [engage starting greeting, optional alternative scenario greetings]";
    if (settings.genExampleMessages)
      schemaObj["exampleMessages"] =
        'Array of dialogue examples matching exactly: [{"user": "Optional user actions/text", "character": "Character response"}]';
    if (settings.genRelatedCharacters)
      schemaObj["relatedCharacters"] =
        "Details about other related characters, including their names, relationships, and brief descriptions";

    const prompt = `Generate a roleplay character profile based on this concept:
"${character.data.mainPrompt}"

Respond ONLY with a valid JSON object matching this schema exactly. Output ONLY raw JSON, no markdown blocks.

${JSON.stringify(schemaObj, null, 2)}`;

    const result = await callAI(prompt);

    if (result) {
      try {
        let cleanJson = result.trim();
        const startIdx = cleanJson.indexOf("{");
        const endIdx = cleanJson.lastIndexOf("}");
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          cleanJson = cleanJson.substring(startIdx, endIdx + 1);
        } else if (cleanJson.startsWith("```json")) {
          cleanJson = cleanJson
            .replace(/^```json/, "")
            .replace(/```$/, "")
            .trim();
        } else if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();
        }

        const parsed = JSON.parse(cleanJson);

        if (settings.genName && parsed.name) character.name = parsed.name;
        if (settings.genDescription && parsed.description)
          character.data.description = parsed.description;
        if (settings.genPersonality && parsed.personality)
          character.data.personality = parsed.personality;
        if (settings.genScenario && parsed.scenario)
          character.data.scenario = parsed.scenario;
        if (settings.genBackstory && parsed.backstory)
          character.data.backstory = parsed.backstory;
        if (settings.genRelatedCharacters && parsed.relatedCharacters)
          character.data.relatedCharacters = parsed.relatedCharacters;

        if (
          settings.genFirstMessages &&
          Array.isArray(parsed.firstMessages) &&
          parsed.firstMessages.length > 0
        ) {
          character.data.firstMessages = parsed.firstMessages;
        }

        if (Array.isArray(parsed.exampleMessages)) {
          character.data.exampleMessages = parsed.exampleMessages.map(
            (e: any) => ({
              id: crypto.randomUUID(),
              user: e.user || "",
              character: e.character || "",
            }),
          );
        }
      } catch (e) {
        console.error("Failed to parse JSON response", e);
        dialogs.alert(
          "Failed to parse AI response. The model might not have returned valid JSON.",
          "Parsing Error",
        );
      }
    }
    generatingAll = false;
  }

  function downloadCardPNG() {
    if (!character) return;

    let imgData = character.data.image;
    if (!imgData) {
      imgData = generateDefaultBlackPNG();
    }

    let finalDesc = character.data.description.trim();
    let appended: string[] = [];
    if (character.data.backstory?.trim())
      appended.push(`Backstory: ${character.data.backstory.trim()}`);
    if (character.data.relatedCharacters?.trim())
      appended.push(
        `Related Characters: ${character.data.relatedCharacters.trim()}`,
      );

    if (appended.length > 0) {
      finalDesc += "\n\n" + appended.join("\n\n");
    }

    const v3Data = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      extensions: {
        char_creator: {
          main_prompt: character.data.mainPrompt,
        },
      },
      data: {
        name: character.name,
        description: finalDesc,
        personality: character.data.personality,
        scenario: character.data.scenario,
        first_mes: character.data.firstMessages[0] || "",
        alternate_greetings: character.data.firstMessages
          .slice(1)
          .filter(Boolean),
        mes_example: character.data.exampleMessages
          .filter((ex) => ex.character.trim())
          .map((ex) => {
            let s = "<START>\n";
            if (ex.user.trim()) s += `{{user}}: ${ex.user.trim()}\n`;
            s += `{{char}}: ${ex.character.trim()}`;
            return s;
          })
          .join("\n\n"),
        creator_notes: "",
        system_prompt: "",
        post_history_instructions: "",
        group_only_greetings: [],
        tags: [],
        creator: "",
        character_version: "1.0",
        character_book: {
          entries: [],
          extensions: {},
        },
        assets: [],
        extensions: {
          char_creator: {
            main_prompt: character.data.mainPrompt,
          },
        },
        creation_date: Math.floor(character.createdAt.getTime() / 1000),
        modification_date: Math.floor(character.updatedAt.getTime() / 1000),
      },
    };

    try {
      const finalDataUrl = injectCharacterCardMetadata(
        imgData,
        JSON.stringify(v3Data),
      );
      const a = document.createElement("a");
      a.href = finalDataUrl;
      const safeName =
        character.name.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "character";
      a.download = `${safeName}_card.png`;
      a.click();
    } catch (e) {
      console.error(e);
      dialogs.alert("Failed to generate Character Card.", "Export Error");
    }
  }

  function copyToClipboard() {
    if (!character) return;
    const c = character.data;

    let parts: string[] = [];
    parts.push(`Name: ${character.name}`);

    let descPart = c.description.trim();
    let subfields: string[] = [];
    if (c.personality?.trim())
      subfields.push(`Personality: ${c.personality.trim()}`);
    if (c.scenario?.trim()) subfields.push(`Scenario: ${c.scenario.trim()}`);
    if (c.backstory?.trim()) subfields.push(`Backstory: ${c.backstory.trim()}`);
    if (c.relatedCharacters?.trim())
      subfields.push(`Related Characters: ${c.relatedCharacters.trim()}`);

    if (subfields.length > 0) descPart += "\n\n" + subfields.join("\n");
    if (descPart) parts.push(descPart);

    let fmParts: string[] = [];
    c.firstMessages.forEach((msg, i) => {
      if (!msg.trim()) return;
      if (i === 0) fmParts.push(`First message:\n${msg.trim()}`);
      else fmParts.push(`Alternative greeting ${i}:\n${msg.trim()}`);
    });
    if (fmParts.length > 0) parts.push(fmParts.join("\n\n"));

    if (c.exampleMessages.some((ex) => ex.character.trim())) {
      let exParts: string[] = [];
      c.exampleMessages.forEach((ex) => {
        if (!ex.character.trim()) return;
        let exStr = "<START>\n";
        if (ex.user.trim()) exStr += `{{user}}: ${ex.user.trim()}\n`;
        exStr += `{{char}}: ${ex.character.trim()}`;
        exParts.push(exStr);
      });
      parts.push(exParts.join("\n\n"));
    }

    const finalExport = "---\n\n" + parts.join("\n\n---\n\n") + "\n\n---";

    navigator.clipboard.writeText(finalExport).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }

  function addFirstMessage() {
    if (character)
      character.data.firstMessages = [...character.data.firstMessages, ""];
  }
  function removeFirstMessage(index: number) {
    if (character) character.data.firstMessages.splice(index, 1);
  }
  function addExampleMessage() {
    if (character)
      character.data.exampleMessages = [
        ...character.data.exampleMessages,
        { id: crypto.randomUUID(), user: "", character: "" },
      ];
  }
  function removeExampleMessage(id: string) {
    if (character)
      character.data.exampleMessages = character.data.exampleMessages.filter(
        (m) => m.id !== id,
      );
  }
</script>

<svelte:head>
  <title>Editing: {character?.name || "Loading"} - Char Creator</title>
</svelte:head>

<div class="page-transition-grid">
  {#if loading}
    <div
      out:fade={{ duration: 150 }}
      class="flex flex-col justify-center items-center py-32 text-muted-foreground w-full"
    >
      <Loader2 class="w-8 h-8 animate-spin mb-4" />
      <p>Loading editor...</p>
    </div>
  {:else if character}
    <div
      in:fade={{ duration: 200, delay: 150 }}
      class="max-w-4xl mx-auto pb-24 w-full"
    >
      <a
        href="/"
        class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft class="w-4 h-4" /> Back to Dashboard
      </a>

      <!-- Header Section with Avatar -->
      <div
        class="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6"
      >
        <div class="flex items-center gap-4 flex-1">
          <!-- Avatar Upload -->
          <button
            class="relative group w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-secondary border border-border hover:border-primary transition-colors flex shrink-0 items-center justify-center cursor-pointer shadow-sm"
            onclick={() => fileInput?.click()}
            aria-label="Upload character image"
          >
            {#if character.data.image}
              <img
                src={character.data.image}
                alt="Avatar"
                class="w-full h-full object-cover"
              />
              <div
                class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <ImagePlus class="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
            {:else}
              <ImagePlus
                class="w-8 h-8 text-muted-foreground group-hover:text-foreground transition-colors"
              />
            {/if}
          </button>
          <input
            type="file"
            accept="image/*"
            class="hidden"
            bind:this={fileInput}
            onchange={handleImageUpload}
          />

          <input
            type="text"
            bind:value={character.name}
            aria-label="Character Name"
            class="text-3xl sm:text-4xl font-bold bg-transparent border-b-2 border-transparent hover:border-border focus:border-primary focus:outline-none py-1 px-0 flex-1 w-full min-w-0"
            placeholder="Character Name"
          />
        </div>

        <div
          class="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2"
        >
          <div class="flex items-center gap-2">
            <button
              onclick={copyToClipboard}
              class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 border transition-colors font-medium text-sm cursor-pointer"
            >
              {#if copied}
                <Check class="w-4 h-4" /> Copied!
              {:else}
                <Copy class="w-4 h-4" /> Text
              {/if}
            </button>
            <button
              onclick={downloadCardPNG}
              class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm cursor-pointer"
            >
              <Download class="w-4 h-4" /> PNG Card
            </button>
          </div>

          <div
            class="flex items-center justify-center gap-2 px-4 py-2 bg-secondary rounded-md min-w-40"
          >
            {#if saveState === "waiting"}
              <span
                class="text-sm font-medium text-muted-foreground flex items-center gap-2"
                >Unsaved changes...</span
              >
            {:else if saveState === "saving"}
              <span
                class="text-sm font-medium text-muted-foreground flex items-center gap-2"
                ><Loader2 class="w-4 h-4 animate-spin" /> Saving...</span
              >
            {:else}
              <span
                class="text-sm font-medium text-muted-foreground flex items-center gap-2"
                ><Save class="w-4 h-4" /> Auto-Saved</span
              >
            {/if}
          </div>
        </div>
      </div>

      <div class="space-y-12">
        <!-- Main Prompt / Concept Section -->
        <div
          class="bg-card border-2 border-blue-500/20 rounded-xl p-4 sm:p-6 shadow-sm"
        >
          <div
            class="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4"
          >
            <div>
              <label for="main-prompt" class="text-xl font-bold block"
                >Core Concept</label
              >
              <p class="text-sm text-muted-foreground">
                Describe your character in a few sentences to serve as a base
                for AI generation.
              </p>
            </div>

            {#if generatingAll}
              <button
                onclick={cancelGeneration}
                class="flex items-center justify-center gap-2 bg-destructive text-white px-5 py-2.5 rounded-md hover:bg-destructive/90 font-medium shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              >
                <Loader2 class="w-4 h-4 animate-spin" /> Cancel Generation
              </button>
            {:else}
              <button
                onclick={generateAll}
                disabled={!character.data.mainPrompt}
                class="flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles class="w-4 h-4" /> Generate All Fields
              </button>
            {/if}
          </div>
          <textarea
            id="main-prompt"
            use:autoresize={character.data.mainPrompt}
            bind:value={character.data.mainPrompt}
            class="w-full border rounded-md p-4 overflow-hidden bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg resize-none min-h-25"
            placeholder="e.g. A 20 years old female student who values friendship above everything else..."
          ></textarea>
        </div>

        <!-- Main Fields Section -->
        <div class="space-y-8">
          <div class="space-y-3">
            <div
              class="flex justify-between items-center border-b border-border pb-2"
            >
              <div>
                <h3 class="text-2xl font-bold">Description</h3>
                <p class="text-sm text-muted-foreground">
                  Main overview of the character's appearance and general vibe.
                </p>
              </div>
              {#if activeGeneratingField === "Description"}
                <button
                  onclick={cancelGeneration}
                  class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
                  ><X class="w-4 h-4" /> Cancel</button
                >
              {:else}
                <button
                  onclick={() =>
                    enhanceField(
                      "Description",
                      character!.data.description,
                      (v) => (character!.data.description = v),
                    )}
                  class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer"
                  ><Sparkles class="w-4 h-4" /> Enhance</button
                >
              {/if}
            </div>
            <textarea
              use:autoresize={character.data.description}
              bind:value={character.data.description}
              aria-label="Description"
              class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-30"
            ></textarea>
          </div>

          <!-- FIRST MESSAGES -->
          <div class="space-y-4 pt-4">
            <div
              class="flex justify-between items-center border-b border-border pb-2"
            >
              <div>
                <h3 class="text-2xl font-bold">First Messages</h3>
                <p class="text-sm text-muted-foreground">
                  The initial greeting. Add alternatives for different starting
                  scenarios.
                </p>
              </div>
              <button
                onclick={addFirstMessage}
                class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer"
              >
                <Plus class="w-4 h-4" /> Add
              </button>
            </div>

            <div class="space-y-6">
              {#each character.data.firstMessages as msg, i}
                <div
                  class="bg-card border rounded-lg p-4 shadow-sm relative group"
                >
                  <div class="flex justify-between items-center mb-3">
                    <label
                      for="first-msg-{i}"
                      class="font-semibold text-sm uppercase tracking-wide text-muted-foreground"
                      >{i === 0 ? "Main Greeting" : `Alternative ${i}`}</label
                    >
                    <div class="flex items-center gap-2">
                      {#if activeGeneratingField === `First Message ${i}`}
                        <button
                          onclick={cancelGeneration}
                          class="flex items-center gap-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm transition-colors cursor-pointer"
                          ><X class="w-3.5 h-3.5" /> Cancel</button
                        >
                      {:else}
                        <button
                          onclick={() =>
                            enhanceField(
                              `First Message ${i}`,
                              msg,
                              (v) => (character!.data.firstMessages[i] = v),
                            )}
                          class="flex items-center gap-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border shadow-sm transition-colors cursor-pointer"
                          ><Sparkles class="w-3.5 h-3.5" /> Enhance</button
                        >
                      {/if}
                      {#if i > 0}
                        <button
                          onclick={() => removeFirstMessage(i)}
                          class="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                          ><Trash2 class="w-4 h-4" /></button
                        >
                      {/if}
                    </div>
                  </div>
                  <textarea
                    id="first-msg-{i}"
                    use:autoresize={character.data.firstMessages[i]}
                    bind:value={character.data.firstMessages[i]}
                    class="w-full border rounded-md p-3 overflow-hidden bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-25"
                  ></textarea>
                </div>
              {/each}
            </div>
          </div>

          <!-- EXAMPLE MESSAGES -->
          <div class="space-y-4 pt-4">
            <div
              class="flex justify-between items-center border-b border-border pb-2"
            >
              <div>
                <h3 class="text-2xl font-bold">Example Messages</h3>
                <p class="text-sm text-muted-foreground">
                  Dialogues or monologues defining how the character speaks.
                </p>
              </div>
              <button
                onclick={addExampleMessage}
                class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer"
              >
                <Plus class="w-4 h-4" /> Add
              </button>
            </div>

            <div class="space-y-4">
              {#if character.data.exampleMessages.length === 0}
                <div
                  class="text-center py-8 text-sm text-muted-foreground border rounded-lg border-dashed"
                >
                  No examples added. Click the button above to add one.
                </div>
              {/if}

              {#each character.data.exampleMessages as ex, i (ex.id)}
                <div
                  class="bg-card border rounded-lg p-4 sm:p-5 shadow-sm relative space-y-4 group"
                >
                  <button
                    onclick={() => removeExampleMessage(ex.id)}
                    class="absolute top-3 right-3 p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                    ><Trash2 class="w-4 h-4" /></button
                  >
                  <div class="pr-8">
                    <label
                      for="ex-user-{i}"
                      class="text-sm font-semibold mb-1 block text-muted-foreground"
                      >User Prompt (Optional)</label
                    >
                    <textarea
                      id="ex-user-{i}"
                      use:autoresize={ex.user}
                      bind:value={ex.user}
                      class="w-full border rounded-md p-3 overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none min-h-15"
                      placeholder="e.g. *I walk into the tavern and wave*"
                    ></textarea>
                  </div>
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <label
                        for="ex-char-{i}"
                        class="text-sm font-semibold text-foreground"
                        >Character Response</label
                      >
                      {#if activeGeneratingField === `Example Message ${i}`}
                        <button
                          onclick={cancelGeneration}
                          class="flex items-center gap-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-2.5 py-1 rounded-md text-xs font-medium shadow-sm transition-colors cursor-pointer"
                          ><X class="w-3.5 h-3.5" /> Cancel</button
                        >
                      {:else}
                        <button
                          onclick={() =>
                            enhanceField(
                              `Example Message ${i}`,
                              ex.character,
                              (v) => (ex.character = v),
                            )}
                          class="flex items-center gap-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2.5 py-1 rounded-md text-xs font-medium border border-border shadow-sm transition-colors cursor-pointer"
                          ><Sparkles class="w-3.5 h-3.5" /> Enhance</button
                        >
                      {/if}
                    </div>
                    <textarea
                      id="ex-char-{i}"
                      use:autoresize={ex.character}
                      bind:value={ex.character}
                      class="w-full border rounded-md p-3 overflow-hidden bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none min-h-25"
                      placeholder="e.g. *glances up from his ale* 'What do you want?'"
                    ></textarea>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Subfields Section -->
        <div class="space-y-6 pt-10 border-t border-border">
          <h3
            class="text-xl font-bold text-muted-foreground uppercase tracking-wider mb-4"
          >
            Optional Subfields
          </h3>

          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <label for="sub-personality" class="font-semibold text-lg"
                >Personality</label
              >
              {#if activeGeneratingField === "Personality"}
                <button
                  onclick={cancelGeneration}
                  class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
                  ><X class="w-4 h-4" /> Cancel</button
                >
              {:else}
                <button
                  onclick={() =>
                    enhanceField(
                      "Personality",
                      character!.data.personality,
                      (v) => (character!.data.personality = v),
                    )}
                  class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer"
                  ><Sparkles class="w-4 h-4" /> Enhance</button
                >
              {/if}
            </div>
            <textarea
              id="sub-personality"
              use:autoresize={character.data.personality}
              bind:value={character.data.personality}
              class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-25"
            ></textarea>
          </div>

          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <label for="sub-scenario" class="font-semibold text-lg"
                >Scenario</label
              >
              {#if activeGeneratingField === "Scenario"}
                <button
                  onclick={cancelGeneration}
                  class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
                  ><X class="w-4 h-4" /> Cancel</button
                >
              {:else}
                <button
                  onclick={() =>
                    enhanceField(
                      "Scenario",
                      character!.data.scenario,
                      (v) => (character!.data.scenario = v),
                    )}
                  class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer"
                  ><Sparkles class="w-4 h-4" /> Enhance</button
                >
              {/if}
            </div>
            <textarea
              id="sub-scenario"
              use:autoresize={character.data.scenario}
              bind:value={character.data.scenario}
              class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-25"
            ></textarea>
          </div>

          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <label for="sub-backstory" class="font-semibold text-lg"
                >Backstory</label
              >
              {#if activeGeneratingField === "Backstory"}
                <button
                  onclick={cancelGeneration}
                  class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
                  ><X class="w-4 h-4" /> Cancel</button
                >
              {:else}
                <button
                  onclick={() =>
                    enhanceField(
                      "Backstory",
                      character!.data.backstory,
                      (v) => (character!.data.backstory = v),
                    )}
                  class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer"
                  ><Sparkles class="w-4 h-4" /> Enhance</button
                >
              {/if}
            </div>
            <textarea
              id="sub-backstory"
              use:autoresize={character.data.backstory}
              bind:value={character.data.backstory}
              class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-30"
            ></textarea>
          </div>

          <!-- Other/Related Characters Subfield -->
          <div class="space-y-3">
            <div class="flex justify-between items-center">
              <label for="sub-relatedCharacters" class="font-semibold text-lg"
                >Related Characters</label
              >
              {#if activeGeneratingField === "Related Characters"}
                <button
                  onclick={cancelGeneration}
                  class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
                  ><X class="w-4 h-4" /> Cancel</button
                >
              {:else}
                <button
                  onclick={() =>
                    enhanceField(
                      "Related Characters",
                      character!.data.relatedCharacters,
                      (v) => (character!.data.relatedCharacters = v),
                    )}
                  class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer"
                  ><Sparkles class="w-4 h-4" /> Enhance</button
                >
              {/if}
            </div>
            <textarea
              id="sub-relatedCharacters"
              use:autoresize={character.data.relatedCharacters}
              bind:value={character.data.relatedCharacters}
              class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-30"
              placeholder="Describe relations to other characters..."
            ></textarea>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

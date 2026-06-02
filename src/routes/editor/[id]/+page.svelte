<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, onDestroy, untrack } from "svelte";
  import { db, type Character } from "$lib/db";
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
    Copy,
    Check,
    ImagePlus,
    Download,
    X,
  } from "@lucide/svelte";
  import { goto } from "$app/navigation";

  // Sub-component Imports
  import MediaAssets from "$lib/components/editor/MediaAssets.svelte";
  import Lorebook from "$lib/components/editor/Lorebook.svelte";
  import FirstGreetings from "$lib/components/editor/FirstGreetings.svelte";
  import ExampleDialogues from "$lib/components/editor/ExampleDialogues.svelte";
  import Subfields from "$lib/components/editor/Subfields.svelte";

  let characterId = $derived($page.params.id as string);
  const aiSystemPrompt =
    "You are an expert AI character creator and writer. You output ONLY the requested content, without conversational filler or markdown formatting blocks unless explicitly requested.";

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
      if (!character.data.assets) {
        character.data.assets = [];
      }
      if (!character.data.characterBook) {
        character.data.characterBook = {
          name: "",
          description: "",
          entries: [],
        };
      }
    } else {
      goto("/");
    }
    loading = false;

    window.addEventListener("beforeunload", handleBeforeUnload);
  });

  onDestroy(() => {
    forceImmediateSave();
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  });

  $effect(() => {
    if (character) {
      const trigger = JSON.stringify({
        name: character.name,
        data: character.data,
      });

      if (isInitialLoad) {
        isInitialLoad = false;
        return;
      }

      untrack(() => {
        saveState = "waiting";
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          saveCharacter();
        }, 1000);
      });
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

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    forceImmediateSave();
    if (saveState === "waiting" || saveState === "saving") {
      e.preventDefault();
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
        img.onerror = () => {
          dialogs.alert(
            "The selected file is not a valid image.",
            "Image Error",
          );
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

      let data;
      try {
        data = await res.json();
      } catch (e) {
        dialogs.alert(
          "Invalid response from API (might be a gateway error).",
          "API Error",
        );
        return null;
      }

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

    const result = await callAI(prompt, aiSystemPrompt);
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

    const result = await callAI(prompt, aiSystemPrompt);

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
        const dataPayload = parsed.data || parsed;

        if (
          settings.genName &&
          (dataPayload.name || dataPayload.character_name)
        ) {
          character.name = dataPayload.name || dataPayload.character_name;
        }
        if (
          settings.genDescription &&
          (dataPayload.description ||
            dataPayload.desc ||
            dataPayload.appearance)
        ) {
          character.data.description =
            dataPayload.description ||
            dataPayload.desc ||
            dataPayload.appearance;
        }
        if (
          settings.genPersonality &&
          (dataPayload.personality ||
            dataPayload.personality_traits ||
            dataPayload.traits)
        ) {
          character.data.personality =
            dataPayload.personality ||
            dataPayload.personality_traits ||
            dataPayload.traits;
        }
        if (
          settings.genScenario &&
          (dataPayload.scenario || dataPayload.setting || dataPayload.context)
        ) {
          character.data.scenario =
            dataPayload.scenario || dataPayload.setting || dataPayload.context;
        }
        if (
          settings.genBackstory &&
          (dataPayload.backstory ||
            dataPayload.backstory_details ||
            dataPayload.origin)
        ) {
          character.data.backstory =
            dataPayload.backstory ||
            dataPayload.backstory_details ||
            dataPayload.origin;
        }
        if (
          settings.genRelatedCharacters &&
          (dataPayload.relatedCharacters ||
            dataPayload.related_characters ||
            dataPayload.other_characters ||
            dataPayload.relations)
        ) {
          character.data.relatedCharacters =
            dataPayload.relatedCharacters ||
            dataPayload.related_characters ||
            dataPayload.other_characters ||
            dataPayload.relations;
        }

        const firstMsgRaw =
          dataPayload.firstMessages ||
          dataPayload.first_messages ||
          dataPayload.greetings ||
          dataPayload.first_mes ||
          dataPayload.greeting;
        if (settings.genFirstMessages && firstMsgRaw) {
          if (Array.isArray(firstMsgRaw) && firstMsgRaw.length > 0) {
            character.data.firstMessages = firstMsgRaw.filter(Boolean);
          } else if (typeof firstMsgRaw === "string" && firstMsgRaw.trim()) {
            character.data.firstMessages = [firstMsgRaw.trim()];
          }
        }

        const exampleMsgRaw =
          dataPayload.exampleMessages ||
          dataPayload.example_messages ||
          dataPayload.mes_example ||
          dataPayload.dialogue_examples ||
          dataPayload.dialogueExamples;
        if (settings.genExampleMessages && Array.isArray(exampleMsgRaw)) {
          character.data.exampleMessages = exampleMsgRaw.map((e: any) => ({
            id: crypto.randomUUID(),
            user: e.user || e.user_prompt || e.sender || "",
            character:
              e.character || e.char_response || e.response || e.text || "",
          }));
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

    if (settings.mergeTraitsOnExport) {
      if (character.data.personality?.trim()) {
        appended.push(`Personality: ${character.data.personality.trim()}`);
      }
      if (character.data.scenario?.trim()) {
        appended.push(`Scenario: ${character.data.scenario.trim()}`);
      }
    }

    if (character.data.backstory?.trim())
      appended.push(`Backstory: ${character.data.backstory.trim()}`);
    if (character.data.relatedCharacters?.trim())
      appended.push(
        `Related Characters: ${character.data.relatedCharacters.trim()}`,
      );

    if (appended.length > 0) {
      finalDesc += "\n\n" + appended.join("\n\n");
    }

    const specAssetsList = (character.data.assets || []).map((asset) => ({
      type: asset.type,
      uri: asset.uri,
      name: asset.name,
      ext: asset.ext,
    }));

    const characterBookData = {
      name: character.data.characterBook?.name || "",
      description: character.data.characterBook?.description || "",
      entries: (character.data.characterBook?.entries || []).map((entry) => ({
        keys: entry.keys,
        secondary_keys: entry.secondary_keys || [],
        content: entry.content,
        enabled: entry.enabled,
        priority: entry.priority ?? 10,
        comment: entry.comment || "",
        constant: entry.constant ?? false,
      })),
    };

    const v3Data = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: character.name,
        description: finalDesc,
        personality: settings.mergeTraitsOnExport
          ? ""
          : character.data.personality,
        scenario: settings.mergeTraitsOnExport ? "" : character.data.scenario,
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
        character_book: characterBookData,
        assets: specAssetsList,
        extensions: {
          char_creator: {
            mainPrompt: character.data.mainPrompt,
          },
        },
        creation_date: Math.floor(character.createdAt.getTime() / 1000),
        modification_date: Math.floor(character.updatedAt.getTime() / 1000),
      },
    };

    let v2PayloadStr = "";
    let v3PayloadStr = "";

    if (settings.exportVersion === "v2") {
      const v2Data = {
        spec: "chara_card_v2",
        spec_version: "2.0",
        data: {
          name: character.name,
          description: finalDesc,
          personality: settings.mergeTraitsOnExport
            ? ""
            : character.data.personality,
          scenario: settings.mergeTraitsOnExport ? "" : character.data.scenario,
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
          tags: [],
          creator: "",
          character_version: "1.0",
          character_book: characterBookData,
          extensions: {
            char_creator: {
              mainPrompt: character.data.mainPrompt,
            },
            assets: (character.data.assets || []).reduce(
              (acc, asset) => {
                acc[asset.name || asset.id] = asset.uri;
                return acc;
              },
              {} as Record<string, string>,
            ),
          },
        },
      };
      v2PayloadStr = JSON.stringify(v2Data);
      v3PayloadStr = JSON.stringify(v3Data);
    } else {
      v2PayloadStr = JSON.stringify(v3Data.data);
      v3PayloadStr = JSON.stringify(v3Data);
    }

    try {
      const finalDataUrl = injectCharacterCardMetadata(
        imgData,
        v3PayloadStr,
        v2PayloadStr,
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
        class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors {generatingAll ||
        activeGeneratingField !== null
          ? 'pointer-events-none opacity-50 cursor-not-allowed'
          : ''}"
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
            class="relative group w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-secondary border border-border hover:border-primary transition-colors flex shrink-0 items-center justify-center cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            onclick={() => fileInput?.click()}
            aria-label="Upload character image"
            disabled={generatingAll || activeGeneratingField !== null}
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
            class="text-3xl sm:text-4xl font-bold bg-transparent border-b-2 border-transparent hover:border-border focus:border-primary focus:outline-none py-1 px-0 flex-1 w-full min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Character Name"
            disabled={generatingAll || activeGeneratingField !== null}
          />
        </div>

        <div
          class="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2"
        >
          <div class="flex items-center gap-2">
            <button
              onclick={copyToClipboard}
              disabled={generatingAll || activeGeneratingField !== null}
              class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 border transition-colors font-medium text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {#if copied}
                <Check class="w-4 h-4" /> Copied!
              {:else}
                <Copy class="w-4 h-4" /> Text
              {/if}
            </button>
            <button
              onclick={downloadCardPNG}
              disabled={generatingAll || activeGeneratingField !== null}
              class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                disabled={!character.data.mainPrompt ||
                  activeGeneratingField !== null}
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
            class="w-full border rounded-md p-4 overflow-hidden bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg resize-none min-h-25 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="e.g. A 20 years old female student who values friendship above everything else..."
            disabled={generatingAll || activeGeneratingField !== null}
          ></textarea>
        </div>

        <!-- Media Assets Management Grid -->
        <MediaAssets
          bind:assets={character.data.assets}
          {generatingAll}
          {activeGeneratingField}
        />

        <!-- Lorebook / Character Book Panel -->
        <Lorebook
          bind:characterBook={character.data.characterBook}
          {generatingAll}
          {activeGeneratingField}
        />

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
                  disabled={generatingAll ||
                    (activeGeneratingField !== null &&
                      activeGeneratingField !== "Description")}
                  class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  ><Sparkles class="w-4 h-4" /> Enhance</button
                >
              {/if}
            </div>
            <textarea
              use:autoresize={character.data.description}
              bind:value={character.data.description}
              aria-label="Description"
              class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-30 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={generatingAll ||
                activeGeneratingField === "Description"}
            ></textarea>
          </div>

          <!-- FIRST MESSAGES -->
          <FirstGreetings
            bind:firstMessages={character.data.firstMessages}
            {generatingAll}
            {activeGeneratingField}
            onenhance={enhanceField}
            oncancel={cancelGeneration}
          />

          <!-- EXAMPLE MESSAGES -->
          <ExampleDialogues
            bind:exampleMessages={character.data.exampleMessages}
            {generatingAll}
            {activeGeneratingField}
            onenhance={enhanceField}
            oncancel={cancelGeneration}
          />
        </div>

        <!-- Subfields Section -->
        <Subfields
          bind:personality={character.data.personality}
          bind:scenario={character.data.scenario}
          bind:backstory={character.data.backstory}
          bind:relatedCharacters={character.data.relatedCharacters}
          {generatingAll}
          {activeGeneratingField}
          onenhance={enhanceField}
          oncancel={cancelGeneration}
        />
      </div>
    </div>
  {/if}
</div>

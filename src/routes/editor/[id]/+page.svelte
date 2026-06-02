<script lang="ts">
  import { page } from "$app/stores";
  import { onMount, onDestroy, untrack } from "svelte";
  import { db, type Character, type CharacterAsset } from "$lib/db";
  import { settings } from "$lib/settings.svelte";
  import { dialogs } from "$lib/dialogs.svelte";
  import { autoresize } from "$lib/autoresize";
  import { fade } from "svelte/transition";
  import {
    injectCharacterCardMetadata,
    generateThumbnail,
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
  let characterImage = $state<string | null>(null);
  let characterAssets = $state<CharacterAsset[]>([]);

  let loading = $state(true);
  let generatingAll = $state(false);
  let copied = $state(false);

  // Tracks active database writing status
  let saveState = $state<"idle" | "waiting" | "saving" | "error">("idle");
  let isInitialLoad = true;
  let saveTimeout: ReturnType<typeof setTimeout>;

  let activeGeneratingField = $state<string | null>(null);
  let aiAbortController = $state<AbortController | null>(null);

  let fileInput = $state<HTMLInputElement>();

  /**
   * Realtime context estimator representing average English word structures (characters / 4).
   * Generates a token budget approximation without dragging in heavy tokenizer packages.
   */
  let estimatedTokens = $derived.by(() => {
    if (!character) return 0;
    const d = character.data;
    const baseStr = `${character.name} ${d.mainPrompt} ${d.description} ${d.personality} ${d.scenario} ${d.backstory} ${d.relatedCharacters}`;
    const msgStr =
      d.firstMessages.join(" ") +
      " " +
      d.exampleMessages.map((e) => e.user + " " + e.character).join(" ");
    const loreStr = d.characterBook.entries
      .filter((e) => e.enabled)
      .map((e) => e.content)
      .join(" ");
    return Math.ceil((baseStr.length + msgStr.length + loreStr.length) / 4);
  });

  onMount(async () => {
    if (!characterId) return goto("/");

    try {
      const char = await db.characters.get(characterId);
      if (!char) {
        dialogs.alert(
          "The selected character record does not exist.",
          "Not Found",
        );
        return goto("/");
      }
      character = char;

      // Extract isolated high-res image and assets list
      const imgObj = await db.characterImages.get(characterId);
      characterImage = imgObj?.image || null;

      characterAssets =
        (await db.characterAssets
          .where("characterId")
          .equals(characterId)
          .toArray()) || [];
    } catch (err: any) {
      console.error("Failed to load character:", err);
      dialogs.alert(
        "Could not load character definitions: " + err.message,
        "Error",
      );
      goto("/");
    } finally {
      loading = false;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
  });

  onDestroy(() => {
    forceImmediateSave();
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  });

  // Watcher targeting automatic debounced background saves
  $effect(() => {
    if (character) {
      // Binds watcher targets to tracking state
      const trigger = JSON.stringify({
        name: character.name,
        data: character.data,
        img: characterImage,
        assets: characterAssets,
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
        }, 1000); // 1s Debounce
      });
    }
  });

  /**
   * Commits current active Svelte state snap payloads to IndexedDB tables.
   */
  async function saveCharacter() {
    if (!character) return;
    saveState = "saving";

    const snap = $state.snapshot(character);
    const snapImg = $state.snapshot(characterImage);
    const snapAssets = $state.snapshot(characterAssets);

    snap.updatedAt = new Date();

    try {
      await db.characters.put(snap);
      if (snapImg) {
        await db.characterImages.put({ id: snap.id, image: snapImg });
      } else {
        await db.characterImages.delete(snap.id);
      }

      await db.characterAssets.where("characterId").equals(snap.id).delete();
      if (snapAssets.length > 0) {
        await db.characterAssets.bulkPut(
          snapAssets.map((a) => ({ ...a, characterId: snap.id })),
        );
      }

      if (saveState === "saving") {
        setTimeout(() => {
          saveState = "idle";
        }, 1000);
      }
    } catch (err) {
      console.error("Background autosave failed:", err);
      saveState = "error"; // Alert the user of DB write locks or quota caps
    }
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
      e.preventDefault(); // Triggers browser confirmation block to preserve pending database streams
    }
  }

  /**
   * Converts uploaded user graphic files to lossless base64 original streams,
   * and auto-generates lightweight JPEG thumbnails.
   */
  async function handleImageUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        if (character) {
          characterImage = base64;
          character.data.thumbnail = await generateThumbnail(base64);
        }
      };
      reader.onerror = () => {
        dialogs.alert("Could not load image file.", "Error");
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error(error);
      dialogs.alert("Failed to process image file: " + error.message, "Error");
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

  /**
   * Dispatches generation completion calls to internal route servers.
   */
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

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        dialogs.alert(
          errPayload.error || "The LLM endpoint returned an error status.",
          "Generation Failed",
        );
        return null;
      }

      const data = await res.json();
      return data.result;
    } catch (e: any) {
      if (e.name === "AbortError" || aiAbortController.signal.aborted)
        return null;
      console.error("AI fetch failed:", e);
      dialogs.alert(
        "Network connection error: Failed to communicate with the model server.",
        "Network Error",
      );
      return null;
    } finally {
      aiAbortController = null;
    }
  }

  /**
   * Refines a specific textarea description parameter using AI completion.
   */
  async function enhanceField(
    fieldName: string,
    currentContent: string,
    updateCb: (val: string) => void,
  ) {
    if (!character) return;
    activeGeneratingField = fieldName;
    const prompt = `You are an expert roleplay character creator.\nThe main concept for this character is: ${character.data.mainPrompt}\n\nPlease expand, refine, and improve the following field [${fieldName}]:\n${currentContent || "(No content yet)"}\n\nRespond ONLY with the improved content. Do not include any meta-commentary or explanations. Keep the tone appropriate for character definitions.`;
    const result = await callAI(prompt, aiSystemPrompt);
    if (result) updateCb(result.trim());
    if (activeGeneratingField === fieldName) activeGeneratingField = null;
  }

  /**
   * Triggers the full system generation, requesting raw completion values in standard JSON.
   */
  async function generateAll() {
    if (!character || !character.data.mainPrompt) {
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

    const prompt = `Generate a roleplay character profile based on this concept:\n"${character.data.mainPrompt}"\n\nRespond ONLY with a valid JSON object matching this schema exactly. Output ONLY raw JSON, no markdown blocks.\n\n${JSON.stringify(schemaObj, null, 2)}`;
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
        }

        const parsed = JSON.parse(cleanJson);
        const d = parsed.data || parsed;

        if (settings.genName && (d.name || d.character_name))
          character.name = d.name || d.character_name;
        if (
          settings.genDescription &&
          (d.description || d.desc || d.appearance)
        )
          character.data.description = d.description || d.desc || d.appearance;
        if (
          settings.genPersonality &&
          (d.personality || d.personality_traits || d.traits)
        )
          character.data.personality =
            d.personality || d.personality_traits || d.traits;
        if (settings.genScenario && (d.scenario || d.setting || d.context))
          character.data.scenario = d.scenario || d.setting || d.context;
        if (
          settings.genBackstory &&
          (d.backstory || d.backstory_details || d.origin)
        )
          character.data.backstory =
            d.backstory || d.backstory_details || d.origin;
        if (
          settings.genRelatedCharacters &&
          (d.relatedCharacters ||
            d.related_characters ||
            d.other_characters ||
            d.relations)
        )
          character.data.relatedCharacters =
            d.relatedCharacters ||
            d.related_characters ||
            d.other_characters ||
            d.relations;

        const firstMsgRaw =
          d.firstMessages ||
          d.first_messages ||
          d.greetings ||
          d.first_mes ||
          d.greeting;
        if (settings.genFirstMessages && firstMsgRaw) {
          if (Array.isArray(firstMsgRaw) && firstMsgRaw.length > 0)
            character.data.firstMessages = firstMsgRaw.filter(Boolean);
          else if (typeof firstMsgRaw === "string" && firstMsgRaw.trim())
            character.data.firstMessages = [firstMsgRaw.trim()];
        }

        const exampleMsgRaw =
          d.exampleMessages ||
          d.example_messages ||
          d.mes_example ||
          d.dialogue_examples ||
          d.dialogueExamples;
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

  /**
   * Formats specifications parameters and compiles base64 PNG card files.
   */
  function downloadCardPNG() {
    if (!character) return;

    let imgData = characterImage;
    if (!imgData) {
      imgData = generateDefaultBlackPNG();
    }

    let finalDesc = character.data.description.trim();
    let appended: string[] = [];

    if (settings.mergeTraitsOnExport) {
      if (character.data.personality?.trim())
        appended.push(`Personality: ${character.data.personality.trim()}`);
      if (character.data.scenario?.trim())
        appended.push(`Scenario: ${character.data.scenario.trim()}`);
    }

    if (character.data.backstory?.trim())
      appended.push(`Backstory: ${character.data.backstory.trim()}`);
    if (character.data.relatedCharacters?.trim())
      appended.push(
        `Related Characters: ${character.data.relatedCharacters.trim()}`,
      );

    if (appended.length > 0) finalDesc += "\n\n" + appended.join("\n\n");

    const specAssetsList = characterAssets.map((asset) => ({
      type: asset.type,
      uri: asset.uri,
      name: asset.name,
      ext: asset.ext,
    }));

    // Legacy standard mappings for strict third-party parsers
    const characterBookData = {
      name: character.data.characterBook?.name || "",
      description: character.data.characterBook?.description || "",
      entries: (character.data.characterBook?.entries || []).map((entry) => ({
        id: entry.id,
        keys: entry.keys,
        key: entry.keys,
        secondary_keys: entry.secondary_keys || [],
        keysecondary: entry.secondary_keys || [],
        content: entry.content,
        enabled: entry.enabled,
        disable: !entry.enabled,
        priority: entry.priority ?? 10,
        order: entry.priority ?? 10,
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
          char_creator: { mainPrompt: character.data.mainPrompt },
          world_info: character.data.worldInfo || "",
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
            char_creator: { mainPrompt: character.data.mainPrompt },
            world_info: character.data.worldInfo || "",
            assets: characterAssets.reduce(
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
    } catch (e: any) {
      console.error(e);
      dialogs.alert(
        "Failed to compile Card graphic binary: " + e.message,
        "Export Error",
      );
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
    navigator.clipboard
      .writeText(finalExport)
      .then(() => {
        copied = true;
        setTimeout(() => (copied = false), 2000);
      })
      .catch(() => {
        dialogs.alert(
          "Failed to write to clipboard. Browser permissions might block clipboard operations.",
          "Clipboard Error",
        );
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
      class="max-w-4xl mx-auto pb-24 w-full relative"
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
            {#if character.data.thumbnail || characterImage}
              <img
                src={character.data.thumbnail || characterImage}
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
            placeholder="e.g. Merlin is an ancient wizard with a long silver beard and flowing blue robes who teaches magical arts in his forest tower..."
            disabled={generatingAll || activeGeneratingField !== null}
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

        <!-- Media Assets Management Grid -->
        <MediaAssets
          bind:assets={characterAssets}
          characterId={character.id}
          {generatingAll}
          {activeGeneratingField}
        />

        <!-- Lorebook / Character Book Panel -->
        <Lorebook
          bind:characterBook={character.data.characterBook}
          bind:worldInfo={character.data.worldInfo}
          {generatingAll}
          {activeGeneratingField}
        />
      </div>

      <!-- Realtime Token and Database Status Indicators -->
      <div class="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        <div
          class="bg-card border px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-semibold text-muted-foreground"
        >
          <span class="w-2 h-2 rounded-full bg-blue-500"></span>
          <span>~{estimatedTokens} Tokens</span>
        </div>

        <div
          class="bg-card border px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs font-semibold text-muted-foreground"
        >
          {#if saveState === "waiting"}
            <span>Unsaved changes...</span>
          {:else if saveState === "saving"}
            <Loader2 class="w-3 h-3 animate-spin" /> Saving...
          {:else if saveState === "error"}
            <div
              class="w-2 h-2 rounded-full bg-destructive animate-pulse"
            ></div>
            <span class="text-destructive font-bold">Failed to save!</span>
          {:else}
            <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span>Auto-Saved</span>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

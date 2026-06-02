<script lang="ts">
  import { autoresize } from "$lib/autoresize";
  import { Sparkles, X } from "@lucide/svelte";

  let {
    personality = $bindable(""),
    scenario = $bindable(""),
    backstory = $bindable(""),
    relatedCharacters = $bindable(""),
    generatingAll = false,
    activeGeneratingField = null,
    onenhance,
    oncancel,
  }: {
    personality: string;
    scenario: string;
    backstory: string;
    relatedCharacters: string;
    generatingAll: boolean;
    activeGeneratingField: string | null;
    onenhance: (
      fieldName: string,
      content: string,
      updateCb: (val: string) => void,
    ) => void;
    oncancel: () => void;
  } = $props();
</script>

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
          onclick={oncancel}
          class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
          ><X class="w-4 h-4" /> Cancel</button
        >
      {:else}
        <button
          onclick={() =>
            onenhance("Personality", personality, (v) => (personality = v))}
          disabled={generatingAll ||
            (activeGeneratingField !== null &&
              activeGeneratingField !== "Personality")}
          class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          ><Sparkles class="w-4 h-4" /> Enhance</button
        >
      {/if}
    </div>
    <textarea
      id="sub-personality"
      use:autoresize={personality}
      bind:value={personality}
      class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-25 disabled:opacity-50"
      disabled={generatingAll || activeGeneratingField === "Personality"}
    ></textarea>
  </div>

  <div class="space-y-3">
    <div class="flex justify-between items-center">
      <label for="sub-scenario" class="font-semibold text-lg">Scenario</label>
      {#if activeGeneratingField === "Scenario"}
        <button
          onclick={oncancel}
          class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
          ><X class="w-4 h-4" /> Cancel</button
        >
      {:else}
        <button
          onclick={() => onenhance("Scenario", scenario, (v) => (scenario = v))}
          disabled={generatingAll ||
            (activeGeneratingField !== null &&
              activeGeneratingField !== "Scenario")}
          class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          ><Sparkles class="w-4 h-4" /> Enhance</button
        >
      {/if}
    </div>
    <textarea
      id="sub-scenario"
      use:autoresize={scenario}
      bind:value={scenario}
      class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-25 disabled:opacity-50"
      disabled={generatingAll || activeGeneratingField === "Scenario"}
    ></textarea>
  </div>

  <div class="space-y-3">
    <div class="flex justify-between items-center">
      <label for="sub-backstory" class="font-semibold text-lg">Backstory</label>
      {#if activeGeneratingField === "Backstory"}
        <button
          onclick={oncancel}
          class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
          ><X class="w-4 h-4" /> Cancel</button
        >
      {:else}
        <button
          onclick={() =>
            onenhance("Backstory", backstory, (v) => (backstory = v))}
          disabled={generatingAll ||
            (activeGeneratingField !== null &&
              activeGeneratingField !== "Backstory")}
          class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          ><Sparkles class="w-4 h-4" /> Enhance</button
        >
      {/if}
    </div>
    <textarea
      id="sub-backstory"
      use:autoresize={backstory}
      bind:value={backstory}
      class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-30 disabled:opacity-50"
      disabled={generatingAll || activeGeneratingField === "Backstory"}
    ></textarea>
  </div>

  <div class="space-y-3">
    <div class="flex justify-between items-center">
      <label for="sub-relatedCharacters" class="font-semibold text-lg"
        >Related Characters</label
      >
      {#if activeGeneratingField === "Related Characters"}
        <button
          onclick={oncancel}
          class="flex items-center gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors cursor-pointer"
          ><X class="w-4 h-4" /> Cancel</button
        >
      {:else}
        <button
          onclick={() =>
            onenhance(
              "Related Characters",
              relatedCharacters,
              (v) => (relatedCharacters = v),
            )}
          disabled={generatingAll ||
            (activeGeneratingField !== null &&
              activeGeneratingField !== "Related Characters")}
          class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50"
          ><Sparkles class="w-4 h-4" /> Enhance</button
        >
      {/if}
    </div>
    <textarea
      id="sub-relatedCharacters"
      use:autoresize={relatedCharacters}
      bind:value={relatedCharacters}
      class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-30 disabled:opacity-50"
      placeholder="Describe relations to other characters..."
      disabled={generatingAll || activeGeneratingField === "Related Characters"}
    ></textarea>
  </div>
</div>

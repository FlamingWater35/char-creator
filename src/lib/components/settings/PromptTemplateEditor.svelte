<script lang="ts">
  import { Eye, RotateCcw, TriangleAlert, ChevronUp } from "@lucide/svelte";
  import { slide } from "svelte/transition";

  /**
   * Editor for one prompt template, with live preview and a reset affordance.
   *
   * The textarea is `$bindable` rather than controlled: assigning `value` on
   * every keystroke would push the caret to the end of the text, which is
   * unusable in a 1200-character template.
   */
  let {
    value = $bindable(""),
    label,
    id,
    description,
    customized = false,
    preview = "",
    usedPlaceholders = [],
    warnMissingConcept = false,
    onreset,
  }: {
    value: string;
    label: string;
    id: string;
    description: string;
    customized?: boolean;
    preview?: string;
    usedPlaceholders?: string[];
    warnMissingConcept?: boolean;
    onreset: () => void;
  } = $props();

  let previewOpen = $state(false);
</script>

<div class="space-y-2">
  <div class="flex flex-wrap justify-between items-center gap-2">
    <div class="flex items-center gap-2">
      <label class="font-bold text-xs" for={id}>{label}</label>
      {#if customized}
        <span
          class="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          >Edited</span
        >
      {/if}
    </div>
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => (previewOpen = !previewOpen)}
        aria-expanded={previewOpen}
        aria-controls="{id}-preview"
        class="text-[10px] text-muted-foreground hover:text-foreground font-bold transition-colors cursor-pointer p-1 inline-flex items-center gap-1"
      >
        {#if previewOpen}
          <ChevronUp class="w-3 h-3" /> Hide preview
        {:else}
          <Eye class="w-3 h-3" /> Preview
        {/if}
      </button>
      <button
        type="button"
        onclick={onreset}
        disabled={!customized}
        class="text-[10px] text-blue-500 hover:text-blue-600 font-bold transition-colors cursor-pointer p-1 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Reset
      </button>
    </div>
  </div>

  <p class="text-[11px] text-muted-foreground">{description}</p>

  <textarea
    {id}
    bind:value
    spellcheck="false"
    class="w-full border rounded-xl px-4 py-3 bg-background text-base sm:text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y min-h-52 leading-relaxed"
    placeholder="Prompt template…"
  ></textarea>

  {#if usedPlaceholders.length > 0}
    <div class="flex flex-wrap gap-1">
      {#each usedPlaceholders as token (token)}
        <code class="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]"
          >{token}</code
        >
      {/each}
    </div>
  {/if}

  {#if warnMissingConcept}
    <p class="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-500">
      <TriangleAlert class="w-3 h-3 shrink-0 mt-0.5" />
      <span>
        This template never mentions <code class="font-mono">&#123;concept&#125;</code
        >, so the model will not know which character it is writing about.
      </span>
    </p>
  {/if}

  {#if previewOpen}
    <div
      id="{id}-preview"
      transition:slide={{ duration: 150 }}
      class="border rounded-xl bg-muted/30 p-3 space-y-1.5"
    >
      <div
        class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
      >
        Rendered with sample data
      </div>
      <pre
        class="text-[10px] sm:text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed max-h-64 overflow-y-auto">{preview}</pre>
    </div>
  {/if}
</div>

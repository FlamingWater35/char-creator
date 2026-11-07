<script lang="ts">
  import { Sparkles, RefreshCw, X, Undo2, Loader2 } from "@lucide/svelte";

  /**
   * The Enhance / Regenerate button pair shown next to a single field.
   *
   * Every section in the editor uses this component so the two actions stay
   * visually and behaviourally identical, and so the "only one field at a time"
   * disabled logic lives in one place.
   */
  let {
    fieldName,
    value = "",
    activeField = null,
    activeMode = null,
    busy = false,
    disabled = false,
    onenhance,
    onregenerate,
    oncancel,
    onundo,
    canUndo = false,
    size = "md",
  }: {
    /** Label used in prompts and to key the active-field state. */
    fieldName: string;
    /** Current field text, passed to the prompt template. */
    value?: string;
    /** Name of the field currently generating, or null. */
    activeField?: string | null;
    /** Which action the active field is running, for the button label. */
    activeMode?: "enhance" | "regenerate" | null;
    /** True while a full-sheet generation owns the UI. */
    busy?: boolean;
    /** Extra reason to disable both buttons (e.g. no concept yet). */
    disabled?: boolean;
    onenhance: (fieldName: string, content: string) => void;
    onregenerate: (fieldName: string, content: string) => void;
    oncancel: () => void;
    onundo?: () => void;
    canUndo?: boolean;
    size?: "sm" | "md";
  } = $props();

  let isActive = $derived(activeField === fieldName);
  let isBlocked = $derived(busy || (activeField !== null && !isActive));
  let blockedReason = $derived(
    busy ? "Another AI action is running" : isBlocked ? "Another field is generating" : undefined,
  );
  let activeLabel = $derived(
    activeMode === "regenerate" ? "Regenerating…" : "Enhancing…",
  );

  let sizing = $derived(
    size === "sm"
      ? { button: "px-2.5 py-1 text-xs gap-1.5 min-h-9", icon: "w-3.5 h-3.5" }
      : { button: "px-3 py-1.5 text-sm gap-2 min-h-9", icon: "w-4 h-4" },
  );
</script>

<div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
  {#if isActive}
    <button
      type="button"
      onclick={oncancel}
      class="flex items-center {sizing.button} bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded-md font-medium shadow-sm transition-colors cursor-pointer"
    >
      <Loader2 class="{sizing.icon} animate-spin" />
      <span class="hidden xs:inline">{activeLabel}</span>
      <span class="xs:hidden">Cancel</span>
    </button>
  {:else}
    {#if canUndo && onundo}
      <button
        type="button"
        onclick={onundo}
        disabled={isBlocked}
        title="Restore the text from before the last AI rewrite"
        aria-label="Undo last AI rewrite of {fieldName}"
        class="flex items-center justify-center p-1.5 bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md border border-transparent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-9 min-w-9"
      >
        <Undo2 class={sizing.icon} />
      </button>
    {/if}
    <button
      type="button"
      onclick={() => onenhance(fieldName, value)}
      disabled={isBlocked || disabled}
      title={blockedReason ?? "Rewrite this field using its current text as the base"}
      class="flex items-center {sizing.button} bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border rounded-md font-medium shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Sparkles class={sizing.icon} /> Enhance
    </button>
    <button
      type="button"
      onclick={() => onregenerate(fieldName, value)}
      disabled={isBlocked || disabled}
      title={blockedReason ??
        "Write this field from scratch, ignoring the current text"}
      aria-label="Regenerate {fieldName}"
      class="flex items-center {sizing.button} bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/25 rounded-md font-medium shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <RefreshCw class={sizing.icon} /> Regenerate
    </button>
  {/if}
</div>

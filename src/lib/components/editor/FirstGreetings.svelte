<script lang="ts">
  import { autoresize } from "#lib/autoresize";
  import { Plus, Trash2 } from "@lucide/svelte";
  import AiFieldActions from "./AiFieldActions.svelte";

  // Bidirectional runes binding alternate greetings arrays with parent states
  let {
    firstMessages = $bindable([""]),
    generatingAll = false,
    activeGeneratingField = null,
    activeAction = null,
    onenhance,
    onregenerate,
    onundo,
    undoBuffer = {},
    oncancel,
  }: {
    firstMessages: string[];
    generatingAll: boolean;
    activeGeneratingField: string | null;
    activeAction?: "enhance" | "regenerate" | null;
    onenhance: (
      fieldName: string,
      content: string,
      updateCb: (val: string) => void,
    ) => void;
    onregenerate: (
      fieldName: string,
      content: string,
      updateCb: (val: string) => void,
    ) => void;
    onundo: (fieldName: string, updateCb: (val: string) => void) => void;
    undoBuffer?: Record<string, string>;
    oncancel: () => void;
  } = $props();

  /**
   * Appends a blank alternate greeting textbox card.
   */
  function addFirstMessage() {
    firstMessages = [...firstMessages, ""];
  }

  /**
   * Wipes an individual greeting from the selection list.
   */
  function removeFirstMessage(index: number) {
    firstMessages = firstMessages.filter((_, i) => i !== index);
  }

  /** Field name used for prompts and for the per-field action state. */
  function fieldNameFor(index: number) {
    return `First Message ${index}`;
  }
</script>

<div class="space-y-4 pt-4">
  <div
    class="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-border pb-2"
  >
    <div>
      <h3 class="text-2xl font-bold">First Messages</h3>
      <p class="text-sm text-muted-foreground">
        The initial greeting. Add alternatives for different starting scenarios.
      </p>
    </div>
    <button
      onclick={addFirstMessage}
      disabled={generatingAll || activeGeneratingField !== null}
      class="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2 sm:py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50 min-h-11 sm:min-h-0"
    >
      <Plus class="w-4 h-4" /> Add Alternate
    </button>
  </div>

  <div class="space-y-6">
    {#each firstMessages as msg, i}
      <div class="bg-card border rounded-lg p-4 shadow-sm relative group">
        <div class="flex flex-wrap justify-between items-center gap-2 mb-3">
          <label
            for="first-msg-{i}"
            class="font-semibold text-xs sm:text-sm uppercase tracking-wide text-muted-foreground"
            >{i === 0 ? "Main Greeting" : `Alternative ${i}`}</label
          >
          <div class="flex items-center gap-2">
            <AiFieldActions
              fieldName={fieldNameFor(i)}
              value={msg}
              activeField={activeGeneratingField}
              activeMode={activeAction}
              busy={generatingAll}
              size="sm"
              onenhance={(_name, content) =>
                onenhance(fieldNameFor(i), content, (v) => (firstMessages[i] = v))}
              onregenerate={(_name, content) =>
                onregenerate(
                  fieldNameFor(i),
                  content,
                  (v) => (firstMessages[i] = v),
                )}
              onundo={() =>
                onundo(fieldNameFor(i), (v) => (firstMessages[i] = v))}
              canUndo={undoBuffer[fieldNameFor(i)] !== undefined}
              {oncancel}
            />
            {#if i > 0}
              <button
                onclick={() => removeFirstMessage(i)}
                disabled={generatingAll || activeGeneratingField !== null}
                class="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer disabled:opacity-50 min-h-9 min-w-9 flex items-center justify-center"
                aria-label="Remove Greeting Card"
                ><Trash2 class="w-4 h-4" /></button
              >
            {/if}
          </div>
        </div>
        <textarea
          id="first-msg-{i}"
          use:autoresize={msg}
          bind:value={firstMessages[i]}
          class="w-full border rounded-md p-3 overflow-hidden bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-25 disabled:opacity-50 text-base sm:text-sm"
          disabled={generatingAll ||
            activeGeneratingField === fieldNameFor(i)}
        ></textarea>
      </div>
    {/each}
  </div>
</div>

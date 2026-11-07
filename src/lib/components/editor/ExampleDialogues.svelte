<script lang="ts">
  import type { ExampleMessage } from "#lib/db";
  import { autoresize } from "#lib/autoresize";
  import { Plus, Trash2 } from "@lucide/svelte";
  import AiFieldActions from "./AiFieldActions.svelte";

  // Bidirectional runes binding dialogue examples arrays with parent states
  let {
    exampleMessages = $bindable([]),
    generatingAll = false,
    activeGeneratingField = null,
    activeAction = null,
    onenhance,
    onregenerate,
    onundo,
    undoBuffer = {},
    oncancel,
  }: {
    exampleMessages: ExampleMessage[];
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
   * Appends a blank interactive dialogue trigger card.
   */
  function addExampleMessage() {
    exampleMessages = [
      ...exampleMessages,
      { id: crypto.randomUUID(), user: "", character: "" },
    ];
  }

  /**
   * Wipes an individual dialogue record from the list.
   */
  function removeExampleMessage(id: string) {
    exampleMessages = exampleMessages.filter((m) => m.id !== id);
  }

  /** Field name used for prompts and for the per-field action state. */
  function fieldNameFor(index: number) {
    return `Example Message ${index}`;
  }
</script>

<div class="space-y-4 pt-4">
  <div
    class="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-border pb-2"
  >
    <div>
      <h3 class="text-2xl font-bold">Example Messages</h3>
      <p class="text-sm text-muted-foreground">
        Dialogues or monologues defining how the character speaks.
      </p>
    </div>
    <button
      onclick={addExampleMessage}
      disabled={generatingAll || activeGeneratingField !== null}
      class="flex items-center justify-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-2 sm:py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50 min-h-11 sm:min-h-0"
    >
      <Plus class="w-4 h-4" /> Add
    </button>
  </div>

  <div class="space-y-4">
    {#if exampleMessages.length === 0}
      <div
        class="text-center py-8 text-sm text-muted-foreground border rounded-lg border-dashed bg-secondary/5"
      >
        No examples added. Click the button above to add one.
      </div>
    {/if}

    {#each exampleMessages as ex, i (ex.id)}
      <div
        class="bg-card border rounded-lg p-4 sm:p-5 shadow-sm relative space-y-4 group"
      >
        <button
          onclick={() => removeExampleMessage(ex.id)}
          disabled={generatingAll || activeGeneratingField !== null}
          class="absolute top-3 right-3 p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer disabled:opacity-50 min-h-9 min-w-9 flex items-center justify-center"
          aria-label="Remove Dialogue Example"
        >
          <Trash2 class="w-4 h-4" />
        </button>

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
            class="w-full border rounded-md p-3 overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm resize-none min-h-15 disabled:opacity-50"
            placeholder="e.g. Can you teach me magic, Merlin?"
            disabled={generatingAll ||
              activeGeneratingField === fieldNameFor(i)}
          ></textarea>
        </div>

        <div>
          <div class="flex flex-wrap justify-between items-center gap-2 mb-1">
            <label
              for="ex-char-{i}"
              class="text-sm font-semibold text-foreground"
              >Character Response</label
            >
            <AiFieldActions
              fieldName={fieldNameFor(i)}
              value={ex.character}
              activeField={activeGeneratingField}
              activeMode={activeAction}
              busy={generatingAll}
              size="sm"
              onenhance={(_name, content) =>
                onenhance(fieldNameFor(i), content, (v) => (ex.character = v))}
              onregenerate={(_name, content) =>
                onregenerate(
                  fieldNameFor(i),
                  content,
                  (v) => (ex.character = v),
                )}
              onundo={() =>
                onundo(fieldNameFor(i), (v) => (ex.character = v))}
              canUndo={undoBuffer[fieldNameFor(i)] !== undefined}
              {oncancel}
            />
          </div>
          <textarea
            id="ex-char-{i}"
            use:autoresize={ex.character}
            bind:value={ex.character}
            class="w-full border rounded-md p-3 overflow-hidden bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm resize-none min-h-25 disabled:opacity-50"
            placeholder="e.g. *Merlin chuckles softly...*"
            disabled={generatingAll ||
              activeGeneratingField === fieldNameFor(i)}
          ></textarea>
        </div>
      </div>
    {/each}
  </div>
</div>

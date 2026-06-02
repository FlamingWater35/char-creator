<script lang="ts">
  import type { ExampleMessage } from "$lib/db";
  import { autoresize } from "$lib/autoresize";
  import { Plus, Trash2, Sparkles, X } from "@lucide/svelte";

  let {
    exampleMessages = $bindable([]),
    generatingAll = false,
    activeGeneratingField = null,
    onenhance,
    oncancel,
  }: {
    exampleMessages: ExampleMessage[];
    generatingAll: boolean;
    activeGeneratingField: string | null;
    onenhance: (
      fieldName: string,
      content: string,
      updateCb: (val: string) => void,
    ) => void;
    oncancel: () => void;
  } = $props();

  function addExampleMessage() {
    exampleMessages = [
      ...exampleMessages,
      { id: crypto.randomUUID(), user: "", character: "" },
    ];
  }

  function removeExampleMessage(id: string) {
    exampleMessages = exampleMessages.filter((m) => m.id !== id);
  }
</script>

<div class="space-y-4 pt-4">
  <div class="flex justify-between items-center border-b border-border pb-2">
    <div>
      <h3 class="text-2xl font-bold">Example Messages</h3>
      <p class="text-sm text-muted-foreground">
        Dialogues or monologues defining how the character speaks.
      </p>
    </div>
    <button
      onclick={addExampleMessage}
      disabled={generatingAll || activeGeneratingField !== null}
      class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50"
    >
      <Plus class="w-4 h-4" /> Add
    </button>
  </div>

  <div class="space-y-4">
    {#if exampleMessages.length === 0}
      <div
        class="text-center py-8 text-sm text-muted-foreground border rounded-lg border-dashed"
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
          class="absolute top-3 right-3 p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer disabled:opacity-50"
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
            class="w-full border rounded-md p-3 overflow-hidden bg-muted focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none min-h-15 disabled:opacity-50"
            placeholder="e.g. Can you teach me magic, Merlin?"
            disabled={generatingAll ||
              activeGeneratingField === `Example Message ${i}`}
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
                onclick={oncancel}
                class="flex items-center gap-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-2.5 py-1 rounded-md text-xs font-medium shadow-sm transition-colors cursor-pointer"
                ><X class="w-3.5 h-3.5" /> Cancel</button
              >
            {:else}
              <button
                onclick={() =>
                  onenhance(
                    `Example Message ${i}`,
                    ex.character,
                    (v) => (ex.character = v),
                  )}
                disabled={generatingAll ||
                  (activeGeneratingField !== null &&
                    activeGeneratingField !== `Example Message ${i}`)}
                class="flex items-center gap-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2.5 py-1 rounded-md text-xs font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                ><Sparkles class="w-3.5 h-3.5" /> Enhance</button
              >
            {/if}
          </div>
          <textarea
            id="ex-char-{i}"
            use:autoresize={ex.character}
            bind:value={ex.character}
            class="w-full border rounded-md p-3 overflow-hidden bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none min-h-25 disabled:opacity-50"
            placeholder="e.g. *Merlin chuckles softly, stroking his white beard.* 'Patience, young seeker. Magic requires deliberate study and quiet meditation.'"
            disabled={generatingAll ||
              activeGeneratingField === `Example Message ${i}`}
          ></textarea>
        </div>
      </div>
    {/each}
  </div>
</div>

<script lang="ts">
  import { autoresize } from "$lib/autoresize";
  import { Plus, Trash2, Sparkles, X } from "@lucide/svelte";

  // Bidirectional runes binding alternate greetings arrays with parent states
  let {
    firstMessages = $bindable([""]),
    generatingAll = false,
    activeGeneratingField = null,
    onenhance,
    oncancel,
  }: {
    firstMessages: string[];
    generatingAll: boolean;
    activeGeneratingField: string | null;
    onenhance: (
      fieldName: string,
      content: string,
      updateCb: (val: string) => void,
    ) => void;
    oncancel: () => void;
  } = $props();

  // Appends a blank alternate greeting textbox card
  function addFirstMessage() {
    firstMessages = [...firstMessages, ""];
  }

  // Wipes an individual greeting from the selection list
  function removeFirstMessage(index: number) {
    firstMessages = firstMessages.filter((_, i) => i !== index);
  }
</script>

<!-- Greetings Manager Panel -->
<div class="space-y-4 pt-4">
  <div class="flex justify-between items-center border-b border-border pb-2">
    <div>
      <h3 class="text-2xl font-bold">First Messages</h3>
      <p class="text-sm text-muted-foreground">
        The initial greeting. Add alternatives for different starting scenarios.
      </p>
    </div>
    <button
      onclick={addFirstMessage}
      disabled={generatingAll || activeGeneratingField !== null}
      class="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50"
    >
      <Plus class="w-4 h-4" /> Add Alternate
    </button>
  </div>

  <div class="space-y-6">
    {#each firstMessages as msg, i}
      <div class="bg-card border rounded-lg p-4 shadow-sm relative group">
        <div class="flex justify-between items-center mb-3">
          <label
            for="first-msg-{i}"
            class="font-semibold text-sm uppercase tracking-wide text-muted-foreground"
            >{i === 0 ? "Main Greeting" : `Alternative ${i}`}</label
          >
          <div class="flex items-center gap-2">
            {#if activeGeneratingField === `First Message ${i}`}
              <button
                onclick={oncancel}
                class="flex items-center gap-1.5 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 px-2.5 py-1.5 rounded-md text-xs font-medium shadow-sm transition-colors cursor-pointer"
                ><X class="w-3.5 h-3.5" /> Cancel</button
              >
            {:else}
              <button
                onclick={() =>
                  onenhance(
                    `First Message ${i}`,
                    msg,
                    (v) => (firstMessages[i] = v),
                  )}
                disabled={generatingAll ||
                  (activeGeneratingField !== null &&
                    activeGeneratingField !== `First Message ${i}`)}
                class="flex items-center gap-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 px-2.5 py-1.5 rounded-md text-xs font-medium border border-border shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                ><Sparkles class="w-3.5 h-3.5" /> Enhance</button
              >
            {/if}
            {#if i > 0}
              <button
                onclick={() => removeFirstMessage(i)}
                disabled={generatingAll || activeGeneratingField !== null}
                class="p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer disabled:opacity-50"
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
          class="w-full border rounded-md p-3 overflow-hidden bg-background focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-25 disabled:opacity-50"
          disabled={generatingAll ||
            activeGeneratingField === `First Message ${i}`}
        ></textarea>
      </div>
    {/each}
  </div>
</div>

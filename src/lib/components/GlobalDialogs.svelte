<script lang="ts">
  import { dialogs } from "$lib/dialogs.svelte";

  // Close on Escape key
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && dialogs.isOpen) {
      dialogs.close(false);
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if dialogs.isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
  >
    <!-- Dialog Box -->
    <div
      class="bg-card text-card-foreground border rounded-lg shadow-lg w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200"
      role="dialog"
      aria-modal="true"
    >
      <h2 class="text-lg font-semibold mb-2">{dialogs.title}</h2>
      <p class="text-sm text-muted-foreground mb-6 whitespace-pre-wrap">
        {dialogs.message}
      </p>

      <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {#if dialogs.type === "confirm"}
          <button
            onclick={() => dialogs.close(false)}
            class="px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onclick={() => dialogs.close(true)}
            class="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors"
          >
            Confirm
          </button>
        {:else}
          <button
            onclick={() => dialogs.close(true)}
            class="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors w-full sm:w-auto"
          >
            OK
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

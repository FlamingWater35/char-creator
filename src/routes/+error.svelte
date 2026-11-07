<script lang="ts">
  import { page } from "$app/state";
  import { ArrowLeft, RotateCcw } from "@lucide/svelte";

  let { error }: { error: { message: string; status?: number } } = $props();

  const status = $derived(error?.status ?? 500);

  const headline = $derived(
    status === 404
      ? "Page not found"
      : status === 403
        ? "Access denied"
        : "Something went wrong",
  );
</script>

<svelte:head>
  <title>{headline} - Char Creator</title>
</svelte:head>

<div class="max-w-xl mx-auto py-24 text-center space-y-6">
  <p class="text-7xl font-black tracking-tighter text-muted-foreground/30">
    {status}
  </p>
  <h1 class="text-3xl font-black tracking-tight">{headline}</h1>
  <p class="text-muted-foreground">
    {error?.message || "An unexpected error occurred."}
  </p>

  <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
    <a
      href="/"
      class="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm transition-opacity hover:opacity-90 min-h-11"
    >
      <ArrowLeft class="w-4 h-4" /> Back to Dashboard
    </a>
    <button
      onclick={() => location.reload()}
      class="inline-flex items-center gap-2 px-5 py-3 rounded-xl border bg-secondary text-secondary-foreground font-bold text-sm transition-colors hover:bg-secondary/80 cursor-pointer min-h-11"
    >
      <RotateCcw class="w-4 h-4" /> Reload
    </button>
  </div>

  {#if page.url.pathname !== "/"}
    <p class="text-xs text-muted-foreground font-mono break-all pt-4">
      {page.url.pathname}
    </p>
  {/if}
</div>

<script lang="ts">
  import type { CharacterAsset } from "$lib/db";
  import { dialogs } from "$lib/dialogs.svelte";
  import { Trash2, ImagePlus } from "@lucide/svelte";

  let {
    assets = $bindable([]),
    generatingAll = false,
    activeGeneratingField = null,
  }: {
    assets: CharacterAsset[];
    generatingAll: boolean;
    activeGeneratingField: string | null;
  } = $props();

  let fileInputAsset = $state<HTMLInputElement>();

  async function handleAssetUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const uri = event.target?.result as string;
        const ext = file.name.split(".").pop() || "png";
        const name = file.name
          .split(".")[0]
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .toLowerCase();

        assets = [
          ...assets,
          {
            id: crypto.randomUUID(),
            name,
            type: "image",
            uri,
            ext,
          },
        ];
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      dialogs.alert("Failed to process asset upload.", "Error");
    } finally {
      if (fileInputAsset) fileInputAsset.value = "";
    }
  }

  function removeAsset(id: string) {
    assets = assets.filter((a) => a.id !== id);
  }
</script>

<div class="bg-card border rounded-2xl p-4 sm:p-6 shadow-sm space-y-5">
  <div>
    <h3 class="text-2xl font-black">Multimedia Assets</h3>
    <p class="text-xs text-muted-foreground">
      Embed custom reference graphics, landscapes, or expressions directly
      within the character file.
    </p>
  </div>

  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
    {#each assets as asset, i (asset.id)}
      <div
        class="relative group border rounded-xl p-3 bg-secondary/20 flex flex-col justify-between space-y-3 shadow-sm hover:border-muted-foreground/30 transition-all"
      >
        <button
          onclick={() => removeAsset(asset.id)}
          disabled={generatingAll || activeGeneratingField !== null}
          class="absolute top-2 right-2 p-1.5 bg-destructive/15 text-destructive rounded-md transition-all hover:bg-destructive/25 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer disabled:opacity-50"
          aria-label="Remove Asset"
        >
          <Trash2 class="w-4 h-4" />
        </button>

        <div
          class="w-full h-32 rounded-lg overflow-hidden bg-background border flex items-center justify-center shadow-inner"
        >
          {#if asset.type === "image" || asset.type === "avatar"}
            <img
              src={asset.uri}
              alt={asset.name}
              class="w-full h-full object-cover"
            />
          {:else}
            <span class="text-3xl">🔊</span>
          {/if}
        </div>

        <div class="space-y-1">
          <label
            for="asset-name-{i}"
            class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            >Asset Name</label
          >
          <input
            id="asset-name-{i}"
            type="text"
            bind:value={asset.name}
            disabled={generatingAll || activeGeneratingField !== null}
            class="w-full bg-background text-xs font-mono border rounded-md px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all disabled:opacity-50"
            placeholder="e.g. merlin_workshop_scene"
          />
        </div>
      </div>
    {/each}

    <!-- Upload trigger cell -->
    <button
      onclick={() => fileInputAsset?.click()}
      disabled={generatingAll || activeGeneratingField !== null}
      class="border-2 border-dashed border-muted-foreground/20 rounded-xl p-6 flex flex-col items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all cursor-pointer min-h-48 group disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <ImagePlus
        class="w-8 h-8 mb-2 text-muted-foreground/60 group-hover:text-primary transition-colors"
      />
      <span class="text-xs font-bold">Add Image Asset</span>
    </button>
  </div>

  <input
    type="file"
    accept="image/*"
    class="hidden"
    bind:this={fileInputAsset}
    onchange={handleAssetUpload}
  />
</div>

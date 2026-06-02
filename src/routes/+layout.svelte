<script lang="ts">
  import "./layout.css";
  import { ModeWatcher } from "mode-watcher";
  import icon from "$lib/assets/favicon.svg";
  import GlobalDialogs from "$lib/components/GlobalDialogs.svelte";
  import { page } from "$app/stores";
  import { fade } from "svelte/transition";
  import { Home, Settings as SettingsIcon } from "lucide-svelte";

  import { version } from "../../package.json";

  let { children } = $props();

  const isActive = (path: string) => {
    if (path === "/") return $page.url.pathname === "/";
    return $page.url.pathname.startsWith(path);
  };
</script>

<svelte:head>
  <link rel="icon" type="image/svg+xml" href={icon} />
  <link rel="shortcut icon" href={icon} />
</svelte:head>

<ModeWatcher />
<GlobalDialogs />

<div class="min-h-screen flex flex-col bg-background">
  <header
    class="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md"
  >
    <div class="container mx-auto px-4 h-16 flex items-center justify-between">
      <a
        href="/"
        class="flex items-center gap-2.5 group transition-transform active:scale-95"
        aria-label="Char Creator Home"
      >
        <div
          class="relative w-9 h-9 flex items-center justify-center bg-primary rounded-xl shadow-lg group-hover:rotate-6 transition-transform"
        >
          <img src={icon} alt="" class="w-6 h-6 invert dark:invert-0" />
        </div>
        <span class="font-black text-xl tracking-tight hidden md:block">
          Char<span class="text-blue-500">Creator</span>
        </span>
      </a>

      <nav
        class="flex items-center gap-1 sm:gap-3 bg-secondary/50 p-1.5 rounded-2xl border border-border/50"
      >
        <a
          href="/"
          class="flex items-center justify-center gap-2 px-4 sm:px-10 py-2.5 rounded-xl text-sm font-bold transition-all relative {isActive(
            '/',
          )
            ? 'bg-background text-primary shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}"
          aria-current={isActive("/") ? "page" : undefined}
        >
          <Home class="w-4 h-4 shrink-0" />
          <span class="hidden xs:block">Dashboard</span>
          {#if isActive("/")}
            <div
              in:fade={{ duration: 150 }}
              class="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1.5 h-1 bg-primary rounded-full"
            ></div>
          {/if}
        </a>

        <a
          href="/settings"
          class="flex items-center justify-center gap-2 px-4 sm:px-10 py-2.5 rounded-xl text-sm font-bold transition-all relative {isActive(
            '/settings',
          )
            ? 'bg-background text-primary shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}"
          aria-current={isActive("/settings") ? "page" : undefined}
        >
          <SettingsIcon class="w-4 h-4 shrink-0" />
          <span class="hidden xs:block">Settings</span>
          {#if isActive("/settings")}
            <div
              in:fade={{ duration: 150 }}
              class="absolute -bottom-3 left-1/2 -translate-x-1/2 w-1.5 h-1 bg-primary rounded-full"
            ></div>
          {/if}
        </a>
      </nav>

      <div class="flex items-center gap-3">
        <div class="hidden md:flex flex-col items-end">
          <span
            class="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
            >Version</span
          >
          <span class="text-[10px] font-mono opacity-60">v{version}</span>
        </div>
      </div>
    </div>
  </header>

  <main class="flex-1 container mx-auto px-4 py-6 sm:py-10">
    {#key $page.url.pathname}
      <div in:fade={{ duration: 200, delay: 100 }} class="w-full">
        {@render children()}
      </div>
    {/key}
  </main>
</div>

<style>
  @media (max-width: 440px) {
    .xs\:block {
      display: none;
    }
  }
</style>

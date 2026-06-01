<script lang="ts">
  import "./layout.css";
  import { ModeWatcher } from "mode-watcher";

  let { children } = $props();
</script>

<ModeWatcher />

<div class="min-h-screen flex flex-col">
  <header class="border-b bg-background sticky top-0 z-10">
    <div class="container mx-auto px-4 h-16 flex items-center justify-between">
      <a href="/" class="font-bold text-xl flex items-center gap-2">
        <span>🎭</span> Char Creator
      </a>
      <nav class="flex items-center gap-6">
        <a
          href="/"
          class="text-sm font-medium hover:text-blue-500 transition-colors"
          >Home</a
        >
        <a
          href="/settings"
          class="text-sm font-medium hover:text-blue-500 transition-colors"
          >Settings</a
        >
      </nav>
    </div>
  </header>

  <main class="flex-1 container mx-auto px-4 py-8">
    {@render children()}
  </main>
</div>

<script lang="ts">
  import SubfieldSection from "./SubfieldSection.svelte";

  // Binds optional metadata text variables directly to top-level editor states
  let {
    personality = $bindable(""),
    scenario = $bindable(""),
    backstory = $bindable(""),
    relatedCharacters = $bindable(""),
    generatingAll = false,
    activeGeneratingField = null,
    activeAction = null,
    onenhance,
    onregenerate,
    onundo,
    undoBuffer = {},
    oncancel,
  }: {
    personality: string;
    scenario: string;
    backstory: string;
    relatedCharacters: string;
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
</script>

<div class="space-y-6 pt-10 border-t border-border">
  <h3
    class="text-xl font-bold text-muted-foreground uppercase tracking-wider mb-4 animate-fade-in"
  >
    Optional Subfields
  </h3>

  <SubfieldSection
    bind:value={personality}
    label="Personality"
    id="sub-personality"
    placeholder="e.g. Wise, patient, speaks in deliberate medieval riddles..."
    {generatingAll}
    {activeGeneratingField}
    {activeAction}
    canUndo={undoBuffer["Personality"] !== undefined}
    {onenhance}
    {onregenerate}
    {onundo}
    {oncancel}
  />

  <SubfieldSection
    bind:value={scenario}
    label="Scenario"
    id="sub-scenario"
    placeholder="e.g. The user discovers Merlin's ancient stone tower..."
    {generatingAll}
    {activeGeneratingField}
    {activeAction}
    canUndo={undoBuffer["Scenario"] !== undefined}
    {onenhance}
    {onregenerate}
    {onundo}
    {oncancel}
  />

  <SubfieldSection
    bind:value={backstory}
    label="Backstory"
    id="sub-backstory"
    minHeight="min-h-30"
    placeholder="e.g. Born of a mortal mother and an incubus..."
    {generatingAll}
    {activeGeneratingField}
    {activeAction}
    canUndo={undoBuffer["Backstory"] !== undefined}
    {onenhance}
    {onregenerate}
    {onundo}
    {oncancel}
  />

  <SubfieldSection
    bind:value={relatedCharacters}
    label="Related Characters"
    id="sub-relatedCharacters"
    minHeight="min-h-30"
    placeholder="e.g. King Arthur (Mentee / Sovereign), Nimue (Lady of the Lake / Companion)..."
    {generatingAll}
    {activeGeneratingField}
    {activeAction}
    canUndo={undoBuffer["Related Characters"] !== undefined}
    {onenhance}
    {onregenerate}
    {onundo}
    {oncancel}
  />
</div>

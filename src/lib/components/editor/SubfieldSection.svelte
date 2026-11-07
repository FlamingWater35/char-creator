<script lang="ts">
  import { autoresize } from "$lib/autoresize";
  import AiFieldActions from "./AiFieldActions.svelte";

  /**
   * One optional subfield: heading, Enhance/Regenerate pair, and its textarea.
   *
   * Extracted so the four sections stay pixel-identical and the parent only has
   * to bind a value per field.
   */
  let {
    value = $bindable(""),
    label,
    id,
    placeholder = "",
    minHeight = "min-h-25",
    generatingAll = false,
    activeGeneratingField = null,
    activeAction = null,
    canUndo = false,
    onenhance,
    onregenerate,
    onundo,
    oncancel,
  }: {
    value: string;
    label: string;
    id: string;
    placeholder?: string;
    minHeight?: string;
    generatingAll: boolean;
    activeGeneratingField: string | null;
    activeAction?: "enhance" | "regenerate" | null;
    canUndo?: boolean;
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
    oncancel: () => void;
  } = $props();
</script>

<div class="space-y-3">
  <div class="flex flex-wrap justify-between items-center gap-3">
    <label for={id} class="font-semibold text-lg">{label}</label>
    <AiFieldActions
      fieldName={label}
      {value}
      activeField={activeGeneratingField}
              activeMode={activeAction}
      busy={generatingAll}
      onenhance={(_name, content) =>
        onenhance(label, content, (v) => (value = v))}
      onregenerate={(_name, content) =>
        onregenerate(label, content, (v) => (value = v))}
      onundo={() => onundo(label, (v) => (value = v))}
      {canUndo}
      {oncancel}
    />
  </div>
  <textarea
    {id}
    use:autoresize={value}
    bind:value
    class="w-full border rounded-md p-4 overflow-hidden bg-card focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none {minHeight} disabled:opacity-50 text-base sm:text-sm"
    {placeholder}
    disabled={generatingAll || activeGeneratingField === label}
  ></textarea>
</div>

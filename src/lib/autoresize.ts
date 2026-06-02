/**
 * Svelte directive action that auto-resizes textarea heights based on content length.
 * Prevents vertical layout shifts and eliminates ugly scrollbars in input cards.
 */
export function autoresize(node: HTMLTextAreaElement, value: string) {
  function resize() {
    try {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + 2 + 'px';
    } catch (e) {
      console.warn("Failed to dynamically compute size of textarea node:", e);
    }
  }

  node.addEventListener('input', resize);
  setTimeout(resize, 0); // Triggers layout paint on next tick

  return {
    update(newValue: string) {
      setTimeout(resize, 0);
    },
    destroy() {
      node.removeEventListener('input', resize);
    }
  };
}

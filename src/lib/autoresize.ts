/**
 * Svelte directive action that auto-resizes textarea heights based on content length.
 * Prevents vertical layout shifts and eliminates ugly scrollbars in input cards.
 *
 * @param node - The HTMLTextAreaElement to bind the resize listener to.
 * @param value - The bound string value to trigger updates.
 */
export function autoresize(node: HTMLTextAreaElement, value: string) {
  /**
   * Computes the scrollHeight and applies it directly to inline styles.
   * Uses try-catch to safely fallback to a default height if DOM metrics fail.
   */
  function resize() {
    try {
      node.style.height = 'auto';
      node.style.height = node.scrollHeight + 2 + 'px';
    } catch (e) {
      console.warn("Failed to dynamically compute size of textarea node. Using fallback height.", e);
      node.style.height = '100px'; // Safe fallback state to prevent invisible textareas
    }
  }

  node.addEventListener('input', resize);
  setTimeout(resize, 0); // Triggers layout paint on next tick

  // Returns Svelte action lifecycle hooks
  return {
    update(newValue: string) {
      setTimeout(resize, 0);
    },
    destroy() {
      node.removeEventListener('input', resize);
    }
  };
}

/**
 * Svelte directive action that auto-resizes textarea heights based on content length.
 * Prevents vertical layout shifts and eliminates ugly scrollbars in input cards.
 *
 * @param node - The HTMLTextAreaElement to bind the resize listener to.
 * @param value - The bound string value to trigger updates.
 */
export function autoresize(node: HTMLTextAreaElement, value: string) {
  let frame = 0;

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

  /**
   * Schedules one resize on the next frame.
   *
   * Coalescing matters: typing fires `input` per keystroke *and* updates the
   * bound value, so each character used to queue two timers — and `resize`
   * forces a layout read on each. One pending frame is all that is needed.
   */
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      resize();
    });
  }

  node.addEventListener('input', schedule);
  schedule(); // Triggers layout paint on next frame

  // Returns Svelte action lifecycle hooks
  return {
    update(_newValue: string) {
      schedule();
    },
    destroy() {
      node.removeEventListener('input', schedule);
      if (frame) cancelAnimationFrame(frame);
    }
  };
}

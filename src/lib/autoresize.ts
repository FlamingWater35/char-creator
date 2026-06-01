export function autoresize(node: HTMLTextAreaElement, value: string) {
  function resize() {
    node.style.height = 'auto';
    node.style.height = node.scrollHeight + 2 + 'px';
  }

  node.addEventListener('input', resize);
  setTimeout(resize, 0);

  return {
    update(newValue: string) {
      setTimeout(resize, 0);
    },
    destroy() {
      node.removeEventListener('input', resize);
    }
  };
}

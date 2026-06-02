/**
 * Global reactive controller for confirm and alert modals.
 * Allows triggering promise-based modals directly from layout code.
 */
class DialogState {
  isOpen = $state(false);
  type = $state<'alert' | 'confirm'>('alert');
  title = $state('');
  message = $state('');
  resolve = $state<(value: boolean) => void>();

  /**
   * Prompts a simple confirmation/notice modal.
   */
  alert(message: string, title = 'Notice') {
    this.title = title;
    this.message = message;
    this.type = 'alert';
    this.isOpen = true;
    return new Promise<boolean>(res => { this.resolve = res; });
  }

  /**
   * Prompts a choice confirmation modal returning a boolean promise.
   */
  confirm(message: string, title = 'Confirm Action') {
    this.title = title;
    this.message = message;
    this.type = 'confirm';
    this.isOpen = true;
    return new Promise<boolean>(res => { this.resolve = res; });
  }

  /**
   * Closes the active dialog modal and returns the result to the caller.
   */
  close(result: boolean) {
    this.isOpen = false;
    if (this.resolve) this.resolve(result);
  }
}

export const dialogs = new DialogState();

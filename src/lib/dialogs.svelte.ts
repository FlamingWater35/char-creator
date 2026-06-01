class DialogState {
  isOpen = $state(false);
  type = $state<'alert' | 'confirm'>('alert');
  title = $state('');
  message = $state('');
  resolve = $state<(value: boolean) => void>();

  alert(message: string, title = 'Notice') {
    this.title = title;
    this.message = message;
    this.type = 'alert';
    this.isOpen = true;
    return new Promise<boolean>(res => { this.resolve = res; });
  }

  confirm(message: string, title = 'Confirm Action') {
    this.title = title;
    this.message = message;
    this.type = 'confirm';
    this.isOpen = true;
    return new Promise<boolean>(res => { this.resolve = res; });
  }

  close(result: boolean) {
    this.isOpen = false;
    if (this.resolve) this.resolve(result);
  }
}

export const dialogs = new DialogState();

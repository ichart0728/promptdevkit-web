export class ClipboardUnavailableError extends Error {
  constructor() {
    super('Clipboard API is unavailable');
    this.name = 'ClipboardUnavailableError';
  }
}

export const copyToClipboard = async (text: string) => {
  if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText) {
    throw new ClipboardUnavailableError();
  }

  await navigator.clipboard.writeText(text);
};

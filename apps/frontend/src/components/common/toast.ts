type ToastParams = {
  title: string;
  description?: string;
};

export const toast = ({ title, description }: ToastParams) => {
  const message = description ? `${title}: ${description}` : title;

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('app-toast', { detail: { title, description } }));
  }

  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(`[toast] ${message}`);
  }
};

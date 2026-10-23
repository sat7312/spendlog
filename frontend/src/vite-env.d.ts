/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface Window {
  google?: {
    accounts?: {
      id: {
        initialize(options: { client_id: string; callback: (response: { credential: string }) => void }): void;
        renderButton(parent: HTMLElement, options: Record<string, string>): void;
        disableAutoSelect(): void;
      };
    };
  };
}

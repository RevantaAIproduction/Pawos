export type DevBrowserConsoleEntry = {
  level: 'log' | 'debug' | 'info' | 'warning' | 'error';
  text: string;
  timestamp: number;
};

export type DevBrowserNetworkEntry = {
  url: string;
  status: number | null;
  failed: boolean;
  timestamp: number;
};

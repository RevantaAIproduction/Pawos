import React, { createContext, ReactNode, useState } from 'react';
import type { WindowContext } from './ConversationTypes';

interface WindowContextProviderValue {
  context: WindowContext;
  setContext: (context: WindowContext) => void;
  updateProjectContext: (project: WindowContext['project']) => void;
  updateSessionContext: (session: WindowContext['session']) => void;
  updateActiveCard: (card: WindowContext['activeCard']) => void;
  updateBrowserContext: (browser: WindowContext['browserContext']) => void;
}

export const WindowContextContext = createContext<WindowContextProviderValue | undefined>(undefined);

export interface WindowContextProviderProps {
  children: ReactNode;
}

export function WindowContextProvider({ children }: WindowContextProviderProps) {
  const [context, setContextState] = useState<WindowContext>({
    activeCard: null,
  });

  const setContext = (newContext: WindowContext) => {
    setContextState(newContext);
  };

  const updateProjectContext = (project: WindowContext['project']) => {
    setContextState(prev => ({ ...prev, project }));
  };

  const updateSessionContext = (session: WindowContext['session']) => {
    setContextState(prev => ({ ...prev, session }));
  };

  const updateActiveCard = (card: WindowContext['activeCard']) => {
    setContextState(prev => ({ ...prev, activeCard: card }));
  };

  const updateBrowserContext = (browser: WindowContext['browserContext']) => {
    setContextState(prev => ({ ...prev, browserContext: browser }));
  };

  const value: WindowContextProviderValue = {
    context,
    setContext,
    updateProjectContext,
    updateSessionContext,
    updateActiveCard,
    updateBrowserContext,
  };

  return (
    <WindowContextContext.Provider value={value}>
      {children}
    </WindowContextContext.Provider>
  );
}

export function useWindowContext() {
  const ctx = React.useContext(WindowContextContext);
  if (!ctx) {
    throw new Error('useWindowContext must be used within WindowContextProvider');
  }
  return ctx;
}

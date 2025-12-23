'use client';

/**
 * Vlibe Edit Mode React Components
 * Provides React integration for Vlibe Edit Mode
 */

import React, { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { initEditMode, isEditModeEnabled, getSelectedElementInfo, type ElementInfo } from './edit-mode';

// Context for edit mode state
interface EditModeContextValue {
  isInitialized: boolean;
  isActive: boolean;
  selectedElement: ElementInfo | null;
}

const EditModeContext = createContext<EditModeContextValue>({
  isInitialized: false,
  isActive: false,
  selectedElement: null,
});

/**
 * EditModeProvider Component
 * Wraps your app to enable Vlibe Edit Mode integration
 *
 * @example
 * ```tsx
 * import { EditModeProvider } from '@withvlibe/editmode-sdk/react';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <EditModeProvider>{children}</EditModeProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);

  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

    const cleanup = initEditMode();
    setIsInitialized(true);

    // Listen for edit mode state changes
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (!message || !message.type) return;

      switch (message.type) {
        case 'EDIT_MODE_ENABLE':
          setIsActive(true);
          break;
        case 'EDIT_MODE_DISABLE':
          setIsActive(false);
          setSelectedElement(null);
          break;
        case 'ELEMENT_CLICKED':
          if (message.payload) {
            setSelectedElement(message.payload as ElementInfo);
          }
          break;
        case 'CLEAR_SELECTION':
          setSelectedElement(null);
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      cleanup();
      window.removeEventListener('message', handleMessage);
      setIsInitialized(false);
    };
  }, []);

  const contextValue: EditModeContextValue = {
    isInitialized,
    isActive,
    selectedElement,
  };

  return (
    <EditModeContext.Provider value={contextValue}>
      {children}
    </EditModeContext.Provider>
  );
}

/**
 * Hook to access edit mode state
 *
 * @example
 * ```tsx
 * import { useEditMode } from '@withvlibe/editmode-sdk/react';
 *
 * function MyComponent() {
 *   const { isActive, selectedElement } = useEditMode();
 *
 *   if (isActive) {
 *     return <div>Edit mode is active!</div>;
 *   }
 *
 *   return <div>Normal mode</div>;
 * }
 * ```
 */
export function useEditMode(): EditModeContextValue {
  return useContext(EditModeContext);
}

/**
 * Hook that returns true when running inside Vlibe Builder iframe
 */
export function useIsInVlibeBuilder(): boolean {
  const [isInBuilder, setIsInBuilder] = useState(false);

  useEffect(() => {
    // Check if we're in an iframe
    const inIframe = typeof window !== 'undefined' && window.parent !== window;
    setIsInBuilder(inIframe);
  }, []);

  return isInBuilder;
}

// Re-export types
export type { ElementInfo, ElementBoundingRect, ElementComputedStyles } from './edit-mode';

# @withvlibe/editmode-sdk

Enable visual editing in Vlibe Builder for your Next.js applications.

## Installation

```bash
npm install @withvlibe/editmode-sdk
```

## Usage

### React Integration

Wrap your app with the `EditModeProvider` component:

```tsx
// app/providers.tsx
'use client';
import { EditModeProvider } from '@withvlibe/editmode-sdk/react';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return <EditModeProvider>{children}</EditModeProvider>;
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Using the Hook

Access edit mode state in your components:

```tsx
import { useEditMode } from '@withvlibe/editmode-sdk/react';

function MyComponent() {
  const { isActive, selectedElement } = useEditMode();

  if (isActive) {
    return <div>Edit mode is active!</div>;
  }

  return <div>Normal mode</div>;
}
```

### Check if Running in Vlibe Builder

```tsx
import { useIsInVlibeBuilder } from '@withvlibe/editmode-sdk/react';

function MyComponent() {
  const isInBuilder = useIsInVlibeBuilder();

  if (isInBuilder) {
    // Running inside Vlibe Builder iframe
  }
}
```

### Vanilla JavaScript

For non-React applications:

```typescript
import { initEditMode, isEditModeEnabled } from '@withvlibe/editmode-sdk';

// Initialize edit mode
const cleanup = initEditMode();

// Check if edit mode is enabled
if (isEditModeEnabled()) {
  console.log('Edit mode is active');
}

// Cleanup when done
cleanup();
```

## API Reference

### React Components

#### `EditModeProvider`

Provider component that initializes edit mode and manages state.

**Props:**
- `children`: React.ReactNode

#### `useEditMode()`

Hook to access edit mode state.

**Returns:**
- `isInitialized`: boolean - Whether edit mode has been initialized
- `isActive`: boolean - Whether edit mode is currently active
- `selectedElement`: ElementInfo | null - Currently selected element info

#### `useIsInVlibeBuilder()`

Hook to check if the app is running inside Vlibe Builder iframe.

**Returns:** boolean

### Core Functions

#### `initEditMode()`

Initializes edit mode functionality. Returns a cleanup function.

#### `isEditModeEnabled()`

Returns whether edit mode is currently enabled.

#### `getSelectedElementInfo()`

Returns the currently selected element info or null.

## Types

```typescript
interface ElementInfo {
  tagName: string;
  textContent: string | null;
  className: string;
  id: string;
  xpath: string;
  selector: string;
  computedStyles: ElementComputedStyles;
  boundingRect: ElementBoundingRect;
  isTextElement: boolean;
  isImageElement: boolean;
  imageSrc?: string;
}

interface ElementBoundingRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

interface ElementComputedStyles {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  lineHeight: string;
  textAlign: string;
  padding: string;
  margin: string;
  border: string;
  borderRadius: string;
  display: string;
  position: string;
  backgroundImage: string;
}
```

## Requirements

- React 18.0.0 or higher
- Next.js 13+ (App Router recommended)

## License

MIT

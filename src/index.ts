/**
 * @withvlibe/editmode-sdk
 * Vlibe Edit Mode SDK - Enable visual editing in Vlibe Builder
 *
 * @example
 * ```tsx
 * // In your layout.tsx or _app.tsx
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

// Core functions
export { initEditMode, isEditModeEnabled, getSelectedElementInfo } from './edit-mode';

// Types
export type {
  ElementInfo,
  ElementBoundingRect,
  ElementComputedStyles,
  EditModeMessage,
} from './edit-mode';

/**
 * Vlibe Edit Mode Core
 * Enables visual element selection and editing from Vlibe Builder
 * This script runs in the preview app and communicates with the parent Builder window
 */

export interface ElementBoundingRect {
  top: number;
  left: number;
  width: number;
  height: number;
  viewportTop: number;
  viewportLeft: number;
}

export interface ElementComputedStyles {
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  padding: string;
  margin: string;
  fontFamily: string;
  lineHeight: string;
  borderRadius: string;
}

export interface ElementInfo {
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

export interface EditModeMessage {
  type: string;
  payload?: ElementInfo | { selector: string; property?: string; value?: string; newText?: string; newSrc?: string };
}

// Module state
let isEditModeActive = false;
let highlightOverlay: HTMLDivElement | null = null;
let selectionOverlay: HTMLDivElement | null = null;
let selectedElement: HTMLElement | null = null;
let lastHoveredElement: HTMLElement | null = null;
let lastFrameTime = 0;
let readyInterval: ReturnType<typeof setInterval> | null = null;
let readyAcknowledged = false;
let cleanupFn: (() => void) | null = null;

const FRAME_DELAY = 16; // ~60fps
const VLIBE_PURPLE = '#F4C7F2';

// Create highlight overlay element
function createHighlightOverlay(): HTMLDivElement {
  if (highlightOverlay) return highlightOverlay;

  highlightOverlay = document.createElement('div');
  highlightOverlay.id = '__vlibe_edit_highlight__';
  highlightOverlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid ${VLIBE_PURPLE};
    background: rgba(244, 199, 242, 0.1);
    z-index: 999999;
    transition: all 0.1s ease-out;
    box-shadow: 0 0 0 4px rgba(244, 199, 242, 0.2);
    border-radius: 4px;
    display: none;
  `;
  document.body.appendChild(highlightOverlay);
  return highlightOverlay;
}

// Create selection overlay element (persistent highlight for selected element)
function createSelectionOverlay(): HTMLDivElement {
  if (selectionOverlay) return selectionOverlay;

  selectionOverlay = document.createElement('div');
  selectionOverlay.id = '__vlibe_edit_selection__';
  selectionOverlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid ${VLIBE_PURPLE};
    background: rgba(244, 199, 242, 0.15);
    z-index: 999998;
    box-shadow: 0 0 0 4px rgba(244, 199, 242, 0.3), 0 0 12px rgba(244, 199, 242, 0.2);
    border-radius: 4px;
    display: none;
  `;
  document.body.appendChild(selectionOverlay);
  return selectionOverlay;
}

// Update selection overlay position
function updateSelectionOverlay(element: HTMLElement | null): void {
  if (!selectionOverlay) createSelectionOverlay();

  if (!element) {
    if (selectionOverlay) selectionOverlay.style.display = 'none';
    return;
  }

  const rect = element.getBoundingClientRect();
  selectionOverlay!.style.display = 'block';
  selectionOverlay!.style.top = rect.top + 'px';
  selectionOverlay!.style.left = rect.left + 'px';
  selectionOverlay!.style.width = rect.width + 'px';
  selectionOverlay!.style.height = rect.height + 'px';
}

// Clear selection
function clearSelection(): void {
  selectedElement = null;
  updateSelectionOverlay(null);
}

// Get XPath for an element
function getXPath(element: HTMLElement | null): string {
  if (!element) return '';
  if (element.id) return '//*[@id="' + element.id + '"]';
  if (element === document.body) return '/html/body';

  let ix = 0;
  const siblings = element.parentNode ? element.parentNode.childNodes : [];
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      const parentPath = getXPath(element.parentNode as HTMLElement);
      const tagName = element.tagName.toLowerCase();
      return parentPath + '/' + tagName + '[' + (ix + 1) + ']';
    }
    if (sibling.nodeType === 1 && (sibling as HTMLElement).tagName === element.tagName) {
      ix++;
    }
  }
  return '';
}

// Get unique CSS selector for an element
function getSelector(element: HTMLElement | null): string {
  if (!element) return '';
  if (element.id) return '#' + CSS.escape(element.id);

  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = '#' + CSS.escape(current.id);
      path.unshift(selector);
      break;
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(c => c && !c.includes(':'));
      if (classes.length > 0) {
        selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
      }
    }

    // Add nth-of-type if needed for uniqueness
    const parent = current.parentNode as HTMLElement | null;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        el => el.tagName === current!.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += ':nth-of-type(' + index + ')';
      }
    }

    path.unshift(selector);
    current = current.parentNode as HTMLElement | null;

    // Stop at body
    if (current === document.body) {
      path.unshift('body');
      break;
    }
  }

  return path.join(' > ');
}

// Get element info for messaging
function getElementInfo(element: HTMLElement | null): ElementInfo | null {
  if (!element) return null;

  const rect = element.getBoundingClientRect();
  const styles = window.getComputedStyle(element);
  const tagName = element.tagName.toLowerCase();

  // Determine if it's a text element
  const textTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'button', 'label', 'li', 'td', 'th', 'div'];
  const isTextElement = textTags.includes(tagName) &&
    element.childNodes.length > 0 &&
    Array.from(element.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());

  // Determine if it's an image element
  const isImageElement = tagName === 'img' ||
    (tagName === 'div' && !!styles.backgroundImage && styles.backgroundImage !== 'none');

  return {
    tagName,
    textContent: isTextElement ? element.textContent?.trim().slice(0, 200) || null : null,
    className: element.className || '',
    id: element.id || '',
    xpath: getXPath(element),
    selector: getSelector(element),
    computedStyles: {
      color: styles.color,
      backgroundColor: styles.backgroundColor,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      padding: styles.padding,
      margin: styles.margin,
      fontFamily: styles.fontFamily,
      lineHeight: styles.lineHeight,
      borderRadius: styles.borderRadius,
    },
    boundingRect: {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
      viewportTop: rect.top,
      viewportLeft: rect.left,
    },
    isTextElement,
    isImageElement,
    imageSrc: tagName === 'img' ? (element as HTMLImageElement).src : undefined,
  };
}

// Update highlight overlay position
function updateHighlight(element: HTMLElement | null): void {
  if (!highlightOverlay || !element) {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    return;
  }

  const rect = element.getBoundingClientRect();
  highlightOverlay.style.display = 'block';
  highlightOverlay.style.top = rect.top + 'px';
  highlightOverlay.style.left = rect.left + 'px';
  highlightOverlay.style.width = rect.width + 'px';
  highlightOverlay.style.height = rect.height + 'px';
}

// Mousemove handler with throttling
function handleMouseMove(e: MouseEvent): void {
  if (!isEditModeActive) return;

  const now = performance.now();
  if (now - lastFrameTime < FRAME_DELAY) return;
  lastFrameTime = now;

  const target = e.target as HTMLElement;

  // Skip certain elements (including both overlays)
  if (target === highlightOverlay ||
      target.id === '__vlibe_edit_highlight__' ||
      target === selectionOverlay ||
      target.id === '__vlibe_edit_selection__' ||
      target.tagName === 'HTML' ||
      target.tagName === 'BODY') {
    return;
  }

  if (target !== lastHoveredElement) {
    lastHoveredElement = target;
    updateHighlight(target);

    const info = getElementInfo(target);
    if (info) {
      window.parent.postMessage({
        type: 'ELEMENT_HOVERED',
        payload: info,
      }, '*');
    }
  }
}

// Click handler
function handleClick(e: MouseEvent): void {
  if (!isEditModeActive) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;

  // Skip highlight and selection overlays
  if (target === highlightOverlay || target.id === '__vlibe_edit_highlight__' ||
      target === selectionOverlay || target.id === '__vlibe_edit_selection__') {
    return;
  }

  // Update selection
  selectedElement = target;
  updateSelectionOverlay(target);

  const info = getElementInfo(target);
  if (info) {
    window.parent.postMessage({
      type: 'ELEMENT_CLICKED',
      payload: info,
    }, '*');
  }
}

// Mouseleave handler
function handleMouseLeave(): void {
  if (!isEditModeActive) return;

  lastHoveredElement = null;
  if (highlightOverlay) {
    highlightOverlay.style.display = 'none';
  }

  window.parent.postMessage({
    type: 'ELEMENT_UNHOVERED',
  }, '*');
}

// Apply style change to element
function applyStyleChange(selector: string, property: string, value: string): void {
  try {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      element.style[property as any] = value;
      console.log('[VlibeEditMode] Applied style:', property, '=', value, 'to', selector);
    }
  } catch (err) {
    console.error('[VlibeEditMode] Failed to apply style:', err);
  }
}

// Apply text change to element
function applyTextChange(selector: string, newText: string): void {
  try {
    const element = document.querySelector(selector);
    if (element) {
      // Find the first text node and update it
      const textNode = Array.from(element.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
      if (textNode) {
        textNode.textContent = newText;
      } else {
        element.textContent = newText;
      }
      console.log('[VlibeEditMode] Applied text change to', selector);
    }
  } catch (err) {
    console.error('[VlibeEditMode] Failed to apply text:', err);
  }
}

// Apply image change to element
function applyImageChange(selector: string, newSrc: string): void {
  try {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      if (element.tagName.toLowerCase() === 'img') {
        (element as HTMLImageElement).src = newSrc;
      } else {
        element.style.backgroundImage = 'url(' + newSrc + ')';
      }
      console.log('[VlibeEditMode] Applied image change to', selector);
    }
  } catch (err) {
    console.error('[VlibeEditMode] Failed to apply image:', err);
  }
}

// Enable edit mode
function enableEditMode(): void {
  console.log('[VlibeEditMode] Enabling edit mode');
  isEditModeActive = true;
  createHighlightOverlay();
  createSelectionOverlay();
  document.body.style.cursor = 'crosshair';

  document.addEventListener('mousemove', handleMouseMove, { passive: true });
  document.addEventListener('click', handleClick, { capture: true });
  document.addEventListener('mouseleave', handleMouseLeave);
}

// Disable edit mode
function disableEditMode(): void {
  console.log('[VlibeEditMode] Disabling edit mode');
  isEditModeActive = false;
  lastHoveredElement = null;
  clearSelection();

  if (highlightOverlay) {
    highlightOverlay.style.display = 'none';
  }

  document.body.style.cursor = '';

  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('click', handleClick, { capture: true });
  document.removeEventListener('mouseleave', handleMouseLeave);
}

// Message handler from parent
function handleMessage(event: MessageEvent): void {
  const message = event.data as EditModeMessage;
  if (!message || !message.type) return;

  switch (message.type) {
    case 'EDIT_MODE_ENABLE':
      enableEditMode();
      break;
    case 'EDIT_MODE_DISABLE':
      disableEditMode();
      break;
    case 'APPLY_STYLE_CHANGE':
      if (message.payload && 'selector' in message.payload && 'property' in message.payload && 'value' in message.payload) {
        applyStyleChange(message.payload.selector, message.payload.property!, message.payload.value!);
      }
      break;
    case 'APPLY_TEXT_CHANGE':
      if (message.payload && 'selector' in message.payload && 'newText' in message.payload) {
        applyTextChange(message.payload.selector, message.payload.newText!);
      }
      break;
    case 'APPLY_IMAGE_CHANGE':
      if (message.payload && 'selector' in message.payload && 'newSrc' in message.payload) {
        applyImageChange(message.payload.selector, message.payload.newSrc!);
      }
      break;
    case 'CLEAR_SELECTION':
      clearSelection();
      break;
    case 'EDIT_MODE_READY_ACK':
      readyAcknowledged = true;
      if (readyInterval) {
        clearInterval(readyInterval);
        readyInterval = null;
      }
      break;
  }
}

// Handle acknowledgment messages
function handleAckMessage(event: MessageEvent): void {
  if (event.data?.type === 'EDIT_MODE_ENABLE' || event.data?.type === 'EDIT_MODE_READY_ACK') {
    readyAcknowledged = true;
    if (readyInterval) {
      clearInterval(readyInterval);
      readyInterval = null;
    }
  }
}

// Send ready message to parent
function sendReady(): void {
  if (!readyAcknowledged) {
    console.log('[VlibeEditMode] Sending EDIT_MODE_READY to parent');
    window.parent.postMessage({ type: 'EDIT_MODE_READY' }, '*');
  }
}

/**
 * Initialize the Edit Mode system
 * Call this function to set up edit mode in your app
 */
export function initEditMode(): () => void {
  // Guard against duplicate initialization
  if (typeof window === 'undefined') {
    return () => {};
  }

  if ((window as any).__VLIBE_EDIT_MODE_INITIALIZED__) {
    console.log('[VlibeEditMode] Already initialized, skipping');
    return cleanupFn || (() => {});
  }

  (window as any).__VLIBE_EDIT_MODE_INITIALIZED__ = true;

  // Set up message listener
  window.addEventListener('message', handleMessage);
  window.addEventListener('message', handleAckMessage);

  // Notify parent that script is ready
  sendReady();
  console.log('[VlibeEditMode] Edit mode script initialized');

  // Keep sending every 500ms until acknowledged or 30 seconds pass
  readyInterval = setInterval(() => {
    sendReady();
  }, 500);

  // Stop after 30 seconds
  setTimeout(() => {
    if (readyInterval) {
      clearInterval(readyInterval);
      readyInterval = null;
    }
  }, 30000);

  // Return cleanup function
  cleanupFn = () => {
    window.removeEventListener('message', handleMessage);
    window.removeEventListener('message', handleAckMessage);
    if (readyInterval) {
      clearInterval(readyInterval);
      readyInterval = null;
    }
    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }
    if (selectionOverlay) {
      selectionOverlay.remove();
      selectionOverlay = null;
    }
    (window as any).__VLIBE_EDIT_MODE_INITIALIZED__ = false;
  };

  return cleanupFn;
}

/**
 * Check if edit mode is currently active
 */
export function isEditModeEnabled(): boolean {
  return isEditModeActive;
}

/**
 * Get the currently selected element info
 */
export function getSelectedElementInfo(): ElementInfo | null {
  return selectedElement ? getElementInfo(selectedElement) : null;
}

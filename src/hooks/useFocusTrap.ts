import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(", ");

/**
 * Traps keyboard focus within the referenced container element.
 * On Tab at the last focusable element, focus wraps to the first.
 * On Shift+Tab at the first focusable element, focus wraps to the last.
 */
export function useFocusTrap<
  T extends HTMLElement = HTMLDivElement,
>(): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const containerEl = containerRef.current as T;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const getFocusableElements = () =>
      Array.from(
        containerEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.getClientRects().length > 0);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;

      const focusable = getFocusableElements();

      if (focusable.length === 0) {
        e.preventDefault();
        containerEl.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (
          document.activeElement === first ||
          !containerEl.contains(document.activeElement)
        ) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (
          document.activeElement === last ||
          !containerEl.contains(document.activeElement)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    // Focus the first focusable element on mount
    if (!containerEl.hasAttribute("tabindex")) {
      containerEl.tabIndex = -1;
    }
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      containerEl.focus();
    }

    containerEl.addEventListener("keydown", handleKeyDown);
    return () => {
      containerEl.removeEventListener("keydown", handleKeyDown);
      if (
        previousActiveElement &&
        previousActiveElement.isConnected &&
        !containerEl.contains(previousActiveElement)
      ) {
        previousActiveElement.focus();
      }
    };
  }, []);

  return containerRef;
}

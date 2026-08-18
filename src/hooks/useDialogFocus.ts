import { useEffect, useRef, type RefObject } from 'react';

/**
 * Moves focus into a dialog when it opens and back to whatever opened it when
 * it closes.
 *
 * The app's sheets stay mounted and are translated off-screen when closed, with
 * `inert` keeping them out of the tab ring. That solves "Tab must not walk into
 * a hidden dialog", but not the other half: without this hook, opening a sheet
 * leaves focus on the trigger behind the backdrop, and closing one drops focus
 * to `<body>`, so the next Tab restarts from the top of the page.
 *
 * `ManageEssentialsModal` unmounts instead of hiding; the hook works either way,
 * because it only reads the container ref while the dialog is open.
 */

/** Elements that can take focus. Mirrors the harness's traversal set. */
const FOCUSABLE =
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(
    isOpen: boolean,
    containerRef: RefObject<HTMLElement | null>,
): void {
    const invokerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (isOpen) {
            // Remember who opened it, so closing can hand focus back.
            const active = document.activeElement;
            invokerRef.current = active instanceof HTMLElement ? active : null;

            const container = containerRef.current;
            if (!container) return;

            // An element already marked autoFocus wins — NewTaskModal focuses
            // its title field, and overriding that would be worse, not better.
            if (container.contains(document.activeElement)) return;

            const first = container.querySelector<HTMLElement>(FOCUSABLE);
            (first ?? container).focus({ preventScroll: true });
            return;
        }

        const invoker = invokerRef.current;
        invokerRef.current = null;
        // Only restore if the trigger still exists — a control inside a list
        // that the dialog itself deleted must not be focused.
        if (invoker && document.body.contains(invoker)) {
            invoker.focus({ preventScroll: true });
        }
    }, [isOpen, containerRef]);
}

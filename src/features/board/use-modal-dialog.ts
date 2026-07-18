import { useEffect, useRef } from "react";

export type ModalFocusTarget = Readonly<{
  focus: () => void;
  isConnected: boolean;
}>;

export function restoreModalFocus(
  target: ModalFocusTarget | null,
  restoreFocus: boolean,
): boolean {
  if (!restoreFocus || !target?.isConnected) return false;
  target.focus();
  return true;
}

type ModalDialogOptions = Readonly<{
  restoreFocus?: boolean;
  returnFocusTarget?: ModalFocusTarget | null;
}>;

export function useModalDialog(
  open: boolean,
  { restoreFocus = true, returnFocusTarget = null }: ModalDialogOptions = {},
) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const returnFocus = returnFocusTarget ?? (
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    );

    if (!dialog.open) dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
      restoreModalFocus(returnFocus, restoreFocus);
    };
  }, [open, restoreFocus, returnFocusTarget]);

  return dialogRef;
}

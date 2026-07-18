import { useEffect, useRef } from "react";

export function useModalDialog(open: boolean) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const returnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    if (!dialog.open) dialog.showModal();

    return () => {
      if (dialog.open) dialog.close();
      returnFocus?.focus();
    };
  }, [open]);

  return dialogRef;
}

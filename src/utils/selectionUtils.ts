let savedRange: Range | null = null;

function onSelectionChange(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.toString().length === 0) return;

  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const editableEl = (
    container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : (container as Element)
  )?.closest("[contenteditable]");

  if (editableEl) {
    savedRange = range.cloneRange();
  }
}

export function startTrackingSelection(): () => void {
  document.addEventListener("selectionchange", onSelectionChange);
  return () => document.removeEventListener("selectionchange", onSelectionChange);
}

export function restoreSelection(): boolean {
  if (!savedRange) return false;
  const sel = window.getSelection();
  if (!sel) return false;
  try {
    const container = savedRange.commonAncestorContainer;
    const editableEl = (
      container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : (container as Element)
    )?.closest("[contenteditable]") as HTMLElement | null;

    if (editableEl) editableEl.focus();

    sel.removeAllRanges();
    sel.addRange(savedRange);
    return savedRange.toString().length > 0;
  } catch {
    return false;
  }
}

export function clearSavedSelection(): void {
  savedRange = null;
}

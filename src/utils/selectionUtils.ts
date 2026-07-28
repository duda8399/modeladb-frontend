let savedSelection: { root: HTMLElement; start: number; end: number } | null = null;

function textOffsetOf(root: Node, targetNode: Node, targetOffset: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(targetNode, targetOffset);
  return range.toString().length;
}

function rangeFromTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  if (nodes.length === 0) return null;

  let total = 0;
  let startPos: { node: Text; offset: number } | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const len = nodes[i].textContent?.length ?? 0;
    if (start < total + len) {
      startPos = { node: nodes[i], offset: start - total };
      break;
    }
    if (start === total + len) {
      startPos = nodes[i + 1]
        ? { node: nodes[i + 1], offset: 0 }
        : { node: nodes[i], offset: len };
      break;
    }
    total += len;
  }
  if (!startPos) return null;

  total = 0;
  let endPos: { node: Text; offset: number } | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const len = nodes[i].textContent?.length ?? 0;
    if (end <= total + len) {
      endPos = { node: nodes[i], offset: end - total };
      break;
    }
    total += len;
  }
  if (!endPos) return null;

  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  return range;
}

function onSelectionChange(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.toString().length === 0) return;

  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const editableEl = (
    container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : (container as Element)
  )?.closest("[contenteditable]") as HTMLElement | null;

  if (editableEl) {
    savedSelection = {
      root: editableEl,
      start: textOffsetOf(editableEl, range.startContainer, range.startOffset),
      end: textOffsetOf(editableEl, range.endContainer, range.endOffset),
    };
  }
}

export function startTrackingSelection(): () => void {
  document.addEventListener("selectionchange", onSelectionChange);
  return () => document.removeEventListener("selectionchange", onSelectionChange);
}

export function restoreSelection(): boolean {
  if (!savedSelection) return false;
  const { root, start, end } = savedSelection;
  if (!root.isConnected) return false;

  const sel = window.getSelection();
  if (!sel) return false;

  try {
    root.focus();

    const range = rangeFromTextOffsets(root, start, end);
    if (!range) return false;

    sel.removeAllRanges();
    sel.addRange(range);
    return range.toString().length > 0;
  } catch {
    return false;
  }
}

export function clearSavedSelection(): void {
  savedSelection = null;
}

/**
 * A name followed by its ✎ never leaves the pencil alone on a line (Gianni): the last word goes with it. `tail` is the
 * last word (kept with the pencil in a nowrap span), `head` everything before it, its space included. A last word too
 * long to share a line safely (over 24 characters) is not held, so it can still wrap inside a narrow card.
 */
export function splitTail(text: string): { head: string; tail: string } {
  const trimmed = text.replace(/\s+$/, '');
  const at = trimmed.search(/\S+$/);
  if (at < 0) return { head: '', tail: '' };
  const tail = trimmed.slice(at);
  if (tail.length > 24) return { head: trimmed, tail: '' };
  return { head: trimmed.slice(0, at), tail };
}

/** A box opened to rename something gets the cursor at the end of its text, with nothing highlighted (Gianni). */
export function focusAtEnd(box: HTMLInputElement | HTMLTextAreaElement | null | undefined): void {
  if (!box) return;
  box.focus();
  const end = box.value.length;
  try { box.setSelectionRange(end, end); } catch { /* a type without a selection */ }
}

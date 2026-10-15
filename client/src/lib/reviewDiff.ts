/**
 * Line-based before/after diff for the LLM review, so the user can see exactly
 * what the model changed. No dependency: articles are a few thousand lines at
 * most, so a plain LCS table after trimming the common prefix/suffix is enough.
 */

export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

export interface DiffSection {
  label: string;
  lines: DiffLine[];
}

/** The fields the review can change, with image bytes already stripped. */
export interface ReviewSnapshot {
  title: string;
  excerpt: string;
  content: string;
  footnotes: Array<{ id: string; text: string }>;
  citations: Array<{ id: string; text: string; source: string }>;
  images: Array<{ id: string; filename?: string; alt: string; title: string; caption?: string }>;
}

/** Diff two line arrays (LCS). Unchanged lines are kept for context. */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }

  const a = before.slice(start, endB);
  const b = after.slice(start, endA);
  const width = b.length + 1;
  // lcs[i * width + j] = LCS length of a[i..] and b[j..]
  const lcs = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const out: DiffLine[] = before.slice(0, start).map((text) => ({ type: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      out.push({ type: 'del', text: a[i++] });
    } else {
      out.push({ type: 'add', text: b[j++] });
    }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++] });
  while (j < b.length) out.push({ type: 'add', text: b[j++] });
  for (const text of before.slice(endB)) out.push({ type: 'same', text });
  return out;
}

/** One line per block-level tag so paragraph edits show as small hunks. */
function htmlToLines(html: string): string[] {
  return html
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|figure|figcaption|table|tr|pre)>/gi, '</$1>\n')
    .replace(/<(br|hr)\s*\/?>/gi, '<$1>\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function textLines(text: string): string[] {
  return text ? [text] : [];
}

/** Keep only changed lines plus `context` lines around each change. */
function collapseUnchanged(lines: DiffLine[], context = 1): DiffLine[] {
  const keep = lines.map((line) => line.type !== 'same');
  const near = keep.map((_, index) => {
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k++) {
      if (keep[k]) return true;
    }
    return false;
  });
  const out: DiffLine[] = [];
  let skipped = 0;
  lines.forEach((line, index) => {
    if (near[index]) {
      if (skipped > 0) out.push({ type: 'same', text: `… ${skipped} unchanged lines …` });
      skipped = 0;
      out.push(line);
    } else {
      skipped++;
    }
  });
  if (skipped > 0) out.push({ type: 'same', text: `… ${skipped} unchanged lines …` });
  return out;
}

/** Returns only the sections that actually differ. */
export function buildReviewDiff(before: ReviewSnapshot, after: ReviewSnapshot): DiffSection[] {
  const imageLine = (img: ReviewSnapshot['images'][number]) =>
    `${img.id} | file: ${img.filename ?? ''} | alt: ${img.alt} | title: ${img.title} | caption: ${img.caption ?? ''}`;

  const candidates: Array<{ label: string; before: string[]; after: string[] }> = [
    { label: 'Title', before: textLines(before.title), after: textLines(after.title) },
    { label: 'Excerpt', before: textLines(before.excerpt), after: textLines(after.excerpt) },
    { label: 'Article HTML', before: htmlToLines(before.content), after: htmlToLines(after.content) },
    {
      label: 'Footnotes',
      before: before.footnotes.map((f) => `${f.id}: ${f.text}`),
      after: after.footnotes.map((f) => `${f.id}: ${f.text}`),
    },
    {
      label: 'Bibliography',
      before: before.citations.map((c) => `${c.id}: ${c.text} (${c.source})`),
      after: after.citations.map((c) => `${c.id}: ${c.text} (${c.source})`),
    },
    { label: 'Images', before: before.images.map(imageLine), after: after.images.map(imageLine) },
  ];

  return candidates
    .map(({ label, before: b, after: a }) => ({ label, lines: diffLines(b, a) }))
    .filter((section) => section.lines.some((line) => line.type !== 'same'))
    .map((section) => ({ label: section.label, lines: collapseUnchanged(section.lines) }));
}

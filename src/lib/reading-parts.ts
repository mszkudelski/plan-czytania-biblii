import type { PlanSegment } from "../types";

export function readingChapters(segment: PlanSegment): string[] {
  if (segment.referenceVersion === 1) return splitReadingChapters(segment.label);
  // Preserve the index mapping used by historical server logs and local marks.
  const match = segment.label.match(/^(.+?)\s+(\d+)(?:\s*[–-]\s*(\d+))?$/);
  if (!match) return [segment.label];
  const start = Number(match[2]);
  const end = Number(match[3] ?? match[2]);
  if (end < start || end - start > 150) return [segment.label];
  return Array.from({ length: end - start + 1 }, (_, index) => `${match[1]} ${start + index}`);
}

// A comma separates chapter and verse in Polish references. Never treat it as
// a chapter list separator; verse ranges (also across chapters) stay intact.
export function splitReadingChapters(label: string): string[] {
  const parts = label.trim().split(/\s*(?:[;|·+\n]|\s\/\s|,(?=\s*(?:[1-3]\s*)?\p{L}))\s*/u);
  const result: string[] = [];
  let book = "";
  for (const part of parts) {
    const reference = part.match(/^((?:[1-3]\s*)?\p{L}[\p{L}.]*(?:\s+\p{L}[\p{L}.]*)*?)\s*(\d.*)$/u);
    const numbers = reference?.[2] ?? part;
    if (reference) book = reference[1].trim();
    if (!book || !numbers) return [label];
    const chapterRange = numbers.match(/^(\d+)(?:\s*[-–—−]\s*(\d+))?$/);
    if (chapterRange) {
      const start = Number(chapterRange[1]);
      const end = Number(chapterRange[2] ?? start);
      if (start < 1 || end < start || end > 150) return [label];
      for (let chapter = start; chapter <= end; chapter++) result.push(`${book} ${chapter}`);
    } else {
      // Validate the whole verse expression before accepting an inherited book.
      // Keep the author's notation, verse lists and verse suffixes (e.g. 16a).
      const verse = numbers.match(/^(\d+)\s*[,:]\s*(\d+)[a-c]?(?:\s*[-–—−]\s*(?:(\d+)\s*[,:]\s*)?(\d+)[a-c]?)?(?:\s*[,.]\s*\d+[a-c]?(?:\s*[-–—−]\s*\d+[a-c]?)?)*$/i);
      if (!verse || Number(verse[1]) < 1 || Number(verse[2]) < 1 ||
          (verse[3] && Number(verse[3]) < Number(verse[1])) ||
          (verse[4] && (!verse[3] || verse[3] === verse[1]) && Number(verse[4]) < Number(verse[2]))) return [label];
      result.push(reference ? part : `${book} ${part}`);
    }
    // Bound expansion even for repeated ranges in untrusted imported text.
    if (result.length > 150) return [label];
  }
  return result.length ? result : [label];
}

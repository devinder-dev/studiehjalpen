/**
 * Heading-aware markdown chunker — PLAN.md §5. Splits on structure first
 * (headings), then paragraphs, then sentences, then a hard character cut,
 * in that priority order, so a chunk boundary never lands mid-table-row and
 * overlap never bleeds across a heading change (see DECISIONS.md 2026-10-04).
 */
import { countTokens } from "./tokenize";

export interface Chunk {
  headingPath: string[];
  content: string; // clean body text, no heading prefix — DECISIONS.md 2026-09-20
  chunkIndex: number;
  tokenCount: number;
  contentHash: string;
}

const DEFAULT_TARGET_TOKENS = 650;
const DEFAULT_OVERLAP_TOKENS = 60;

// Matches the convention already used in spikes/vector-search-check.ts, so
// chunk-level hashes computed here and there are directly comparable.
function hashContent(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

// Builds the string actually sent to the embedding API — heading prefix + content.
// Never store this string in chunks.content (see DECISIONS.md 2026-09-20).
export function withHeadingPrefix(chunk: Pick<Chunk, "headingPath" | "content">): string {
  if (chunk.headingPath.length === 0) return chunk.content;
  return `[${chunk.headingPath.join(" > ")}] ${chunk.content}`;
}

interface Section {
  headingPath: string[];
  text: string;
}

// A markdown heading line, level 2-6. PLAN.md §5 splits on ##/### only — a
// bare # is the document title (already in documents.title), not a path
// segment, so it's left as ordinary text rather than popping the stack.
const HEADING_RE = /^(#{2,6})\s+(.+?)\s*$/;

// Splits the whole document into sections, one per heading, each carrying the
// full stack of ancestor heading text as headingPath. Text before the first
// heading gets headingPath [] — there's nothing else sensible to call it.
function splitIntoSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  const stack: { level: number; text: string }[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text.length > 0) {
      sections.push({ headingPath: stack.map((s) => s.text), text });
    }
    buffer = [];
  };

  for (const line of lines) {
    const match = line.match(HEADING_RE);
    if (match) {
      flush();
      const level = match[1].length;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: match[2] });
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|");
}

// Splits section text into ordered blocks: contiguous table-row runs become one
// atomic block (never split further — "never split mid-table-row"), everything
// else is split on blank lines into paragraph blocks.
function splitIntoBlocks(text: string): { text: string; isTable: boolean }[] {
  const lines = text.split("\n");
  const blocks: { text: string; isTable: boolean }[] = [];
  let buffer: string[] = [];

  const flushParagraph = () => {
    const joined = buffer.join("\n").trim();
    if (joined.length > 0) blocks.push({ text: joined, isTable: false });
    buffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isTableRow(line)) {
      flushParagraph();
      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({ text: tableLines.join("\n"), isTable: true });
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      i++;
      continue;
    }
    buffer.push(line);
    i++;
  }
  flushParagraph();

  return blocks;
}

// Heuristic sentence split: break after ./!/? followed by whitespace and an
// uppercase/digit start. Good enough for prose chunking, not a full NLP parser.
function splitIntoSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ0-9])/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

// Last-resort split when even one sentence exceeds the target: cut by
// characters, binary-searching for the longest prefix that fits in budget.
function hardCutToFit(text: string, targetTokens: number): string[] {
  const pieces: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (countTokens(remaining) <= targetTokens) {
      pieces.push(remaining);
      break;
    }
    let lo = 1;
    let hi = remaining.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (countTokens(remaining.slice(0, mid)) <= targetTokens) lo = mid;
      else hi = mid - 1;
    }
    pieces.push(remaining.slice(0, lo));
    remaining = remaining.slice(lo);
  }
  return pieces;
}

// Expands a block into leaf units no larger than targetTokens: whole block if
// it already fits, else sentences, else hard-cut pieces. Tables are exempt —
// they stay atomic no matter their size, per "never split mid-table-row".
function expandToUnits(block: { text: string; isTable: boolean }, targetTokens: number): string[] {
  if (block.isTable) return [block.text];
  if (countTokens(block.text) <= targetTokens) return [block.text];

  const sentences = splitIntoSentences(block.text);
  if (sentences.length <= 1) return hardCutToFit(block.text, targetTokens);

  const units: string[] = [];
  for (const sentence of sentences) {
    if (countTokens(sentence) <= targetTokens) {
      units.push(sentence);
    } else {
      units.push(...hardCutToFit(sentence, targetTokens));
    }
  }
  return units;
}

// Overlap is capped at half of the previous chunk's own tokens, so a short
// chunk can never have its entire content duplicated into the next one.
function buildOverlap(prevUnits: string[], prevTokens: number, overlapTokens: number): string {
  const cap = Math.min(overlapTokens, Math.floor(prevTokens / 2));
  if (cap <= 0 || prevUnits.length === 0) return "";

  const picked: string[] = [];
  let tokens = 0;
  for (let i = prevUnits.length - 1; i >= 0; i--) {
    const unit = prevUnits[i];
    const unitTokens = countTokens(unit);
    if (picked.length > 0 && tokens + unitTokens > cap) break;
    picked.unshift(unit);
    tokens += unitTokens;
    if (tokens >= cap) break;
  }
  return picked.join("\n\n");
}

// Packs a section's blocks into token-budgeted chunks. Overlap only ever
// carries between chunks inside the same section — a new section means a new
// heading path, which PLAN.md §5 treats as a clean break with no bleed.
function packSection(
  section: Section,
  targetTokens: number,
  overlapTokens: number,
): { content: string; tokenCount: number }[] {
  const blocks = splitIntoBlocks(section.text);
  const allUnits: { text: string; isTable: boolean }[] = [];
  for (const block of blocks) {
    if (block.isTable) {
      allUnits.push(block);
    } else {
      for (const unit of expandToUnits(block, targetTokens)) {
        allUnits.push({ text: unit, isTable: false });
      }
    }
  }

  const chunks: { content: string; tokenCount: number }[] = [];
  let currentUnits: string[] = [];
  let currentTokens = 0;
  let lastUnitWasTable = false;

  const finalize = () => {
    if (currentUnits.length === 0) return;
    const content = currentUnits.join("\n\n");
    chunks.push({ content, tokenCount: countTokens(content) });
  };

  for (const unit of allUnits) {
    const unitTokens = countTokens(unit.text);
    if (currentUnits.length > 0 && currentTokens + unitTokens > targetTokens) {
      const prevUnits = currentUnits;
      const prevTokens = currentTokens;
      finalize();
      const overlap = lastUnitWasTable ? "" : buildOverlap(prevUnits, prevTokens, overlapTokens);
      currentUnits = overlap ? [overlap] : [];
      currentTokens = overlap ? countTokens(overlap) : 0;
    }
    currentUnits.push(unit.text);
    currentTokens += unitTokens;
    lastUnitWasTable = unit.isTable;
  }
  finalize();

  return chunks;
}

export function chunkMarkdown(
  markdown: string,
  opts?: { targetTokens?: number; overlapTokens?: number },
): Chunk[] {
  const targetTokens = opts?.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapTokens = opts?.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

  const sections = splitIntoSections(markdown);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    for (const piece of packSection(section, targetTokens, overlapTokens)) {
      chunks.push({
        headingPath: section.headingPath,
        content: piece.content,
        chunkIndex: chunkIndex++,
        tokenCount: piece.tokenCount,
        contentHash: hashContent(piece.content),
      });
    }
  }

  return chunks;
}

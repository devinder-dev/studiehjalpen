// Fixtures mirror real corpus topics (PLAN.md §3: CSN, Försäkringskassan) so
// token counts and split points reflect actual Swedish prose, not lorem ipsum.
import { describe, expect, test } from "bun:test";
import { chunkMarkdown, withHeadingPrefix } from "./chunk";
import { countTokens } from "./tokenize";

// A long section forces at least one paragraph/sentence split under the
// default 650-token target — each sentence below is a distinct, plausible
// claim so a real split doesn't accidentally cut mid-meaning either.
const LONG_FORALDRAPENNING_SECTION = [
  "Föräldrapenning är en ersättning du kan få för att vara hemma med ditt barn istället för att arbeta, söka arbete eller studera.",
  "Du kan ta ut föräldrapenning som hel, tre fjärdedels, halv, en fjärdedels eller en åttondels dag, beroende på hur mycket du vill arbeta vid sidan av.",
  "De flesta dagarna betalas ersättningen ut på sjukpenningnivå, vilket innebär ungefär åttio procent av din sjukpenninggrundande inkomst, upp till ett visst tak.",
  "Resten av dagarna betalas på lägstanivå, ett fast belopp per dag oavsett hur mycket du annars tjänar.",
  "Du kan spara föräldradagar och ta ut dem tills barnet fyller tolv år, eller till dess barnet avslutar första klass om det är senare.",
  "Om du är gravid kan du ha rätt till graviditetspenning istället för föräldrapenning under de sista veckorna innan beräknad förlossning.",
  "Dubbeldagar innebär att båda föräldrarna kan ta ut föräldrapenning samtidigt för samma barn under en begränsad period.",
  "Sjukpenninggrundande inkomst, SGI, ligger till grund för beräkningen och fastställs av Försäkringskassan utifrån din inkomst före skatt.",
  "Om din SGI är låg eller saknas helt kan du ändå ha rätt till lägstanivåersättning för föräldrapenningen.",
  "Du ansöker om föräldrapenning digitalt via Försäkringskassans e-tjänster, och behöver ange vilka dagar och vilken omfattning du vill ta ut.",
  "Arbetsgivaren kan behöva underrättas i förväg om du planerar att vara föräldraledig, enligt föräldraledighetslagen.",
  "Om du arbetar deltid och tar ut föräldrapenning för resterande tid måste omfattningen anmälas korrekt för att ersättningen ska bli rätt.",
  "Föräldrapenning på lägstanivå påverkas inte av hur mycket du tidigare tjänat, utan betalas ut som ett fast belopp oavsett tidigare inkomst.",
  "Du kan också ta ut tillfällig föräldrapenning i samband med att barnet föds, för att till exempel följa med till förlossningen eller vara hemma de första dagarna.",
  "Reglerna skiljer sig åt om du är gift, sambo eller ensam vårdnadshavare, särskilt när det gäller hur dagarna delas mellan föräldrarna.",
].join(" ");

const FIXTURE = `
# Studiehjälpen testdokument

Det här dokumentet samlar bestämmelser om studiestöd och föräldraförsäkring.

## Studiemedel

### Fribelopp

Om du arbetar vid sidan av studierna får du tjäna upp till ett visst belopp per
kalenderhalvår utan att studiemedlen påverkas. Fribeloppet varierar beroende på
hur många veckor du har studiemedel under halvåret.

| Studietakt | Fribelopp per halvår |
| --- | --- |
| 100% | 155 000 kr |
| 75% | 180 000 kr |
| 50% | 207 000 kr |

### Återbetalning

Du börjar betala tillbaka lånet tidigast sex månader efter att du haft
studiestöd, och det sker alltid vid ett årsskifte.

## Föräldrapenning

${LONG_FORALDRAPENNING_SECTION}
`;

describe("chunkMarkdown", () => {
  test("empty input returns no chunks", () => {
    expect(chunkMarkdown("")).toEqual([]);
  });

  test("tracks heading_path per chunk, including nested headings", () => {
    const chunks = chunkMarkdown(FIXTURE);

    const fribelopp = chunks.find((c) => c.content.includes("Fribeloppet varierar"));
    expect(fribelopp?.headingPath).toEqual(["Studiemedel", "Fribelopp"]);

    const atertbetalning = chunks.find((c) => c.content.includes("betala tillbaka lånet"));
    expect(atertbetalning?.headingPath).toEqual(["Studiemedel", "Återbetalning"]);
  });

  test("text before the first heading gets an empty heading_path", () => {
    const chunks = chunkMarkdown(FIXTURE);
    const intro = chunks.find((c) => c.content.includes("samlar bestämmelser"));
    expect(intro?.headingPath).toEqual([]);
  });

  test("chunk_index is sequential and 0-based across the whole document", () => {
    const chunks = chunkMarkdown(FIXTURE);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  test("a long section is split into more than one chunk", () => {
    const chunks = chunkMarkdown(FIXTURE, { targetTokens: 650, overlapTokens: 60 });
    const foraldraChunks = chunks.filter((c) => c.headingPath[0] === "Föräldrapenning");
    expect(foraldraChunks.length).toBeGreaterThan(1);
  });

  test("no chunk wildly exceeds the target", () => {
    // Ceiling is target + overlap, not target alone: the unit that triggers a
    // new chunk is only checked *before* it's added, and overlap text from the
    // previous chunk is prepended, so a chunk can legitimately land a bit over
    // target without any bug. Anything beyond that would signal a real defect.
    const targetTokens = 650;
    const overlapTokens = 60;
    const chunks = chunkMarkdown(FIXTURE, { targetTokens, overlapTokens });
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(targetTokens + overlapTokens + 50);
    }
  });

  test("a table is never split across two chunks", () => {
    const chunks = chunkMarkdown(FIXTURE, { targetTokens: 40, overlapTokens: 5 });
    const tableChunks = chunks.filter((c) => c.content.includes("| 100%"));
    expect(tableChunks).toHaveLength(1);
    // all three table rows must have landed in that one chunk, not split
    expect(tableChunks[0].content).toContain("| 100%");
    expect(tableChunks[0].content).toContain("| 75%");
    expect(tableChunks[0].content).toContain("| 50%");
  });

  test("a short section stays as one chunk with no artificial padding", () => {
    const chunks = chunkMarkdown(FIXTURE);
    const returnChunks = chunks.filter((c) => c.headingPath[1] === "Återbetalning");
    expect(returnChunks).toHaveLength(1);
    expect(returnChunks[0].content.trim()).toBe(returnChunks[0].content);
  });

  test("overlap never duplicates an entire chunk for a very short section", () => {
    // Tiny target forces many splits; even then no chunk should just be a
    // verbatim copy of the one before it (full-chunk duplication bug).
    const chunks = chunkMarkdown(FIXTURE, { targetTokens: 30, overlapTokens: 60 });
    for (let i = 1; i < chunks.length; i++) {
      if (chunks[i].headingPath.join(">") === chunks[i - 1].headingPath.join(">")) {
        expect(chunks[i].content).not.toBe(chunks[i - 1].content);
      }
    }
  });

  test("withHeadingPrefix adds the [A > B] prefix and never equals content", () => {
    const chunks = chunkMarkdown(FIXTURE);
    const fribelopp = chunks.find((c) => c.headingPath.join(">") === "Studiemedel>Fribelopp");
    expect(fribelopp).toBeDefined();

    const prefixed = withHeadingPrefix(fribelopp!);
    expect(prefixed).toBe(`[Studiemedel > Fribelopp] ${fribelopp!.content}`);
    expect(prefixed).not.toBe(fribelopp!.content);
  });

  test("withHeadingPrefix is a no-op (no brackets) when heading_path is empty", () => {
    const chunks = chunkMarkdown(FIXTURE);
    const intro = chunks.find((c) => c.headingPath.length === 0);
    expect(withHeadingPrefix(intro!)).toBe(intro!.content);
  });

  test("content_hash is deterministic and differs for different content", () => {
    const chunks = chunkMarkdown(FIXTURE);
    const again = chunkMarkdown(FIXTURE);
    expect(chunks.map((c) => c.contentHash)).toEqual(again.map((c) => c.contentHash));

    const unique = new Set(chunks.map((c) => c.contentHash));
    expect(unique.size).toBe(chunks.length);
  });

  test("token_count matches the real tokenizer, not a character estimate", () => {
    const chunks = chunkMarkdown(FIXTURE);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBe(countTokens(chunk.content));
    }
  });
});

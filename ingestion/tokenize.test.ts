// Values verified against this tokenizer's own output (see DECISIONS.md for
// the live Voyage calibration). No network calls — CI must run offline.
import { describe, expect, test } from "bun:test";
import { countTokens } from "./tokenize";

describe("countTokens", () => {
  test("short string", () => {
    expect(countTokens("fribelopp")).toBe(3);
  });

  test("empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  test("Swedish compound words cost more than a char-length estimate predicts", () => {
    const text =
      "Du kan ansöka om jämkning för att skatten som din utbetalare drar från din inkomst under året ska bli så nära din slutliga skatt som möjligt.";
    const naiveEstimate = text.length / 4;
    const actual = countTokens(text);

    expect(actual).toBe(43);
    expect(actual).toBeGreaterThan(naiveEstimate * 1.1);
  });
});

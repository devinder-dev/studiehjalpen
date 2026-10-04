/**
 * Real BPE token counting for Voyage's voyage-4 model — PLAN.md §5 forbids
 * char-length estimates. Voyage has no tokenize endpoint or JS client, so this
 * loads their published tokenizer files directly from Hugging Face (vendored
 * in vendor/, see docs/DECISIONS.md).
 */
import { Tokenizer } from "@huggingface/tokenizers";

const vendorDir = new URL("../vendor/", import.meta.url);
const tokenizerJson = await Bun.file(new URL("voyage-4-tokenizer.json", vendorDir)).json();
const tokenizerConfig = await Bun.file(new URL("voyage-4-tokenizer_config.json", vendorDir)).json();

export const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);

// Calibrated against 5 live Voyage API calls (2026-10-04, voyage-4, input_type:
// document): this tokenizer's raw count was exactly 1 higher than
// usage.total_tokens every time, across short/long and Swedish/English text.
// Cause unconfirmed — likely a token Voyage's own billing doesn't count — but
// the offset was stable enough to subtract rather than guess a ratio.
const VOYAGE_BILLING_OFFSET = 1;

export function countTokens(text: string): number {
  const raw = tokenizer.encode(text, { add_special_tokens: false }).ids.length;
  return Math.max(0, raw - VOYAGE_BILLING_OFFSET);
}

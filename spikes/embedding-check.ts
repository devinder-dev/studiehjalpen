/**
 * Spike: does the embedding model understand Swedish?
 *
 * Why this exists: the embedding dimension gets baked into the database schema,
 * and changing models later means re-embedding everything. So we test first.
 *
 * No database, no dependencies. Run: bun run spikes/embedding-check.ts
 */

const MODEL = "voyage-4";
const DIMENSION = 1024;

// Replace these with REAL text pasted from csn.se / forsakringskassan.se.
// Fake text gives a fake result — the whole point is testing actual corpus language.
const chunks: string[] = [
  "[Studiemedel > Fribelopp] Om du arbetar vid sidan av studierna får du tjäna upp till ett visst belopp per kalenderhalvår utan att studiemedlen påverkas.",
  "[Studiemedel > Studietakt] Studiemedel betalas ut för heltidsstudier eller deltidsstudier. Din studietakt avgör hur mycket du får.",
  "[Föräldrapenning > Arbeta under ledighet] Du kan arbeta deltid och ta ut föräldrapenning för den tid du är ledig. Du anmäler omfattningen till Försäkringskassan.",
  "[Föräldrapenning > Nivåer] Föräldrapenning kan tas ut som hel, tre fjärdedels, halv, en fjärdedels eller en åttondels dag.",
  "[SGI] Sjukpenninggrundande inkomst är den inkomst som ligger till grund för beräkning av flera ersättningar.",
  "[VAB] Du kan få ersättning för vård av sjukt barn när du avstår från arbete för att ta hand om ditt barn.",
  "[Enskild firma > F-skatt] Du som driver enskild näringsverksamhet ska vara godkänd för F-skatt och betala preliminärskatt.",
  "[Enskild firma > Moms] Du redovisar moms i en momsdeklaration. Hur ofta beror på din omsättning.",
  "[Studielån > Återbetalning] Du börjar betala tillbaka till CSN tidigast sex månader efter att du hade studiestöd och det sker alltid vid ett årsskifte.",
  "[Studielån > Betalningsplan] Det vanliga är att du betalar fyra gånger per år (februari, maj, augusti och november) men du kan själv ändra till att betala varje månad på Mina sidor.",
  "[Studielån > Ränta] Räntan på CSN:s studielån är 2,135 procent för år 2026.",
  "[Studielån > Lägsta belopp] Det lägsta årsbelopp du kan få betala är 8 880 kronor under 2026, och är lånet större än 200 000 kronor är lägsta månadspremien 200 kronor.",
  "[VAB > Antal dagar] Ersättning för vab kan betalas ut i 120 dagar per år för ett barn.",
  "[VAB > Ersättningsnivå] Ersättningen för vab är lite mindre än 80 procent av din vanliga inkomst.",
  "[Skatteverket > Jämkning] Du kan ansöka om jämkning för att skatten som din utbetalare drar från din inkomst under året ska bli så nära din slutliga skatt som möjligt.",
  "[YH > LIA] Lärande i arbete (LIA) innebär att en del av utbildningen är förlagd till en eller flera arbetsplatser, och teori varvas med praktik.",
  "[YH > Andel LIA] All utbildning som leder till en kvalificerad yrkeshögskoleexamen ska innehålla minst 25 procent LIA.",
  "[A-kassa > Arbetsvillkor] För att uppfylla arbetsvillkoret ska du ha arbetat i Sverige och tjänat totalt 120 000 kronor under de senaste 12 månaderna innan du blev arbetslös, och minst 11 000 kronor i fyra av dessa månader.",
  "[A-kassa > Medlemsvillkor] Medlemsvillkoret innebär att du ska ha varit medlem i en a-kassa i minst 12 sammanhängande månader för att ha rätt till inkomstrelaterad ersättning.",
  "[A-kassa > Ersättningstak] Du kan få ersättning från a-kassan i högst 300 dagar, och efter 100 dagar minskar ersättningen med 10 procentenheter.",
];

// Mix of Swedish and English. The English ones test cross-language retrieval:
// the sources are Swedish, so a correct hit proves both languages land in the
// same vector space.
const queries: { text: string; expectChunkIndex: number }[] = [
  { text: "Hur mycket får jag tjäna under studierna?", expectChunkIndex: 0 },
  { text: "Kan jag jobba deltid under föräldraledighet?", expectChunkIndex: 2 },
  { text: "Vad är SGI?", expectChunkIndex: 4 },
  { text: "How much can I earn while studying?", expectChunkIndex: 0 },
  { text: "Can I work part time during parental leave?", expectChunkIndex: 2 },
  { text: "What tax do I pay as a sole trader?", expectChunkIndex: 6 },
  { text: "När börjar jag betala tillbaka mitt studielån?", expectChunkIndex: 8 },
  { text: "When do I start repaying my student loan?", expectChunkIndex: 8 },
  { text: "Hur många dagar kan jag vabba per år?", expectChunkIndex: 12 },
  { text: "How many VAB days do I get per year?", expectChunkIndex: 12 },
  { text: "Vad innebär jämkning av skatten?", expectChunkIndex: 14 },
  { text: "What does tax jämkning mean?", expectChunkIndex: 14 },
  { text: "Vad är LIA inom yrkeshögskolan?", expectChunkIndex: 15 },
  { text: "What is LIA in vocational education?", expectChunkIndex: 15 },
  { text: "Vilket arbetsvillkor krävs för a-kassa?", expectChunkIndex: 17 },
  { text: "What work requirement do I need for unemployment insurance?", expectChunkIndex: 17 },
];

async function embed(texts: string[], inputType: "document" | "query") {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: texts,
      model: MODEL,
      input_type: inputType, // queries and documents are embedded differently
      output_dimension: DIMENSION,
    }),
  });

  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

// Cosine similarity: 1 means identical direction, 0 means unrelated.
function cosine(a: number[], b: number[]) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

const chunkVectors = await embed(chunks, "document");
const queryVectors = await embed(queries.map((q) => q.text), "query");

console.log(`Model: ${MODEL} · dimension returned: ${chunkVectors[0].length}\n`);

let hits = 0;

queries.forEach((query, qi) => {
  const ranked = chunkVectors
    .map((vec, ci) => ({ ci, score: cosine(queryVectors[qi], vec) }))
    .sort((a, b) => b.score - a.score);

  const correct = ranked[0].ci === query.expectChunkIndex;
  if (correct) hits++;

  console.log(`${correct ? "PASS" : "FAIL"}  ${query.text}`);
  ranked.slice(0, 3).forEach((r, rank) => {
    console.log(`   ${rank + 1}. ${r.score.toFixed(3)}  ${chunks[r.ci].slice(0, 70)}...`);
  });
  console.log();
});

console.log(`Top-1 correct: ${hits}/${queries.length}`);
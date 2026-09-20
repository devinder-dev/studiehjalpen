/**
 * Spike: prove the HNSW index works end to end — embed, insert, query, and check
 * that the planner actually uses chunks_embedding_idx.
 *
 * Why this exists: embedding-check.ts ranks with cosine in memory and db-check.ts
 * only inspects the schema, so until now nothing had written a vector into
 * pgvector. Same 20 chunks and same 16 queries as embedding-check.ts, so the
 * ranking coming out of Postgres can be compared against the in-memory result.
 *
 * Throwaway: inserts two "SPIKE:" documents and deletes them again at the end.
 * Costs ~36 Voyage inputs. Run: bun run spikes/vector-search-check.ts
 */

import { SQL } from "bun";

const MODEL = "voyage-4";
const DIMENSION = 1024;

// Real chunks compete against noise so the planner has an actual choice to make.
// At 20 rows a sequential scan is genuinely cheaper and EXPLAIN proves nothing.
const FILLER_ROWS = 2000;

// content is clean body text, heading_path stays separate, and the heading is
// prepended only to what goes to Voyage. content_tsv already indexes
// heading_path || ' ' || content, so baking the prefix into content would give
// heading terms double weight in keyword ranking.
const corpus: { heading: string; body: string }[] = [
  { heading: "Studiemedel > Fribelopp", body: "Om du arbetar vid sidan av studierna får du tjäna upp till ett visst belopp per kalenderhalvår utan att studiemedlen påverkas." },
  { heading: "Studiemedel > Studietakt", body: "Studiemedel betalas ut för heltidsstudier eller deltidsstudier. Din studietakt avgör hur mycket du får." },
  { heading: "Föräldrapenning > Arbeta under ledighet", body: "Du kan arbeta deltid och ta ut föräldrapenning för den tid du är ledig. Du anmäler omfattningen till Försäkringskassan." },
  { heading: "Föräldrapenning > Nivåer", body: "Föräldrapenning kan tas ut som hel, tre fjärdedels, halv, en fjärdedels eller en åttondels dag." },
  { heading: "SGI", body: "Sjukpenninggrundande inkomst är den inkomst som ligger till grund för beräkning av flera ersättningar." },
  { heading: "VAB", body: "Du kan få ersättning för vård av sjukt barn när du avstår från arbete för att ta hand om ditt barn." },
  { heading: "Enskild firma > F-skatt", body: "Du som driver enskild näringsverksamhet ska vara godkänd för F-skatt och betala preliminärskatt." },
  { heading: "Enskild firma > Moms", body: "Du redovisar moms i en momsdeklaration. Hur ofta beror på din omsättning." },
  { heading: "Studielån > Återbetalning", body: "Du börjar betala tillbaka till CSN tidigast sex månader efter att du hade studiestöd och det sker alltid vid ett årsskifte." },
  { heading: "Studielån > Betalningsplan", body: "Det vanliga är att du betalar fyra gånger per år (februari, maj, augusti och november) men du kan själv ändra till att betala varje månad på Mina sidor." },
  { heading: "Studielån > Ränta", body: "Räntan på CSN:s studielån är 2,135 procent för år 2026." },
  { heading: "Studielån > Lägsta belopp", body: "Det lägsta årsbelopp du kan få betala är 8 880 kronor under 2026, och är lånet större än 200 000 kronor är lägsta månadspremien 200 kronor." },
  { heading: "VAB > Antal dagar", body: "Ersättning för vab kan betalas ut i 120 dagar per år för ett barn." },
  { heading: "VAB > Ersättningsnivå", body: "Ersättningen för vab är lite mindre än 80 procent av din vanliga inkomst." },
  { heading: "Skatteverket > Jämkning", body: "Du kan ansöka om jämkning för att skatten som din utbetalare drar från din inkomst under året ska bli så nära din slutliga skatt som möjligt." },
  { heading: "YH > LIA", body: "Lärande i arbete (LIA) innebär att en del av utbildningen är förlagd till en eller flera arbetsplatser, och teori varvas med praktik." },
  { heading: "YH > Andel LIA", body: "All utbildning som leder till en kvalificerad yrkeshögskoleexamen ska innehålla minst 25 procent LIA." },
  { heading: "A-kassa > Arbetsvillkor", body: "För att uppfylla arbetsvillkoret ska du ha arbetat i Sverige och tjänat totalt 120 000 kronor under de senaste 12 månaderna innan du blev arbetslös, och minst 11 000 kronor i fyra av dessa månader." },
  { heading: "A-kassa > Medlemsvillkor", body: "Medlemsvillkoret innebär att du ska ha varit medlem i en a-kassa i minst 12 sammanhängande månader för att ha rätt till inkomstrelaterad ersättning." },
  { heading: "A-kassa > Ersättningstak", body: "Du kan få ersättning från a-kassan i högst 300 dagar, och efter 100 dagar minskar ersättningen med 10 procentenheter." },
];

const queries: { text: string; expect: number }[] = [
  { text: "Hur mycket får jag tjäna under studierna?", expect: 0 },
  { text: "Kan jag jobba deltid under föräldraledighet?", expect: 2 },
  { text: "Vad är SGI?", expect: 4 },
  { text: "How much can I earn while studying?", expect: 0 },
  { text: "Can I work part time during parental leave?", expect: 2 },
  { text: "What tax do I pay as a sole trader?", expect: 6 },
  { text: "När börjar jag betala tillbaka mitt studielån?", expect: 8 },
  { text: "When do I start repaying my student loan?", expect: 8 },
  { text: "Hur många dagar kan jag vabba per år?", expect: 12 },
  { text: "How many VAB days do I get per year?", expect: 12 },
  { text: "Vad innebär jämkning av skatten?", expect: 14 },
  { text: "What does tax jämkning mean?", expect: 14 },
  { text: "Vad är LIA inom yrkeshögskolan?", expect: 15 },
  { text: "What is LIA in vocational education?", expect: 15 },
  { text: "Vilket arbetsvillkor krävs för a-kassa?", expect: 17 },
  { text: "What work requirement do I need for unemployment insurance?", expect: 17 },
];

async function embed(texts: string[], inputType: "document" | "query", attempt = 0): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType, output_dimension: DIMENSION }),
  });
  // Free tier without a payment method is 3 requests/min, so a rerun inside the
  // same minute gets a 429. PLAN.md §9.3.
  if (res.status === 429 && attempt < 4) {
    console.log(`Rate limited, waiting 25s (attempt ${attempt + 1})...`);
    await Bun.sleep(25_000);
    return embed(texts, inputType, attempt + 1);
  }
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

const toVector = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

function randomUnitVector(): number[] {
  const v = Array.from({ length: DIMENSION }, () => Math.random() * 2 - 1);
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / mag);
}

const sha256 = (text: string) => new Bun.CryptoHasher("sha256").update(text).digest("hex");

// Placeholder. PLAN.md §5 requires a real tokenizer; Phase 2 brings one.
const roughTokens = (text: string) => Math.ceil(text.length / 3);

type Row = { content: string; heading: string; idx: number; tokens: number; hash: string; vec: string };

// DATABASE_URL points at Supabase's transaction pooler (6543), which multiplexes
// server connections, so named prepared statements collide across runs.
const sql = new SQL(process.env.DATABASE_URL!, { prepare: false });

// Rows go over as one jsonb parameter: Bun's SQL client serialises a JS array by
// joining it with commas, which Postgres then rejects as a malformed array literal.
async function insertChunks(documentId: string, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const batch = JSON.stringify(rows.slice(i, i + 200));
    await sql`
      insert into chunks (document_id, content, heading_path, chunk_index, token_count, content_hash, embedding)
      select ${documentId}::uuid, r.content, r.heading, r.idx, r.tokens, r.hash, r.vec::vector
      from jsonb_to_recordset(${batch}::jsonb)
        as r(content text, heading text, idx int, tokens int, hash text, vec text)
    `;
  }
}

// A 1024-dimension literal appears inline in the plan and drowns out everything
// worth reading.
const planText = (rows: unknown[]) =>
  rows
    .map((r) => (r as Record<string, string>)["QUERY PLAN"])
    .join("\n")
    .replace(/'\[[-0-9.,e]+\]'::vector/g, "'[...]'::vector");

try {
  await sql`delete from documents where title like 'SPIKE:%'`;

  console.log(`Embedding ${corpus.length} chunks and ${queries.length} queries with ${MODEL}...`);
  const chunkVectors = await embed(corpus.map((c) => `[${c.heading}] ${c.body}`), "document");
  const queryVectors = await embed(queries.map((q) => q.text), "query");
  console.log(`Dimension returned: ${chunkVectors[0].length}\n`);

  const [realDoc] = await sql`
    insert into documents (title, source_type, status, fetched_at)
    values ('SPIKE: swedish corpus', 'upload', 'ready', now()) returning id
  `;
  const [fillerDoc] = await sql`
    insert into documents (title, source_type, status)
    values ('SPIKE: random filler', 'upload', 'ready') returning id
  `;

  await insertChunks(
    realDoc.id,
    corpus.map((c, i) => ({
      content: c.body,
      heading: c.heading,
      idx: i,
      tokens: roughTokens(c.body),
      hash: sha256(c.body),
      vec: toVector(chunkVectors[i]),
    })),
  );

  await insertChunks(
    fillerDoc.id,
    Array.from({ length: FILLER_ROWS }, (_, i) => ({
      content: `filler ${i}`,
      heading: "Filler",
      idx: i,
      tokens: 2,
      hash: sha256(`filler ${i}`),
      vec: toVector(randomUnitVector()),
    })),
  );

  // Without fresh stats the planner works from defaults and the EXPLAIN below
  // would say nothing about how it behaves on a populated table.
  await sql`analyze chunks`;

  const [{ n }] = await sql`select count(*)::int as n from chunks where superseded_at is null`;
  console.log(`Live chunks in table: ${n}\n`);

  let hits = 0;
  for (const [qi, query] of queries.entries()) {
    const qvec = toVector(queryVectors[qi]);
    // superseded_at is null is not optional: chunks_embedding_idx is a partial
    // index and without a matching predicate the planner cannot use it.
    const rows = await sql`
      select heading_path, 1 - (embedding <=> ${qvec}::vector) as similarity
      from chunks
      where superseded_at is null
      order by embedding <=> ${qvec}::vector
      limit 3
    `;
    const correct = rows[0].heading_path === corpus[query.expect].heading;
    if (correct) hits++;
    console.log(`${correct ? "PASS" : "FAIL"}  ${query.text}`);
    rows.forEach((r: { heading_path: string; similarity: number }, rank: number) => {
      console.log(`   ${rank + 1}. ${r.similarity.toFixed(3)}  ${r.heading_path}`);
    });
    console.log();
  }
  console.log(`Top-1 correct from pgvector: ${hits}/${queries.length}\n`);

  const probe = toVector(queryVectors[0]);

  const cosinePlan = planText(await sql`
    explain (analyze, costs off)
    select id from chunks where superseded_at is null
    order by embedding <=> ${probe}::vector limit 3
  `);
  console.log("--- cosine <=> (matches vector_cosine_ops) ---");
  console.log(cosinePlan);
  console.log(cosinePlan.includes("chunks_embedding_idx") ? "\nUSES HNSW INDEX\n" : "\nSEQ SCAN — index not used\n");

  // Negative control: the index is vector_cosine_ops, so L2 cannot use it.
  const l2Plan = planText(await sql`
    explain (analyze, costs off)
    select id from chunks where superseded_at is null
    order by embedding <-> ${probe}::vector limit 3
  `);
  console.log("--- L2 <-> (wrong operator for this index) ---");
  console.log(l2Plan);
  console.log(l2Plan.includes("chunks_embedding_idx") ? "\nunexpected: index used\n" : "\nfalls back to a scan, as expected\n");

  // Same query without the partial-index predicate, to show it is load-bearing.
  const unfilteredPlan = planText(await sql`
    explain (analyze, costs off)
    select id from chunks order by embedding <=> ${probe}::vector limit 3
  `);
  console.log("--- cosine <=> without `where superseded_at is null` ---");
  console.log(unfilteredPlan);
  console.log(unfilteredPlan.includes("chunks_embedding_idx") ? "\nunexpected: index used\n" : "\nfalls back to a scan, as expected\n");
} finally {
  const deleted = await sql`delete from documents where title like 'SPIKE:%' returning id`;
  console.log(`Cleaned up ${deleted.length} spike documents (chunks cascade).`);
  await sql.end();
}

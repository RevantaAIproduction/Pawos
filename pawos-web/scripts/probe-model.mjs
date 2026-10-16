// Diagnostic only: three minimal, non-streaming calls to the model PawOS Web uses, ten seconds
// apart, from wherever this is run. It reads GEMINI_API_KEY from the environment and never prints
// it, or any header that carries it. Nothing is written anywhere; nothing in PawOS is changed.
//
//   node scripts/probe-model.mjs            (with the same environment the web server runs in)
//
// The endpoint, model and request shape are the ones in src/lib/webChat/model.ts.
const MODEL = "gemini-flash-latest";
const URL_ = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY is not set in this environment. Run this with the web server's environment.");
  process.exit(2);
}
const clean = (text) => String(text ?? "").replaceAll(key, "<key>").replace(/\s+/g, " ").slice(0, 300);
const HEADERS = ["x-goog-request-id", "x-request-id", "server", "via", "retry-after", "content-type", "x-envoy-upstream-service-time", "server-timing"];

for (let probe = 1; probe <= 3; probe++) {
  const started = Date.now();
  // The third call sends the setting agent turns use (thinkingLevel "low"): whether the model behind
  // the alias accepts it, and how many reasoning tokens a tiny answer still costs.
  const thinking = probe === 3;
  const line = { probe, utc: new Date(started).toISOString(), model: MODEL, ...(thinking ? { thinkingLevel: "low" } : {}) };
  try {
    const response = await fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the single word: ready" }] }], generationConfig: thinking ? { maxOutputTokens: 256, thinkingConfig: { thinkingLevel: "low" } } : { maxOutputTokens: 16 } }),
      signal: AbortSignal.timeout(30_000),
    });
    line.latencyMs = Date.now() - started;
    line.httpStatus = response.status;
    line.headers = Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)]).filter(([, value]) => value));
    const raw = await response.text();
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // Not JSON: an HTML or plain-text page means a proxy or gateway answered, not the model API.
      line.notJson = clean(raw);
    }
    if (body?.error) {
      const details = body.error.details ?? [];
      line.providerError = { code: body.error.code, status: body.error.status, message: clean(body.error.message), details: details.map((detail) => detail["@type"] ?? "").slice(0, 5) };
      // A delay the provider suggests before trying again (RetryInfo), when it gives one.
      const delay = details.find((detail) => typeof detail?.retryDelay === "string")?.retryDelay;
      if (delay) line.providerError.retryDelay = delay;
    }
    if (body?.candidates) {
      line.answered = true;
      line.finishReason = body.candidates[0]?.finishReason;
      line.modelVersion = body.modelVersion;
      line.responseId = body.responseId;
      line.tokens = body.usageMetadata ? { prompt: body.usageMetadata.promptTokenCount, output: body.usageMetadata.candidatesTokenCount, thoughts: body.usageMetadata.thoughtsTokenCount } : undefined;
    }
  } catch (error) {
    // No HTTP answer at all: a timeout, DNS or connection problem on this machine's side of the call.
    line.latencyMs = Date.now() - started;
    line.noResponse = `${error?.name ?? "Error"}: ${clean(error?.cause?.code ?? error?.message)}`;
  }
  console.log(JSON.stringify(line));
  if (probe < 3) await new Promise((resolve) => setTimeout(resolve, 10_000));
}

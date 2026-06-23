const https = require("https");
const { respond, respondError } = require("./utils");

// ─── Zenmux Configuration ────────────────────────────────────────────────────
// Zenmux is an AI API gateway that supports Anthropic API natively.
// Docs: https://zenmux.ai/docs
// Endpoint: https://zenmux.ai/api/anthropic/v1/messages
const ZENMUX_HOST = "zenmux.ai";
const ZENMUX_PATH = "/api/anthropic/v1/messages";

// ─── Forward Anthropic request directly to Zenmux ────────────────────────────
function forwardToZenmux(anthropicBody, signal) {
  return new Promise((resolve, reject) => {
    const { ZENMUX_API_KEY } = require("./config");

    if (!ZENMUX_API_KEY) {
      return reject(new Error(
        "ZENMUX_API_KEY is not set.\n" +
        "  Add to .env: ZENMUX_API_KEY=sk-ai-v1-..."
      ));
    }

    const payload = JSON.stringify(anthropicBody);

    const req = https.request(
      {
        hostname: ZENMUX_HOST,
        port: 443,
        path: ZENMUX_PATH,
        method: "POST",
        headers: {
          "x-api-key": ZENMUX_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        signal,
      },
      (res) => resolve(res)
    );

    req.on("error", (err) => {
      if (err.name === "AbortError" || signal?.aborted) return;
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

// ─── Zenmux Handler (Anthropic passthrough) ──────────────────────────────────
async function handleZenmuxRequest(body, res, model, ac, isStream) {
  console.log(`  ├ Zenmux Anthropic passthrough`);

  // Estimate input tokens for stats logging
  const msgStr = JSON.stringify(body?.messages || []);
  const estimatedInputTokens = Math.ceil(msgStr.length / 4);

  try {
    const upstream = await forwardToZenmux(body, ac.signal);
    console.log(`  └ Zenmux upstream status=${upstream.statusCode}`);

    if (upstream.statusCode >= 400) {
      const errChunks = [];
      upstream.on("data", (c) => errChunks.push(c));
      upstream.on("end", () => {
        const raw = Buffer.concat(errChunks).toString();
        console.error(`  ✗ Zenmux error: ${raw.slice(0, 300)}`);
        respondError(res, upstream.statusCode, "api_error",
          `Zenmux error: ${raw.slice(0, 500)}`);
      });
      return;
    }

    if (isStream) {
      // Stream Anthropic SSE directly back
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      let inTokens = estimatedInputTokens;
      let outTokens = 0;

      upstream.on("data", (chunk) => {
        if (ac.signal.aborted) return;
        res.write(chunk);

        const text = chunk.toString();
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(trimmed.slice(6));
            if (evt.type === "message_start" && evt.message?.usage) {
              inTokens = evt.message.usage.input_tokens || inTokens;
            }
            if (evt.type === "message_delta" && evt.usage) {
              outTokens = evt.usage.output_tokens || outTokens;
            }
          } catch {}
        }
      });

      upstream.on("end", () => {
        console.log(`  📊 Zenmux usage: in=${inTokens} out=${outTokens}`);
        if (!res.writableEnded) res.end();
      });

      upstream.on("error", (err) => {
        if (err.message === "aborted" || ac.signal.aborted) return;
        console.error(`  ✗ Zenmux stream error: ${err.message}`);
        if (!res.writableEnded) res.end();
      });
    } else {
      const chunks = [];
      upstream.on("data", (c) => chunks.push(c));
      upstream.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const resp = JSON.parse(raw);
          const usage = resp.usage || {};
          console.log(`  📊 Zenmux usage: in=${usage.input_tokens || 0} out=${usage.output_tokens || 0}`);
          respond(res, 200, resp);
        } catch (e) {
          console.error(`  ✗ Zenmux parse error: ${e.message}`);
          respondError(res, 500, "api_error", `Zenmux: ${raw.slice(0, 200)}`);
        }
      });
    }
  } catch (err) {
    if (err.name === "AbortError" || ac.signal.aborted) return;
    console.error(`  ✗ Zenmux error: ${err.message}`);
    respondError(res, 500, "api_error", err.message);
  }
}

// ─── Status ──────────────────────────────────────────────────────────────────
function getZenmuxStatus() {
  const { ZENMUX_API_KEY } = require("./config");
  if (!ZENMUX_API_KEY) return "⚠ Not configured (set ZENMUX_API_KEY in .env)";
  return `✅ Key loaded (${ZENMUX_API_KEY.slice(0, 10)}...${ZENMUX_API_KEY.slice(-4)})`;
}

module.exports = { handleZenmuxRequest, getZenmuxStatus };

const https = require("https");
const crypto = require("crypto");
const { respond, respondError } = require("./utils");

// ─── AeroLink Configuration ──────────────────────────────────────────────────
// AeroLink is an Anthropic API-compatible proxy.
// It accepts native Anthropic /v1/messages format — no conversion needed!
// Docs: https://aerolink.lat (official guide uses ANTHROPIC_BASE_URL)
const AEROLINK_HOST = "capi.aerolink.lat";
const AEROLINK_PATH = "/v1/messages";

// ─── Load deps lazily to avoid circular require ──────────────────────────────
function getConfig() {
  return require("./config");
}

// ─── Forward Anthropic request directly to AeroLink ──────────────────────────
// AeroLink speaks Anthropic API natively, so we just pass through the
// exact same request body with a different API key.
//
function forwardToAerolink(anthropicBody, signal) {
  return new Promise((resolve, reject) => {
    const { AEROLINK_API_KEY } = getConfig();

    if (!AEROLINK_API_KEY) {
      return reject(
        new Error(
          "AEROLINK_API_KEY is not set.\n" +
          "  Add it to .env file: AEROLINK_API_KEY=aero_live_...\n" +
          "  Or set env var: $env:AEROLINK_API_KEY='aero_live_...' (PowerShell)"
        )
      );
    }

    const payload = JSON.stringify(anthropicBody);

    const req = https.request(
      {
        hostname: AEROLINK_HOST,
        port: 443,
        path: AEROLINK_PATH,
        method: "POST",
        headers: {
          Authorization: `Bearer ${AEROLINK_API_KEY}`,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "x-api-key": AEROLINK_API_KEY,  // AeroLink may use this header too
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

// ─── AeroLink Handler ────────────────────────────────────────────────────────
//
// Since AeroLink speaks native Anthropic API, this is a simple passthrough:
//   1. Forward the exact Anthropic body to capi.aerolink.lat/v1/messages
//   2. Pipe the Anthropic SSE response directly back to Claude Code
//
async function handleAerolinkRequest(body, res, model, ac, isStream) {
  console.log(`  ├ AeroLink native passthrough (Anthropic API)`);

  // Estimate input tokens for stats logging
  const msgStr = JSON.stringify(body?.messages || []);
  const toolStr = JSON.stringify(body?.tools || []);
  const sysStr = typeof body?.system === "string" ? body.system : JSON.stringify(body?.system || "");
  const estimatedInputTokens = Math.ceil((msgStr.length + toolStr.length + sysStr.length) / 4);

  try {
    // Forward the SAME Anthropic body to AeroLink
    const upstream = await forwardToAerolink(body, ac.signal);
    console.log(`  └ Aero upstream status=${upstream.statusCode}`);

    // Handle upstream HTTP errors
    if (upstream.statusCode >= 400) {
      const errChunks = [];
      upstream.on("data", (c) => errChunks.push(c));
      upstream.on("end", () => {
        const raw = Buffer.concat(errChunks).toString();
        console.error(`  ✗ Aero error: ${raw.slice(0, 300)}`);
        respondError(res, upstream.statusCode, "api_error",
          `AeroLink error: ${raw.slice(0, 500)}`);
      });
      return;
    }

    // ── Streaming: passthrough Anthropic SSE directly ──────────────────
    if (isStream) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      let inputTokens = estimatedInputTokens;
      let outputTokens = 0;

      upstream.on("data", (chunk) => {
        if (ac.signal.aborted) return;
        const text = chunk.toString();
        res.write(chunk);

        // Parse and track token usage from message_start / message_delta
        const lines = text.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(trimmed.slice(6));
            if (evt.type === "message_start" && evt.message?.usage) {
              inputTokens = evt.message.usage.input_tokens || inputTokens;
            }
            if (evt.type === "message_delta" && evt.usage) {
              outputTokens = evt.usage.output_tokens || outputTokens;
            }
          } catch {}
        }
      });

      upstream.on("end", () => {
        console.log(`  📊 Aero usage: in=${inputTokens} out=${outputTokens}`);
        if (!res.writableEnded) res.end();
      });

      upstream.on("error", (err) => {
        if (err.message === "aborted" || ac.signal.aborted) return;
        console.error(`  ✗ Aero stream error: ${err.message}`);
        if (!res.writableEnded) res.end();
      });

      return;
    }

    // ── Non-streaming: collect and forward ─────────────────────────────
    const chunks = [];
    upstream.on("data", (c) => chunks.push(c));
    upstream.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      try {
        const anthResp = JSON.parse(raw);
        const usage = anthResp.usage || {};
        console.log(`  📊 Aero usage: in=${usage.input_tokens || 0} out=${usage.output_tokens || 0}`);
        respond(res, 200, anthResp);
      } catch (parseErr) {
        console.error(`  ✗ Aero parse error: ${parseErr.message}`);
        respondError(res, 500, "api_error", `AeroLink: ${raw.slice(0, 200)}`);
      }
    });
  } catch (err) {
    if (err.name === "AbortError" || ac.signal.aborted) return;
    console.error(`  ✗ Aero error: ${err.message}`);
    respondError(res, 500, "api_error", err.message);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get AeroLink status for the startup banner.
 */
function getAerolinkStatus() {
  const { AEROLINK_API_KEY } = getConfig();
  if (!AEROLINK_API_KEY) {
    return "⚠ Not configured (set AEROLINK_API_KEY in .env)";
  }
  const masked =
    AEROLINK_API_KEY.slice(0, 14) + "..." + AEROLINK_API_KEY.slice(-4);
  return `✅ Key loaded (${masked})`;
}

module.exports = {
  forwardToAerolink,
  handleAerolinkRequest,
  getAerolinkStatus,
};

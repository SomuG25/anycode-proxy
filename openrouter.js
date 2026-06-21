const https = require("https");
const crypto = require("crypto");

// ─── OpenRouter Configuration ─────────────────────────────────────────────────
const OPENROUTER_HOST = "openrouter.ai";
const OPENROUTER_PATH = "/api/v1/chat/completions";

// ─── Load deps lazily to avoid circular require ──────────────────────────────
function getConfig() {
  return require("./config");
}

// ─── Anthropic → OpenAI Tool Conversion ──────────────────────────────────────

/**
 * Convert Anthropic tools array to OpenAI function-calling format.
 * Handles both regular tools and Anthropic built-in tools (web_search, text_editor, etc.)
 */
function convertToolsToOpenAI(tools) {
  if (!tools || tools.length === 0) return [];
  const { ANTHROPIC_BUILTIN_TOOLS } = getConfig();
  const result = [];

  for (const t of tools) {
    // Built-in Anthropic tool (has `type` like "web_search_20250305")
    if (t.type && ANTHROPIC_BUILTIN_TOOLS[t.type]) {
      const schema = ANTHROPIC_BUILTIN_TOOLS[t.type];
      result.push({
        type: "function",
        function: {
          name: schema.name,
          description: schema.description,
          parameters: schema.input_schema,
        },
      });
      continue;
    }

    // Unknown built-in type without schema — skip
    if (t.type && !t.input_schema && !t.inputSchema) continue;

    // Regular tool
    const schema = t.input_schema || t.inputSchema || { type: "object", properties: {} };
    result.push({
      type: "function",
      function: {
        name: t.name,
        description: t.description || "",
        parameters: schema,
      },
    });
  }

  return result;
}

// ─── Tool Result Content Extraction ──────────────────────────────────────────

function extractToolResultText(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (c.type === "text") return c.text || "";
        return JSON.stringify(c);
      })
      .join("\n");
  }
  return JSON.stringify(content);
}

// ─── Request Conversion: Anthropic /v1/messages → OpenAI Chat Completions ────

/**
 * Convert an Anthropic /v1/messages request body to OpenAI Chat Completions format.
 *
 * KEY DIFFERENCES:
 *   Anthropic                          →  OpenAI
 *   ─────────────────────────────────────────────────────────────────────────
 *   system: "..."  (top-level)         →  messages[0] = { role:"system", content:"..." }
 *   role:"user" + tool_result blocks   →  role:"tool" messages with tool_call_id
 *   role:"assistant" + tool_use blocks →  tool_calls:[{id,type:"function",function:{...}}]
 *   tools[].input_schema               →  tools[].function.parameters
 *   thinking blocks                    →  (skipped — no OpenAI equivalent)
 */
function convertAnthropicToOpenAI(body, openrouterModelId) {
  const messages = [];

  // ── 1. System prompt → messages[0] ──────────────────────────────────────
  if (body.system) {
    const sysText =
      typeof body.system === "string"
        ? body.system
        : Array.isArray(body.system)
          ? body.system.map((b) => b.text || "").join("\n")
          : "";
    if (sysText.trim()) {
      messages.push({ role: "system", content: sysText });
    }
  }

  // ── 2. Convert messages ──────────────────────────────────────────────────
  for (const msg of body.messages || []) {
    const role = msg.role;
    const content = msg.content;

    // ── User / System messages ──────────────────────────────────────────
    if (role === "user" || role === "system") {
      // Simple string content
      if (typeof content === "string") {
        messages.push({ role: "user", content });
        continue;
      }

      // Non-array content
      if (!Array.isArray(content)) {
        messages.push({ role: "user", content: JSON.stringify(content) });
        continue;
      }

      // Array content — split tool_results → role:"tool", text → role:"user"
      const toolResults = [];
      const textParts = [];

      for (const block of content) {
        switch (block.type) {
          case "tool_result":
            toolResults.push({
              role: "tool",
              tool_call_id: block.tool_use_id,
              content: extractToolResultText(block.content),
            });
            break;
          case "text":
            if (block.text) textParts.push(block.text);
            break;
          case "image":
            textParts.push("[Image]");
            break;
          // Skip server_tool_use, web_search_tool_result, etc.
        }
      }

      // Tool results must come before user text
      for (const tr of toolResults) messages.push(tr);
      if (textParts.length > 0) {
        messages.push({ role: "user", content: textParts.join("\n") });
      }
      continue;
    }

    // ── Assistant messages ──────────────────────────────────────────────
    if (role === "assistant") {
      // Simple string content
      if (typeof content === "string") {
        messages.push({ role: "assistant", content });
        continue;
      }

      // Non-array content
      if (!Array.isArray(content)) {
        messages.push({ role: "assistant", content: JSON.stringify(content) });
        continue;
      }

      // Array content — collect text and tool_use blocks
      const textParts = [];
      const toolCalls = [];

      for (const block of content) {
        switch (block.type) {
          case "text":
            if (block.text) textParts.push(block.text);
            break;
          case "thinking":
            // Skip — no OpenAI equivalent
            break;
          case "tool_use":
            toolCalls.push({
              id: block.id || `call_${crypto.randomUUID().slice(0, 16)}`,
              type: "function",
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input || {}),
              },
            });
            break;
          // Skip server_tool_use, web_search_tool_result, etc.
        }
      }

      const outMsg = { role: "assistant" };
      outMsg.content = textParts.length > 0 ? textParts.join("") : null;
      if (toolCalls.length > 0) outMsg.tool_calls = toolCalls;

      // Only push if there's something meaningful
      if (outMsg.content !== null || toolCalls.length > 0) {
        messages.push(outMsg);
      }
      continue;
    }
  }

  // ── 3. Convert tools ─────────────────────────────────────────────────────
  const tools = convertToolsToOpenAI(body.tools || []);

  // ── 4. Build final OpenAI request body ───────────────────────────────────
  const openaiBody = {
    model: openrouterModelId,
    messages,
    max_tokens: body.max_tokens || 8192,
    stream: true,
  };

  if (tools.length > 0) {
    openaiBody.tools = tools;
    openaiBody.tool_choice = "auto";
  }

  if (body.temperature !== undefined) {
    openaiBody.temperature = body.temperature;
  }

  return openaiBody;
}

// ─── Forward Request to OpenRouter ───────────────────────────────────────────

/**
 * Send an OpenAI-format request to OpenRouter's chat completions endpoint.
 * Returns the raw Node.js IncomingMessage (upstream response stream).
 */
function forwardToOpenRouter(openaiBody, signal) {
  return new Promise((resolve, reject) => {
    const { OPENROUTER_API_KEY } = getConfig();

    if (!OPENROUTER_API_KEY) {
      return reject(
        new Error(
          "OPENROUTER_API_KEY is not set.\n" +
          "  Add it to .env file: OPENROUTER_API_KEY=sk-or-v1-...\n" +
          "  Or set env var: $env:OPENROUTER_API_KEY='sk-or-v1-...' (PowerShell)"
        )
      );
    }

    const payload = JSON.stringify(openaiBody);

    const req = https.request(
      {
        hostname: OPENROUTER_HOST,
        port: 443,
        path: OPENROUTER_PATH,
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:4141",
          "X-Title": "anycode-proxy",
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

// ─── OpenAI SSE → Anthropic SSE Stream Converter ─────────────────────────────
//
// OpenRouter returns OpenAI-style SSE:
//   data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}
//   data: {"choices":[{"delta":{"tool_calls":[{...}]},"finish_reason":null}]}
//   data: {"choices":[{"delta":{},"finish_reason":"stop"}]}
//   data: [DONE]
//
// Claude Code expects Anthropic SSE:
//   event: message_start       data: {...}
//   event: content_block_start data: {...}
//   event: content_block_delta data: {...}
//   event: content_block_stop  data: {...}
//   event: message_delta       data: {...}
//   event: message_stop        data: {...}
//

class OpenAIToAnthropicStreamConverter {
  constructor(model, res, estimatedInputTokens = 0, providerLabel = "OR") {
    this.model = model;
    this.res = res;
    this.providerLabel = providerLabel;
    this.started = false;
    this.contentIndex = -1;
    this.textBlockOpen = false;
    this.estimatedInputTokens = estimatedInputTokens;
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.buffer = "";
    this.hasTextContent = false;
    // Tool call accumulation: Map<oai_index, {id, name, args, blockIdx, closed}>
    this.toolCallMap = new Map();
    this.finishEmitted = false;
  }

  // ── Anthropic SSE writer ────────────────────────────────────────────────

  writeEvent(event) {
    if (this.res.writableEnded || this.res.destroyed) return;
    try {
      this.res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    } catch {
      // Client disconnected — ignore
    }
  }

  // ── Stream lifecycle ────────────────────────────────────────────────────

  ensureStarted() {
    if (this.started) return;
    this.started = true;
    this.writeEvent({
      type: "message_start",
      message: {
        id: `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        type: "message",
        role: "assistant",
        content: [],
        model: this.model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: this.estimatedInputTokens, output_tokens: 0 },
      },
    });
  }

  openTextBlock() {
    if (this.textBlockOpen) return;
    this.ensureStarted();
    this.contentIndex++;
    this.textBlockOpen = true;
    this.writeEvent({
      type: "content_block_start",
      index: this.contentIndex,
      content_block: { type: "text", text: "" },
    });
  }

  closeTextBlock() {
    if (!this.textBlockOpen) return;
    this.writeEvent({ type: "content_block_stop", index: this.contentIndex });
    this.textBlockOpen = false;
  }

  // ── Event handlers ──────────────────────────────────────────────────────

  handleTextDelta(text) {
    if (!text) return;
    this.openTextBlock();
    this.hasTextContent = true;
    this.writeEvent({
      type: "content_block_delta",
      index: this.contentIndex,
      delta: { type: "text_delta", text },
    });
  }

  /**
   * Handle an OpenAI tool_calls delta fragment.
   * OpenAI streams tool calls across multiple chunks:
   *   Chunk 1: { index:0, id:"call_abc", type:"function", function:{name:"fn", arguments:""} }
   *   Chunk 2+: { index:0, id:null, function:{arguments:"{\"x\""} }
   *   ...more argument fragments...
   */
  handleToolCallDelta(tc) {
    this.ensureStarted();

    if (!this.toolCallMap.has(tc.index)) {
      // First chunk for this tool call — open a new tool_use block
      this.closeTextBlock();
      this.contentIndex++;
      const blockIdx = this.contentIndex;
      const callId = tc.id || `call_${crypto.randomUUID().slice(0, 16)}`;
      const callName = tc.function?.name || "";

      this.toolCallMap.set(tc.index, {
        id: callId,
        name: callName,
        args: "",
        blockIdx,
        closed: false,
      });

      this.writeEvent({
        type: "content_block_start",
        index: blockIdx,
        content_block: {
          type: "tool_use",
          id: callId,
          name: callName,
          input: {},
        },
      });
    }

    const state = this.toolCallMap.get(tc.index);
    const argFragment = tc.function?.arguments || "";

    if (argFragment) {
      state.args += argFragment;
      this.writeEvent({
        type: "content_block_delta",
        index: state.blockIdx,
        delta: { type: "input_json_delta", partial_json: argFragment },
      });
    }
  }

  handleFinish(finishReason, usage) {
    if (this.finishEmitted) return;
    this.finishEmitted = true;

    // Close any open text block
    this.closeTextBlock();

    // Close all open tool_use blocks (stop events)
    for (const [, state] of this.toolCallMap) {
      if (!state.closed) {
        state.closed = true;
        this.writeEvent({ type: "content_block_stop", index: state.blockIdx });
      }
    }

    // If nothing was ever emitted, send a minimal empty response
    if (!this.started) {
      this.ensureStarted();
      this.openTextBlock();
      this.closeTextBlock();
    }

    // Extract token usage (OpenAI uses prompt_tokens / completion_tokens)
    this.inputTokens = usage?.prompt_tokens || this.estimatedInputTokens;
    this.outputTokens = usage?.completion_tokens || 0;

    console.log(`  📊 ${this.providerLabel} usage: in=${this.inputTokens} out=${this.outputTokens}`);

    // Map OpenAI finish reason → Anthropic stop reason
    const stopReason =
      finishReason === "tool_calls" ? "tool_use"
      : finishReason === "length" ? "max_tokens"
      : "end_turn";

    this.writeEvent({
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { input_tokens: this.inputTokens, output_tokens: this.outputTokens },
    });
    this.writeEvent({ type: "message_stop" });
  }

  // ── Chunk / line processing ─────────────────────────────────────────────

  processLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    // SSE comment lines (e.g., ": OPENROUTER PROCESSING") — ignore
    if (trimmed.startsWith(":")) return;

    // Must be a data line
    if (!trimmed.startsWith("data: ")) return;

    const data = trimmed.slice(6);

    // End sentinel
    if (data === "[DONE]") {
      if (!this.finishEmitted) {
        this.handleFinish("stop", null);
      }
      return;
    }

    // Parse JSON
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return; // Skip malformed lines
    }

    const choice = json.choices?.[0];
    if (!choice) return;

    const delta = choice.delta || {};

    // Text content
    if (delta.content) {
      this.handleTextDelta(delta.content);
    }

    // Tool call fragments (accumulate per tc.index)
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        this.handleToolCallDelta(tc);
      }
    }

    // Usage data (sometimes in last pre-DONE chunk)
    if (json.usage) {
      this.inputTokens = json.usage.prompt_tokens || this.inputTokens;
      this.outputTokens = json.usage.completion_tokens || this.outputTokens;
    }

    // Finish reason (can appear alongside the last delta)
    if (choice.finish_reason && choice.finish_reason !== null) {
      this.handleFinish(choice.finish_reason, json.usage || null);
    }
  }

  processChunk(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      this.processLine(line);
    }
  }

  flush() {
    // Process any remaining buffered data
    if (this.buffer.trim()) {
      this.processLine(this.buffer);
      this.buffer = "";
    }

    // Ensure we always emit a complete Anthropic response
    if (!this.finishEmitted) {
      this.handleFinish("stop", null);
    }
  }
}

// ─── OpenRouter Status ────────────────────────────────────────────────────────

function getOpenRouterStatus() {
  const { OPENROUTER_API_KEY } = getConfig();
  if (!OPENROUTER_API_KEY) {
    return "⚠ Not configured (set OPENROUTER_API_KEY in .env)";
  }
  const masked =
    OPENROUTER_API_KEY.slice(0, 14) + "..." + OPENROUTER_API_KEY.slice(-4);
  return `✅ Key loaded (${masked})`;
}

module.exports = {
  convertAnthropicToOpenAI,
  forwardToOpenRouter,
  OpenAIToAnthropicStreamConverter,
  getOpenRouterStatus,
};

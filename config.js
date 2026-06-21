const fs = require("fs");
const path = require("path");

// ─── Load .env file (no external deps needed) ─────────────────────────────────
// Reads .env from the project root and sets process.env for any key not already set.
// This runs before anything else so OPENROUTER_API_KEY is available immediately.
function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      // Strip optional surrounding quotes from value
      const val = trimmed.slice(eq + 1).trim().replace(/^"|"$|^'|'$/g, "");
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env file doesn't exist — that's fine, use env vars directly
  }
}
loadDotEnv();

// ─── Constants ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "4141", 10);
const CMD_BASE = "api.commandcode.ai";
const ALPHA_ENDPOINT = "/alpha/generate";

// ─── OpenRouter Configuration ─────────────────────────────────────────────────
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || null;

// ─── AeroLink Configuration ─────────────────────────────────────────────────
const AEROLINK_API_KEY = process.env.AEROLINK_API_KEY || null;

// ─── Load auth from Command Code's CLI auth file ─────────────────────────────
function loadAuth() {
  const authPath = path.join(
    process.env.USERPROFILE || process.env.HOME,
    ".commandcode",
    "auth.json"
  );
  try {
    const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
    return auth;
  } catch {
    console.error("⚠ Could not read ~/.commandcode/auth.json");
    console.error("  Make sure you're logged in: npx command-code");
    process.exit(1);
  }
}

// ─── Detect CLI version for headers ──────────────────────────────────────────
function getCliVersion() {
  try {
    const pkgPath = path.join(
      process.env.APPDATA || "",
      "npm/node_modules/command-code/package.json"
    );
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.version || "0.27.0";
  } catch {
    return "0.27.0";
  }
}

// ─── Model Registry ───────────────────────────────────────────────────────────
//
// provider values:
//   "deepseek" | "moonshot" | "qwen" | etc.  → Command Code backend (free)
//   "openrouter"                              → OpenRouter backend (your API key)
//
// openrouterId: the exact model slug to send to OpenRouter (anthropic/xxx format)
//
const ALL_MODELS = [
  // ══ COMMAND CODE BACKEND (free $1/mo Go plan) ══════════════════════════════

  // ── Execution Engine — DeepSeek (recommended for execution terminals) ───
  { id: "deepseek/deepseek-v4-pro",   name: "DeepSeek V4 Pro",   provider: "deepseek", plan: "go" },
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "deepseek", plan: "go" },

  // ── Other free models ───────────────────────────────────────────────────
  // Moonshot / Kimi
  { id: "moonshotai/kimi-k2.7-code", name: "Kimi K2.7 Code", provider: "moonshot", plan: "go" },
  { id: "moonshotai/kimi-k2.6",      name: "Kimi K2.6",      provider: "moonshot", plan: "go" },
  { id: "moonshotai/kimi-k2.5",      name: "Kimi K2.5",      provider: "moonshot", plan: "go" },
  // GLM
  { id: "glm-5.1", name: "GLM-5.1", provider: "zhipu", plan: "go" },
  { id: "glm-5",   name: "GLM-5",   provider: "zhipu", plan: "go" },
  // MiniMax
  { id: "minimax-m3",  name: "MiniMax M3",  provider: "minimax", plan: "go" },
  { id: "minimax-m2.7",name: "MiniMax M2.7",provider: "minimax", plan: "go" },
  { id: "minimax-m2.5",name: "MiniMax M2.5",provider: "minimax", plan: "go" },
  // Qwen
  { id: "qwen-3.7-max",         name: "Qwen 3.7 Max",         provider: "qwen", plan: "go" },
  { id: "qwen-3.6-max-preview", name: "Qwen 3.6 Max Preview", provider: "qwen", plan: "go" },
  { id: "qwen-3.6-plus",        name: "Qwen 3.6 Plus",        provider: "qwen", plan: "go" },
  // StepFun
  { id: "step-3.5-flash", name: "Step 3.5 Flash", provider: "stepfun", plan: "go" },

  // ══ AEROLINK BACKEND (DEFAULT for Claude — your API key, cheaper) ════════
  //
  // All Claude models here route through AeroLink, NOT OpenRouter.
  // AeroLink is Anthropic API-compatible — model names passthrough directly.
  // Set AEROLINK_API_KEY in .env.
  //

  // Opus 4.8 — 1M context (native), via AeroLink
  { id: "claude-opus-4-8", name: "Claude Opus 4.8 [Aero] 1M", provider: "aerolink", plan: "aerolink" },

  // Sonnet 4.6 — for routine tasks, via AeroLink
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 [Aero]", provider: "aerolink", plan: "aerolink" },

  // Sonnet 4.6 — extended 1M via AeroLink
  { id: "claude-sonnet-4-6-extended", name: "Claude Sonnet 4.6 [Aero] 1M", provider: "aerolink", plan: "aerolink" },

  // Haiku 4.5 — via AeroLink (real model, not troll mode)
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 [Aero]", provider: "aerolink", plan: "aerolink" },

  // Fable 5 — via AeroLink
  { id: "claude-fable-5", name: "Claude Fable 5 [Aero]", provider: "aerolink", plan: "aerolink" },

  // ══ OPENROUTER BACKEND (fallback only — more expensive) ═══════════════════
  // Prefix with "or-" or use the opus-or / sonnet-or aliases to access these.
  // NOT shown in the model picker unless explicitly selected.

  { id: "or-claude-opus-4-8",   name: "CLAUDE OPUS 4.8 [OR] 1M (FALLBACK)", provider: "openrouter", plan: "openrouter",
    openrouterId: "anthropic/claude-opus-4-8" },
  { id: "or-claude-sonnet-4-6", name: "CLAUDE SONNET 4.6 [OR] (FALLBACK)",   provider: "openrouter", plan: "openrouter",
    openrouterId: "anthropic/claude-sonnet-4-6" },
  { id: "or-claude-sonnet-4-6-extended", name: "CLAUDE SONNET 4.6 [OR] 1M (FALLBACK)", provider: "openrouter", plan: "openrouter",
    openrouterId: "anthropic/claude-sonnet-4-6:extended" },

  // ── Command Code Pro models (if you have Pro plan) ──────────────────────
  { id: "claude-opus-4-7",   name: "Claude Opus 4.7",   provider: "anthropic", plan: "pro" },
  { id: "claude-opus-4-6",   name: "Claude Opus 4.6",   provider: "anthropic", plan: "pro" },
  { id: "claude-fable-5",    name: "Claude Fable 5",    provider: "anthropic", plan: "pro" },
  // Haiku — routes to the infinite troll loop (fake agent impersonation)
  { id: "claude-haiku", name: "Claude Haiku [TROLL MODE]", provider: "troll", plan: "troll" },
  // OpenAI
  { id: "gpt-5.5",       name: "GPT-5.5",       provider: "openai", plan: "pro" },
  { id: "gpt-5.4",       name: "GPT-5.4",       provider: "openai", plan: "pro" },
  { id: "gpt-5.3-codex", name: "GPT-5.3 Codex", provider: "openai", plan: "pro" },
  { id: "gpt-5.4-mini",  name: "GPT-5.4 Mini",  provider: "openai", plan: "pro" },
  // Google
  { id: "google/gemini-3.5-flash",    name: "Gemini 3.5 Flash",    provider: "google", plan: "pro" },
  { id: "google/gemini-3.1-flash-lite",name: "Gemini 3.1 Flash Lite",provider: "google", plan: "pro" },
];

// ─── Model Aliases ────────────────────────────────────────────────────────────
// Short names you can use with: claude --model "sonnet"
// Maps alias → canonical model ID in ALL_MODELS
const MODEL_ALIASES = {
  // Planning models (OpenRouter)
  // ── AeroLink-backed (DEFAULT for Claude — cheaper) ────────────────────
  "sonnet":          "claude-sonnet-4-6",
  "sonnet-1m":       "claude-sonnet-4-6-extended",
  "sonnet-extended": "claude-sonnet-4-6-extended",
  "opus":            "claude-opus-4-8",
  "opus-1m":         "claude-opus-4-8",
  "haiku":           "claude-haiku-4-5",
  "claude-sonnet":   "claude-sonnet-4-6",
  "claude-opus":     "claude-opus-4-8",
  "claude-haiku":    "claude-haiku-4-5",
  "claude-fable":    "claude-fable-5",
  // ── OpenRouter-backed (fallback — more expensive) ──────────────────────
  "sonnet-or":       "or-claude-sonnet-4-6",
  "sonnet-or-1m":    "or-claude-sonnet-4-6-extended",
  "opus-or":         "or-claude-opus-4-8",
  // Execution model (Command Code, free)
  "deepseek":        "deepseek/deepseek-v4-pro",
  "ds":              "deepseek/deepseek-v4-pro",
  "kimi":            "moonshotai/kimi-k2.6",
  "qwen":            "qwen-3.7-max",
};

// ─── Anthropic built-in tool schemas ─────────────────────────────────────────
// Claude Code sends these as special tools with a `type` field but no
// `input_schema`. We convert them to regular tools so the model can call them,
// then Claude Code handles execution locally.
const ANTHROPIC_BUILTIN_TOOLS = {
  web_search_20250305: {
    name: "web_search",
    description: "Search the web for current information. Returns relevant search results.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  web_fetch_20250910: {
    name: "web_fetch",
    description: "Fetch content from a URL. Returns the page content as text.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch" },
      },
      required: ["url"],
    },
  },
  text_editor_20250429: {
    name: "text_editor",
    description: "View, create, or edit files. Supports view, create, str_replace, and insert commands.",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["view", "create", "str_replace", "insert"], description: "The command to run" },
        path: { type: "string", description: "Absolute path to the file" },
        file_text: { type: "string", description: "File content for create command" },
        old_str: { type: "string", description: "String to replace (for str_replace)" },
        new_str: { type: "string", description: "Replacement string (for str_replace or insert)" },
        insert_line: { type: "integer", description: "Line number for insert command" },
        view_range: { type: "array", items: { type: "integer" }, description: "Line range [start, end] for view" },
      },
      required: ["command", "path"],
    },
  },
  code_execution_20250522: {
    name: "code_execution",
    description: "Execute code in a sandboxed environment.",
    input_schema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Code to execute" },
        language: { type: "string", description: "Programming language" },
      },
      required: ["code"],
    },
  },
};

// ─── Export ───────────────────────────────────────────────────────────────────
const AUTH = loadAuth();
const CLI_VERSION = getCliVersion();

module.exports = {
  PORT,
  CMD_BASE,
  ALPHA_ENDPOINT,
  AUTH,
  CLI_VERSION,
  ALL_MODELS,
  MODEL_ALIASES,
  ANTHROPIC_BUILTIN_TOOLS,
  OPENROUTER_API_KEY,
  AEROLINK_API_KEY,
};

<div align="center">

# AnyCode Proxy

### Use Claude Opus + DeepSeek + 20+ models — all from Claude Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?logo=node.js&logoColor=white)](https://nodejs.org)

A lightweight proxy that sits between **Claude Code** and multiple AI backends, letting you use **Claude Opus 4.8** (via AeroLink), **DeepSeek V4 Pro** (free via Command Code), and 20+ other models — all through Claude Code's familiar interface.

</div>

---

## ✨ Features

| Feature | Description |
|:---|:---|
| **🟣 Claude Opus 4.8** | Via AeroLink — cheap per-week pricing (~$7/wk) |
| **🟢 DeepSeek V4 Pro** | Via Command Code — free ($1/mo Go plan) |
| **🤖 20+ Models** | GPT, Gemini, Qwen, Kimi, GLM, MiniMax, and more |
| **🔍 Web Search** | Built-in DuckDuckGo + optional SearXNG (70+ engines) |
| **⚡ Streaming** | Real-time SSE streaming for fast responses |
| **🛠️ Full Tool Support** | File editing, code execution, web fetch — everything works |
| **💰 AeroLink-Only** | No expensive OpenRouter. All Claude models route through AeroLink. |
| **🔄 Auto-Protect** | Background tasks auto-reroute to free DeepSeek — saves your credits |

---

## 🏗️ Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│              │       │                  │       │                  │
│  Claude Code │──────→│  AnyCode Proxy   │──────→│  capi.aerolink   │
│   (CLI)      │←──────│    :4141         │←──────│  .lat (Anthropic │
│              │       │                  │       │   API native)    │
└──────────────┘       │                  │       └──────────────────┘
                       │  Routes by model │       ┌──────────────────┐
                       │                  │──────→│  api.commandcode │
                       │                  │←──────│  .ai (free)      │
                       └──────────────────┘       └──────────────────┘
```

**Key insight:** AeroLink speaks **native Anthropic API** — no format conversion needed. Claude Code talks to AeroLink directly through the proxy. DeepSeek and other free models use Command Code's Alpha format (converted automatically).

---

## 🚀 Quick Start (5 minutes)

### Prerequisites
- **[Node.js](https://nodejs.org/)** v18+ (check with `node --version`)
- A **Claude Code** install: `npm install -g @anthropic-ai/claude-code`
- A **Command Code** account (free): `npm install -g command-code` then `npx command-code` to login

### Step 1 — Clone & Install

```bash
# Clone the repo
git clone https://github.com/SomuG25/anycode-proxy.git
cd anycode-proxy

# No npm install needed — pure Node.js, zero dependencies!
```

### Step 2 — Set up your API key

Create a `.env` file in the project folder (or rename `.env.example`):

```env
# ─── AeroLink API Key (for Claude models) ──────────────────────
# Get your key from: https://aerolink.lat
AEROLINK_API_KEY=aero_live_your-key-here
```

### Step 3 — Point Claude Code to the Proxy

```bash
claude config set --global apiBaseUrl http://localhost:4141
claude config set --global apiKey "sk-proxy"
```

> **For Windows PowerShell:** Run the above commands in **Command Prompt (cmd.exe)**, not PowerShell, to avoid encoding issues with Claude Code config.

### Step 4 — Start the Proxy

```bash
node index.js
```

You'll see:

```
╔══════════════════════════════════════════════════════════╗
║  ⚡ AnyCode Proxy on http://localhost:4141               ║
╠══════════════════════════════════════════════════════════╣
║  🟣 Claude models  ──→ AeroLink (your API key)          ║
║  🟢 DeepSeek/Qwen  ──→ Command Code (free $1/mo plan)   ║
║  🔄 Subagents/bg   ──→ Always DeepSeek (free)           ║
╚══════════════════════════════════════════════════════════╝

  User:         yourname
  AeroLink:     ✅ Key loaded (aero_live_abcd...wxyz)
  Search:       DuckDuckGo (no setup needed)
```

### Step 5 — Use It!

Open a **new terminal** and run:

```bash
# 🟣 Claude Opus 4.8 (via AeroLink — paid, powerful)
claude --model opus --dangerously-skip-permissions

# 🟢 DeepSeek V4 Pro (free via Command Code — fast)
claude --model deepseek --dangerously-skip-permissions
```

> The `--dangerously-skip-permissions` flag skips the permission prompt. Safe to use with this proxy.

---

## 🐳 Docker Setup (Optional but Recommended)

Docker lets you run the proxy + SearXNG search engine together without installing Node.js directly.

### Prerequisites
- Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) or Docker Engine (Linux)
- Install [Command Code CLI](https://commandcode.ai) and login: `npm install -g command-code && npx command-code`

### Step 1 — Set up .env

Create `.env` in the project folder:

```env
AEROLINK_API_KEY=aero_live_your-key-here
```

### Step 2 — Start with Docker Compose

```bash
docker-compose up -d
```

This starts:
- **AnyCode Proxy** on `http://localhost:4141`
- **SearXNG** (web search) on `http://localhost:8080`

### Step 3 — Point Claude Code

```bash
claude config set --global apiBaseUrl http://localhost:4141
claude config set --global apiKey "sk-proxy"
```

### Step 4 — Use it

```bash
claude --model opus --dangerously-skip-permissions
```

### Docker-only (without SearXNG)

```bash
docker build -t anycode-proxy .
docker run -d -p 4141:4141 \
  -v ~/.commandcode:/root/.commandcode \
  -e AEROLINK_API_KEY=aero_live_your-key-here \
  anycode-proxy
```

---

## 🤖 Available Models

### 🟣 AeroLink (Claude — your API key)
| Model ID | Description |
|:---|:---|
| `claude-opus-4-8` | Claude Opus 4.8 — best for complex tasks (1M context) |
| `claude-sonnet-4-6` | Claude Sonnet 4.6 — efficient for routine tasks |
| `claude-sonnet-4-6-extended` | Sonnet 4.6 with 1M context window |
| `claude-fable-5` | Claude Fable 5 — newest Claude model |

### 🟢 Command Code — Free ($1/mo Go plan)
| Model ID | Description |
|:---|:---|
| `deepseek/deepseek-v4-pro` | DeepSeek V4 Pro (default for execution) |
| `deepseek/deepseek-v4-flash` | DeepSeek V4 Flash (faster, lighter) |
| `moonshotai/kimi-k2.7-code` | Kimi K2.7 Code |
| `qwen-3.7-max` | Qwen 3.7 Max |
| `glm-5.1` | GLM-5.1 |
| `minimax-m3` | MiniMax M3 |
| `step-3.5-flash` | Step 3.5 Flash |

### Short Aliases
| Alias | Routes To |
|:---|:---|
| `opus` | `claude-opus-4-8` (→ AeroLink) |
| `sonnet` | `claude-sonnet-4-6` (→ AeroLink) |
| `deepseek` | `deepseek/deepseek-v4-pro` (→ Command Code, free) |
| `ds` | `deepseek/deepseek-v4-pro` (→ Command Code, free) |

---

## 💡 Usage Tips

### Switch models mid-session
```bash
# Inside Claude Code, type:
/model opus
/model deepseek
/model ds
```

### Run two terminals side-by-side
```bash
# Terminal 1 — Planning (Opus via AeroLink)
claude --model opus

# Terminal 2 — Execution (DeepSeek, free)
claude --model deepseek
```

### Background tasks are always free
The proxy automatically routes all background tasks (titles, summaries, subagents) to DeepSeek (free), even if your main session is on Opus. Your AeroLink credits only get spent on your active conversations.

---

## 🔍 Web Search Setup

### Default: DuckDuckGo (zero setup)
Works out of the box — no configuration needed.

### Upgrade: SearXNG (better results, 70+ engines)
Run SearXNG with Docker:

```bash
# Windows PowerShell:
docker run -d -p 8080:8080 -v "${PWD}/searxng-settings.yml:/etc/searxng/settings.yml" --name searxng searxng/searxng

# Linux/Mac:
docker run -d -p 8080:8080 -v ./searxng-settings.yml:/etc/searxng/settings.yml --name searxng searxng/searxng
```

Then start the proxy with SearXNG:

```bash
# Windows PowerShell:
$env:SEARXNG_URL="http://localhost:8080"; node index.js

# Mac/Linux:
SEARXNG_URL=http://localhost:8080 node index.js
```

Or use Docker Compose (starts everything together):
```bash
docker-compose up -d
```

---

## ⚙️ Configuration

| Setting | How to Change | Default |
|:---|:---|:---|
| **Proxy port** | Set `PORT` in `.env` or env var | `4141` |
| **Default model** | `claude config set --global model "opus"` | AeroLink Opus |
| **Search engine** | Set `SEARXNG_URL` env var | DuckDuckGo |
| **Max search results** | Edit `maxResults` in `websearch.js` | `10` |

### Environment Variables

| Variable | Required | Description |
|:---|:---|:---|
| `AEROLINK_API_KEY` | ✅ Yes | Your AeroLink API key (get from https://aerolink.lat) |
| `SEARXNG_URL` | ❌ No | URL of SearXNG instance (e.g., `http://localhost:8080`) |
| `PORT` | ❌ No | Proxy port (default: `4141`) |

---

## ❄️ Windows-Specific Notes

### PowerShell encoding
If you see garbled characters in logs, run:
```powershell
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
```

### Setting environment variables
```powershell
$env:AEROLINK_API_KEY="aero_live_your-key-here"
$env:SEARXNG_URL="http://localhost:8080"
node index.js
```

### Docker on Windows
Use **Docker Desktop** with WSL2 backend. Docker Compose is included with Docker Desktop.

---

## 🐛 Troubleshooting

<details>
<summary><strong>"Could not read ~/.commandcode/auth.json"</strong></summary>

You need to install Command Code CLI and login first:
```bash
npm install -g command-code
npx command-code
```
Follow the prompts to create a free account.
</details>

<details>
<summary><strong>"AEROLINK_API_KEY is not set"</strong></summary>

Create a `.env` file in the project root with:
```env
AEROLINK_API_KEY=aero_live_your-key-here
```
Get your key from: https://aerolink.lat
</details>

<details>
<summary><strong>403 — Model Not In Plan</strong></summary>

The selected model isn't available on your Command Code plan. Try a different model:
```bash
claude --model deepseek/deepseek-v4-flash
```
</details>

<details>
<summary><strong>No logs showing in proxy output</strong></summary>

Make sure:
1. The proxy is running (`node index.js`)
2. Claude Code is pointed to the proxy (`claude config set --global apiBaseUrl http://localhost:4141`)
3. You're sending requests through the proxy
</details>

<details>
<summary><strong>ECONNRESET / connection errors</strong></summary>

The proxy retries automatically on transient errors. If persistent:
1. Check your internet connection
2. Restart the proxy
3. Try a different network (some networks block certain API endpoints)
</details>

<details>
<summary><strong>"SearXNG: Invalid JSON response"</strong></summary>

You must mount the `searxng-settings.yml` file. Without it, SearXNG returns HTML instead of JSON:
```bash
docker run -d -p 8080:8080 -v "${PWD}/searxng-settings.yml:/etc/searxng/settings.yml" --name searxng searxng/searxng
```
</details>

---

## 📁 Project Structure

```
anycode-proxy/
├── aerolink.js              # AeroLink handler (Anthropic API passthrough)
├── config.js                # Auth, model registry, tool schemas
├── converter.js             # Anthropic ↔ Alpha format translation
├── docker-compose.yml       # Run proxy + SearXNG together
├── Dockerfile               # Docker image for the proxy
├── handlers.js              # Request handling, routing, web search, abort control
├── index.js                 # HTTP server, routing, startup
├── openrouter.js            # OpenRouter handler (fallback only)
├── package.json
├── searxng-settings.yml     # SearXNG config (JSON API enabled)
├── stream.js                # SSE stream converter (Alpha → Anthropic)
├── system-prompts.js        # Fable 5-style per-backend system prompt injection
├── utils.js                 # HTTP helpers, retry logic
├── websearch.js             # SearXNG + DuckDuckGo search engine
└── .env.example             # Example environment variables
```

---

## 🙏 Credits

- **[AeroLink](https://aerolink.lat)** — Cheap Claude model API proxy
- **[Command Code](https://commandcode.ai)** — Free AI API backend
- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** — Anthropic's CLI coding assistant
- **[SearXNG](https://github.com/searxng/searxng)** — Privacy-respecting meta search engine

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

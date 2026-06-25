# Token Optimization

Zero is designed so that the most common operations consume zero tokens. This document explains the architecture and how to get the most out of it.

---

## Why Token Cost Matters

When using cloud LLMs, every request costs tokens — which translates to API credit spend. Even with free-tier providers, rate limits apply per token count. Zero minimizes token usage by resolving as much as possible locally before ever touching an LLM.

---

## The Four Cost Tiers

### Tier 1 — System Commands (0 tokens)

Built-in commands are handled entirely in the application layer. No LLM is involved at all.

Examples: `time`, `date`, `weather`, `open notepad`, `find report.pdf`, `volume up`, `git status`, `git log`, `commit message`

Token cost: **0**

### Tier 2 — Plugin Responses (0 tokens)

If a user message matches a plugin trigger, the plugin handler runs and returns its response directly. The LLM is bypassed.

Token cost: **0**

### Tier 3 — Cache Hits (0 tokens)

Zero maintains a response cache keyed by a normalized version of the input. If the same (or very similar) query was answered recently, the cached response is returned immediately.

Token cost: **0**

### Tier 4 — Ollama Inference (free, offline)

If no system command, plugin, or cache entry matches, Zero sends the query to Ollama. Ollama runs entirely on your local hardware — there is no API call, no account, and no per-token cost.

Token cost: **free** (uses your CPU/GPU)

### Tier 5 — OpenRouter Fallback (free tier available)

If Ollama is unreachable or returns an error, and you have configured an OpenRouter key, Zero falls back to the configured OpenRouter model. The default fallback model (`mistralai/mistral-7b-instruct:free`) is on OpenRouter's free tier.

Token cost: **free tier** (rate-limited) or **paid** depending on the model you choose

---

## Decision Tree

```
User sends a message
        |
        v
  System command match?
  YES --> Handle locally, return result (0 tokens)
        |
        NO
        v
  Plugin trigger match?
  YES --> Run plugin handler, return result (0 tokens)
        |
        NO
        v
  Cache hit?
  YES --> Return cached response (0 tokens)
        |
        NO
        v
  Ollama reachable?
  YES --> Send to local Ollama model (free, no API)
        |
        NO
        v
  OpenRouter key configured?
  YES --> Send to OpenRouter model (free tier or paid)
        |
        NO
        v
  Show "Ollama offline" error to user
```

---

## Reducing Token Usage Further

### Extend system commands

If you repeatedly ask Zero the same type of question and it currently goes to the LLM, consider writing a plugin for it. Plugin responses cost 0 tokens and respond instantly.

### Use cache-friendly phrasing

The cache normalizes input (lowercase, punctuation stripped), so `"What is Python?"` and `"what is python"` share the same cache entry. Slight rephrasing within the same question hits the cache. Completely different wording does not.

### Choose small Ollama models

Smaller models (e.g. `phi3`, `mistral`) process tokens faster and use less VRAM. For short factual queries, they perform comparably to larger models. Reserve `codellama` or larger models for complex coding tasks.

### Use OpenRouter free-tier models

If you need cloud fallback, stick to models with the `:free` suffix on OpenRouter. These are rate-limited but have no per-token cost.

---

## Summary Table

| Source | Token Cost | Requires Internet | Requires API Key |
|---|---|---|---|
| System command | 0 | No (except weather) | No |
| Plugin | 0 | Depends on plugin | Depends on plugin |
| Cache | 0 | No | No |
| Ollama | 0 (free) | No | No |
| OpenRouter (free tier) | 0 (rate-limited) | Yes | Yes (free) |
| OpenRouter (paid model) | Paid | Yes | Yes |

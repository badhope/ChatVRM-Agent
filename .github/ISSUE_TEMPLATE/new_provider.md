---
name: Add a new LLM provider
about: Propose / submit a new LLM adapter (HuggingFace, Groq, Mistral, etc.)
title: "[Provider] Add <name> support"
labels: ["enhancement", "llm-provider"]
assignees: []
---

## Provider

- **Name**:
- **Website**:
- **Base URL**:
- **Compatible protocol**: [OpenAI / Anthropic / Google / Baidu / custom]
- **Default model**:
- **Auth method**: [API key header / OAuth / bearer]
- **Streaming**: [yes/no — SSE? chunked?]
- **Function calling / Tools**: [yes/no]

## Sample request

```bash
curl -X POST https://<base-url>/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -d '{"model":"...","messages":[...]}'
```

## Willing to submit a PR?

- [ ] Yes — I can implement the adapter
- [ ] No — please consider this a request only

## Implementation sketch

Outline which files would change:

- `src/adapters/llm.adapter.ts` — add provider case
- `server/providers.ts` — register metadata
- `frontend/src/pages/Config.tsx` — pick up automatically via `/api/config/providers`
- `src/ports/llm.port.ts` — no change (port stays the same)

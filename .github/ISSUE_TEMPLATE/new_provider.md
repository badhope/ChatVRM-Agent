## Provider

- **Name**:
- **Website**:
- **Base URL**:
- **Compatible protocol**: OpenAI / Anthropic / Google / Baidu / custom
- **Default model**:
- **Auth method**: API key header / OAuth / bearer
- **Streaming**: yes — SSE? chunked? — no
- **Function calling / Tools**: yes / no

## Sample request

```bash
curl -X POST https://<base-url>/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -d '{"model":"...","messages":[...]}'
```

## Willing to submit a PR?

Yes — I will implement the adapter. / No — request only.

## Implementation sketch

Files that would change:

- `src/adapters/llm.adapter.ts` — add provider case
- `server/providers.ts` — register metadata
- `frontend/src/pages/Config.tsx` — picks up automatically via `/api/config/providers`
- `src/ports/llm.port.ts` — no change (port stays the same)

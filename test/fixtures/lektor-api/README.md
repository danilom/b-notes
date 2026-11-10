# Real replies from Google and OpenRouter

Material for the Lektor's fake network (`design/lektor-openrouter-spec.md` §11). What each one
shows is written up in the spec's §16, "API facts".

These are recorded replies, not hand-written ones. Build fakes from them, and don't edit them to
suit a test. If a test needs a shape that isn't here, record it.

## How they were made

1. `node scripts/record-lektor-api.mts --out <folder outside the repo>` sends the requests and
   keeps every piece of each reply as it arrived, timed with `performance.now()`.
   - It uses free calls only.
   - Keys are read from `testdata/*-key.txt` inside the script, and never printed.
   - The only text sent is the made-up one in the script, never anything from `testdata/`.
2. `node scripts/clean-lektor-recordings.mts --from <that folder> --to test/fixtures/lektor-api`
   makes these files from the raw recordings:
   - **Keys** become `<KEY>`.
   - **Identifying fields** get placeholders: key label, user, workspace, interaction and event
     IDs, page tokens.
   - **E-mail addresses** become `someone@example.com`.
   - **Headers** are cut down to `content-type`, `retry-after` and `x-openrouter-error-origin`.
   - **A long stream** has the middle of its `step.delta` pieces dropped.
   - It refuses to write a file in which a real key, or anything shaped like one, is left.
   - Everything else is byte for byte as the service sent it.

## The format

One JSON file per case:

```
{ name, recordedAt, request: { method, url, headers, body },
  status, headers, headersAtMs, pieces: [ { atMs, text } ], endAtMs, failure, trimmed? }
```

- **`pieces`** are the body as it came off the wire, chunk by chunk; join their `text` for the
  whole body. A fake can replay them at their `atMs` times, or all at once.
- **`failure`** is set only when our side gave up (a timeout, no connection). The service's own
  refusals are in `status` and `pieces`.
- **`trimmed`** says what the cleaning took out, when it took anything.

## The cases

| File | Recorded (UTC) | What it is |
|---|---|---|
| `google-wrong-key-interactions.json` | 2026-11-10 17:01 | `/interactions` with a key-shaped wrong key: 400 `API_KEY_INVALID`, plain JSON under a `text/event-stream` content type |
| `google-no-key-interactions.json` | 2026-11-10 17:01 | `/interactions` with no key: 403 `PERMISSION_DENIED` |
| `google-wrong-key-models.json` | 2026-11-10 17:01 | the key check (`/models?pageSize=1`) with a wrong key: 400 |
| `google-models-page-1.json` | 2026-11-10 17:01 | the key check with the real key: 200, one model and a page token |
| `google-models-all.json` | 2026-11-10 17:01 | the whole model list, cut down to the gemini-3.x-flash models (`trimmed` says so) |
| `google-busy-at-once-gemini-3.8-flash.json` | 2026-11-10 17:01 | free 3.8, streamed: 503 `service_unavailable` "high demand" after 1.4 s, bare JSON |
| `google-busy-at-once-gemini-3.6-flash.json` | 2026-11-10 17:01 | the same for 3.6 |
| `openrouter-wrong-key-completion.json` | 2026-11-10 17:01 | `/chat/completions` with a wrong key: 401 "User not found." |
| `openrouter-wrong-key-key.json` | 2026-11-10 17:01 | `/key` with a wrong key: the same 401 |
| `openrouter-key.json` | 2026-11-10 17:01 | `/key` with the real key: the key's cap and its use, **not the account balance** |
| `openrouter-credits.json` | 2026-11-10 17:01 | `/credits` with the real (ordinary) key: 200, `total_credits` and `total_usage` |

The balances in `openrouter-key.json` and `openrouter-credits.json` are the real ones from that
day. They're kept because they show the two disagreeing: $12,08 left on the key's cap against
$7,08 in the account.

## Not here yet

- **A whole free stream** (keep-alives, `interaction.created`, words, `interaction.completed`)
  and **a mid-stream error event**. Google answered every try with 503 at once while these were
  recorded. Run `node scripts/record-lektor-api.mts --out <folder> --cases google-stream` at a
  quieter hour, clean the result, and add a row above.
- **Any OpenRouter completion stream, 402, 429 or 503.** These need a paid call or an empty
  account. Record the first paid stream when the build's own first paid test is run by hand,
  through the same cleaning script.
- **Google 429 `quota_exceeded`.** It needs the day's free quota used up.

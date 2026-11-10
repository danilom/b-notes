# AI Lektor with OpenRouter: build spec

What the Lektor mockup on branch `lektor-openrouter` decided (sessions of 2026-11-07 to
2026-11-10), written for whoever builds it into the app. Nothing here is built yet.

**Where things are**
- The mockup: `design/lektor-choice-prototype.{html,ts}` (the panel), `lektor-corrections-window-prototype.ts`,
  `lektor-choice-radios.ts`, `lektor-comment-run-prototype.ts`, `lektor-keys-prototype.ts`,
  `lektor-prototype-pieces.ts`, `lektor-menu-icons-prototype.ts`, `lektor-menu-pictures.css`.
- See it with `node scripts/build.mjs` and `node scripts/serve.mjs`, then
  `/his-screens?page=lektor-choice-prototype#asus`. The switches beside the screen set the day:
  keys saved or dead, Google's state per model, balance, money out, offline, pace of the waits, ready
  suggestions, text changed. The "Panel" dropdown jumps straight to each screen and failure.
- Side pages: `/lektor-menu-pictures` (menu pictures), `/lektor-tier-marks` (the Lektors' marks).
- Measurements: `design/lektor-free-queue-measurements.md`. Model comparison findings live in
  gitignored `testdata/lektor-comparison/` (his essays: never commit, never send to an AI service
  without Danilo's say-so, service by service).

**Which wins where they differ**
- **Wording, layout, spacing, colours:** the mockup. Copy strings from it, not from this file, which quotes them
  only to say what they are for.
- **Behaviour:** this spec. The mockup pretends; where it took a shortcut, the spec says what the app
  must do.
- **DESIGN.md:** changes as listed at the end; bring it in line in the same work.

**Ground rules, unchanged.** These come from CLAUDE.md and DESIGN.md:
- **v1 is in his hands.** Build on a new branch from `main`, publish only with `npm run release`
  (pre-release), and never `--live`.
- **No test spends AI credits.**
- **Keys are never printed, logged or committed.**
- **LF line endings, one small commit per finished change, no attribution lines.**

---

## 1. Who it's for, and the principles that came out of the mockup

The end user is elderly, bold, reads little, acts on his own wrong mental models, and presses
whatever looks like the next step. Everything below follows from that.

- **One request at a time; nothing runs out of sight.** He won't understand work going on in the
  background. Closing the panel or the window cancels the request running in it.
- **Every choice starts on Besplatni.** It starts there every time a choice screen opens. Plaćeni
  holds only for that visit and is never remembered across visits, texts or restarts. The one exception is
  the tick box (§5), which starts ticked under stated conditions.
- **The bottom-right strip of the panel is "the next step".** Only forward steps go there, in solid blue.
  Ways back ("← Nazad") sit at the strip's left. Escape hatches ("Odustani od zahteva") are small grey
  buttons near what they cancel, never in the strip.
- **Send buttons always say to whom.** He reads a bare "Pošalji tekst" as e-mail or chat.
- **No person's name anywhere he can see it.** Messages point to the in-app way to act ("API
  ključevi"), or to "Zovi za pomoć".
- **A technicality he can't act on is worked around, not explained.** This covers the model stand-in, 3.8 versus 3.6, and the
  provider's hosts.
- **Times are his local 24-hour clock.** He travels with the laptop, so times are never "Serbian time".

## 2. Services and models

There are three Lektors. The choice he makes is only ever free or paid. Which paid model runs follows from
the work:

| Work | Besplatni | Plaćeni |
|---|---|---|
| Utisak (comment) | gemini-3.8-flash (Google, free tier) | claude-opus-5.5 via OpenRouter |
| Slova i zarezi | gemini-3.8-flash | gemini-3.8-flash via OpenRouter |
| Pravopis i gramatika | gemini-3.8-flash | gemini-3.8-flash via OpenRouter |
| Stilska dorada | gemini-3.8-flash | claude-opus-5.5 via OpenRouter |
| Dubinska prerada | gemini-3.8-flash | claude-opus-5.5 via OpenRouter |

- **A slow free request handed on (§5) always goes to paid gemini-3.8-flash, never Opus**, whatever the work.
  It's the same writer, without the queue.
- **Free goes through Google's `/interactions` endpoint with `stream: true`.**
  - While queued it sends keep-alives (every ~15 s).
  - `interaction.created` says the work has started, then the words stream.
  - That's how the wait can tell "queued" from "working" on free.
  - Measured: 3.8 usually queues ~2–5½ minutes, then works for seconds. 3.6 is erratic. See the
    measurements file.
- **Free falls back from 3.8 to 3.6, silently**, for the utisak, Slova and Pravopis. It happens when 3.8 is refused
  as busy, is still queued at 1 minute, or has its daily limit spent.
  - Stilska and Dubinska don't fall back: on those kinds, 3.6 loses his voice.
  - Log which model answered.
- **Paid goes through OpenRouter.** It's a third provider in `src/platform/lektor-remote.ts` (main process,
  fixed address), with its key in `lektor.json` next to Google's.
  - Opus at medium effort.
  - Route Opus to Anthropic first, with Bedrock/Google as backup. Allow only no-retention hosts.
  - Stream the paid replies too, so the wait shows thinking and writing.
- **The time limit for a request is 10 minutes** (it was 4).
- **Refusals, told apart.** These are the failures in §8:
  - **Busy:** Google 503, or an error event mid-stream saying high demand.
  - **Daily limit spent:** Google 429. Each model has its own limit, which resets at midnight Pacific time.
  - **Bad key:** OpenRouter 401; Google 400 or 403 for an invalid or revoked key. Never shown as busy.
  - **Money gone:** OpenRouter 402. No retry.
  - **Paid busy:** OpenRouter's own host fallbacks exhausted.
  - **Content filter, no internet, cut-off or mismatched reply, too long.**
- **Prices, for context only** (none are shown to him in advance):
  - **Flash:** $0.75/$3.75 per million tokens until 2026-12-31, then double.
  - **Opus:** $4/$20.
  - **Typical costs:** a utisak on Opus is about 3–7 cents (measured); a paid Flash correction is about 10 cents (estimated); Opus rework about 50 cents.

## 3. The three Lektors: names, marks, colours

| | Name (one name, family in Serbian quotes) | Mark (Lucide line) | Light | Dark |
|---|---|---|---|---|
| free | Besplatni „Flash” | gift | #3380d6 | #6caef2 |
| paid Flash | Plaćeni „Flash” | circle-dollar-sign (coin) | #2f8a3e | #5cc977 |
| paid Opus | Plaćeni „Opus” | gem | #a87412 | #e3b04a |

- **Quotes:** „…” (U+201E, U+201D), because the family is a product name, and an unfamiliar one to him.
  - Where a name follows "lektoru"/"lektora", join them with a no-break space, so „Flash” never wraps alone.
  - Write it in code as ` `, so the next reader can see it.
- **On a filled (blue) button, the mark takes the button's text colour.**
- **Sentences about the kind stay generic:** "plaćenom lektoru", "Besplatni lektor često čeka…". Always "lektoru",
  never a bare "plaćenom".
- **Who made a result is decided by the model that actually ran, not by what was chosen.** For example, a handed-on
  utisak is signed and charged as Plaćeni „Flash”.
- **Rejected:** "Skuplji „Opus”"; the family as separate grey text after the name.

## 4. Keys

- **Keys screen:** "Besplatni (Google)" and "Plaćeni (OpenRouter)". The saved key is never shown again.
  - Under a working key: "✓ Radi", and for paid "· na računu $X".
  - Pasting checks the key (free calls).
  - "Nazad" at the left, "Sačuvaj" at the right, the same size.
  - Wording as in the mockup ("Dovoljan je jedan.").
- **No keys at all:** the panel opens on the keys screen with no "Nazad". After a key is saved, it goes to the
  menu with "API ključ radi i sačuvan je."
- **A key that stops working (dead key):**
  - **Find out early, when the panel opens.** OpenRouter's balance lookup uses the key. Google has a free
    call that lists its models.
  - **Then a screen of its own, in place of the menu:**
    - a big red line key mark (Lucide "key");
    - "API ključ više ne radi." and "Zovi za pomoć.";
    - "API ključevi" as the main button.
  - **The whole feature goes, not one Lektor of two:** partial disabling reads as flaky.
  - **On the keys screen,** the dead key's field says "Ovaj ključ više ne radi. Zalepi novi." A working key
    pasted clears it.
  - **Found only on sending:** the same screen, plus "Nazad", in the panel and in the window. In the window,
    "API ključevi" closes the window and opens the keys screen in the panel.
- **Keys stay in plain text in `lektor.json`.** Decided; nothing more.

## 5. The tick box: a slow free one goes to paid Flash

- **Wording:** "Ako čeka duže od 2 minuta, pošalji tekst plaćenom lektoru „Flash”", with the green coin. The space
  before „Flash” is a no-break one; one sentence, with no grey line under it.
- **Where it appears:**
  - **Utisak and Stilska/Dubinska:** nested under Besplatni, set in to the Lektor names. Greyed, not hidden,
    while Plaćeni is chosen.
  - **Slova/Pravopis:** under the "AI Lektor: Besplatni „Flash”" line, since those kinds have no choice.
  - **Shown only with both keys saved.**
- **Default:** ticked when there's a paid key and the balance reads $1 or more. Unticked under $1, or when the
  balance can't be read. Set afresh each time the utisak step or the window opens. A balance that falls
  under $1 while the window is open does not untick it.
- **What it does:**
  - **The 2 minutes count from sending,** across both free models.
  - **Slova, Pravopis and the utisak:** 1 minute on 3.8, then 1 on 3.6, then paid Flash.
  - **Stilska/Dubinska:** 3.8 has both minutes, as there's no 3.6 step.
  - **Busy, or the daily limit spent, on the last free model, hands over at once.**
  - **Only a request still queued is ever handed over.** Once Google's stream says work began, it waits.
- **The kept 2-minute limit is deliberate.** In practice most ticked free requests go paid today, since 3.8
  queues ~5 minutes. The limit is there for the day Google gets faster.

## 6. The panel

The title line reads "AI Lektor" on the menu, "AI Lektor: utisak" on the utisak's steps, and "AI Lektor: podešavanje"
on keys. "Zatvori" closes the panel, and closing cancels a utisak being read (§7).

**Step 1, the menu**
- **Text, top to bottom:** "AI Lektor čita tvoj tekst, kaže šta misli i predlaže ispravke.", then "Šta želiš?"
- **Two big white cards** with full-colour pictures (the owl "owl-fluffy" and the page with a red ž "page-z-caron",
  2.3rem, drawn in `lektor-menu-icons-prototype.ts`):
  - **"Utisak o tekstu"** / "Kratak osvrt na tekst, kao od pažljivog čitaoca." goes to step 2.
  - **"Ispravke"** / "Predlozi ispravki, od zareza do stila." opens the corrections window directly.
- **Then "Upozorenje o privatnosti",** centred vertically in the space left. It reads "Ceo tekst (N reči) se šalje firmi
  Google ili OpenRouter.", plus the existing lines.
- **"API ključevi"** at the very bottom right: small, grey, link-like, styled as "AI može da pogreši".
- **No strip on the menu.**
- **In dark mode the pictures keep their light-mode colours.** Inverted ink and paper looked bad.

**Step 2, the utisak's Lektor**
- **At the top:** the owl, "Utisak o tekstu" and its sentence, as the step's title (left-aligned, not a card).
- **Then:** "Izaberi AI Lektora:", "Oba pišu utisak sličnog kvaliteta." (small grey, close under the heading), and:
  - ◉ 🎁 Besplatni „Flash” · dobar
    - ☑ 🪙 the tick box (§5)
  - ○ 💎 Plaćeni „Opus” · drugačije mišljenje
  - a short line, then "Na računu za plaćene lektore: $7,47" (§9)
- **The grey words sit on the name's baseline.** "brži" was dropped: speed is the tick box's job, and nothing should
  tip him to Opus.
- **Strip:** "← Nazad" (to the menu) at the left; at the right, solid blue "Pošalji tekst lektoru" with the
  chosen Lektor's mark and the arrow.
- **The send button's tooltip:** the company and model, and with the tick box ticked, "Ako čeka duže od 2 minuta:
  firmi OpenRouter, model gemini-3.8-flash". It follows the tick.
- **At 125 % the strip wraps:** "← Nazad" above at the left, the blue button whole at the right.

**The wait**
- **No stage list here:** his text is beside it to look at.
- **"AI Lektor čita tekst „X”…"** with the turning mark, then a line on what to expect:
  - **Free:** "Besplatni lektor često čeka na red, pa može da potraje nekoliko minuta.", plus "Ako ne krene za
    2 minuta, šalje se plaćenom lektoru „Flash”." if ticked.
  - **Paid:** "Obično traje pola minuta."
- **Then the quiet clock "Prošlo je N s." (N min N s).** Time it with `performance.now()`, never `Date.now()`: the wall
  clock stepped back and showed "−1 s".
- **"Odustani od zahteva"** with ✕ (the app's close icon), small grey like "Traži novi utisak", right-aligned
  under the clock. Its hit area isn't enlarged, since it's not to be encouraged.
- **No strip at all while waiting.**
- **Cancelling goes back to step 2** as he left it. A paid request may be charged for work begun; that's accepted silently.

**The utisak**
- **"← Traži novi utisak"** small grey at the top right (back to step 2, on Besplatni again). The
  "Tekst promenjen posle utiska" note sits beside it when the text has changed since.
- **The comment opens with "Utisak AI Lektora o tekstu „<title>”:"** in the comment's own font. The app adds it; the AI doesn't
  write it.
  - Use the title as the list shows it (`titleFrom` in `src/notes/note-title.ts`), trimmed.
  - Strip his own outer quotes, and cut a long title at a word with "…".
  - Use "bez naslova" when it's empty.
  - Don't build a second clean-up.
- **Signed under it:** "AI Lektor: [mark] Plaćeni „Opus” · upravo sad · $0,05" (the cost only when paid; it comes off the
  balance at once), then "AI može da pogreši".
- **Opening "AI može da pogreši" must scroll its explanation into view.** v1 has this bug.
- **No "Nazad" on this step:** a big way back would throw away what was written, maybe paid for.
- **The strip:** a plain white, wide "Ispravke…", with no picture, which opens the window.

**Another text opened while a utisak is being read**
- **The request goes on,** and the panel stays with it (its wait, failure or result) whatever text is open.
- **To ask about another text he must cancel first.**
- **Done while another text is open:** "Utisak o tekstu „X” je gotov.", with solid-blue full-height "Otvori tekst i
  utisak" right under that line, not in the strip. "← Nazad" sits alone at the strip's left and keeps the
  utisak with its text.
- **Failed while another text is open:** "Utisak o tekstu „X” nije stigao." plus the problem. Its shortcut resends
  that text, not the open one.
- **The text deleted (or archived) while being read:** the request stops at once, and the panel says "Tekst „X” je obrisan." /
  "Zato utisak o njemu neće stići." "Nazad" goes to the open text's menu.

## 7. Closing

- **The panel's "Zatvori" (and the bottom bar's "AI Lektor" toggle) cancels a utisak being read.** Reopened, that text is
  at step 2.
- **The window's "Zatvori" (✕, Esc) mid-wait cancels the request.**
- **The window's close confirm:** keep the app's existing one on the review ("Zatvori AI ispravke" / "Predlozi nisu
  uneti u tekst…", with the "Tvoje promene u predlozima neće biti sačuvane." variant; buttons "Zatvori" / "Nazad na
  ispravke").
  - Ask the same, with the same wording, on the choosing step, but only when this text has kept suggestions.
  - "← Nazad" never asks.
  - His yes/no picks in a review are lost on close. That's accepted: he was warned, and the kept suggestions are already a bonus.

## 8. The corrections window

It's modal, from "Ispravke" on the menu or "Ispravke…" under a utisak. His text isn't shown and can't change
while the window is open. The title reads "AI ispravke: <title>" with "Tvoj tekst se ne menja dok je ovaj prozor otvoren." under it.
The footer has only "Zatvori".

**The left side, the kinds:** "Izaberi vrstu ispravke:" and four radio rows, each with the two lines in the mockup
(what it does, then what stays his). There's a line before Dubinska. Nothing is picked on opening. The picked row is
marked like Ranije verzije's open row. All are locked while a request runs.

**The right side** shows nothing picked ("Izaberi vrstu ispravke sa leve strane.") or one of the following.

- **Ready suggestions:** the kind's name, then one card per Lektor that made some, up to two:
  - "[mark] Predlozi lektora „Opus” od pre 3 dana · plaćeno $0,48" and a blue "Pogledaj".
  - Free cards have no amount. A just-made card leaves out the time ("od upravo sad" reads badly).
  - The mark and name come from the model that ran.
  - Two blue "Pogledaj" buttons when both exist is accepted, as it's rare.
  - Then a plain "Novi zahtev za ispravke…".
- **Void suggestions:**
  - **What counts:** kept suggestions are void once his text differs from what was sent, trailing whitespace aside.
  - **What he sees:** where the cards were, one grey line, "Stari predlozi više ne važe, tekst je promenjen.", then the request form.
    It's one line however many sets were void.
- **The request:**
  - **Lektor, Slova and Pravopis:** "AI Lektor: 🎁 Besplatni „Flash”" (Plaćeni only without a free key), plus the tick box and the
    balance line.
  - **Lektor, Stilska and Dubinska:** the same choice piece as the panel: Besplatni „Flash”, the nested tick box, then
    Plaćeni „Opus” · "bolje piše i čuva tvoj glas", and the balance line. It starts on Besplatni each time the
    window opens. Once Plaćeni is picked, it holds for both rework kinds until the window closes.
  - **"Prošli put za ovaj tekst: $X",** when this kind was paid on this text before. There are no estimates.
  - **"▸ Uputstva za AI",** folded on each opening unless his note isn't empty. Opened (▾), it's one group with a
    line down its side, made of "Za ovu vrstu ispravke" (the app's whole English instruction, read-only, 4 lines,
    scrolling) and "Tvoja, dodatna (nije obavezno)" (his 3-line note). Folded, the opener sits at the left of
    the send note's line.
  - **"Videćeš predloge. Tekst se ne menja dok ih ne uneseš."** sits over the send button.
  - **Blue "Pošalji zahtev za ispravke"** with the Lektor's mark and the arrow, and a tooltip as in §6.
- **The wait:** one left-aligned column, pinned at the form title's height:
  - **The header:** the text's name in the accent colour, "Vrsta ispravke: X", then "AI Lektor: [mark] Besplatni
    „Flash”".
  - **The stages:** "Zahtev čeka u redu…" (free only), "Lektor razmišlja…", "Lektor ispravlja tekst…" with a bar and
    "40%" under that stage only. Each ends ✓ with its time at the right, after a dotted leader.
  - **What the stages never say:** Google AI, Claude AI, "kod Gugla" or "(novi model)".
  - **3.8 then 3.6 is one queue line:** only its model changes.
  - **A stage given up or turned away** gets a soft grey "!" in a ring, not ✗. The words are "Lektor je zauzet i nije primio zahtev"
    and "Besplatni lektor je za danas potrošen".
  - **A hand-over to paid** gets its own "AI Lektor: 🪙 Plaćeni „Flash”" line, a little apart, before its stages.
  - **Under the queue stage while it lasts:** "Besplatni zahtevi čekaju na red, pa traju duže, obično nekoliko minuta." plus
    "Ako ne krene za 2 minuta, šalje se plaćenom lektoru „Flash”." if ticked.
  - **Then the big clock "Prošlo je N s",** and the model in small grey ("gemini-3.6-flash (rezervni)").
  - **"Odustani od zahteva"** at the column's bottom right, where the send button was. That's fine here: the window has
    no next-step strip.
- **The review:**
  - **The header line:** "Vrsta ispravke: X · [mark] Plaćeni „Opus” · pre 3 dana · plaćeno $0,48 · Veće promene: 12,
    sitne popravke: 31.", with the model only as the name's tooltip.
  - **Then the app's legend** with "Prikaži tekst kakav će biti" at the right.
  - **Footer:** "← Nazad" at the far left, solid-blue "Unesi" (the app's hop/confetti stays), and "Zatvori".

## 9. Money

- **The balance** comes from OpenRouter (`GET /api/v1/key`, `limit_remaining`, or `/api/v1/credits`; an ordinary key
  works).
  - **On its own line under the choice:** a short rule, then "Na računu za plaćene lektore: $7,47", starting at the heading's edge.
    It belongs to both paid Lektors and to the tick box, not to one row.
  - **Under $1:** red, with "(malo)".
  - **Hidden** without a paid key, or when it can't be read. A failed lookup isn't trouble with his money.
- **Format:** $ first, decimal comma ($7,47).
- **Keeping it right:**
  - **After a paid run that finished:** subtract the reply's stated cost at once, then re-read in the background.
  - **After a run that failed or was cancelled:** only the re-read, since begun work may be charged.
  - **When to re-read:** whenever the window opens or step 2 shows.
- **Logging, required:**
  - **One log line every time the balance is read,** with the figure.
  - **Each paid request's cost** as the reply states it, in dollars, on the existing "Asked a Lektor service" line in
    `electron-main.ts`. v1 logs only Claude's tokens, and nothing for Gemini.
- **No cost estimates anywhere, no spending caps, no blocking.** Out of money, OpenRouter refuses and §10 says so.
  This is deliberate; guardrails were considered and dropped.

## 10. Failures: every path, its words, its offer

Every failure screen has the same shape: the problem, "← Nazad" back to the form exactly as he left it (where sending again is
the retry), and at most one solid-blue shortcut to the other Lektor, only where the trouble was the
company's and he has that key. There's no "Pokušaj ponovo". In the panel, a failure while another text is open
adds "Utisak o tekstu „X” nije stigao."

| Case | Words (see mockup) | Offer |
|---|---|---|
| Free busy (both models where 3.6 applies; 3.8 on rework), not ticked | "Gugl je sada zauzet." / "Probaj malo kasnije, ili pošalji plaćenom lektoru." | Pošalji plaćenom lektoru |
| Free daily limit spent, not ticked | "Besplatni lektor je za danas potrošen." / "Ponovo radi sutra posle HH:MM, ili pošalji plaćenom lektoru." | Pošalji plaćenom lektoru |
| … ticked | no failure: "! Besplatni lektor je za danas potrošen" line, then paid Flash at once | — |
| Free 10-minute timeout | as busy | Pošalji plaćenom lektoru |
| Paid money gone | "Plaćeni iznos je potrošen." / "Možeš da pošalješ besplatnom lektoru, ili neka se uplati još." | Pošalji besplatnom lektoru |
| Money gone after a hand-over | "Besplatni lektor sada ne može da primi tekst, a za plaćenog nema više novca." / "Probaj ponovo kasnije, ili neka se uplati još." | none |
| Paid busy (after OpenRouter's host fallbacks), paid timeout | as busy, for paid | Pošalji besplatnom lektoru |
| Bad key, either | the dead-key screen (§4), with Nazad | API ključevi |
| Content filter refused | own sentence | the other Lektor |
| No internet | "Internet ne radi, a AI Lektoru je potreban." / "Kad internet proradi, pošalji ponovo." | none |
| Cut off, or the reply doesn't match his text | own sentence | none |
| Text too long | own sentence | none (see Later) |
| Text deleted during a utisak | "Tekst „X” je obrisan." / "Zato utisak o njemu neće stići." | none |

- **HH:MM** is the next midnight Pacific time, in his local 24-hour time, with "danas" or "sutra" as the case may be. That's
  09:00 in Serbia and 15:00 in Bangkok. Mind the two days a year Pacific time changes its clocks.
- **Cross-checks:**
  - An offer follows the kind's own rules: free on Slova/Pravopis goes 3.8 → 3.6 again; rework is 3.8 only.
  - Every switch shows in the stages and in the review's model.
  - Google's refusal can arrive as an error event mid-queue.

## 11. Tests (we skimped in the mockup, so the build mustn't)

The mockup was checked by hand in the browser only. The build needs real coverage. Per CLAUDE.md: tests for logic
that fails silently, with names that describe behaviour, mutation-checked (break the code and see the test fail), and
no AI credits ever. Run `npm test` freely; ask Danilo before `npm run test:gui`.

**Unit tests, with the network faked as Google and OpenRouter really answer.** Fake it at the `ask` seam,
per model, not the service. Fake streams with keep-alives, `interaction.created`, error events mid-stream, 503, 429,
401/403, 402, partial bodies.

- **Model chain:** for each work kind, free and paid:
  - which model is asked first;
  - when 3.8 → 3.6 happens: busy, queued at 1 minute, daily limit spent;
  - rework never falls back;
  - the hand-over to paid Flash, never Opus;
  - only queued requests move;
  - the 2 minutes counted from sending;
  - rework's 3.8 gets both minutes.
- **The tick box default:** paid key and $1 or more, under $1, balance unreadable, no paid key. It's reset on each opening and not
  unticked by a mid-window fall.
- **Every row of the failure table:** the right failure kind for each HTTP and stream answer; never "busy" for a bad
  key; the right shortcut (or none) for each; money gone after a hand-over told apart.
- **Who made it:** a result's tier, name, mark and cost follow the model that ran. A handed-on utisak is Plaćeni
  „Flash” at the Flash cost.
- **Balance:** parsing both endpoints, the display rule ($ first, comma, "(malo)" under $1, hidden when unreadable),
  subtracting on finish, re-reading on failure, and a log line on every read.
- **Cost logging:** each paid reply's cost logged.
- **The reset time:** midnight Pacific in several local zones, including Belgrade, Bangkok and a US zone, across both DST
  changes, with "danas" versus "sutra".
- **Void suggestions:** trailing whitespace doesn't void them; any other change does; one line however many.
- **The utisak's title line:** empty, spaces, his own quotes, long, control characters.
- **Requests and texts:** request for the open text, for another text, text deleted while waiting, failure on
  another text (its shortcut resends that text), only one request at a time.
- **Closing:** the panel and the window each cancel a running request; nothing arrives afterwards.
- **Every choice starts on Besplatni:** on each step 2, after "Traži novi utisak", and on each window opening; rework's
  Plaćeni held until the window closes, then reset.
- **Keys:** a dead key found early, from the balance lookup or the model list; found on sending; cleared by a working paste; the no-keys
  start.
- **Wait timing:** `performance.now()` only, so a stepped-back wall clock never shows a negative time.

**GUI tests** (`test-gui/`, Playwright, network faked the same way). Walk every screen and path once:
- **The panel:** no keys, the dead key, the menu, step 2 (both choices, tick box greyed on Plaćeni), the wait (with "Odustani" and
  "Zatvori" cancelling), the utisak (signature, title line, stale note, "AI može da pogreši" scrolled into view), and
  another text (pinned wait, done elsewhere with "Otvori tekst i utisak", deleted text).
- **The window:** each kind, cards, void line, the request with the fold, the tick box and the balance, the wait with the
  queue, the 3.6 switch and the hand-over lines, each failure screen and its shortcut, the review and Unesi, and the
  close confirm (asks with kept suggestions, not without, Nazad never asks).
- **Dark mode once:** marks brighter, pictures unchanged.
- **Mind the traps in memory:** `npx playwright test <spec>` doesn't rebuild; no spec name may start with `test-`.

## 12. DESIGN.md changes

- **"Free Gemini" becomes:** free gemini-3.8-flash with silent fallback to 3.6 (utisak, Slova, Pravopis). "Never moved to a weaker
  model" goes: it came from flash-lite being terrible.
- **Paid becomes OpenRouter** (it was Anthropic direct), with models per kind (§2).
- **"No prices or balances on his screen" goes:** the balance and paid costs are shown (§9).
- **"Starts on the free one every time" stays**, now for both choices, with the one named tick-box exception.
- **"Recipient named again on the corrections step" goes:** the privacy warning on the menu names both companies; the tooltips
  name the recipient.
- **The request's time limit is 10 minutes.**
- **Closing cancels; one request at a time; switching texts keeps a utisak going.**
- **Send buttons say to whom; no person's name in the UI.**
- **Logging:** balance reads, paid costs, and which model answered.

## 13. Rejected (so they aren't retried)

- **Names:** "Skuplji", a family as separate grey text, "mnogo brži"/"brži" on Opus.
- **Send button:** "Pošalji tekst Guglu"/"OpenRouteru" (untrue once a slow free one can go to OpenRouter),
  "Pošalji tekst lektoru „Flash”" (too wide beside Nazad), and a bare "Pošalji tekst" (reads as e-mail).
- **Marks:** coins, coin stacks or crowns for Opus; purple or ruby for it; gold for paid Flash (green says
  "fine to use").
- **The panel:** Lektor choice before the kind; a context-dependent "Nazad"; a "Pređi na ispravke" button;
  solid blue on a suggestion or on going back; the corrections picture on "Ispravke…"; Lucide line icons or monochrome for
  the menu pictures.
- **Dead key:** a message squeezed over a greyed menu; disabling one Lektor of two; "Javi Danilu".
- **Waits:** "Google AI"/"Claude AI" stage names; "(novi model)/(stariji model)"; "Odustani" in the strip.
- **Void suggestions:** one line per set, naming Lektor and date.
- **Money:** cost estimates, spending caps, daily ceilings, price checks.
- **Background requests:** closing doesn't cancel.

## 14. Later (not part of this build)

- **Where the "text too long" limit really is,** measured against his longest essays (some are long). Drop the case if it's
  far beyond them.
- **Prompt tweaks for 3.8:** less over-editing on Stilska; keep lines in poems only. Then rerun the blind comparison.
- **Before release,** time whole essays on free 3.8 across a day. The queue data so far is afternoons and evenings only,
  which is accepted for now.
- **Danilo checks the panel and window at 125 % Windows scale and with his text size up.** Look at the send line, the review
  header, the open instructions and the wait column.
- **The footer gap:** the window uses 0.75rem against the app-wide 1rem. Review every dialog with a footer and ask Danilo, with
  screenshots.
- **"Otkaži" elsewhere in the app,** which Danilo dislikes: a separate change.

## 15. Build order

1. **The engine** (`lektor-remote.ts` and the services):
   - OpenRouter provider;
   - Google `/interactions` streaming;
   - the model chain and hand-over;
   - the refusal kinds;
   - the balance;
   - logging;
   - unit tests for all of it.
2. **Keys screen**, the dead key, no keys.
3. **The panel:** menu, step 2, wait, utisak, another text, deleted text.
4. **The corrections window:** kinds, cards, void line, request, wait, failures, review, close confirm.
5. **GUI tests;** ask Danilo before running the suite. Then `npm run release` for a pre-release he tries on the Asus.

Each stage gets its own commits, and nothing is live until Danilo makes it so.

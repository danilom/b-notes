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
- **v1 is in his hands.** Build on a new branch off `lektor-openrouter` (`lektor-openrouter-build`), where the
  Lektor, the prototype and the fixtures are (`main` has no Lektor). Publish only with `npm run release` (pre-release), and never `--live`.
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
  - OpenRouter's model IDs are `anthropic/claude-opus-5.5` and `google/gemini-3.8-flash` (§16).
  - Opus at medium effort: `reasoning: { effort: "medium" }`, as in the model tests.
  - **Flash, free and paid, gets no reasoning setting:** each service's default (Danilo, 2026-11-11). The tests
    never set one, and a paid run isn't held back to match the free one if the defaults differ.
  - **No host rules** (Danilo, 2026-11-11): no `provider` object, so OpenRouter routes by its own default, on
    price and availability. Who runs the model doesn't matter as long as cost and speed are the same. The
    "Anthropic first" and "no-retention hosts only" ideas were never his asks, and are dropped; §16 keeps the
    facts in case that ever changes. Without `service_tier`, the half-price "flex" and dearer "priority" hosts
    aren't used.
  - Stream the paid replies too, so the wait shows thinking and writing.
- **The time limit for a request is 10 minutes** (it was 4).
- **Refusals, told apart.** These are the failures in §8:
  - **Busy:** Google 503 (`code: "service_unavailable"`), or an error event mid-stream saying high demand. A 429
    with `code` `rate_limit_exceeded` or `too_many_requests` is also busy: those are per-minute limits, not the day's.
  - **Daily limit spent:** Google 429 with `code: "quota_exceeded"`, and only that. Limits are per project and per model
    (one key is one project), and the daily ones reset at midnight Pacific time.
  - **Bad key:** OpenRouter 401. Google 400 `API_KEY_INVALID` for a wrong key, or 403 `PERMISSION_DENIED` for a missing,
    leaked or blocked key. Also Google 401 `authentication`, which the docs list for `/interactions` but no call
    returned. Never shown as busy.
  - **Money gone:** OpenRouter 402. No retry.
  - **Paid busy:** OpenRouter's own host fallbacks exhausted: 502 (the model is down), 503 (no host meets the routing
    rules), 429, or a mid-stream chunk with `finish_reason: "error"`. A 404 "No endpoints found…" means the routing
    rules allow no host at all, which is our bug, not his. Log it loudly and show it as paid busy.
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
  - **The same check tells him the internet is down** (Danilo, 2026-11-11). Neither call getting an answer at all
    is what being offline looks like, so there is no separate connection check while a key is saved.
- **The internet, every time the panel opens:**
  - **With no keys saved,** a keyless call (as today's `ping`) checks the internet first. He must never be sent to
    paste keys only to meet a cryptic error afterwards.
  - **Offline:** a screen of its own, in place of whatever the panel would open on, the comment too. It reads
    "Internet ne radi, a AI Lektoru je potreban." with "Pokušaj ponovo" (he may tether to his phone). This is
    likely his commonest failure, so it must be plain.
  - **No extra effort to read a kept utisak offline.** But a panel already open on the utisak stays as it is when
    the internet goes; offline is said only when he sends.
  - **Then a screen of its own, in place of the menu:**
    - a big red line key mark (Lucide "key");
    - "API ključ više ne radi." and "Zovi za pomoć.";
    - "API ključevi" as the main button.
  - **The whole feature goes, not one Lektor of two:** partial disabling reads as flaky.
  - **On the keys screen,** the dead key's field says "Ovaj ključ više ne radi. Zalepi novi." A working key
    pasted clears it. The dead key's box shows "Zalepi ključ ovde", as an empty one does, not "Sačuvan", which over
    the warning read as all well (Danilo, 2026-11-11).
  - **"Sačuvaj" with nothing pasted stays as it is** (Danilo, 2026-11-11): solid blue, doing nothing. Not worth special
    cases on that screen.
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

**What it opens on** (Danilo, 2026-11-11): the utisak, whenever this text has one, however much the text has
changed since and however long ago. From there the corrections are one button away. Otherwise the menu. The old
rule that sent him back to the first step after a big change he came back to goes. Only the stale note is left
(below).

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
- **The line stays the same for the whole wait, as the prototype does it** (`commentWaiting` in
  `design/lektor-comment-run-prototype.ts`). The app's note that changes after a while (`waitLong`,
  `waitVeryLong`) goes.
- **Then the quiet clock "Prošlo je N s." (N min N s).** Time it with `performance.now()`, never `Date.now()`: the wall
  clock stepped back and showed "−1 s".
- **"Odustani od zahteva"** with ✕ (the app's close icon), small grey like "Traži novi utisak", right-aligned
  under the clock. Its hit area isn't enlarged, since it's not to be encouraged.
- **No strip at all while waiting.**
- **Cancelling goes back to step 2** as he left it. A paid request may be charged for work begun; that's accepted silently.

**The utisak**
- **"← Traži novi utisak"** small grey at the top right (back to step 2, on Besplatni again). The stale note
  sits beside it after a big change, with the count as the app has it now: "Utisak je napisan pre tvojih poslednjih
  izmena (oko 120 reči)." (`standingOf` decides when, as today).
- **The words appear one by one,** as the app does now (`revealed()`, a click shows them all), and they're kept
  deliberately (Danilo, 2026-11-11). The stream brings them almost all at once (§16), so the reveal is what makes the
  comment read as written.
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
  "Zato utisak o njemu neće stići." "Nazad" goes to the open text's menu. Plain lines, the second small grey, with no
  red warning sign and no failure box (Danilo, 2026-11-11): deleting it was his own act, not a fault.

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

- **Ready suggestions:** the kind's name, then one card: the latest set of that kind, whichever Lektor made it
  (Danilo, 2026-11-11). He has no use for choosing between sets.
  - "[mark] Predlozi lektora „Opus” od pre 3 dana · plaćeno $0,48" and a blue "Pogledaj".
  - Free cards have no amount. A just-made card leaves out the time ("od upravo sad" reads badly).
  - The mark and name come from the model that ran.
  - **One kept set per kind,** made with any note: a newer request that succeeds replaces it, even a free one after
    a paid one. That's accepted, since he rarely asks a cheaper Lektor again for the same text. A failed or cancelled
    request replaces nothing.
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
    scrolling: everything that goes to the model, the preset's prompt and the rules on the reply's shape,
    `CORRECTION_RULES` or `REWRITE_RULES`, that are hidden today. In English, because that's what is sent) and "Tvoja, dodatna (nije obavezno)" (his 3-line note). Folded, the opener sits at the left of
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
  - **Then the big clock "Prošlo je N s",** and the model in small grey ("gemini-3.6-flash (rezervni)"). Kept
    deliberately (Danilo, 2026-11-11): the wait is the one place with room to show such things; §1's "worked around,
    not explained" is about what he's asked to act on.
  - **"Odustani od zahteva"** at the column's bottom right, where the send button was. That's fine here: the window has
    no next-step strip.
- **The review:**
  - **The header line, bare** (Danilo, 2026-11-11): "Stilska dorada · [mark] Plaćeni „Opus” · pre 3 dana · plaćeno
    $0,48 · veće promene: 12, sitne popravke: 31." No "Vrsta ispravke:" label, and the counts start in lowercase, so the
    longest case fits on one line beside "Izgled izmena". Each part says in full what it is in its tooltip:
    - the kind: "Vrsta ispravke: Stilska dorada";
    - the Lektor: "AI Lektor koji je napisao ispravke: Plaćeni „Opus” (Model: claude-opus-5.5)", the model that ran;
    - the time: "Vreme kad su ispravke napisane: pre 3 dana";
    - the cost, on paid: "Plaćeno za sve napisane predloge: $0,48";
    - the counts: "Broj izmena: veće promene 12, sitne popravke 31".
    The counts are the app's `review.counts` in `src/language/lektor-wording.ts`, which starts with a capital today.
  - **Then the app's legend.**
  - **"Izgled izmena"** (Danilo, 2026-11-11) replaces the checkbox "Prikaži tekst kakav će biti", which was too easy
    to miss. It's a choice of how the changes are drawn, nothing more:
    - **Where:** at the right of the header line and the legend, beside both. It costs no height, which this dialog
      can't spare.
    - **What:** "Izgled izmena:" on one line, small grey, then two radio rows stacked one under the other. Each row is
      a sample of what it shows, drawn at the legend's size with the text's own marks and the legend's word "reč":
      red struck "reč" next to green "reč" (the changes as old and new, 2 px apart), and green bold "reč" (the text as
      it will be). No words name the rows; their screen-reader names are "izmene označene" and "samo rezultat".
    - **Look:** the rows touch, with no dead space between them, and the whole row is the click target. The row
      chosen has a light grey wash (the toolbar's grey) and a thin edge, not the accent: a fill would clash with the
      marks' red, green and blue. Hovering the row chosen changes nothing.
    - **What it does:** choosing a row draws **every** change that way, and forgets which ones he opened or closed by
      hand. He can still open a single change afterwards. Clicking the row already chosen applies it again, so it
      closes what he has opened since.
    - **The one exception:** a change he has decided stays closed in both views, showing what goes in (the legend's
      "biće uneto"). Opened, its wordings are drawn alike and his pick shows only on the bar, so the text would stop
      saying what he chose.
    - Rework kinds open on "samo rezultat", as today. Built in `createDiffReview` (`src/ui/diff-review.ts`), already
      done and tested on `lektor-openrouter` (commit ba6d1fe).
  - **Footer:** "← Nazad" at the far left, solid-blue "Unesi sve izmene u tekst" (the app's hop/confetti stays), and
    "Zatvori".
- **After the window closes,** taken or not, the panel stays open, on the screen the window was opened from: the
  menu, or the utisak (Danilo, 2026-11-11). Closing the panel after the review was for when the corrections were
  set up in the panel.

## 9. Money

- **The balance** comes from OpenRouter's `GET /api/v1/credits`: `total_credits − total_usage`. An ordinary key works,
  verified, although the docs say it needs a management key.
  - `GET /api/v1/key`'s `limit_remaining` **is not the balance.** It's what is left of the key's own spending cap,
    and it's `null` when the key has no cap. Measured: the key had $12,08 left of its cap while the account had $7,08.
  - Show the lower of the two, ignoring `limit_remaining` when it's `null`. Either one running out gets a 402.
  - If `/credits` starts refusing an ordinary key (403), fall back to `limit_remaining`, or hide the balance if that's
    `null`. `/key` still tells a dead key (401) from a working one.
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
company's and he has that key. In the panel, a failure while another text is open adds "Utisak o tekstu „X”
nije stigao."

- **"Pokušaj ponovo" only where trying again is likely to work** (Danilo, 2026-11-11): no internet (he may tether
  to his phone) and a cut-off reply. Not on busy, the daily limit or money gone (they have the shortcut), nor on
  a refusal that would only be refused again.
- **The service's own words, small and grey, with "Kopiraj poruku",** under every failure where the service gave
  any, as the app does now (`problem()`).

| Case | Words (see mockup) | Offer |
|---|---|---|
| Free busy (both models where 3.6 applies; 3.8 on rework), not ticked | "Gugl je sada zauzet." / "Probaj malo kasnije, ili pošalji plaćenom lektoru." | Pošalji plaćenom lektoru |
| Free daily limit spent, not ticked | "Besplatni lektor je za danas potrošen." / "Ponovo radi posle HH:MM, ili pošalji plaćenom lektoru." | Pošalji plaćenom lektoru |
| … ticked | no failure: "! Besplatni lektor je za danas potrošen" line, then paid Flash at once | — |
| Free 10-minute timeout | as busy | Pošalji plaćenom lektoru |
| Paid money gone | "Plaćeni iznos je potrošen." / "Možeš da pošalješ besplatnom lektoru, ili neka se uplati još." | Pošalji besplatnom lektoru |
| Money gone after a hand-over | "Besplatni lektor sada ne može da primi tekst, a za plaćenog nema više novca." / "Probaj ponovo kasnije, ili neka se uplati još." | none |
| Paid busy (after OpenRouter's host fallbacks), paid timeout | as busy, for paid | Pošalji besplatnom lektoru |
| Bad key, either | the dead-key screen (§4), with Nazad | API ključevi |
| Content filter refused | own sentence | the other Lektor |
| No internet | "Internet ne radi, a AI Lektoru je potreban." / "Kad internet proradi, pošalji ponovo." | Pokušaj ponovo |
| Cut off, or the reply doesn't match his text | own sentence | Pokušaj ponovo |
| Text too long | own sentence | none (see Later) |
| Text deleted during a utisak | "Tekst „X” je obrisan." / "Zato utisak o njemu neće stići." | none |

- **HH:MM** is the next midnight Pacific time, in his local 24-hour time: 09:00 in Serbia, 15:00 in Bangkok.
  **No "danas" or "sutra"** (Danilo, 2026-11-11): on a daily cycle the clock time alone is unambiguous, and the day
  word can only confuse. Don't build anything for the days the clocks change.
- **Cross-checks:**
  - An offer follows the kind's own rules: free on Slova/Pravopis goes 3.8 → 3.6 again; rework is 3.8 only.
  - Every switch shows in the stages and in the review's model.
  - Google's refusal can arrive as an error event mid-queue.

## 11. Tests (we skimped in the mockup, so the build mustn't)

The mockup was checked by hand in the browser only. The build needs real coverage. Per CLAUDE.md: tests for logic
that fails silently, with names that describe behaviour, mutation-checked (break the code and see the test fail), and
no AI credits ever. Run `npm test` freely; ask Danilo before `npm run test:gui`.

**Unit tests, with the network faked as Google and OpenRouter really answer.** Fake it at the `ask` seam,
per model, not the service. Real recorded replies to build the fakes from are in `test/fixtures/lektor-api/`
(see its README and §16). Fake streams with keep-alives, `interaction.created`, error events mid-stream, 503, 429,
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
- **The reset time:** midnight Pacific as a local 24-hour time in several zones, including Belgrade, Bangkok and a US
  zone, with no day word.
- **Kept sets:** one per kind, the latest replacing the one before whoever made it, and a failed request replacing
  nothing.
- **Opening:** offline with and without keys saved (no keys: the keyless check), on the utisak when there is one.
- **Void suggestions:** trailing whitespace doesn't void them; any other change does; one line however many.
- **The review's view:** done in `test/diff-review.test.ts`: every change follows it, his own opening forgotten,
  decided ones stay closed, setting it again applies again.
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
  queue, the 3.6 switch and the hand-over lines, each failure screen and its shortcut, the review (both views of
  "Izgled izmena", and a change he opened closed again by its row) and Unesi, and the close confirm (asks with kept
  suggestions, not without, Nazad never asks).
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
- **"The panel is one thing" becomes:** it opens on the utisak whenever there is one, with the stale note; the
  "big change he comes back to opens on the first step" rule goes.
- **"After the review the sidebar closes" goes:** the panel stays where the window was opened from.
- **"Results are kept" becomes:** the last comment, and one set of corrections per kind, the latest.
- **"Fake model" goes:** the test Lektor is removed. The saved real replies move into the fake network (§17.5).
- **Anthropic direct goes,** with its key, its model and its mark.
- **"Errors" stays,** with "Pokušaj ponovo" only where trying again may work (§10).

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
- **The review's view** (in place of "Prikaži tekst kakav će biti"): the checkbox itself (missed); two joined
  buttons "Prikaži tekst: [sa izmenama] [kakav će biti]" on a line of their own (a line of height, words too subtle);
  an on/off switch; samples reading "staro"/"novo" (they say old against new, when the choice is only the shape);
  blurred samples (the green bold one vanishes); the rows side by side (less plainly a choice); the soft blue on the
  row chosen (one more colour, competing); "Prikaži:" and "Prikaz izmena:" as the title ("Prikaz" implies more than a
  look); the title split over two lines (each word read as its row's label); the view setting only the changes he
  hadn't touched (the control would say one thing and the page show another).
- **The review's header:** the counts moved to the legend's line (longer still there).
- **Money:** cost estimates, spending caps, daily ceilings, price checks.
- **Background requests:** closing doesn't cancel.
- **The reset time:** "danas"/"sutra" before it.
- **Kept corrections:** a card per Lektor; matching a kept set by his note.
- **The test Lektor** as a choice he could see, switched on per machine.

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

## 16. API facts (verified 2026-11-11)

What the build relies on, checked against the services themselves on 2026-11-10/11, with free calls only: no
OpenRouter completion with a real key, and no paid Google tier. Each item is marked:
- **[call]**: seen in a real reply. The reply is saved in `test/fixtures/lektor-api/`, or the call was to a public,
  keyless listing.
- **[docs]**: from the official docs only.
- **[unverified]**: neither; it needs spending, or a state we can't cause.

Recorded with `scripts/record-lektor-api.mts` and cleaned with `scripts/clean-lektor-recordings.mts`.

### OpenRouter: models and routing

- **[call] Model IDs:** `anthropic/claude-opus-5.5` (canonical `anthropic/claude-opus-5.5-20260921`) and
  `google/gemini-3.8-flash` (canonical `-20260902`). Both accept `reasoning` and `reasoning_effort`. These come from
  `GET /api/v1/models`, which is public.
- **[call] Hosts** (`GET /api/v1/models/<id>/endpoints`, public):
  - Opus 5.5: `anthropic`, `anthropic/fast` (double price), `amazon-bedrock` (plus `/eu-west-1`, `/us-east-1`), `azure`
    (`/global`, `/us`), `google-vertex` (`/global`, `/us`, `/europe`) and `claude-on-aws`.
  - Flash 3.8: `google-ai-studio` and `google-vertex`, each also with `/flex` (half price) and `/priority` (dearer)
    tiers, plus `google-vertex/us`.
- **[call] Zero-retention hosts** (`GET /api/v1/endpoints/zdr`, public):
  - Opus 5.5: only `amazon-bedrock` (all three) and `google-vertex` (all three), all with `safety_retention: false`.
    **Not** `anthropic`, `azure` or `claude-on-aws`.
  - Flash 3.8: only `google-vertex` (`/global`, `/us`, and its flex and priority tiers), all with
    `safety_retention: true`. **Not** `google-ai-studio`.
  - Hence the decision in §2.
- **[docs] The routing object** is `provider: { order, allow_fallbacks (default true), only, ignore, data_collection:
  "allow" | "deny", zdr: true, sort, require_parameters }`.
  - A plain slug in `order` (`"google-vertex"`) matches all of that host's regions.
  - Setting `order` turns off OpenRouter's own load balancing.
  - `data_collection: "deny"` keeps out hosts that store and may train on data. It's no promise about retention:
    some hosts that don't train do keep data. Only `zdr: true` promises no retention.
  - The flex and priority tiers are used only when asked for (`service_tier`, `:floor`, `:nitro`).
- **[docs] Effort:** `reasoning: { effort: "medium" }`, with values `max`, `xhigh`, `high`, `medium`, `low`, `minimal`
  and `none`. On Anthropic models it maps to Claude's effort.
- **[call] Prices** (per million tokens, input/output):
  - Opus 5.5: $4/$20 on `anthropic`, the plain `amazon-bedrock` and `google-vertex/global`. The regional Bedrock,
    Vertex and Azure hosts charge 10 % more ($4.40/$22).
  - Flash 3.8: $0.75/$3.75 on `google-vertex/global`, but $0.825/$4.125 on `google-vertex/us`. The listing shows
    `discount: 0.5` on Flash, which fits the price doubling after the promotion (§2).
- **[docs] Moderation:** the model listing marks Opus `is_moderated: true`, meaning OpenRouter may refuse with a 403
  and moderation details in `error.metadata`. That's the "content filter" case.

### OpenRouter: streaming, cost, cancelling

- **[docs] The stream:**
  - It's SSE `data: {json}` lines ending with `data: [DONE]`.
  - While waiting, it sends comment lines `: OPENROUTER PROCESSING`. Skip anything starting with `:`.
  - Reasoning arrives in `choices[].delta.reasoning_details`, and the words in `choices[].delta.content`.
- **[docs] Errors before the stream starts** are plain JSON with the HTTP status.
- **[docs] Errors mid-stream** keep HTTP 200. The last chunk has a top-level `error` and `finish_reason: "error"`, and
  a 200 may hold nothing but that error. A cut-off reply ends with `finish_reason: "length"`.
- **[docs] Cost:** `usage.cost` arrives in a last chunk just before `[DONE]`. That chunk has one choice with an empty
  delta, which repeats the `finish_reason`; don't read it as a second end.
  - It's automatic: `usage: { include: true }` is deprecated and does nothing.
  - The unit is credits, which are dollars: **[call]** `/key`'s `usage` and `/credits`' `total_usage` agree to the
    nanodollar.
- **[docs] Cancelling** (closing the connection) stops the work and the bill on Anthropic, but **not on Amazon Bedrock
  or Google**, which finish and bill the whole reply. With default routing (§2) a cancelled request may land on
  either kind, so it may be billed in full; accepted silently (§6). That's another reason §9 re-reads the balance
  after a cancel.
- **[unverified] The real stream:** chunk shapes, the reasoning field names for Opus and Flash, and where `usage.cost`
  sits. All three need a paid completion. Record one on the build's first paid test, as in the README.

### OpenRouter: account and errors

- **[call] `GET /api/v1/key`, ordinary key:** `{ data: { label, is_management_key: false, limit, limit_reset,
  limit_remaining, budgets[], effective_budget, usage, usage_daily, usage_weekly, usage_monthly, byok_usage…,
  is_free_tier, expires_at, creator_user_id, organization_id, workspace_id, allowed_data_regions,
  free_model_daily_requests, rate_limit } }`.
  - `limit_remaining` is the key's cap, not the account (§9).
  - The key has an `expires_at` (2027-05-07 for this one), so **a key can expire on a date.** It shows up as the dead
    key.
- **[call] `GET /api/v1/credits`, ordinary key:** `{ data: { total_credits, total_usage } }`, status 200. The docs
  say it needs a management key and answers 403 otherwise. They're wrong today, and could become right.
- **[call] 401, wrong key:** `{"error":{"message":"User not found.","code":401}}`, with header
  `x-openrouter-error-origin: client`. It's the same on `/chat/completions` (before any model runs) and on `/key`.
- **[docs] Error shape** is `{ error: { code: number, message, metadata? } }`, with the HTTP status equal to `code`:
  - 400: bad request.
  - 401: wrong or disabled key.
  - 402: not enough credits, for the account or the key's cap; `metadata.limit_source` says which.
  - 403: moderation or a guardrail.
  - 408: timeout.
  - 429: rate limited.
  - 502: the model is down or answered nonsense.
  - 503: no host meets the routing rules.
- **[unverified] 402, 429, 503 and "no host available" as actually sent.** 402 needs an empty account. The rest need a
  completion with the real key. A completion constrained to no host at all should be free, but the brief allowed no
  completions at all. The 404 "No endpoints found matching your data policy" is known from users' reports, not the
  docs.

### Google: free tier

- **[call] Wrong key** (`/interactions` and `/models` alike): HTTP 400. Unlike the `/interactions` errors below, it's
  in Google's older error shape: `{"error":{"code":400,"message":"API key not valid. Please pass a valid API
  key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID",…}]}}`. On `/interactions` it comes as
  plain JSON although the content type says `text/event-stream`.
- **[call] No key:** HTTP 403 `PERMISSION_DENIED`, "Method doesn't allow unregistered callers…".
- **[docs] Leaked or blocked key:** 403, "Your API key was reported as leaked…". 403 also covers a project that needs
  verification, or a place without a free tier. **[docs]** The `/interactions` error list also has 401
  `authentication` for a missing, invalid or expired key, but no call returned it.
- **[call] Model list** (`GET /models?pageSize=1`, as the key check asks): `{ models: [ { name: "models/…", version,
  displayName, description, inputTokenLimit, outputTokenLimit, supportedGenerationMethods, temperature, topP, topK,
  maxTemperature, thinking } ], nextPageToken }`.
  - The full list (62 models) has `models/gemini-3.5-flash` to `models/gemini-3.8-flash`, with 1,048,576 tokens in and
    65,536 out.
  - It lists only `generateContent`-style methods, never `/interactions`, so don't check for that.
- **[call] Busy, at once:** HTTP 503 within 1–3 s, with body `{"error":{"message":"gemini-3.8-flash is currently
  experiencing high demand, spikes in demand are usually temporary. Please try again later.","code":"service_unavailable"}}`.
  - The `code` is a string here, unlike the key errors.
  - The content type is `text/event-stream`, but the body is bare JSON with no `data:` framing. **The parser must read
    a non-200 body as JSON whatever its content type says.**
  - From 17:01 to 17:12 UTC on 2026-11-10 (00:01–00:12 his time), at about 3-minute intervals, 3.8 answered this way
    all 5 times. 3.6 answered this way 4 times, then queued and answered on the 5th.
- **[docs] `/interactions` error codes** (`error.code`, a string), the ones the Lektor tells apart:
  - `quota_exceeded` 429: the daily quota.
  - `rate_limit_exceeded` 429: per minute or per second.
  - `too_many_requests` 429.
  - `service_unavailable` 503.
  - `deadline_exceeded` 504.
  - `invalid_request` 400.
  - `permission_denied` 403.
  - `payment_required` 402: prepaid credit, so not the free tier.
  - Blocked output: `safety`, `prohibited_content`, `recitation`, `blocklist`, `content_blocked`, `spii`. That's the
    content filter.
- **[docs] Limits** are per project and vary by model. "Requests per day (RPD) quotas reset at midnight Pacific
  time." The free numbers for 3.8 and 3.6 aren't published; AI Studio shows them per project.
- **[unverified] A real 429 `quota_exceeded`,** and whether its body carries a reset time. Getting one would mean using
  up the day's free quota.
- **[call] The stream** (`/interactions?alt=sse`, `stream: true`, `store: false`): one whole request on free 3.6,
  in `google-stream-whole-gemini-3.6-flash.json`. **Where it differs from the docs, the call wins:**
  - **Framing:** each event is an `event: <name>` line plus a `data: {json}` line, and the JSON repeats the name as
    `event_type`. Parse by `event_type` and ignore the `event:` line.
  - **Queued:** `: keep-alive` comments at exactly 15.2, 30.2 and 45.2 s, and nothing else.
  - **Started**, at 51.5 s: `interaction.created` is `{"interaction":{"object":"interaction","model":"gemini-3.6-flash"}}`.
    It has **no `id`, `status`, `created` or `event_id`**, unlike the docs, probably because of `store: false`. Don't
    expect an id to log or resume with.
  - `interaction.status_update`: `{"status":"in_progress"}`, with no `interaction_id`.
  - **Thinking** is a step of its own: `step.start` `{index:0, step:{type:"thought"}}`, then `step.delta`s holding only
    `delta.signature`, an opaque base64 string of ~6 KB, with **no text and no `type`**, then `step.stop`. So the wait
    can tell "thinking" (a `thought` step started) but has no thoughts to show. The docs' `thought_summary` didn't
    appear.
  - **Words:** `step.start` `{index:1, step:{type:"model_output"}}`, then
    `step.delta` `{index:1, delta:{text, type:"text"}}` several times, then `step.stop`. Several events can share one
    network chunk, and one event can span several. All the words came within 10 ms: the work took no time, the wait
    was all queue.
  - **End:** `interaction.completed` with `{status:"completed", usage:{total_tokens, total_input_tokens,
    total_output_tokens, total_thought_tokens, total_cached_tokens, total_tool_use_tokens, initial_input_tokens,
    input_tokens_by_modality}, created, updated, service_tier:"standard", object, model}`. Then a last
    `event: done` / `data: [DONE]`. **The reply names the model that ran (`model`)**, which is what "log which model
    answered" should log.
  - Thought tokens: 1,437 thought against 244 written, for a short text.
- **[docs] `error` event:** `{ event_type: "error", error: { code, message } }`, which can come mid-stream.
  **[call, earlier]** A mid-stream "high demand" refusal after queuing was seen by the queue probe on 2026-11-09/10
  (`design/lektor-free-queue-measurements.md`), but its exact bytes weren't kept. **[unverified]** That shape, and
  whether its `code` is `service_unavailable` as in the 503.
- **[unverified] A whole stream on 3.8.** It was refused at once every time it was tried. The measurements file has
  3.8 queuing ~5 minutes on other days with the same events, so expect the same shapes.

## 17. Where it goes in the code

Read from `lektor-openrouter` on 2026-11-11. That branch carries `ai-lektor` → `rewrite-review` → `change-choices`,
plus the prototype and the fixtures, and the build happens on it; `main` has no Lektor. Paths are from the repo
root. Anything marked *(guess)* is a suggestion and not something the code settles. Danilo's answers to the
questions this section first raised are listed at its end, and are written into the sections above.

**How it works today.**
- **Services:** the renderer builds one `LektorService` per level (`free` Gemini, `thorough` Claude, `fake` the test
  Lektor) in `createLektor` (`src/ui/lektor/lektor-sidebar.ts`). Each gets the `ask` seam (`LektorServiceParts.ask`
  in `lektor-service-call.ts`).
- **The way out:** `ask` is `host.askLektorService` (`src/platform/host.ts`).
  - In the app it goes through IPC `lektor:request` (`invoke`, one answer) in `src/hosts/electron/electron-main.ts`.
  - In the browser it goes to POST `/lektor-ai` on `scripts/serve.mjs`.
  - Both end in `askLektorService` (`src/platform/lektor-remote.ts`).
- **The reply comes back whole.** Nothing crosses the process boundary while a request runs.
- **The sidebar:** keeps a `TextState` per text and a `Screen` union. It also has the kind-of-correction screen.
- **The corrections window:** `lektor-dialog.ts` is the review alone. The window's wait and failure are
  `plainPanel`s built in the sidebar.

### 17.1 The engine

**Removed first,** since it shrinks everything after it:
- **Anthropic direct:** `lektor-claude-ai.ts`, `src/platform/claude-reply-stream.ts`, `askClaude` and the `claude`
  provider in `lektor-remote.ts`, `LEKTOR_CLAUDE_URL` in `scripts/serve.mjs`, `anthropicKey`, and
  `lektor-mark-anthropic.svg`.
- **The test Lektor:** `lektor-fake-ai.ts`, `lektor-fake-setting.ts` (`lektor-test.json`, `FAKE_BEHAVIOURS`), the
  `fake` level, its Advanced-settings switch, `lektor-mark-test.svg`, and `test/lektor-fake-ai.test.ts`.
  - The saved real replies (`lektor-test-replies.ts`, `realReply`, `host.realLektorReply`, the dev server's
    `/lektor-real-reply`) move into the fake network instead (§17.5).
  - A leftover `lektor-test.json` on a test machine is simply never read again.

**The way out: `src/platform/lektor-remote.ts`**
- **Provider:** `LektorProvider` becomes `'gemini' | 'openrouter'`, with `https://openrouter.ai/api/v1` and an
  `openrouter` entry in `LektorAddresses`.
- **The balance:** a `'balance'` action that reads `/credits` and `/key` and returns both bodies, so the rule in §9
  is applied in one tested place in the renderer *(guess)*. The OpenRouter key check (`'check'`) is `GET /key`.
- **Free sends:** `askGemini` POSTs to `/interactions?alt=sse` with `stream: true`, keeping `store: false` and the
  `Api-Revision` header. A new `src/platform/google-interaction-stream.ts` reads the stream (parse rules in §16).
  - `plainResponse` already parses a non-200 body as JSON whatever its content type, which is what the bare-JSON
    503 and 400 need. Keep it.
- **Paid sends:** a new `src/platform/openrouter-reply-stream.ts` reads OpenRouter's SSE (§16). Opus gets
  `reasoning: { effort: "medium" }`; Flash gets no reasoning setting; there's no `provider` object.
- **Time limit:** `GEMINI_LIMIT_MS` (240 s) becomes a 10-minute send limit, for both providers.
- **Progress, the one real change of shape.** The chain needs "still queued at 1 minute" and "work began", and the
  window's wait needs its stages. So `askLektorService` takes an `onProgress` callback, with a discriminated union
  such as `queued | started(model) | thinking | writing(share)` *(names a guess)*.
  - **In the app:** the `lektor:request` handler sends `lektor:progress` with the request id over
    `event.sender.send`. `src/hosts/electron/preload-bridge.ts` exposes a listener for it, and
    `src/hosts/electron/browser-entry.ts` routes it by id.
  - **In the browser:** `/lektor-ai` answers in lines (NDJSON): progress lines, then the response
    *(guess)*. `src/hosts/mockup/browser-entry.ts` reads them.
  - `Host.askLektorService` in `src/platform/host.ts` gains the callback.
- **Keep as they are:** `LEKTOR_STOPPED`, `LEKTOR_TIMED_OUT`, `LEKTOR_UNREACHED`, the empty-key short-circuit,
  `ping` (now for the keyless internet check, §4), and `lektorRequestFrom` (it only learns the new provider and
  action).

**The services: `src/ui/lektor/`**
- **`lektor-service.ts`:**
  - `feedback` and `corrections` return `{ words, model, cost }` in place of a string *(guess)*, so the tier, mark
    and cost come from the model that ran (§3).
  - `company` becomes `'google' | 'openrouter'`, for tooltips and the privacy line.
  - `LektorFailure` maps onto §10 as follows:
    - `overloaded` → busy, and it needs a side (free or paid);
    - `limit` → Google's daily limit only;
    - `declined` → content filter;
    - `no-credit` stays;
    - add "money gone after a hand-over" and "text deleted".
  - `finalSentence` (today it means "no retry") is replaced by what §10 decides per case: the shortcut, and
    "Pokušaj ponovo" only for no internet and a cut-off reply.
- **`lektor-gemini-ai.ts`:** rewrite.
  - `MODEL = 'gemini-3.6-flash'` and its "never a weaker model" comment go.
  - `refusal()` today reads every 429 as the daily cap and spots a bad key by a regex on the message. Read
    `error.code` instead (`quota_exceeded`, `rate_limit_exceeded`, `too_many_requests`, `service_unavailable`), and
    `details[].reason` `API_KEY_INVALID` for a 400.
  - Add a `codeOf` beside `messageOf` in `lektor-service-call.ts`; `messageOf` already unwraps Google's list.
  - `wordsOf` reads a whole interaction, so it goes once the words come from the stream.
  - Keep the warning on an unrecognised refusal.
- **A new `lektor-openrouter-ai.ts`,** in place of the Claude one: the refusal kinds come from the status (§2,
  §16), not from Anthropic's wording. A 404 "No endpoints found" is `log.error` and shown as paid busy.
  `finish_reason: "length"` means cut off.
  - Keep the reply checks `proposalFrom` and `withHisFilingMarks` in `lektor-instructions.ts` as they are; they
    work on words from any model.
- **The model chain:** new and pure, in `src/ui/lektor/lektor-model-chain.ts` *(name a guess)*.
  - It takes the work kind, the choice, the tick and a clock seam (`performance.now()` and injected timers).
  - It runs §2 and §5, calling `ask` once per model.
  - It sends out the stage events the window's wait draws.
  - Keep it out of the sidebar, which is 1,105 lines already.
- **The reset time:** `lektor-daily-cap.ts` reads Google's "retry in 15h57m" and "limit: N requests per day".
  Replace that with the next midnight Pacific as a local 24-hour time, with no day word (§10).
  `freeResetWords` in `design/lektor-prototype-pieces.ts` does the sum; drop its "danas"/"sutra" and don't fuss over
  the clock-change days. `test/lektor-daily-cap.test.ts` tests the old parse and gets rewritten to §11.
- **The balance:** a new `lektor-balance.ts` *(guess)*.
  - It parses both bodies and returns the lower figure, ignoring a `null` `limit_remaining`.
  - On a 403 from `/credits` it falls back to `limit_remaining`; when unreadable it returns `null`.
  - The $1 threshold is in the prototype as `LOW_BALANCE_USD`.
  - The display format ($7,47) belongs with the wording, since `dollars()` in the prototype is display.
  - It subtracts on finish, re-reads after a failure or cancel, and logs every read.
- **The tick box default:** a pure function (paid key, balance) → boolean. The prototype's `paidIfSlowByDefault`
  in `design/lektor-choice-radios.ts` reads prototype state, so write it anew.
- **Logging:** "Asked a Lektor service" (`electron-main.ts:248`) logs provider, action, model, status, ms and
  `reply.usage`, and only Claude's reply had `usage`.
  - Add `cost` (OpenRouter's `usage.cost`) and the model that answered (Google's `interaction.completed.model`) as
    named fields, never the reply.
  - Do the same for the dev server's console line (`scripts/serve.mjs:147`).
  - The renderer logs the balance reads, and the chain logs each model step.

**Tests for the engine**
- **What fakes `ask` today:** `test/lektor-services.test.ts` hands the services a `parts.ask` that pops hand-written
  `{ status, body }` answers. Its bodies (`{ error: { message } }`, Claude's `stopReason`) and its test "never falls
  back to a cheaper model" are the old behaviour; most of the file is rewritten.
  - `correctionInstruction`, `withHisFilingMarks` and `proposalFrom` keep their tests.
- **Fakes from `test/fixtures/lektor-api/`, in two layers:**
  1. **Bytes → stream readers.** Feed each fixture's `pieces` to `google-interaction-stream.ts` and
     `openrouter-reply-stream.ts` as `Uint8Array` chunks. Do it as recorded, and also split mid-event.
  2. **Scripted `ask` → services and chain.** Build a fake `ask` per model from the fixtures' final responses, plus
     progress events on a fake clock: "3.8 busy, 3.6 queues 70 s then streams". This is the seam §11 means. The
     same fake serves the GUI tests (§17.5), so write it once, in `src/hosts/mockup/` *(guess)*, and import it from
     `test/`.
- **`test/lektor-claude-route.test.ts`** runs the dev server for real against a local stand-in, through
  `LEKTOR_CLAUDE_URL`. Keep the pattern and retarget it: `LEKTOR_GOOGLE_URL` and `LEKTOR_OPENROUTER_URL`, serving
  fixture bytes at their `atMs`. That also covers the NDJSON route.
- **`test/lektor-elapsed-time.test.ts`** stays. It already holds a stepped-back clock at zero, but the sidebar feeds
  it `Date.now()` (`readingSince`, `waitingLine`, `correct`), so switch those to `performance.now()`.

### 17.2 Keys, the dead key, no keys, offline

- **`lektor-settings.ts`:**
  - `LektorSettings { googleKey, anthropicKey }` becomes `{ googleKey, openRouterKey }`.
  - `writeLektorSettings` lays what it writes over what's in the file, so a stray `anthropicKey` is left alone and
    never read.
  - `RealLevel 'free' | 'thorough'` becomes the choice `'free' | 'paid'`.
- **The keys screen (sidebar):** `keyScreen`, `keyField`, `saveKeys`, `checkPastedKeys` and `checkOneKey`, with
  `keyNotes` and `isKeyJustSaved` (`words().keyWorks`). Reuse them.
  - **To add:** the labels, "✓ Radi · na računu $X", Nazad at the left of Sačuvaj, and no Nazad without keys.
  - `settleOnLevelWithKey` already does "Plaćeni only without a free key".
- **Opening (§4):** today `openSidebar` runs `checkConnection()` (a keyless ping) only when there's no comment,
  behind the `connecting` and `offline` screens. It becomes:
  - **every opening,** comment or not;
  - **with keys saved:** Google's model list and the balance lookup, in parallel. No answer at all → `offline`; an
    answer of 400, 401 or 403 → a new `dead-key` screen;
  - **with no keys:** the keyless ping, then `offline` or the keys screen.
  - The `offline` screen keeps its "Pokušaj ponovo" and the `online` listener that re-checks. `connecting` stays as
    the brief state while the check runs.
  - A panel already open on the utisak isn't touched when the internet goes.
- **The dead key on sending:** today `showReadFailure` sends a `bad-key` to the `key` screen with a note. It
  should go to `dead-key` with Nazad instead.
  - The field's "Ovaj ključ više ne radi. Zalepi novi." is a new `keyNotes` value, cleared by a working paste.
- **Tests:** `test/lektor-settings.test.ts` covers the file; its test-Lektor-setting tests go. Three GUI tests cover
  keys today: "asks for the keys", "with only the free key…" and "with only the paid key…". Rewrite them to §4.

### 17.3 The panel

- **`lektor-sidebar.ts`, the screens:** the `Screen` union becomes:
  - connecting, offline, menu, step 2 (the utisak's Lektor), reading, failed, response, keys and dead-key;
  - "done or failed while another text is open", and "deleted", as states of the request's own text.
  - `correctionsScreen`, `presetChoice` and `correctionsFoot` go to the window.
- **Split the file** *(guess)*:
  - the choice piece, shared with the window's Stilska and Dubinska (radios, tick box, balance line):
    `lektor-choice.ts`;
  - the wait, shared too: `lektor-wait.ts`;
  - the menu: `lektor-menu.ts`;
  - the pictures, from `design/lektor-menu-icons-prototype.ts` (`drawPicture`, `UTISAK_PICTURES`).
- **Reuse:**
  - **`waitingLine`:** the clock and `elapsedLine`. Its changing notes (the `WAITS` thresholds, `waitLong`,
    `waitVeryLong`) go: the line stays as the prototype's `commentWaiting` has it.
  - **`problem()`:** the failure box, with the service's words and `copyMessageButton`, kept on every failure.
  - **`footer()`:** becomes the strip, with Nazad at the left.
  - **`backButton()`:** "← Traži novi utisak".
  - **`commentHead` and `staleNote`,** with `standingOf` (`lektor-comment-standing.ts`), the note keeping its word
    count (`changedSince`).
  - **`revealed()`:** the word-by-word reveal stays as it is.
  - **`commentSignature`:** `serviceLine`, `describeWhen` and `aboutAi()`.
    - It needs the cost.
    - The v1 bug: `aboutAi` re-renders and scrolls nothing, so scroll the explanation into view after the render.
  - **`privacyWarning()`:** `privacyWhole(count, recipient)` gets new wording naming both companies, and moves to
    the menu.
- **What it opens on:** `openSidebar` today goes to `start` for an `outdated` comment. It goes to the utisak
  whenever there is one. `standingOf` then decides only whether the stale note shows, so its `outdated` and
  `changed` kinds can become one *(guess)*.
- **The marks:** `lektor-service-mark.ts` maps `free`, `thorough` and `fake` to the company SVGs (copied by
  `scripts/build.mjs:143`). It becomes the three tiers with Lucide line marks and §3's colours, as `markOf` in the
  prototype draws them.
  - The trademark comment and the SVG files go.
- **The title line:** `titleFrom` (`src/notes/note-title.ts:37`) and nothing else, then:
  - strip his outer quotes;
  - cut at a word with "…";
  - "bez naslova" when empty.

  A small pure function with its own tests. `titleFrom`'s `\s` doesn't catch every control character: test it.
- **Another text:** today `openTextChanged` → `settleWhatWasUnderway` → `stopWorking()` cancels the reading. §6
  wants the opposite.
  - The `states` Map already holds one state per text, and `working` is already one request at a time.
  - What's missing is "the request's text" kept apart from `openKey` while it runs, so `render()` draws that one.
- **Deleted or archived mid-request:** there's no hook. The `Lektor` interface (`openTextChanged`,
  `startedNewText`) needs one more, called from `src/ui/ui-app.ts` where a text is put away (around
  `src/ui/deleted-and-archived/put-away-texts.ts`).
- **Closing:** `goAway` already stops a reading through `settleWhatWasUnderway`. Only where it lands changes: step
  2, not start/response.
- **Every choice starts on Besplatni:** today `level` lives in `createLektor` and holds while the app is open (the
  comment at line 171). Reset it on each step 2 and on "Traži novi utisak".
- **After the window:** `finishWithReview` closes the panel. It goes; the panel stays on the screen the window was
  opened from.
- **Tests:** `lektor-comment-standing.test.ts` stays, less its "outdated opens on the first step" cases if the kinds
  merge. The GUI tests on sittings and stale notes (lines 194–266) change to "always opens on the utisak".

### 17.4 The corrections window

- **One modal with two sides,** in a new `lektor-corrections-window.ts` *(guess)*.
  - The left side has the kinds. The right side shows nothing picked, the card, the void line, the request, the
    wait, a failure, or the review.
  - Lay it out as `design/lektor-corrections-window-prototype.ts` does.
  - `correct()` and `showCorrectionFailure()` leave the sidebar.
- **Take from `openLektorDialog` (`lektor-dialog.ts`), so the review draws inside the right side:**
  - `viewOfDiff` and `legend`; `onlyNewChoice` (the checkbox) gives way to "Izgled izmena" (§8). The mockup's
    `viewChoice` in `design/lektor-corrections-window-prototype.ts` draws it, with its CSS in
    `design/lektor-choice-prototype.html` (`.lektor-view-*`);
  - the `noticeIfAtTheEnd` confetti (`burstFrom`);
  - `leave()` with `openConfirmDialog` and the existing `review.leaveTitle`, `leaveBody`, `leaveBodyDecided` and
    `leaveCancel`, picked by `review.hasDecisions()`. §7's wording is already there.
- **Change in the review:** today's footer is the footer note, then "Unesi sve izmene u tekst", then Zatvori. It
  becomes "← Nazad", solid "Unesi sve izmene u tekst" and Zatvori. The header line moves into `withKind` and its service line.
- **The instruction shown:** today the box shows `PRESET_PROMPTS[preset]` only, and `CORRECTION_RULES` and
  `REWRITE_RULES` stay hidden. Show what `correctionInstruction` sends, less his note, which is in its own box below.
- **Reuse as they are:** `showAsModal`, `titleOf`, `PRESET_ORDER`, `PRESET_PROMPTS`, `parts.applyCorrections` (which
  keeps a version first), and `withEndingOf`.
- **The card and the void line: `lektor-kept-results.ts`.**
  - **Matching goes:** one set per kind, the latest. `savedCorrections` drops the level and the note from the match
    (`isSameChoice`), and `withCorrections` replaces by `preset` alone.
  - **To add:** `madeAt` (for "od pre 3 dana") and `cost` (for "plaćeno $0,48"). The tier comes from `model`.
  - **The void line** is `proposals.length > 0 && !isSameText(text, proposalsFor)`, which today's data already
    supports. `isSameText` is the trailing-whitespace rule the spec asks for.
  - **"Prošli put za ovaj tekst: $X"** must outlive a new set and a changed text, so it's a field of its own, such
    as the last paid cost per kind *(guess)*.
  - **Older files:** `keptResultsFrom` must accept them without the new fields. An old file with two sets of one
    kind keeps the later one.
- **Tests:** `test/lektor-kept-results.test.ts` covers matching, replacing and dropping. Its "stand side by side for
  each kind and each Lektor" and the note-matching tests become "one per kind"; add the new fields and the void
  rule. GUI test "shows corrections already made…" (line 146) and the review tests (lines 293, 327) carry over,
  reached through the window.

### 17.5 GUI tests and the fake network

- **Today:** `test-gui/lektor.spec.ts` turns on the test Lektor by writing `Podaci/lektor-test.json` into the mock
  store (`withTestLektor`). It counts `**/lektor-ai` requests and aborts them. Keep that counter as the guard; the
  test Lektor goes.
- **The fake network** *(guess on where and how)*: a fake `ask` in `src/hosts/mockup/`, so it's in the browser
  build only and the installed app can't contain it. `test/boundaries.test.ts` already keeps `hosts/electron` from
  importing `hosts/mockup`, and keeps Node out of the mock host, so the fake can have no `node:` imports.
  - It replays the fixture-built scripts (§17.1) on timers that `page.clock` drives (`install` and then `pauseAt`,
    as DESIGN.md says), so a queue, the 1- and 2-minute steps and a hand-over can be acted out.
  - A GUI test picks its script by name, written into the mock store the way `withTestLektor` does today.
  - `page.route('**/lektor-ai')` can't do this alone: a fulfil hands over the whole body at once.
- **The saved real replies go into it.** A correction request for a text whose title matches a sample is answered
  with that sample's saved reply, as if Opus had sent it. Use today's title rule (`savedTestReply`) and today's
  sources: the dev server reads `testdata/diff-samples/`, which is gitignored and stays private.
  - Keep the `[SAVED OPUS CORRECTIONS]` mark under the title, so a saved reply can't pass for a fresh one.
  - In the packaged app this is gone, with the rest of the test Lektor. Trying the review on what Opus really sends
    happens in the browser build.

### 17.6 Documents

- **DESIGN.md:** the changes in §12, in its "AI Lektor" section, and the `lektor.json` row (Google's and
  OpenRouter's keys). Remove the `lektor-test.json` row. "Testing" names `test-gui/lektor.spec.ts` and the test
  Lektor; it becomes the fake network.
- **`HANDOFF-AI-LEKTOR.md`:** describes the old step 1 ("Google: besplatan…", "Anthropic: plaćen…") and the test
  Lektor. It says it can go once that work is merged; its "Where things live" table is still right today.

### Decided with Danilo, 2026-11-11

The questions this section raised, and his answers. Each is also written where it applies above.

1. **Branch:** build on a new branch off `lektor-openrouter`, not from `main`.
2. **Anthropic direct:** removed.
3. **The test Lektor:** removed. The saved real replies move into the fake network (§17.5).
4. **Opening:** the key checks double as the internet check; with no keys, a keyless check. An offline screen with
   "Pokušaj ponovo" comes first, over a kept utisak too. No extra work to read a utisak offline, but a panel
   already open on it stays.
5. **The reset time:** a local 24-hour time with no "danas"/"sutra"; clock-change days aren't worth code.
6. **The service's own words** with "Kopiraj poruku": kept, small and grey.
7. **"Pokušaj ponovo":** only where it may work: no internet and a cut-off reply.
8. **The wait's line:** as the prototype has it now, fixed, whatever the spec said. The app's changing note goes.
9. **The word-by-word reveal:** kept.
10. **Opening on a comment:** always the utisak. The stale note keeps its word count.
11. **After the review:** the panel stays open, where the window was opened from.
12. **Cards:** one, the latest set of the kind.
13. **Kept sets:** one per kind, the latest; a cheaper re-run replacing a paid set is accepted.
14. **Effort:** Opus at medium as tested; Flash, free and paid, at each service's default.
15. **The instruction shown:** the whole English instruction sent to the model, rules included.
16. **English wording:** translated by whoever builds it; Danilo may review it.
17. **Kept as they are:** the 10-word minimum, and the opener labelled "Lektor".
18. **The panel behind the window:** where it was; it stays there after the window closes.

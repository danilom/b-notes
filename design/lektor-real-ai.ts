import { type CorrectionRequest, type LektorFailure, type LektorService, LektorServiceError } from './lektor-service.ts';

/*
  The Lektor on real Gemini, for trying the prompts while the screens are still a
  prototype. Goes through the dev server, which holds the key and alone may talk to
  Google; in the app that part belongs to the main process. Nothing here logs text.
*/

export const KEY_STORE = 'lektor-fake-key';

/** Best first. A model that is overloaded is passed over for the next, quietly: he can do nothing about it. */
const FEEDBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.1-flash-lite'];
const CORRECTION_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.6-flash'];

/** A corrected text this much shorter has lost something, rather than been corrected. */
const SHORTEST_SHARE_KEPT = 0.6;

const FEEDBACK_INSTRUCTION = `Ti si pažljiv čitalac ovog teksta, a ne učitelj. Napiši autoru svoj utisak u najviše tri kratka pasusa, obraćajući mu se sa „ti”.

U prvom reci šta ti je ostalo i zašto, i navedi jedno konkretno mesto iz teksta, kratkim navodom.
U drugom reci gde si zastao ili želeo nešto više, i opet navedi to mesto.
U trećem reci nešto o celini.

Bez opšte hvale, bez ocena i bez spiska saveta. Ne izmišljaj lično iskustvo. Ako nisi siguran u neku činjenicu, nemoj je tvrditi. Piši narečjem kojim je tekst pisan.
Vrati samo te pasuse, običnim tekstom, bez naslova i oznaka.`;

const SECOND_LOOK_INSTRUCTION = `Ti si pažljiv čitalac koji je već jednom čitao ovaj tekst. Autor ga je u međuvremenu menjao. U jednom ili dva kratka pasusa, obraćajući mu se sa „ti”, reci šta njegove izmene menjaju u tvom utisku. Govori samo o onome što se između dve verzije zaista promenilo i navedi to mesto. Ako je izmena sitna, reci to u jednoj rečenici. Bez opšte hvale. Piši narečjem kojim je tekst pisan.
Vrati samo te pasuse, običnim tekstom, bez naslova i oznaka.`;

/** What he doesn't need to read: rules about the shape of the answer, added to what he does. */
const CORRECTION_RULES = `Zadrži naslov, prelome redova i prazne redove tačno kako jesu, osim ako je baš tu greška.
Vrati ceo tekst, samo ispravljen, bez ikakvog komentara i bez oznaka oko njega.`;

function keyNow(): string {
  // None saved means the dev server uses its own, from testdata/.
  return window.sessionStorage.getItem(KEY_STORE) ?? '';
}

async function callServer(body: object, signal: AbortSignal): Promise<{ status: number; reply: unknown }> {
  let response: Response;
  try {
    response = await fetch('/lektor-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new LektorServiceError('offline');
  }
  const raw = await response.text();
  try {
    return { status: response.status, reply: JSON.parse(raw) };
  } catch (error) {
    console.error('The Lektor service answered with something unreadable', error);
    return { status: response.status, reply: null };
  }
}

function messageOf(reply: unknown): string {
  if (typeof reply !== 'object' || reply === null || !('error' in reply)) return '';
  const error = reply.error;
  if (typeof error !== 'object' || error === null || !('message' in error)) return '';
  return typeof error.message === 'string' ? error.message : '';
}

/** What a refusal means to him. Only the kinds he should hear differently are told apart. */
function failureFor(status: number, reply: unknown): LektorFailure {
  const message = messageOf(reply);
  if (status === 502) return 'offline';
  if (status === 429) return 'limit';
  if (status === 401 || status === 403 || /api.?key/i.test(message)) return 'bad-key';
  if (status === 400 && /token|too long|too large|size/i.test(message)) return 'too-long';
  console.error('The Lektor service refused', { status, message });
  return 'overloaded';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The reply's words, from the last of the model's steps: an earlier one may be its thinking. */
function wordsOf(reply: unknown): string | null {
  if (!isRecord(reply)) return null;
  if (typeof reply['output_text'] === 'string') return reply['output_text'];
  const steps = reply['steps'];
  if (!Array.isArray(steps)) return null;
  const last = steps.filter(isRecord).findLast((step) => step['type'] === 'model_output');
  const content = last?.['content'];
  if (!Array.isArray(content)) return null;
  const texts = content.filter(isRecord).flatMap((part) => (typeof part['text'] === 'string' ? [part['text']] : []));
  return texts.length === 0 ? null : texts.join('');
}

async function ask(models: readonly string[], system: string, input: string, signal: AbortSignal): Promise<string> {
  for (const model of models) {
    const { status, reply } = await callServer({ action: 'send', key: keyNow(), model, system, input }, signal);
    if (status === 503 || status === 500) continue;
    if (status !== 200) throw new LektorServiceError(failureFor(status, reply));
    const words = wordsOf(reply);
    const finished = !isRecord(reply) || reply['status'] === undefined || reply['status'] === 'completed';
    if (words === null || words.trim() === '' || !finished) throw new LektorServiceError('cut-off');
    return words;
  }
  throw new LektorServiceError('overloaded');
}

/** Whatever it wrapped the text in, and an ending that matches his. */
function cleanedProposal(reply: string, original: string): string {
  const unfenced = reply.replace(/^\s*```[^\n]*\n/, '').replace(/\n```\s*$/, '');
  const body = unfenced.replace(/\s+$/, '');
  const ending = /\s*$/.exec(original)?.[0] ?? '';
  return body + ending;
}

/** A reply that came back much shorter is not offered: already accepted in the review, it would delete his text. */
async function corrections(request: CorrectionRequest, signal: AbortSignal): Promise<string> {
  const note = request.note.trim() === '' ? '' : `\n\nAutor još kaže: ${request.note.trim()}`;
  // Suggesting takes more thought than correcting: the quicker model hardly offers any.
  const models = request.preset === 'wording' ? FEEDBACK_MODELS : CORRECTION_MODELS;
  const reply = await ask(models, `${request.instruction}${note}\n\n${CORRECTION_RULES}`, request.text, signal);
  const proposal = cleanedProposal(reply, request.text);
  if (proposal.length < request.text.length * SHORTEST_SHARE_KEPT) throw new LektorServiceError('cut-off');
  return proposal;
}

export const realAi: LektorService = {
  needsKey: () => false,
  connectionCheck: async (signal) => {
    const { status } = await callServer({ action: 'ping' }, signal);
    if (status !== 200) throw new LektorServiceError('offline');
  },
  keyCheck: async (key, signal) => {
    const { status, reply } = await callServer({ action: 'check', key }, signal);
    if (status !== 200) throw new LektorServiceError(failureFor(status, reply));
  },
  feedback: async (text, signal) => (await ask(FEEDBACK_MODELS, FEEDBACK_INSTRUCTION, text, signal)).trim(),
  secondLook: async (text, earlier, signal) => {
    const input = `Tekst kakav je bio:\n${earlier.text}\n\nTvoj raniji utisak:\n${earlier.comment}\n\nTekst sada:\n${text}`;
    return (await ask(FEEDBACK_MODELS, SECOND_LOOK_INSTRUCTION, input, signal)).trim();
  },
  corrections,
};

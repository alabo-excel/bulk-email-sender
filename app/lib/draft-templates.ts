export type EmailDraft = { tone: string; subject: string; body: string };

type Point = {
  /** "sentence" is prose to keep, "detail" a note to list, "want"/"invite" an ask to close on. */
  kind: "sentence" | "detail" | "want" | "invite";
  text: string;
  block: number;
  bullet: boolean;
};

/** A greeting the writer typed themselves, e.g. "Hi Sam," — we keep theirs instead of adding one. */
const GREETING_LINE = /^(?:hi|hey|hello|dear|greetings|good (?:morning|afternoon|evening|day))\b[^\n]{0,60}$/i;

/** A sign-off the writer typed themselves; the campaign footer supplies the signature. */
const SIGN_OFF_LINE = /^(?:thanks|thank you|many thanks|cheers|best|regards|(?:kind|warm|best) regards|sincerely|yours (?:sincerely|truly)|talk soon|speak soon)\b[\s,.!-]*$/i;

/** Sentence boundary: terminator, space, then the start of a new sentence — not "$9.99" or "e.g. this". */
const SENTENCE_BREAK = /(?<=[.!?])["')\]]?\s+(?=[A-Z"'({[])/;

const BULLET_MARKER = /^(?:[-*•–—>]+\s*|\d+[.)]\s+)/;

/** "…and ask if they'd like a demo" — a second instruction tacked onto one sentence. */
const CLAUSE_BREAK = /,?\s+(?:and|then)\s+(?=(?:ask|invite|encourage|urge|mention|note|include|say|state|explain|highlight|point out|talk about|cover|tell (?:them|him|her|everyone)|let (?:them|him|her|everyone) know|remind (?:them|him|her|everyone))\b)/i;

/** "ask if they'd like a demo" — what they may want becomes the closing ask. */
const ASK_FOR = /^(?:and |also |then )?(?:please )?ask (?:them |him |her |everyone |people |you )?(?:if|whether) (?:they|he|she|you)(?:'d| would| will)? ?(?:like|want|wants|need|needs|are interested in|is interested in) (.+)$/i;

/** "invite them to book a call" — the action they can take becomes the closing ask. */
const ASK_TO = /^(?:and |also |then )?(?:please )?(?:ask|invite|encourage|remind|urge) (?:them|him|her|everyone|people|you|[\w' ]{2,40}?) to (.+)$/i;

/** "mention the free trial" — a note to the writer, not a sentence they want sent as-is. */
const DETAIL = /^(?:and |also |then )?(?:please )?(?:mention|note|include|say|state|explain|highlight|point out|talk about|cover|tell (?:them|him|her|everyone)|let (?:them|him|her|everyone) know|remind (?:them|him|her|everyone))(?: that| about| how)? (.+)$/i;

/** Brief-style openers ("I'm writing to…") that read badly in a subject line. */
const BRIEF_LEAD_IN = /^(?:(?:i|we)(?:'m|'d| am| are| would)?\s+(?:writing|reaching out|want|wanted|need|would like)\s+to\s+|(?:please\s+|kindly\s+)?(?:let\s+(?:them|him|her|us|you|everyone)\s+know|tell\s+(?:them|him|her|everyone)|remind\s+(?:them|him|her|everyone)|inform\s+(?:them|him|her|everyone))\s+|this\s+(?:email|message|note)\s+is\s+to\s+|just\s+a\s+(?:quick\s+)?(?:note|reminder|heads[-\s]?up)\s+(?:to|that|about)\s+)/i;

/** A sentence that already opens an email; it becomes the opening line untouched. */
const OPENER = /^(?:i|we)(?:'m|'d|'ve|\s+(?:am|are|have|hope|just|want|wanted|would|will|recently))\b/i;

/** Clause openers that are safe to lowercase when folded into a generated sentence. "I" never is. */
const FUNCTION_WORD = /^(?:we|our|my|your|you|they|their|he|she|it|its|his|her|the|this|these|those|a|an|all|any|every|some|most|there|next|last|from|on|as|due|no|nothing|everything)$/i;

/** A verb or auxiliary, so a fragment like "the free 14-day trial" is not folded into a sentence. */
const VERBISH = /\b(?:is|are|was|were|be|been|being|am|will|would|can|could|may|might|must|shall|should|has|have|had|do|does|did|won't|don't|doesn't|didn't|isn't|aren't|can't)\b|\w(?:ed|ing)\b/i;

/** Commands and questions cannot be folded into "…that <clause>". */
const IMPERATIVE = /^(?:join|come|visit|check|see|book|reply|call|sign|register|save|get|grab|try|download|order|buy|use|read|watch|click|follow|don't|do|please|let|take|make|bring|send|share|tell|ask|invite|remember|note|find|feel)\b/i;

/** An ask only reads as an instruction when it starts with something the reader can do. */
const ACTION_VERB = /^(?:try|book|schedule|join|visit|come|check|see|reply|respond|register|sign|rsvp|confirm|renew|download|read|review|share|call|email|order|buy|use|attend|apply|complete|fill|update|take|get|explore|start|test|claim|redeem|bring|send|follow|subscribe|donate|vote|pick|choose|save|let|keep|watch|click|browse)\b/i;

/** The writer already told the reader what to do, so we add no ask of our own. */
const OWN_ASK = /\b(?:reply|respond|write back|let me know|get in touch|sign up|register|rsvp|book (?:a|an|your)|schedule (?:a|an|your)|call me|email me|click|visit us)\b/i;

const TONES = [
  {
    tone: "Concise",
    greeting: "Hello,",
    lead: (clause: string) => `I wanted to let you know that ${clause}.`,
    opening: "I wanted to share a quick update with you.",
    detailOne: (detail: string) => `A quick note: ${detail}.`,
    detailLead: "Here are the details:",
    want: (thing: string) => `If you'd like ${thing}, just reply to this email.`,
    invite: (action: string) => `To ${action}, just reply to this email.`,
    closing: "Let me know if you have any questions.",
    thanks: "",
  },
  {
    tone: "Friendly",
    greeting: "Hi there,",
    lead: (clause: string) => `I hope you're doing well. I just wanted to let you know that ${clause}.`,
    opening: "I hope you're doing well. I wanted to share a quick update with you.",
    detailOne: (detail: string) => `Here's what's worth knowing: ${detail}.`,
    detailLead: "Here's what's worth knowing:",
    want: (thing: string) => `If you'd like ${thing}, just reply to this email and I'll sort it out.`,
    invite: (action: string) => `If you'd like to ${action}, just reply and I'll help you get started.`,
    closing: "Let me know if you have any questions — happy to help. Thanks for your time!",
    thanks: "Thanks for your time!",
  },
  {
    tone: "Formal",
    greeting: "Hello,",
    lead: (clause: string) => `I hope this message finds you well. I am writing to inform you that ${clause}.`,
    opening: "I hope this message finds you well. I am writing to share an update with you.",
    detailOne: (detail: string) => `Please note the following: ${detail}.`,
    detailLead: "Please also note the following:",
    want: (thing: string) => `If you would like ${thing}, please reply to this message.`,
    invite: (action: string) => `Should you wish to ${action}, please reply to this message.`,
    closing: "Please let me know if you require any further information. Thank you for your time.",
    thanks: "Thank you for your time.",
  },
];

type Tone = (typeof TONES)[number];

/**
 * Writes three straightforward emails from what the writer typed: an opening
 * sentence built around their first point, their remaining points as prose or
 * a short list, and a closing sentence built from whatever they asked the
 * reader to do. Deterministic composition only — no network calls, no language
 * model, and no facts beyond the ones they supplied.
 */
export function generateTemplateDrafts(description: string): EmailDraft[] {
  const message = normalize(description);
  if (!message) throw new Error("Enter the main message for your email.");

  const [firstLine, ...restLines] = message.split("\n");
  const rest = GREETING_LINE.test(firstLine.trim()) ? restLines.join("\n").trim() : "";
  const ownGreeting = rest ? firstLine.trim() : "";
  const points = toPoints(rest || message);
  const subject = toSubject(points[0]?.text ?? message);
  const signedOff = SIGN_OFF_LINE.test(points[points.length - 1]?.text ?? "");

  return TONES.map((tone) => ({ tone: tone.tone, subject, body: compose(tone, points, ownGreeting, signedOff) }));
}

/** Trims, caps the length, and collapses stray blank lines and carriage returns. */
function normalize(description: string): string {
  return description.slice(0, 4000).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Splits the message into sentences and sorts each one into prose, a detail, or an ask. */
function toPoints(message: string): Point[] {
  const points: Point[] = [];
  message.split(/\n{2,}/).forEach((block, index) => {
    for (const rawLine of block.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const bullet = BULLET_MARKER.test(line);
      for (const raw of line.replace(BULLET_MARKER, "").split(SENTENCE_BREAK).flatMap((part) => part.split(CLAUSE_BREAK))) {
        const text = raw.trim();
        if (!text) continue;
        const want = ASK_FOR.exec(text);
        const invite = want ? null : ASK_TO.exec(text);
        const detail = want || invite ? null : DETAIL.exec(text);
        const action = invite && ACTION_VERB.test(invite[1]) ? invite : null;
        const match = want ?? action ?? detail;
        points.push({
          kind: want ? "want" : action ? "invite" : detail ? "detail" : "sentence",
          text: match ? match[1].trim().replace(/[\s.]+$/, "") : text,
          block: index,
          bullet,
        });
      }
    }
  });
  return points;
}

/** Builds one email: greeting, an opening sentence, the writer's points, then a closing sentence. */
function compose(tone: Tone, points: Point[], ownGreeting: string, signedOff: boolean): string {
  const sentences = points.filter((point) => point.kind === "sentence");
  const details = points.filter((point) => point.kind === "detail").map((point) => point.text);
  const asks = points.filter((point) => point.kind === "want" || point.kind === "invite");
  const first = sentences[0]?.bullet === false ? sentences[0].text : "";

  let opening = "";
  if (first && OPENER.test(first)) opening = asSentence(sentences.shift()!.text);
  else if (first && foldable(first)) opening = tone.lead(fold(sentences.shift()!.text));
  else if (!sentences.length && details.length === 1 && foldable(details[0], true)) opening = tone.lead(fold(details.shift()!));
  else if (sentences.length) opening = tone.opening;

  const listed = details.length === 1 ? [tone.detailOne(fold(details[0]))]
    : details.length ? [tone.detailLead, details.map((detail) => `- ${capitalize(detail)}`).join("\n")] : [];

  return [ownGreeting || tone.greeting, opening, ...renderPoints(sentences), ...listed,
    closingFor(tone, asks, points, signedOff)].filter(Boolean).join("\n\n");
}

/** Keeps the writer's paragraphs and lists, and starts a new paragraph every three sentences. */
function renderPoints(points: Point[]): string[] {
  const paragraphs: string[] = [];
  let prose: string[] = [];
  let block = -1;
  let blockStart = 0;
  const flush = () => { if (prose.length) paragraphs.push(prose.join(" ")); prose = []; };
  for (const point of points) {
    if (point.block !== block) { flush(); block = point.block; blockStart = paragraphs.length; }
    if (!point.bullet) {
      prose.push(point.text);
      if (prose.length === 3) flush();
      continue;
    }
    flush();
    const last = paragraphs.length - 1;
    if (last >= blockStart) paragraphs[last] += `\n- ${point.text}`;
    else paragraphs.push(`- ${point.text}`);
  }
  flush();
  return paragraphs;
}

/** Turns whatever the writer asked the reader to do into the closing sentence. */
function closingFor(tone: Tone, asks: Point[], points: Point[], signedOff: boolean): string {
  if (signedOff) return "";
  const ask = asks[0];
  if (ask) return ask.kind === "want" ? tone.want(fold(ask.text)) : tone.invite(fold(ask.text));
  return points.some((point) => point.kind === "sentence" && OWN_ASK.test(point.text)) ? tone.thanks : tone.closing;
}

/** True when a clause can follow "…that": a statement, not a question, command, heading or fragment. */
function foldable(text: string, fragment = false): boolean {
  return text.length <= 160 && /\s/.test(text) && !/[?!:]$/.test(text) && !IMPERATIVE.test(text)
    && (FUNCTION_WORD.test(text.split(/\s/)[0]) || /^[A-Z{]/.test(text))
    && (!fragment || VERBISH.test(text));
}

/** Prepares a clause to sit inside a generated sentence. */
function fold(clause: string): string {
  const text = clause.replace(/[\s.]+$/, "");
  const [first] = text.split(/\s/);
  return FUNCTION_WORD.test(first) ? first.toLowerCase() + text.slice(first.length) : text;
}

/** The writer's opening point, tidied into a subject line. */
function toSubject(text: string): string {
  const sentences = text.split("\n")[0].split(SENTENCE_BREAK);
  let sentence = sentences[0];
  for (let index = 1; index < sentences.length && sentence.length < 18; index++) {
    sentence = `${sentence} ${sentences[index]}`;
  }

  let subject = sentence.replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 2; pass++) {
    subject = subject.replace(BRIEF_LEAD_IN, "").replace(/^that\s+/i, "");
  }
  subject = subject.replace(/^[\s\-–—*•>#]+/, "").replace(/[\s,;:.!\-–—]+$/, "").trim();
  if (!subject) subject = text.replace(/\s+/g, " ").trim();
  return truncate(capitalize(subject), 70);
}

/** Shortens on a word boundary so the subject reads as a phrase, not a cut-off word. */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.!\-–—]+$/, "")}…`;
}

/** Starts the sentence with a capital, leaving merge tags and other markup untouched. */
function capitalize(text: string): string {
  return /^[a-z]/.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function asSentence(text: string): string {
  return /[.!?:]$/.test(text) ? capitalize(text) : `${capitalize(text)}.`;
}

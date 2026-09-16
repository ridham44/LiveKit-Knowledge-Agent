// Greeting / small-talk detection, kept deliberately separate from the RAG pipeline.
// Front-anchored matching: greeting phrases are only recognized when they appear at the
// start of the message (consumed left-to-right). This lets "Hi, what is our refund policy?"
// split cleanly into a greeting + a real question, while "What time do we open in the
// morning?" is NOT misdetected as a greeting just because it contains the word "morning"
// somewhere in the middle.

const MAX_PHRASE_WORDS = 7;

// { phrase: metadata } - phrase is space-separated, already normalized (lowercase, no punctuation).
// Longer phrases are matched before shorter ones automatically (matching is length-first).
const GREETING_PHRASES = {
  // Time-based
  'good morning': { type: 'time', value: 'morning' },
  'good afternoon': { type: 'time', value: 'afternoon' },
  'good evening': { type: 'time', value: 'evening' },
  'good night': { type: 'time', value: 'night' },
  morning: { type: 'time', value: 'morning' },
  afternoon: { type: 'time', value: 'afternoon' },
  evening: { type: 'time', value: 'evening' },

  // Basic greetings (incl. casual spelling / repeated letters)
  hi: { type: 'basic', word: 'hi' },
  hii: { type: 'basic', word: 'hi' },
  hiii: { type: 'basic', word: 'hi' },
  hello: { type: 'basic', word: 'hello' },
  helloo: { type: 'basic', word: 'hello' },
  hellooo: { type: 'basic', word: 'hello' },
  hey: { type: 'basic', word: 'hey' },
  heyy: { type: 'basic', word: 'hey' },
  heyyy: { type: 'basic', word: 'hey' },
  hiya: { type: 'basic', word: 'hiya' },
  howdy: { type: 'basic', word: 'howdy' },
  yo: { type: 'basic', word: 'yo' },
  yoo: { type: 'basic', word: 'yo' },
  greetings: { type: 'basic', word: 'greetings' },
  'hi there': { type: 'basic', word: 'hi' },
  'hello there': { type: 'basic', word: 'hello' },
  'hey there': { type: 'basic', word: 'hey' },

  // Small talk
  'how are you': { type: 'howareyou' },
  'how are you doing': { type: 'howareyou' },
  'hows it going': { type: 'howareyou' },
  'how is it going': { type: 'howareyou' },
  'how are things': { type: 'howareyou' },
  'whats up': { type: 'whatsup' },
  sup: { type: 'whatsup' },
  'nice to meet you': { type: 'nicetomeet' },
  'good to meet you': { type: 'nicetomeet' },
  'pleased to meet you': { type: 'nicetomeet' },
  'hope youre doing well': { type: 'hopewell' },
  'hope you are doing well': { type: 'hopewell' },
  'hope youre having a good day': { type: 'hopewell' },
  'hope you are having a good day': { type: 'hopewell' },
};

// Only skipped as connective tissue *between* already-matched greeting phrases -
// never before the first real greeting match, so they can't cause false positives
// on ordinary sentences (see the gating check in analyzeGreeting below).
const CONNECTORS = new Set(['there', 'to', 'you', 'and', 'so', 'well', 'just', 'again']);

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function analyzeGreeting(rawMessage) {
  const normalized = normalize(rawMessage || '');
  const tokens = normalized.split(' ').filter(Boolean);

  let i = 0;
  const matches = [];

  while (i < tokens.length) {
    let consumed = 0;

    for (let len = Math.min(MAX_PHRASE_WORDS, tokens.length - i); len >= 1; len--) {
      const candidate = tokens.slice(i, i + len).join(' ');
      const meta = GREETING_PHRASES[candidate];
      if (meta) {
        matches.push(meta);
        consumed = len;
        break;
      }
    }

    if (consumed > 0) {
      i += consumed;
      continue;
    }

    if (matches.length > 0 && CONNECTORS.has(tokens[i])) {
      i += 1;
      continue;
    }

    break;
  }

  const remainder = tokens.slice(i).join(' ').trim();

  return {
    isGreeting: matches.length > 0,
    isPureGreeting: matches.length > 0 && remainder.length === 0,
    remainder,
    timeOfDay: matches.find(m => m.type === 'time')?.value || null,
    basicWord: matches.find(m => m.type === 'basic')?.word || null,
    askedHowAreYou: matches.some(m => m.type === 'howareyou'),
    whatsUp: matches.some(m => m.type === 'whatsup'),
    niceToMeet: matches.some(m => m.type === 'nicetomeet'),
    hopeWell: matches.some(m => m.type === 'hopewell'),
  };
}

const INVITATIONS = [
  'How can I help you today?',
  'What would you like to know?',
  'What can I help you with?',
  'How can I help?',
];

function pickInvitation() {
  return INVITATIONS[Math.floor(Math.random() * INVITATIONS.length)];
}

// Full conversational reply for a message that is ONLY a greeting/small talk - no RAG involved.
function buildGreetingReply(analysis) {
  const parts = [];

  if (analysis.basicWord) {
    parts.push(`${capitalize(analysis.basicWord)}!`);
  }
  if (analysis.timeOfDay === 'night') {
    parts.push('Good night!');
  } else if (analysis.timeOfDay) {
    parts.push(`Good ${analysis.timeOfDay}.`);
  }
  if (analysis.niceToMeet) {
    parts.push('Nice to meet you too!');
  }
  if (analysis.hopeWell) {
    parts.push('Thank you, same to you!');
  }
  if (analysis.askedHowAreYou) {
    parts.push("I'm doing well, thanks.");
  }
  if (analysis.whatsUp) {
    parts.push("Not much - I'm ready to help.");
  }

  if (parts.length === 0) {
    parts.push('Hi!');
  }

  parts.push(pickInvitation());
  return parts.join(' ');
}

// Short acknowledgment prefixed onto a real RAG answer when a greeting and a
// question arrive in the same message (e.g. "Hi, good morning, what's our refund policy?").
function buildGreetingPrefix(analysis) {
  if (analysis.timeOfDay && analysis.timeOfDay !== 'night') {
    return `Good ${analysis.timeOfDay}!`;
  }
  if (analysis.timeOfDay === 'night') {
    return 'Good night!';
  }
  if (analysis.basicWord) {
    return `${capitalize(analysis.basicWord)}!`;
  }
  return 'Hi!';
}

module.exports = {
  analyzeGreeting,
  buildGreetingReply,
  buildGreetingPrefix,
};

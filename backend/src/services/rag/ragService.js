const { retrieveRelevantChunks } = require('./retrievalService');
const { generateResponseStream } = require('../ai/aiProvider');
const { analyzeGreeting, buildGreetingReply, buildGreetingPrefix } = require('./greetingService');

const SYSTEM_PROMPT = `You are a Knowledge Base Assistant. Your role is to answer questions based on the provided Knowledge Base context.

Important guidelines:
1. Answer questions using ONLY the provided context from the Knowledge Base.
2. Do not invent, assume, or provide information not present in the context.
3. Recognize information even when it isn't under an explicit labeled field. For
   example, a bare email address, phone number, or URL sitting in a contact/header
   line (e.g. "Ahmedabad | +91 9313887585 | jane@example.com | linkedin.com/...")
   IS the answer to "what is the email/phone/LinkedIn" - you don't need it preceded
   by a literal label like "Email:" to use it. Recognizing a value's type from its
   format (e.g. an "@" address is an email) is not "inventing" information.
4. Only refuse when the requested fact truly is not present anywhere in the context,
   after considering point 3. In that case, clearly state: "I couldn't find
   information about [topic] in your Knowledge Base."
5. Always cite the source document when using information from the Knowledge Base.
6. Be helpful, accurate, and concise.
7. If a question is unclear, ask for clarification.`;

// Spoken answers have completely different constraints from written ones: every extra
// sentence is extra seconds the user has to sit through before they can talk again,
// and markdown/bullets/URLs are actively harmful when read aloud by TTS.
const VOICE_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

You are currently answering OUT LOUD over a voice call. Additional rules for this mode:
- Keep it to 1-3 short sentences. Lead with the direct answer.
- Write plain spoken prose. No markdown, bullet points, numbered lists, or headings.
- Don't read out URLs, file paths, or long ID strings. Summarize them instead.
- Don't recite the source document name unless the user specifically asks where it came from.
- If a full answer would be long, give the key point and offer to go into detail.`;

// A spoken reply of 1-3 sentences is well under 100 tokens; the cap is headroom, and
// keeping it tight also bounds how long a runaway answer can stall the conversation.
const VOICE_MAX_TOKENS = 300;
const TEXT_MAX_TOKENS = 2000;

const NOT_FOUND_MESSAGE =
  "I couldn't find any relevant information in your Knowledge Base to answer this question. Please upload documents that might contain the answer.";

// Streams the answer as it is generated. `meta` is an out-param that gets `sources`
// populated before the first token is yielded, and `usage` after the last one.
async function* answerQuestionStream(userId, question, { voice = false, meta = {} } = {}) {
  meta.sources = [];
  meta.usage = null;

  const greeting = analyzeGreeting(question);

  // Pure greeting/small talk ("Hi", "Good morning", "How are you?") - respond
  // conversationally without touching the Knowledge Base at all.
  if (greeting.isPureGreeting) {
    yield buildGreetingReply(greeting);
    return;
  }

  // A greeting attached to a real question ("Hi, good morning, what's our refund
  // policy?") still runs full RAG below - only the final answer gets a short
  // acknowledgment prefixed onto it.
  const greetingPrefix = greeting.isGreeting ? buildGreetingPrefix(greeting) : null;

  const relevantChunks = await retrieveRelevantChunks(userId, question, 5);

  if (relevantChunks.length === 0) {
    yield greetingPrefix ? `${greetingPrefix} ${NOT_FOUND_MESSAGE}` : NOT_FOUND_MESSAGE;
    return;
  }

  const context = relevantChunks
    .map((chunk, idx) => `Document ${idx + 1} (${chunk.fileName}):\n${chunk.text}`)
    .join('\n\n---\n\n');

  const messages = [
    {
      role: 'user',
      content: `Based on the following Knowledge Base documents, please answer this question:\n\nQuestion: ${question}\n\nKnowledge Base:\n${context}`,
    },
  ];

  // Sources are known as soon as retrieval finishes, so the caller can persist or
  // display them without waiting for the whole answer to generate.
  meta.sources = relevantChunks.map(chunk => ({
    fileId: chunk.fileId,
    fileName: chunk.fileName,
    fileType: chunk.fileType,
    relevantText: chunk.text.substring(0, 200) + '...',
    chunkIndex: chunk.chunkIndex,
    similarity: chunk.similarity,
  }));

  if (greetingPrefix) {
    yield `${greetingPrefix} `;
  }

  const llmMeta = {};
  yield* generateResponseStream(
    messages,
    voice ? VOICE_SYSTEM_PROMPT : SYSTEM_PROMPT,
    0.7,
    voice ? VOICE_MAX_TOKENS : TEXT_MAX_TOKENS,
    llmMeta
  );

  meta.usage = llmMeta.usage ?? null;
}

// Non-streaming wrapper for the text chat endpoint, which returns one JSON response.
// Deliberately built on the same generator so both input modes share one code path.
async function answerQuestion(userId, question, options = {}) {
  try {
    const meta = {};
    let answer = '';

    for await (const delta of answerQuestionStream(userId, question, { ...options, meta })) {
      answer += delta;
    }

    return {
      answer,
      sources: meta.sources || [],
      usage: meta.usage ?? null,
    };
  } catch (error) {
    throw new Error(`RAG processing failed: ${error.message}`);
  }
}

module.exports = {
  answerQuestion,
  answerQuestionStream,
};

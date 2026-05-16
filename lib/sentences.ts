/**
 * 30-sentence pronunciation practice pool — hardcoded per SPEC §9.
 * No LLM / external API is used for sentence generation.
 */
export const SENTENCES: string[] = [
  // Minimal pairs (r/l)
  'The red lorry rolled rapidly along the road.',
  'Lily lent her little brother a yellow lollipop.',
  'Rural roads rarely run really straight.',
  // Minimal pairs (th)
  'Thirty-three thirsty thieves thought thick thoughts.',
  'The three thin thinkers thanked them thoroughly.',
  'This thing thrives through thorough thinking.',
  // Minimal pairs (f/v, b/v)
  'Five vivid violets vanished from the vase.',
  "Vincent's brave brother bought very vibrant fabric.",
  // Vowels (æ/ʌ/ɛ)
  'The cat sat on the mat next to the bat.',
  "Sandra's sandwich had ham, jam, and cranberries.",
  'Many men can mend the bent metal bench.',
  // Vowels (ɪ/iː)
  'Three green geese sit beneath the leaf.',
  "Linda's little kitten licks the silky ribbon.",
  // Vowels (ʊ/uː)
  'The cook put a good book on the wooden hook.',
  'Sue blew through the bamboo flute smoothly.',
  // Vowels (ɔ/ɑ)
  'The tall hawk caught a small frog at dawn.',
  'Bob saw a robin on the lawn.',
  // Tongue twisters
  'She sells seashells by the seashore.',
  'Peter Piper picked a peck of pickled peppers.',
  'How much wood would a woodchuck chuck.',
  'Betty bought a bit of better butter.',
  'Red leather, yellow leather, red leather.',
  'Unique New York, unique New York.',
  'Toy boat, toy boat, toy boat.',
  // Connected speech
  'I would have gone if I had known earlier.',
  'What are you going to do about it.',
  'Could you please pass me the salt and pepper.',
  // Stress patterns
  'Photography is more popular than photographers think.',
  'The committee decided to investigate the situation.',
  'Necessary preparations require careful consideration.',
];

/** Pick a uniformly random sentence from the pool. */
export function pickRandomSentence(): string {
  return SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
}

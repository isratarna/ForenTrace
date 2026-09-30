// Friendly replies for greetings, thanks, goodbyes and "what can you do".
// No AI call and no database call needed for these.
const HELP_TEXT =
  'I can help you use ForenTrace: missing persons, investigation cases, DNA samples, ' +
  'DNA matching, labs, user roles and accounts. For example, ask "How do I register a DNA sample?"';

const RULES = [
  {
    pattern: /^(hi+|hello+|hey+|hola|salam|assalamu ?alaikum|good (morning|afternoon|evening))( there| bot| assistant| forentrace)?$/,
    reply: `Hello! I'm the ForenTrace Assistant. ${HELP_TEXT}`
  },
  {
    pattern: /^(how are you|how r u|how are you doing|kemon acho|kemon achen)$/,
    reply: `I'm doing well, thank you! ${HELP_TEXT}`
  },
  {
    pattern: /^(thanks|thank you|thank u|thanks a lot|thank you so much|ty|dhonnobad|dhonyobad)$/,
    reply: "You're welcome! Ask me anything else about ForenTrace."
  },
  {
    pattern: /^(bye|goodbye|good bye|see you|see ya|good night)$/,
    reply: 'Goodbye! Come back any time you need help with ForenTrace.'
  },
  {
    pattern: /^(who are you|what are you|what can you do|what do you do|help|how can you help( me)?)$/,
    reply: `I'm the ForenTrace Assistant. ${HELP_TEXT}`
  }
];

export function getSmallTalkReply(question) {
  const cleaned = question
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')   // remove ? ! , etc.
    .replace(/\s+/g, ' ')
    .trim();
  const rule = RULES.find(r => r.pattern.test(cleaned));
  return rule ? rule.reply : null;
}
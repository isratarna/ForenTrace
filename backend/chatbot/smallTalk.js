// Friendly replies for greetings, thanks, goodbyes and "what can you do".
// No AI call and no database call needed for these.
const HELP_TEXT =
  'Ask me anything about how ForenTrace works, or try one of the suggested questions in the chat.';

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

// Bangla okkhore lekha small talk (হাই, ধন্যবাদ ...) — uttor-o Bangla te
const BN_HELP_TEXT = 'ForenTrace কীভাবে কাজ করে, সে বিষয়ে যেকোনো প্রশ্ন বাংলায় করুন।';

const BN_RULES = [
  {
    pattern: /^(হাই|হ্যালো|হেলো|সালাম|আসসালামু ?আলাইকুম|শুভ সকাল|শুভ বিকাল|শুভ সন্ধ্যা)$/,
    reply: `হ্যালো! আমি ForenTrace Assistant। ${BN_HELP_TEXT}`
  },
  {
    pattern: /^(কেমন আছ|কেমন আছো|কেমন আছেন|কেমন আছিস)$/,
    reply: `আমি ভালো আছি, ধন্যবাদ! ${BN_HELP_TEXT}`
  },
  {
    pattern: /^(ধন্যবাদ|অনেক ধন্যবাদ|ধন্যবাদ অনেক|থ্যাংকস|থ্যাংক ইউ)$/,
    reply: 'আপনাকেও ধন্যবাদ! ForenTrace নিয়ে আর কিছু জানতে চাইলে জিজ্ঞেস করুন।'
  },
  {
    pattern: /^(বিদায়|আল্লাহ হাফেজ|আবার দেখা হবে|শুভ রাত্রি)$/,
    reply: 'বিদায়! ForenTrace নিয়ে সাহায্য লাগলে যেকোনো সময় আবার আসুন।'
  },
  {
    pattern: /^(তুমি কে|আপনি কে|তুমি কী করতে পারো|আপনি কী করতে পারেন|সাহায্য|সাহায্য করো|সাহায্য করুন)$/,
    reply: `আমি ForenTrace Assistant। ${BN_HELP_TEXT}`
  }
];

function getBanglaSmallTalkReply(question) {
  const cleaned = question
    .normalize('NFC')
    .replace(/[^\u0980-\u09FF\s]/g, ' ')   // ? ! । , ইত্যাদি বাদ (। Bangla block er baire)
    .replace(/\s+/g, ' ')
    .trim();
  const rule = BN_RULES.find(r => r.pattern.test(cleaned));
  return rule ? rule.reply : null;
}

export function getSmallTalkReply(question) {
  if (/[\u0980-\u09FF]/.test(question)) return getBanglaSmallTalkReply(question);

  const cleaned = question
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')   // remove ? ! , etc.
    .replace(/\s+/g, ' ')
    .trim();
  const rule = RULES.find(r => r.pattern.test(cleaned));
  return rule ? rule.reply : null;
}
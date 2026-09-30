# CB-12 Chatbot Test Report

## Overall status

**16/20 PASS - blocked by FAQ/prompt/Gemini behavior (not by Member 3 code)**

## Task 1: Gemini error-path review

- backend/chatbot/gemini.js:23-31 parses JSON and returns joined candidate text, or an empty string when candidate/content/parts are absent. It does not produce OUT_OF_CONTEXT or the refusal message.
- backend/chatbot/gemini.js:4, 24-28, 34-51 retries HTTP 429/500/503 and network errors; other non-200 statuses throw immediately. Exhausted retries throw the last error. backend/controllers/chatbotController.js:80-84 catches it and returns HTTP 500 with the generic unavailable message.
- Retry loop: up to two attempts per configured model (one retry), with waits of 1 second after attempt 1 and 2 seconds after attempt 2. With a primary and fallback model configured, that is up to four requests and six seconds of explicit delay.
- Successful HTTP responses with no candidate text, including a blocked/missing candidate, return an empty string at gemini.js:30-31. controller.js:74-75 maps either an empty answer or an answer containing OUT_OF_CONTEXT to the safe scope refusal and inContext=false.
- backend/chatbot/prompt.js:8-10 says: “If the CONTEXT does not contain the answer, reply with exactly: OUT_OF_CONTEXT”.
- controller.js:63-68 returns inContext=false if no retrieved chunk meets the score threshold (default 0.65); controller.js:74-79 returns false for empty/token answers and true for other answers. Exceptions use 500, not false.
- **Can a Gemini quota/API error currently end up as inContext=false? NO for an exhausted HTTP quota/API error:** it is thrown and becomes 500. A successful but empty/blocked response can become false, so the empty-candidate path is ambiguous. Temperature is 0.2 (gemini.js:19). The configured model names come from GEMINI_MODEL and optional GEMINI_FALLBACK_MODEL (gemini.js:34-39); captured warnings named gemini-3.8-flash.

## Task 2: Live diagnosis

Diagnostic backend started with temporary CHATBOT_RATE_LIMIT=100; MySQL connection succeeded. Each failing question was sent three times, with ten seconds between calls. All 12 calls returned HTTP 200, inContext=false, sources=0.

| Question | Call 1 | Call 2 | Call 3 | Conclusion |
|---|---|---|---|---|
| What are DNA laboratories used for? | 200 / false / 0 | 200 / false / 0 | 200 / false / 0 | Consistent refusal (3/3); prior debug run captured Gemini OUT_OF_CONTEXT. |
| How are missing-person cases handled? | 200 / false / 0 | 200 / false / 0 | 200 / false / 0 | Consistent refusal (3/3); prior debug run captured Gemini OUT_OF_CONTEXT. |
| What information is available for cases? | 200 / false / 0 | 200 / false / 0 | 200 / false / 0 | Consistent refusal outcome (3/3); this run did not instrument the internal branch. |
| What can an authorized user do with the system? | 200 / false / 0 | 200 / false / 0 | 200 / false / 0 | Consistent refusal (3/3); prior debug run captured Gemini OUT_OF_CONTEXT. |

All 12 answers had the same first-100-character preview: “Sorry, I can only answer questions about the ForenTrace system (cases, DNA samples, matching, labs a”.

### Controls

| Question | Status | inContext | Sources |
|---|---:|---|---:|
| What does a lab technician do in ForenTrace? | 200 | true | 1 |
| How do I register a missing person? | 200 | true | 1 |
| What can an Admin do? | 200 | true | 1 |

The three controls were all answered (3/3). The diagnostic server terminal was accessible; it logged repeated Gemini HTTP 429 free-tier quota warnings and “retrying” messages for gemini-3.8-flash. The controls nevertheless returned in-context answers. No separate blocked/safety warning was observed. The HTTP error path in the code does not turn exhausted quota errors into inContext=false; prior instrumented results and repeated refusal outcomes support a prompt/FAQ refusal. The fourth question's internal branch remains unobserved in this no-debug run.

## Task 3: Teammate message

> The four in-domain questions (DNA lab purpose, missing-person case handling, available case information, authorized user capabilities) returned 200/inContext=false/sources=0 on all three calls; the three FAQ-matching controls answered 200/inContext=true with one source. Earlier diagnostics captured OUT_OF_CONTEXT for questions 4, 5, and 9.  
> The relevant logic is prompt.js:8-10 (OUT_OF_CONTEXT rule), gemini.js:23-31 (missing candidates become an empty string), and controller.js:63-75 (no relevant chunks or empty/token answer becomes the same refusal).  
> Please add direct, authoritative FAQ entries for all four topics in the FAQ source and adjust the prompt to synthesize answers when retrieved context supports them even if wording differs. Exhausted HTTP 429/API errors already throw and become a safe 500 at controller.js:80-84; missing/blocked candidate output is the ambiguous path and should be surfaced distinctly instead of as a scope refusal.

## Latest benchmark

Fresh-run benchmark result: PASS=16, PARTIAL=0, FAIL=4, INVALID=0, ERROR=0. The four failing questions were IDs 4, 5, 7, and 9. The separate rate-limit probe returned its first 429 at cumulative API request #21. The original questions were retained and the optional fallback remained disabled.

## Task 5: Manual browser demo checklist

Restart the backend first with the default rate limit so its in-memory counter resets. Start the frontend at http://localhost:5173. Capture a screenshot for each item:

1. ChatWidget launcher is visible while closed; screenshot the page with the launcher.
2. Open the panel; screenshot the greeting and all three suggestion chips.
3. Compare Enter (sends) and Shift+Enter (adds a newline); screenshot both outcomes.
4. Type 501 characters; screenshot the 501/500 counter and disabled send control.
5. Send a valid question; screenshot the loading dots while the request is pending.
6. Show an in-domain answer with source chips; screenshot the answer and chips.
7. Ask an off-topic question; screenshot the out-of-scope badge.
8. After restarting the backend, send 20 quick requests, then a 21st; screenshot the 429 message.
9. Open the Reports page with the panel visible; screenshot the layout and fixed widget layering (z-index 1080).
10. Set the viewport to 480px wide; screenshot the responsive panel and page fit.
11. Enter a script-tag string; screenshot that it is displayed as plain text and does not execute.

## Verification and remaining work

- Frontend lint: exit 0 with warnings, including three Date.now purity warnings in ChatWidget.jsx and warnings in other frontend files.
- Frontend build: exit 0; 119 modules built. Vite reported a JavaScript chunk larger than 500 kB.
- Temporary diagnostic backend stopped and CHATBOT_RATE_LIMIT removed from the diagnostic PowerShell environment.
- FAQ/prompt owner should update the authoritative FAQ source and prompt behavior, then rerun the 20-question benchmark. No changes were made to teammate-owned Gemini/prompt/retriever/data files.
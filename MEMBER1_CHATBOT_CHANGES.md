# ForenTrace AI Chatbot — Member 1 Change Log

**Role:** Knowledge Base, Index & Tuning
**Issues:** CB-1, CB-2, CB-3, CB-4, CB-8
**Branch:** `chatbot/m1-ingestion` (from `feature/chatbot`)
**PR target:** `chatbot/m1-ingestion → feature/chatbot`

This file records every change made in each phase: what was added, the full code, and why.

---

## Phase overview

| Phase | Issue | Goal | Main file(s) | Status |
| --- | --- | --- | --- | --- |
| 0 | Setup | Check that `.env`, the embedder and MongoDB work on this laptop | — (no code) | ✅ Done |
| 1 | CB-1 | Write the ForenTrace FAQ (knowledge base) and export it as a PDF | `backend/chatbot/data/forentrace_faq.pdf` (+ `forentrace_faq_source.txt`) | ✅ Done + double-checked (waiting for M2/M3 review) |
| 2 | CB-2 | Pre-process and chunk the FAQ text (one chunk per Q&A) | `backend/chatbot/chunker.js` | ✅ Done |
| 3 | CB-3 | PDF → chunks → 384-number embeddings → MongoDB (`faq_chunks`), no duplicates | `backend/chatbot/ingest.js` | ⏳ Next |
| 4 | CB-4 | Create `vector_index` by script (replaces Member 2's temporary one), check READY | `backend/chatbot/createIndex.js` | ⏳ Needs Member 2's "API ready" + `testSearch.js` |
| 5 | CB-8 | Tune `CHATBOT_SCORE_THRESHOLD` with the 20-question score table | `.env` (not committed) + score table in this file | ⏳ Needs `testSearch.js` |
| 6 | Wrap-up | Final checklist, commit own files by name, push, open PR, hand-off message | — | ⏳ |

Rules followed in every phase: ES modules only (`import`/`export`, `.js` on local imports), `process.env` is read inside functions, `embedder.js` and `mongoClient.js` are not modified, the chatbot never reads MySQL, `.env` is never committed, and files are added to git by name (never `git add .`).

---

## Phase 0 — Setup check

### Goal
Make sure this laptop can run the chatbot scripts before starting any issue.

### What was checked

| Check | Result |
| --- | --- |
| Current branch | `chatbot/m1-ingestion` (clean working tree) |
| `backend/.gitignore` contains `.env` | ✅ yes (`node_modules/` and `.env`) |
| 5 chatbot lines at the end of `backend/.env` | ✅ present (`MONGODB_URI`, `MONGODB_DB`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `CHATBOT_SCORE_THRESHOLD`) |
| `pdf-parse` version | ✅ `1.1.1`, with `lib/pdf-parse.js` present |
| `node chatbot/testSetup.js` | ✅ `Embedding length: 384` and `MongoDB connected. Documents in faq_chunks: 0` |

### Notes
- `faq_chunks` has **0** documents, and `chatbot/testSearch.js` does not exist yet on `feature/chatbot`. That means Member 2's Phase 1 (sample seed + temporary index + "API ready") hasn't landed yet. That is fine for CB-1 and CB-2, which need no API. CB-4 and CB-8 need `testSearch.js`.
- No code was changed in this phase.

---

## Phase 1 — CB-1: ForenTrace Knowledge Base (FAQ PDF)

### Goal
Write the FAQ that the chatbot answers from, making sure every answer matches the **real** system, and export it as `backend/chatbot/data/forentrace_faq.pdf`.

### Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `backend/chatbot/data/forentrace_faq.pdf` | **New** | The knowledge base. `ingest.js` (Phase 3) will read this file. 5 pages, 36 Q&A pairs + 1 intro. |
| `backend/chatbot/data/forentrace_faq_source.txt` | **New** | Editable plain-text copy of the FAQ. If the FAQ changes, edit this text, re-export the PDF, then re-run `ingest.js`. |

### Where the answers came from (why they are accurate)
This branch (`feature/chatbot`) does **not** contain the DNA module yet. The DNA samples, matches, family members and trigger only exist on `origin/main`. So every answer was checked against **`origin/main`** code:

| FAQ topic | Checked against (on `origin/main`) |
| --- | --- |
| Sidebar menu names per role (Missing Persons, Family Members, Investigation Cases, DNA Samples, DNA Matches, Reports, Labs Intersection, DNA Sample Report, DNA Analytics, Users & Accounts …) | `frontend/src/layouts/AppLayout.jsx` (`navByRole`) |
| Registration (Officer / Lab Technician self-register → `pending_approval` → Admin activates; Admin is predefined) | `backend/controllers/authController.js` (`register`, `registerOfficer`), `frontend/src/pages/Auth.jsx` link texts |
| Login errors ("Invalid email or password", "Account is not active") | `authController.login` |
| Activate / Deactivate accounts | `frontend/src/pages/Administration.jsx` (`AdminList kind="users"`) |
| Change password (My Profile → Change Password → current + new → Save), Sign out | `Administration.jsx` (`Profile`), `AppLayout.jsx` |
| Register person (Officer only), fields, statuses `Missing` / `Identified` | `frontend/src/pages/MissingPersons.jsx`, `backend/routes/missingPersonRoutes.js` |
| Create Case (Officer only), statuses `Active / Pending / Solved`, priority `High / Medium / Low` | `frontend/src/pages/Cases.jsx`, `backend/routes/caseRoutes.js` |
| Family Members, "+ Add Family Member", "Save Family Member", "Register DNA", "Confirm & Register DNA Sample", relationships | `frontend/src/components/FamilyMembersManager.jsx`, `pages/FamilyMembersPage.jsx` |
| Register DNA Sample form fields, sample types, "Save DNA Sample", Admin/Officer only, officer limited to assigned cases | `frontend/src/pages/Laboratory.jsx` (`SampleForm`), `backend/routes/dnaSampleRoutes.js`, `dnaSampleController.js` |
| Sample statuses `Awaiting Analysis / In Analysis / Analyzed / Rejected`, technician "Analyze" → "Save Analysis", profile code 6–50 chars | `Laboratory.jsx` (`SAMPLE_STATUSES`, `DNAAnalysis`) |
| New Comparison, Run Comparison, Save Match, manual similarity (Admin/Officer only) | `Laboratory.jsx` (`MatchForm`), `backend/routes/dnaMatchRoutes.js` |
| Similarity formula + confidence (≥90 High, ≥80 Medium, else Low) | `database/sql/compare_dna_samples_procedure.sql` |
| Match statuses `Pending Review / Confirmed / Rejected`, Confirm/Reject = Admin/Officer only | `database/schema.sql`, `dnaMatchRoutes.js` (`PUT /:id/status`) |
| Confirmed → missing person becomes `Identified` automatically | `database/sql/trigger.sql` (`trg_dna_match_confirmed_update` / `_insert`) |
| Dashboard cards per role | `frontend/src/pages/Dashboards.jsx` |
| Reports, Export Report (CSV), DNA Sample Report (`Matched / Awaiting Match`), Labs Intersection | `Administration.jsx` (`Reports`), `DnaSampleReport.jsx`, `IntersectionReport.jsx` |

### Writing rules applied (and why)

| Rule | Why |
| --- | --- |
| Every question starts with `Q:`, every answer with `A:`, and `Q:` appears nowhere else | The chunker (CB-2) splits at every `Q:`. A stray `Q:` would create a broken chunk. Verified: exactly **36** `Q:` in the extracted text. |
| No section headings between Q&As | A heading placed after an answer would be glued onto that answer's chunk and blur its meaning. Only the title + "About ForenTrace" intro come before the first `Q:`, and they become their own intro chunk. |
| Synonyms in brackets inside questions, e.g. `How do I register (add, create, collect) a DNA sample?` | Users type different words. More matching words in the question means a higher cosine score in vector search. |
| Answers 1–4 sentences, simple English | One clear meaning per vector. all-MiniLM-L6-v2 is an English model. Longest chunk is 75 words (limit 150). |
| Separate Q&As for "Missing/Identified statuses" and "What does Identified mean" | Test question #10 asks exactly "What does the Identified status mean?", so it gets its own focused chunk. |
| The assistant-scope Q&A does **not** mention off-topic words (weather, cooking, sports, maths …) | If the FAQ contained those words, off-topic questions like "What is the weather today?" would score high and slip past the threshold (layer 1). |
| Privacy Q&A (the assistant cannot see case/person/DNA data) | Needed so Gemini refuses privacy questions (#17, #18) even if they pass the threshold (layer 2). |
| No real names, real DNA codes or passwords | Privacy rule from the task guide. The only code-like example is the generic "7 of 8 positions → 87.5%". |

### Test questions coverage (from the 20-question sheet)

| # | On-topic test question | Answered by FAQ question |
| --- | --- | --- |
| 1 | What is ForenTrace? | "What is ForenTrace? What does this system (app, website) do?" |
| 2 | What user roles are there? | "What user roles (user types, account types) are there in ForenTrace? …" |
| 3 | How do I register a DNA sample? | "How do I register (add, create, collect) a DNA sample?" |
| 4 | What is a family reference sample? | "What is a family reference DNA sample (reference sample)?" |
| 5 | How does DNA matching work? | "How does DNA matching (DNA comparison) work in ForenTrace?" |
| 6 | What happens after a match is confirmed? | "What happens after (when) a DNA match is confirmed?" |
| 7 | How do I change my password? | "How do I change (update, reset) my password?" |
| 8 | Who creates officer accounts? | "Who creates officer accounts? Who creates (approves) lab technician accounts?" |
| 9 | What can a lab technician do? | "What can a lab technician do? …" |
| 10 | What does the Identified status mean? | "What does the Identified status mean? When does a person become Identified?" |

### How the PDF was made
1. The FAQ text was written in `forentrace_faq_source.txt`.
2. A tiny helper (kept outside the repo, in the session scratchpad) turned it into a simple HTML page: title bold, `Q:` lines bold, `A:` lines normal.
3. Microsoft Edge printed that page to PDF in headless mode with **`--no-pdf-header-footer`**. Without that flag, Edge prints the file path and date on every page, and that text would leak into the chunks.

> Word automation was tried first but hung on a hidden dialog, so Edge was used instead. The team guide's own route (paste the text into Word or Google Docs → **Save as PDF**) produces an equivalent file. If you do that, name it `forentrace_faq.pdf` and make sure no header/footer text is added.

Re-export command (PowerShell, after regenerating the HTML):
```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer `
  --print-to-pdf="E:\Projects\ForenTrace\ForenTrace\backend\chatbot\data\forentrace_faq.pdf" "file:///<path>/forentrace_faq.html"
```

### Full FAQ content (`forentrace_faq_source.txt` = text inside the PDF)

```text
ForenTrace - Help and Frequently Asked Questions
About ForenTrace
ForenTrace is a DNA-based missing person identification system. Police officers register missing persons and investigation cases, DNA laboratories analyse DNA samples, and the system compares DNA profiles to help identify missing persons. This help document explains how to use ForenTrace.
Q: What is ForenTrace? What does this system (app, website) do?
A: ForenTrace is a web-based DNA identification system that helps police and forensic DNA laboratories trace missing persons. It keeps missing person reports, investigation cases, family members, DNA samples and DNA matches in one place.
Q: What user roles (user types, account types) are there in ForenTrace? Who uses ForenTrace?
A: There are three roles: Admin, Officer (Police Officer) and Lab Technician. The Admin manages users, police stations, officers, DNA labs and technicians and can see all data. Officers manage missing persons, investigation cases and DNA samples for their assigned cases. Lab Technicians analyse the DNA samples of their own laboratory.
Q: What can an Admin (administrator) do?
A: The Admin can see all records and manages Police Stations, Police Officers, DNA Labs, Lab Technicians and Users & Accounts. The Admin approves, activates or deactivates user accounts and can confirm or reject DNA matches. The Admin account is predefined and cannot be registered.
Q: What can a police officer do? What are an officer's permissions?
A: An Officer registers missing persons, creates investigation cases, adds family members and registers DNA samples. Officers can only manage DNA samples and family DNA for their own assigned cases. Officers can also run DNA comparisons and confirm or reject DNA matches.
Q: What can a lab technician do? What are a lab technician's permissions (duties, tasks)?
A: A Lab Technician sees the DNA samples assigned to their own laboratory. They open a sample, click Analyze, and record the analysis status, DNA profile code and laboratory remarks. They can also run DNA comparisons, but they cannot register samples or confirm matches.
Q: How do I get an account? Can I register (sign up, create an account) myself?
A: Yes. Police Officers and Lab Technicians register on the login page using "Register as an officer or lab technician" or "Register as Police Officer (Detailed)". A new account stays Pending Approval until the Admin activates it. Admin accounts cannot be registered.
Q: Who creates officer accounts? Who creates (approves) lab technician accounts?
A: Officers and Lab Technicians create their own accounts through registration on the login page. The Admin then finds the account in Users & Accounts and clicks Activate to approve it. The user can sign in only after this approval. For a Lab Technician, the Admin must also link the account to a technician record in Lab Technicians.
Q: Why can't a lab technician see or analyse any DNA samples? What does "No technician profile is linked to this account" mean?
A: A Lab Technician account must be linked to a technician record of a DNA lab. The Admin opens Lab Technicians and clicks + Link User beside the technician to link the login account. After that, the technician sees and analyses the samples of that laboratory.
Q: How do I log in (sign in) to ForenTrace?
A: Open the login page, enter your registered email address and password, and click Sign in. You are taken to the dashboard for your role. Your account must be active (approved by the Admin) to sign in.
Q: Why can't I log in? My login failed or my account is not active (pending).
A: "Invalid email or password" means the email or password is wrong. "Account is not active" means the Admin has not approved your registration yet, or your account was deactivated. Contact the Admin to activate your account.
Q: How do I change (update, reset) my password?
A: Click My Profile at the bottom of the sidebar, then click Change Password. Enter your current password and your new password, then click Save.
Q: How do I log out (sign out)?
A: Click Sign out at the bottom of the sidebar. Your session ends and you return to the login page.
Q: How do I register (add, report) a missing person?
A: Log in as an Officer, open Missing Persons and click Register person. Fill in details such as name, gender, date of birth, missing date, last seen location, city and description, then click Register Missing Person. Only Officers can register missing persons.
Q: What are the missing person statuses (Missing, Identified)?
A: A missing person has one of two statuses. Missing means the person has not been found or identified yet. Identified means a DNA match for this person has been confirmed.
Q: What does the Identified status mean? When does a person become Identified?
A: Identified means the missing person has been identified through a confirmed DNA match. When an Admin or Officer confirms a DNA match, the system automatically changes the person's status from Missing to Identified.
Q: How do I create (open, register) an investigation case?
A: Log in as an Officer, open Investigation Cases and click Create Case. Select the missing person, police station and investigating officer, set the report date, case status and priority, then click Save Case. Each case links one missing person report to a police station and an officer.
Q: What do the case statuses (Active, Pending, Solved) and case priorities mean?
A: Active means the investigation is in progress. Pending means the case is waiting for evidence or action. Solved means the investigation is closed, usually after the person is identified. Priority can be High, Medium or Low.
Q: What is a family member in ForenTrace? How do I add (register) a family member (relative)?
A: A family member is a relative of a missing person, such as a father, mother, brother, sister, daughter or spouse. Open Family Members, click + Add Family Member, select the missing person, enter the name, relationship and phone, then click Save Family Member. Admins and Officers can manage family members.
Q: What is a family reference DNA sample (reference sample)?
A: A family reference sample is a DNA sample given by a close relative of a missing person. Because relatives share DNA, it is compared with unknown or evidence samples to find a possible match and identify the missing person.
Q: How do I register a family reference DNA sample for a family member?
A: Open Family Members and click Register DNA beside the family member. Choose the DNA lab, sample type and collection date, and optionally a technician and storage location, then click Confirm & Register DNA Sample. You can also use Register DNA Sample and choose the person in the Family Member (reference sample) field.
Q: How do I register (add, create, collect) a DNA sample?
A: Go to DNA Samples and click Register DNA Sample. Select the missing person, a family member only if it is a reference sample, the DNA lab, an optional technician, the sample type, collection date and storage location, then click Save DNA Sample. Only Admins and Officers can register DNA samples.
Q: What DNA sample types can be registered?
A: ForenTrace supports these sample types: Buccal Swab, Blood Sample, Hair Strand, Bone Sample, Tissue Sample and Personal Belonging.
Q: What do the DNA sample statuses (Awaiting Analysis, In Analysis, Analyzed, Rejected) mean?
A: Awaiting Analysis means the sample is registered and waiting in the laboratory queue. In Analysis means a technician is processing it. Analyzed means the DNA profile code has been recorded. Rejected means the sample was unusable.
Q: How does a lab technician analyse (process, test) a DNA sample? What is the lab analysis workflow?
A: The technician opens DNA Samples, which shows only their laboratory's samples, and clicks Analyze on a sample. On the Analyze Sample page they set the status to In Analysis, Analyzed or Rejected, enter the DNA profile code and laboratory remarks, then click Save Analysis. The DNA profile code is required when the status is Analyzed.
Q: What is a DNA profile code?
A: A DNA profile code is the result of the laboratory analysis, stored as 6 to 50 letters, numbers or hyphens. The system compares these codes to measure how similar two samples are. Only Analyzed samples have a profile code and can be compared.
Q: How does DNA matching (DNA comparison) work in ForenTrace?
A: Open DNA Matches and click New Comparison, or click Compare on an analyzed evidence sample. Select an Unknown / Evidence Sample and a Matched / Reference Sample, then click Run Comparison. The system compares the two DNA profile codes position by position and shows the similarity percentage and confidence level. Click Save Match to record the result.
Q: What is the similarity percentage of a DNA match? How is it calculated?
A: The similarity percentage is the number of positions where the two DNA profile codes are the same, divided by the length of the longer code, times 100. For example, codes that are the same in 7 of 8 positions give 87.5%. Admins and Officers can also enter a similarity percentage manually.
Q: What is the confidence level (High, Medium, Low) of a DNA match?
A: The confidence level is based on the similarity percentage. 90% or more is High, 80% up to 90% is Medium, and below 80% is Low.
Q: What do the DNA match statuses (Pending Review, Confirmed, Rejected) mean? How do I confirm or reject a match?
A: A new match starts as Pending Review. An Admin or Officer opens the match in DNA Matches and clicks Confirm Match or Reject Match. Lab Technicians can create comparisons but cannot confirm or reject matches.
Q: What happens after (when) a DNA match is confirmed?
A: When a match status becomes Confirmed, a database trigger automatically changes the status of the missing person linked to the reference sample to Identified. No manual status change is needed. Rejecting a match does not change the person's status.
Q: What does the dashboard show? What is on my dashboard?
A: Each role has its own dashboard. The Admin Dashboard shows system-wide statistics such as solved and pending cases, samples awaiting analysis, police stations and DNA labs. The Officer dashboard shows active cases, pending cases, samples awaiting results and new DNA matches, and the Lab Technician dashboard shows samples awaiting analysis, analyzed samples and DNA matches.
Q: What reports are available? How do I export (download) a report?
A: Open Reports to see solved and total cases per police station and the average identification time, and click Export Report (CSV) to download a CSV file. The DNA Sample Report shows whether each sample is Matched or Awaiting Match, and the Labs Intersection report lists labs with above-average technician capacity and active technicians. Admins and Lab Technicians can also open DNA Analytics.
Q: How does the Admin manage police stations, police officers, DNA labs and lab technicians?
A: The Admin uses the sidebar pages Police Stations, Police Officers, DNA Labs and Lab Technicians. Each page has an Add button, and each record can be viewed, edited or deleted. Users & Accounts is used to edit, activate or deactivate login accounts.
Q: Is my data secure? How does ForenTrace protect data (privacy, security, access control)?
A: Every user must sign in, and each role can only open the pages and records allowed for that role. Officers only manage their assigned cases, and Lab Technicians only see their own laboratory's samples. Passwords are stored in hashed (encrypted) form, never as plain text.
Q: Can the assistant (chatbot) tell me about a specific case, person or DNA result? Can it show private data?
A: No. For privacy, the ForenTrace assistant only explains how the system works and cannot see any case, missing person or DNA data. It never shares names, DNA profile codes or match results. Please log in and open the relevant page to see the records you are allowed to access.
Q: What can the ForenTrace assistant (chatbot, help bot) answer?
A: The assistant only answers questions about using ForenTrace, such as roles, accounts, missing persons, cases, family members, DNA samples, lab analysis and DNA matching. For anything else, please ask your Admin or supervisor.
```

### Testing results
PDF checked with the **same import `ingest.js` will use** (`pdf-parse/lib/pdf-parse.js`), run from `backend/`:

| Check | Result |
| --- | --- |
| Pages / characters extracted | 5 pages, 12,233 characters |
| `Q:` / `A:` occurrences | **36 / 36** (= number of questions, no stray `Q:`) |
| Blocks after splitting at `Q:` (preview of CB-2) | **37** = 36 Q&As + 1 intro ✅ (guide expects "Q&A count + 1"); every non-intro block starts with `Q:` and contains `A:` |
| PDF text == `forentrace_faq_source.txt` (whitespace-normalised) | ✅ identical |
| Longest block | 75 words (below the 150-word safety split, so no extra windows) |
| Header/footer leak (file path / date) | None ✅ |
| Console warning `TT: undefined function: 21` | Harmless pdf.js font-hint warning. Text is extracted correctly. |

### Known gaps / to confirm with the team
1. **Review needed (Done-when condition):** Member 2 and Member 3 must read the FAQ and confirm it matches the real system.
2. **Registration decision (Member 3):** the FAQ follows the current code on `main`: self-registration for Officer / Lab Technician → Pending Approval → Admin clicks **Activate**. If Member 3's final decision differs, edit Q&As 6 and 7 and re-export.
3. **Change password:** the Profile page's Change Password form calls `services/mockAuth.changePassword`. There is **no real backend endpoint** for it on `main`. The FAQ describes the UI steps. Tell the team in case they want to wire it up before the demo.
4. **`feature/chatbot` is behind `main`:** it doesn't have the DNA module. The FAQ describes `main`. The final merge to `main` resolves this, and nothing is needed for the chatbot scripts.
5. Every time the FAQ text changes: edit `forentrace_faq_source.txt` → re-export the PDF → run `node chatbot/ingest.js` (Phase 3). No new index is needed.

### Phase 1 review (double-check)
Every factual claim in the FAQ was re-checked against the `origin/main` code: routes and their `requireRole`, page buttons, statuses, and SQL. Three answers were corrected, then the PDF was regenerated and re-tested.

| # | What was wrong / missing | Evidence in code (`origin/main`) | Change made |
| --- | --- | --- | --- |
| 1 | A registered Lab Technician account also has to be **linked** to a technician record. Otherwise the technician sees no samples and gets *"No technician profile is linked to this account."* The FAQ didn't say this. | `backend/controllers/dnaSampleController.js` (403 message), `backend/models/dnaSampleModel.js` (technician scope by `user_id` / `technician_id`), `frontend/src/pages/LabTechniciansPage.jsx` (**+ Link User** button → `POST /api/technicians/:id/link-user`) | Added one sentence to *"Who creates officer accounts?…"* and a **new Q&A**: *"Why can't a lab technician see or analyse any DNA samples? …"* (35 → 36 Q&As) |
| 2 | Missing person answer said "then save" | `MissingPersons.jsx`: `submitLabel="Register Missing Person"` | "…then click **Register Missing Person**." |
| 3 | Case answer said "then save" | `Cases.jsx`: button text `'Save Case'` | "…then click **Save Case**." |

Claims re-confirmed as correct (no change): Admin predefined and cannot register; only Officer / Lab Technician can register (`REGISTERABLE_ROLES`); new accounts are `pending_approval`; Register person / Create Case are Officer only; Family Members page is Admin + Officer; **Register DNA** and **Confirm & Register DNA Sample** button texts; register sample = Admin/Officer only; 6 sample types; 4 sample statuses; profile code `^[A-Z0-9-]{6,50}$`; compare = all three roles; manual similarity = Admin/Officer only; confidence ≥90 High / ≥80 Medium / else Low (procedure **and** `dnaMatchController.js`); Confirm/Reject buttons only for Admin/Officer while *Pending Review*; trigger sets *Identified* from the reference sample's person; DNA Analytics = Admin + Lab Technician; DNA Sample Report and Labs Intersection = all three roles.

Side note for the team (not a FAQ issue): on `origin/main`, `backend/routes/familyMemberRoutes.js` has **no `requireAuth`** on list/get/add/edit/delete. Only `register-dna` is protected. The FAQ correctly says Admins and Officers manage family members (the frontend route is limited to them), but whoever owns family members may want to add the guard.

---

## Phase 2 — CB-2: Pre-processing & Chunking

### Goal
Turn the text extracted from the FAQ PDF into small chunks, **one chunk per Q&A pair**, so each chunk gets one embedding with one clear meaning. One embedding of the whole PDF would mix every topic into one vector, and search couldn't find the right part.

### Files changed

| File | Type | Purpose |
| --- | --- | --- |
| `backend/chatbot/chunker.js` | **New** | Exports `chunkText(rawText)`. `ingest.js` (Phase 3) calls it after reading the PDF. |

No other file was changed. `embedder.js` and `mongoClient.js` were not touched.

### Code — `backend/chatbot/chunker.js` (full new file)

```js
// backend/chatbot/chunker.js
// Cuts the FAQ text into small pieces ("chunks").
// Rule 1: every "Q:" starts a new chunk, so a question and its answer stay together.
// Rule 2: if a piece is still too long (> 150 words), cut it into 150-word windows
//         with 30 words of overlap so no sentence loses its meaning at the border.
// (Pura PDF er ekta embedding hole shob topic mishe jay — tai ekta Q&A = ekta chunk = ekta meaning)

// Safety split: boro block ke 150-word window e kata, protita window porer tar sathe 30 word share kore
function splitByWords(text, maxWords = 150, overlap = 30) {
  const words = text.split(' ');
  if (words.length <= maxWords) return [text]; // choto hole jemon ache temon-i ekta chunk

  const pieces = [];
  // protibar (150 - 30) = 120 word agay jai, tai porer window er shuru te ager 30 word thake
  for (let start = 0; start < words.length; start += maxWords - overlap) {
    pieces.push(words.slice(start, start + maxWords).join(' '));
    if (start + maxWords >= words.length) break; // shesh word porjonto pouche gele thamo
  }
  return pieces;
}

export function chunkText(rawText) {
  // Pre-process: PDF extraction er extra space/new line ke ekta space banano
  const clean = rawText.replace(/\s+/g, ' ').trim();

  const blocks = clean
    .split(/(?=Q:)/)             // split right before every "Q:" (lookahead, tai "Q:" chunk er vitore-i thake)
    .map(b => b.trim())
    .filter(b => b.length > 20); // ignore tiny empty pieces

  // Protita block ke dorkar hole 150-word window e bhag kore ekta flat list banano
  const chunks = [];
  for (const block of blocks) {
    chunks.push(...splitByWords(block));
  }
  return chunks;
}
```

### What each part does

| Part | What it does | Why |
| --- | --- | --- |
| `rawText.replace(/\s+/g, ' ').trim()` | **Pre-processing.** Every run of spaces, tabs and line breaks becomes one space. | PDF extraction breaks lines in the middle of sentences. Clean text gives a cleaner embedding, and `split(' ')` can count words correctly. |
| `.split(/(?=Q:)/)` | Splits the text **right before** every `Q:`. `(?=…)` is a *lookahead*: it finds the position but doesn't remove `Q:`. | The question and its answer stay in the same chunk, and each chunk still starts with `Q:`. The text before the first `Q:` (title + "About ForenTrace") becomes the intro chunk. |
| `.filter(b => b.length > 20)` | Drops tiny or empty pieces. | Avoids useless vectors from stray fragments (for example a lone `Q:`). |
| `splitByWords(text, 150, 30)` | **Safety split.** A block of 150 words or fewer is returned as is. A longer block is cut into 150-word windows, each step moving 120 words (150 − 30). | Very long text makes a vague embedding, and the model reads only a limited number of tokens. The 30-word overlap keeps a sentence that crosses a window border in both windows, so its meaning isn't lost. |
| `if (start + maxWords >= words.length) break;` | Stops once the window reaches the last word. | Without it, the loop would add an extra, fully overlapping tail window. |
| `export function chunkText` | Named ES-module export. | The backend is `"type": "module"`, so `ingest.js` imports it with `import { chunkText } from './chunker.js'`. |

Banglish comments were added beside the code (guide's English comments kept), following the project's comment style.

### Testing results
Run with a temporary test script (kept outside the repo, in the session scratchpad) that imports the real `chunker.js` and the same `pdf-parse/lib/pdf-parse.js` import that `ingest.js` will use.

| # | Test | Expected | Result |
| --- | --- | --- | --- |
| T1 | Real `forentrace_faq.pdf` | Q&A count + 1 = **37** chunks; intro is first; every other chunk starts with `Q:` and contains `A:` | ✅ 37 chunks, intro first, all 36 others start with `Q:` and contain `A:`, sizes 27–75 words (no safety split needed) |
| T2 | One 321-word block | 3 windows (150, 150, 81); last 30 words of window 1 = first 30 words of window 2; last word kept | ✅ `[150,150,81]`, overlap ✅, last word ✅ |
| T3 | Exactly 150 words | 1 chunk (no split) | ✅ 1 |
| T4 | Messy whitespace/new lines + a tiny `Q: A?` | Whitespace collapsed; tiny piece dropped | ✅ `["Intro text that is long enough here.", "Q: What is ForenTrace? A: A system."]` |
| T5 | Only spaces | Empty list | ✅ `[]` |

### Known gaps / notes
- A real Q&A shorter than 21 characters would be dropped by the filter. None of the FAQ's Q&As is anywhere near that short (the smallest is 27 words).
- The chunker trusts that `Q:` appears only at question starts. That is guaranteed by the FAQ writing rule and verified in Phase 1 (36 `Q:` for 36 questions).
- The PDF isn't read here. That happens in `ingest.js` (Phase 3), which passes the text to `chunkText()`.


# ForenTrace API

Run `npm start` from this folder. The API persists case, missing-person, family-member, DNA-sample, and match records in `backend/data/records.json`.

The frontend remains usable offline using its browser cache, then automatically loads and saves through `http://localhost:8000/api/records` whenever this API is running.

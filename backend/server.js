import http from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const recordsFile = join(root, 'data', 'records.json')
const headers = { 'Access-Control-Allow-Origin': 'http://localhost:5173', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' }
const collections = ['missingPeople', 'cases', 'familyMembers', 'samples', 'matches', 'stations', 'officers', 'labs', 'technicians']

async function readRecords() {
  try { return JSON.parse(await readFile(recordsFile, 'utf8')) } catch { return null }
}
async function writeRecords(records) {
  await mkdir(dirname(recordsFile), { recursive: true })
  const temp = `${recordsFile}.tmp`
  await writeFile(temp, JSON.stringify(records, null, 2), 'utf8')
  await rename(temp, recordsFile)
}
function send(response, status, body) { response.writeHead(status, headers); response.end(JSON.stringify(body)) }

http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, headers); return response.end() }
  if (request.url !== '/api/records') return send(response, 404, { error: 'Not found' })
  if (request.method === 'GET') return send(response, 200, await readRecords())
  if (request.method !== 'PUT') return send(response, 405, { error: 'Method not allowed' })
  let raw = ''; for await (const chunk of request) raw += chunk
  try {
    const records = JSON.parse(raw)
    if (!collections.every(key => Array.isArray(records[key]))) throw new Error('Invalid record shape')
    await writeRecords(records)
    return send(response, 200, { saved: true })
  } catch (error) { return send(response, 400, { error: error.message }) }
}).listen(8000, () => console.log('ForenTrace API listening on http://localhost:8000'))

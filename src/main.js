import { Actor, log } from 'apify';
import { SOURCES } from './sources.js';
import { byNewest, dedupeJobs, makeJobFilter } from './normalize.js';

await Actor.init();

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const JOB_SEARCH_COMPLETED_EVENT = 'job-search-completed';
const SEEN_KEY = 'seen-job-ids';
const MAX_SEEN = 20_000;

const input = (await Actor.getInput()) ?? {};
const {
    sources: sourcesInput,
    tags = [],
    search = '',
    locations = [],
    postedWithinDays,
    onlyWithSalary = false,
    maxItems = 100,
    includeDescriptionHtml = false,
    mode = 'snapshot',
    monitorStoreName = 'remote-jobs-monitor',
} = input;

const wanted = (Array.isArray(sourcesInput) && sourcesInput.length ? sourcesInput : Object.keys(SOURCES)).map((s) => String(s).toLowerCase().trim());
const unknown = wanted.filter((s) => !SOURCES[s]);
if (unknown.length) await Actor.fail(`Unknown source "${unknown.join('", "')}". Use any of: ${Object.keys(SOURCES).join(', ')}.`);
const boards = wanted.map((s) => SOURCES[s]);

log.info('Fetching remote jobs', { sources: wanted, tags, search, locations, postedWithinDays, onlyWithSalary, maxItems, mode });

// Both boards at once; a board that can't be read is reported and the other one still counts.
const failures = [];
const perBoard = await Promise.all(boards.map(async (board) => {
    try {
        const raw = await board.fetch();
        const jobs = [];
        for (const r of raw) {
            try {
                const j = board.normalize(r);
                if (j.jobId && j.title) jobs.push(j);
            } catch (err) {
                log.warning(`Skipping a malformed ${board.name} job`, { error: err.message });
            }
        }
        log.info(`${board.name}: ${jobs.length} jobs`);
        return jobs;
    } catch (err) {
        failures.push({ source: board.id, error: err.message });
        log.warning(`${board.name} couldn't be read: ${err.message}`);
        return [];
    }
}));
if (failures.length === boards.length) await Actor.fail(`No board could be read: ${failures.map((f) => `${f.source}: ${f.error}`).join('; ')}`);

const keep = makeJobFilter({ tags, search, locations, postedWithinDays, onlyWithSalary });
const all = perBoard.flat();
let matching = dedupeJobs(all.filter(keep)).sort(byNewest);

let newCount = null;
if (mode === 'monitor') {
    // Remembers which jobs were already returned, so a scheduled run gives only the new ones.
    const store = await Actor.openKeyValueStore(monitorStoreName);
    const seen = new Set((await store.getValue(SEEN_KEY)) ?? []);
    const firstRun = seen.size === 0;
    const fresh = matching.filter((j) => !seen.has(`${j.source}:${j.jobId}`));
    for (const j of matching) seen.add(`${j.source}:${j.jobId}`);
    await store.setValue(SEEN_KEY, [...seen].slice(-MAX_SEEN));
    log.info(firstRun
        ? `Monitor: first run, ${fresh.length} job(s) saved as the baseline; up to ${maxItems} are returned, and the rest count as already seen.`
        : `Monitor: ${fresh.length} new job(s) since the last run.`);
    matching = fresh;
    newCount = fresh.length;
}

const scrapedAt = new Date().toISOString();
const rows = matching.slice(0, Math.max(0, maxItems)).map(({ descriptionHtml, ...j }) => ({
    ...j,
    ...(includeDescriptionHtml ? { descriptionHtml } : {}),
    scrapedAt,
}));

if (rows.length) {
    await Actor.pushData(rows);
} else {
    // An empty dataset looks the same as a broken run, so say why nothing came back.
    const fetched = all.length;
    const reason = failures.length
        ? `${failures.map((f) => f.source).join(', ')} couldn't be read; the other board had nothing matching.`
        : mode === 'monitor' && newCount === 0
            ? 'No new jobs since the last run.'
            : `None of the ${fetched} jobs fetched matched the filters.`;
    await Actor.pushData({ title: 'No jobs in this run', note: reason, fetched, failures, scrapedAt });
}
await Actor.charge({ eventName: JOB_SEARCH_COMPLETED_EVENT });

const bySource = Object.fromEntries(boards.map((b) => [b.id, rows.filter((r) => r.source === b.id).length]));
log.info(`Saved ${rows.length} job(s)`, { bySource, fetched: all.length, matchingAfterDedupe: matching.length, failures });
await Actor.setStatusMessage(`${rows.length} remote job(s) saved (${Object.entries(bySource).map(([k, v]) => `${SOURCES[k].name} ${v}`).join(', ')})${failures.length ? `; couldn't read ${failures.map((f) => f.source).join(', ')}` : ''}.`, { isStatusMessageTerminal: true });

await Actor.exit();

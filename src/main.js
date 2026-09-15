import { Actor, log } from 'apify';

const REMOTEOK_API_URL = 'https://remoteok.com/api';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 15_000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, { ...options, signal: controller.signal });
        } catch (err) {
            lastError = err.name === 'AbortError' ? new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`) : err;
            if (attempt < MAX_ATTEMPTS) {
                await sleep(1000 * 2 ** (attempt - 1));
                continue;
            }
            throw lastError;
        } finally {
            clearTimeout(timeoutId);
        }
        if (res.ok) return res;
        if (!TRANSIENT_STATUSES.has(res.status)) {
            throw new Error(`RemoteOK API request failed with status ${res.status}`);
        }
        lastError = new Error(`RemoteOK API request failed with status ${res.status}`);
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
}

await Actor.init();

/** Must match the event name configured in this Actor's pay-per-event pricing on Apify. */
const JOB_SEARCH_COMPLETED_EVENT = 'job-search-completed';

const input = (await Actor.getInput()) ?? {};
const { tags = [], search = '', maxItems = 100 } = input;

const normalizedTags = tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean);
const searchTerm = String(search).toLowerCase().trim();

log.info('Fetching RemoteOK job listings', { tags: normalizedTags, search: searchTerm, maxItems });

const response = await fetchWithRetry(REMOTEOK_API_URL, {
    headers: {
        // RemoteOK rejects requests without a browser-like User-Agent.
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        Accept: 'application/json',
    },
});

const rawJobs = await response.json();

// The first entry in RemoteOK's API response is a legal/notice object, not a job.
const jobs = rawJobs.filter((item) => item && item.id && item.position);

let filtered = jobs;

if (normalizedTags.length > 0) {
    filtered = filtered.filter((job) => {
        const jobTags = (job.tags ?? []).map((t) => String(t).toLowerCase());
        return normalizedTags.some((tag) => jobTags.includes(tag));
    });
}

if (searchTerm) {
    filtered = filtered.filter((job) => {
        const haystack = `${job.position ?? ''} ${job.company ?? ''} ${job.description ?? ''}`.toLowerCase();
        return haystack.includes(searchTerm);
    });
}

const limited = filtered.slice(0, maxItems);

const records = limited.map((job) => ({
    id: job.id,
    position: job.position,
    company: job.company,
    companyLogo: job.company_logo ?? null,
    tags: job.tags ?? [],
    location: job.location || 'Worldwide',
    salaryMin: job.salary_min ?? null,
    salaryMax: job.salary_max ?? null,
    description: job.description ?? null,
    url: job.url ?? (job.slug ? `https://remoteok.com/remote-jobs/${job.slug}` : null),
    applyUrl: job.apply_url ?? job.url ?? null,
    datePosted: job.date ?? null,
}));

await Actor.pushData(records);
await Actor.charge({ eventName: JOB_SEARCH_COMPLETED_EVENT });

log.info(`Saved ${records.length} job listings to the dataset.`);

await Actor.exit();

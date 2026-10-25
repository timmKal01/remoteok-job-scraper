// JSON over HTTP with a timeout, retries on 429/5xx, and one request a second per host (remoteok.com's robots.txt asks
// for Crawl-delay: 1, and Jobicy asks callers not to hammer its API).

export const USER_AGENT = 'remoteok-job-scraper/0.2 (+https://apify.com/m_ctim/remoteok-job-scraper)';

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const HOST_GAP_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hostQueues = new Map();

/** Serializes requests per host, a second apart, while different hosts run in parallel. */
function waitForHost(host) {
    const prev = hostQueues.get(host) ?? Promise.resolve();
    hostQueues.set(host, prev.then(() => sleep(HOST_GAP_MS)).catch(() => {}));
    return prev;
}

export async function fetchJson(url) {
    const host = new URL(url).host;
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await waitForHost(host);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res;
        try {
            res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
        } catch (err) {
            lastError = err.name === 'AbortError' ? new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${url}`) : err;
            if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
            continue;
        } finally {
            clearTimeout(timeoutId);
        }
        if (res.ok) return res.json();
        lastError = new Error(`${host} answered ${res.status}`);
        await res.body?.cancel().catch(() => {});
        if (!TRANSIENT_STATUSES.has(res.status)) throw lastError;
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
    }
    throw lastError;
}

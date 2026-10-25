// Pure helpers shared by the job sources: HTML to text, salary periods, the job filters and cross-board dedupe.

const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', euro: '€', pound: '£',
};

export function decodeEntities(s) {
    if (!s) return s;
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
        if (code[0] === '#') {
            const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
        }
        return NAMED_ENTITIES[code.toLowerCase()] ?? m;
    });
}

/** HTML to readable plain text: block elements become line breaks, tags go, entities decode. */
export function stripHtml(html) {
    if (!html) return null;
    const text = decodeEntities(
        String(html)
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<li[^>]*>/gi, '\n- ')
            .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section)>/gi, '\n')
            .replace(/<[^>]+>/g, ''),
    );
    return text.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null;
}

const PERIODS = [[/hour/i, 'hour'], [/day|daily/i, 'day'], [/week/i, 'week'], [/month/i, 'month'], [/year|annual/i, 'year']];
export function normalizePeriod(raw) {
    if (!raw) return null;
    for (const [re, label] of PERIODS) if (re.test(raw)) return label;
    return null;
}

/** A positive number, or null (boards use 0 and "" for "not given"). */
export const amount = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

export function toIso(value) {
    if (value === null || value === undefined || value === '') return null;
    const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const lower = (arr) => (arr ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);

/**
 * Filters apply to each job. Text filters are case-insensitive "contains any". A job with no stated location is open
 * to anywhere, so a location filter keeps it.
 */
export function makeJobFilter({ tags, search, locations, postedWithinDays, onlyWithSalary } = {}, now = Date.now()) {
    const wantTags = lower(tags);
    const term = String(search ?? '').trim().toLowerCase();
    const locs = lower(locations);
    const cutoff = postedWithinDays > 0 ? now - postedWithinDays * 86400e3 : null;
    return (job) => {
        if (wantTags.length) {
            const have = lower(job.tags);
            if (!wantTags.some((t) => have.some((h) => h.includes(t)))) return false;
        }
        if (term && !`${job.title ?? ''} ${job.company ?? ''} ${job.description ?? ''}`.toLowerCase().includes(term)) return false;
        if (locs.length && job.location && !locs.some((l) => job.location.toLowerCase().includes(l))) return false;
        if (cutoff !== null) {
            const t = Date.parse(job.postedAt ?? '');
            if (!Number.isFinite(t) || t < cutoff) return false;
        }
        if (onlyWithSalary && job.salaryMin === null && job.salaryMax === null) return false;
        return true;
    };
}

/** "Senior Engineer (Remote) — Acme Inc." and "senior engineer, acme" compare equal. */
const squash = (s) => String(s ?? '').toLowerCase()
    .replace(/\((?:[^)]*remote[^)]*)\)|[-–—,]\s*remote\b.*$/gi, ' ')
    .replace(/\b(inc|llc|ltd|gmbh|corp|co)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export const dedupeKey = (job) => `${squash(job.company)}|${squash(job.title)}`;

/**
 * The same job posted on two boards is returned once: the copy with a salary wins, then the newer one. The other
 * board is listed in `alsoListedOn`.
 */
export function dedupeJobs(jobs) {
    const byKey = new Map();
    for (const job of jobs) {
        const key = dedupeKey(job);
        const prev = byKey.get(key);
        if (!prev) { byKey.set(key, { ...job, alsoListedOn: [] }); continue; }
        if (prev.source === job.source) { byKey.set(`${key}|${job.source}:${job.jobId}`, { ...job, alsoListedOn: [] }); continue; }
        const better = (job.salaryMin !== null && prev.salaryMin === null)
            || ((job.salaryMin !== null) === (prev.salaryMin !== null) && (job.postedAt ?? '') > (prev.postedAt ?? ''));
        const [keep, drop] = better ? [job, prev] : [prev, job];
        byKey.set(key, { ...keep, alsoListedOn: [...new Set([...(prev.alsoListedOn ?? []), drop.sourceName, ...(drop.alsoListedOn ?? [])])].filter((n) => n !== keep.sourceName) });
    }
    return [...byKey.values()];
}

export const byNewest = (a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '') || String(a.jobId).localeCompare(String(b.jobId));

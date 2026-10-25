// The two remote job boards whose terms allow a tool like this one, each mapped to one job shape.
//
// Remote OK (https://remoteok.com/api): "Please link back ... to the URL on Remote OK and mention Remote OK as a
// source", and don't use its logo. Every row carries the Remote OK job page and an attribution line.
//
// Jobicy (https://jobicy.com/api/jobs): free for commercial use and aggregators, provided Jobicy is credited with a
// clickable link and "all application buttons redirect to the original job URL provided in this feed". So applyUrl is
// the Jobicy job page. Its feed covers the last 7 days.
//
// Field names below were read off live responses on 2026-10-25.
import { fetchJson } from './fetch.js';
import { amount, normalizePeriod, stripHtml, toIso } from './normalize.js';

const EMPLOYMENT_TYPES = [
    [/^full[\s_-]?time$/i, 'Full-time'], [/^part[\s_-]?time$/i, 'Part-time'], [/^contract(or)?$/i, 'Contract'],
    [/^intern(ship)?$/i, 'Internship'], [/^(temporary|temp)$/i, 'Temporary'], [/^freelance$/i, 'Freelance'],
];
const employmentType = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    for (const [re, label] of EMPLOYMENT_TYPES) if (re.test(s)) return label;
    return s;
};

export const remoteok = {
    id: 'remoteok',
    name: 'Remote OK',
    async fetch() {
        const body = await fetchJson('https://remoteok.com/api');
        // The first entry is the legal notice, not a job.
        return (Array.isArray(body) ? body : []).filter((j) => j && j.id && j.position);
    },
    normalize(job) {
        const jobUrl = job.url || (job.slug ? `https://remoteok.com/remote-jobs/${job.slug}` : null);
        const salaryMin = amount(job.salary_min);
        const salaryMax = amount(job.salary_max);
        return {
            source: 'remoteok',
            sourceName: 'Remote OK',
            jobId: String(job.id),
            title: job.position?.trim() || null,
            company: job.company?.trim() || null,
            companyLogo: job.company_logo || job.logo || null,
            // Many Remote OK jobs leave the location empty.
            location: job.location?.trim() || null,
            tags: (job.tags ?? []).map(String),
            employmentType: null,
            seniority: null,
            salaryMin,
            salaryMax,
            // Remote OK publishes yearly USD ranges.
            salaryCurrency: salaryMin || salaryMax ? 'USD' : null,
            salaryPeriod: salaryMin || salaryMax ? 'year' : null,
            postedAt: toIso(job.date) ?? (job.epoch ? toIso(job.epoch * 1000) : null),
            description: stripHtml(job.description),
            descriptionHtml: job.description || null,
            jobUrl,
            applyUrl: job.apply_url || jobUrl,
            attribution: jobUrl ? `Job via Remote OK: ${jobUrl}` : 'Job via Remote OK',
        };
    },
};

const JOBICY_PAGE_SIZE = 200;
// The feed covers 7 days; 5 pages has been plenty, and keeps a run to a handful of requests.
const JOBICY_MAX_PAGES = 5;

export const jobicy = {
    id: 'jobicy',
    name: 'Jobicy',
    async fetch() {
        const jobs = [];
        let cursor = null;
        for (let page = 0; page < JOBICY_MAX_PAGES; page++) {
            const url = new URL('https://jobicy.com/api/jobs');
            url.searchParams.set('count', String(JOBICY_PAGE_SIZE));
            if (cursor) url.searchParams.set('cursor', cursor);
            const body = await fetchJson(url.href);
            jobs.push(...(body?.jobs ?? []));
            if (!body?.hasMore || !body?.nextCursor) break;
            cursor = body.nextCursor;
        }
        return jobs;
    },
    normalize(job) {
        const salaryMin = amount(job.salaryMin);
        const salaryMax = amount(job.salaryMax);
        const location = String(job.jobGeo ?? '').split(',').map((s) => s.trim()).filter(Boolean).join(', ') || null;
        return {
            source: 'jobicy',
            sourceName: 'Jobicy',
            jobId: String(job.id),
            title: decodeTitle(job.jobTitle),
            company: job.companyName?.trim() || null,
            companyLogo: job.companyLogo || null,
            location,
            tags: [...[].concat(job.jobIndustry ?? [])].map(String),
            employmentType: employmentType([].concat(job.jobType ?? [])[0]),
            seniority: job.jobLevel && job.jobLevel !== 'Any' ? String(job.jobLevel).trim() : null,
            salaryMin,
            salaryMax,
            salaryCurrency: salaryMin || salaryMax ? job.salaryCurrency || null : null,
            salaryPeriod: salaryMin || salaryMax ? normalizePeriod(job.salaryPeriod) : null,
            postedAt: toIso(job.pubDate),
            description: stripHtml(job.jobDescription),
            descriptionHtml: job.jobDescription || null,
            jobUrl: job.url || null,
            applyUrl: job.url || null,
            attribution: job.url ? `Job via Jobicy: ${job.url}` : 'Job via Jobicy',
        };
    },
};

/** Jobicy titles sometimes arrive with HTML entities ("R&amp;D"). */
function decodeTitle(t) {
    const s = String(t ?? '').trim();
    return s ? stripHtml(s) : null;
}

export const SOURCES = { remoteok, jobicy };

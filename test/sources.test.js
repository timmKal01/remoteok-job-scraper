// Each board's normalizer against real responses captured 2026-10-25, plus the filters and cross-board dedupe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { remoteok, jobicy } from '../src/sources.js';
import { dedupeJobs, makeJobFilter, normalizePeriod, stripHtml } from '../src/normalize.js';

const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

test('remote ok: skips the legal notice, keeps the job page as link-back and apply link', () => {
    const raw = fixture('remoteok.json');
    const jobs = raw.filter((j) => j && j.id && j.position).map((j) => remoteok.normalize(j));
    assert.equal(jobs.length, raw.length - 1, 'the first entry is the legal notice');
    for (const j of jobs) {
        assert.equal(j.source, 'remoteok');
        assert.match(j.jobUrl, /^https:\/\/remote ?ok\.com\/remote-jobs\//i);
        assert.match(j.attribution, /^Job via Remote OK: https:/);
        assert.ok(j.title && j.company && j.postedAt);
    }
    const paid = jobs.find((j) => j.salaryMin !== null);
    assert.equal(paid.salaryCurrency, 'USD');
    assert.equal(paid.salaryPeriod, 'year');
    assert.equal(jobs.find((j) => j.location === null).location, null, 'an empty location stays empty, not "Worldwide"');
    assert.ok(stripHtml(paid.descriptionHtml).length > 100);
});

test('jobicy: apply link is the Jobicy page, salaries carry their period, unpaid jobs have no currency', () => {
    const jobs = fixture('jobicy.json').jobs.map((j) => jobicy.normalize(j));
    for (const j of jobs) {
        assert.equal(j.applyUrl, j.jobUrl);
        assert.match(j.jobUrl, /^https:\/\/jobicy\.com\/jobs\//);
        assert.match(j.attribution, /^Job via Jobicy: https:/);
        assert.doesNotMatch(j.location ?? '', /\s{2,}/);
    }
    const paid = jobs.find((j) => j.salaryMin !== null);
    assert.ok(paid.salaryCurrency && paid.salaryPeriod);
    const unpaid = jobs.find((j) => j.salaryMin === null);
    assert.equal(unpaid.salaryCurrency, null);
    assert.equal(unpaid.salaryPeriod, null);
});

test('salary periods and filters', () => {
    assert.equal(normalizePeriod('yearly'), 'year');
    assert.equal(normalizePeriod('hourly'), 'hour');
    assert.equal(normalizePeriod(''), null);
    const now = Date.parse('2026-10-25T00:00:00Z');
    const job = { title: 'Senior Go Engineer', company: 'Acme', description: 'Build APIs', tags: ['golang', 'backend'], location: 'USA, Canada', postedAt: '2026-10-20T00:00:00Z', salaryMin: null, salaryMax: null };
    assert.equal(makeJobFilter({ tags: ['GO'] }, now)(job), true, 'tags match part of a tag');
    assert.equal(makeJobFilter({ search: 'apis' }, now)(job), true);
    assert.equal(makeJobFilter({ locations: ['europe'] }, now)(job), false);
    assert.equal(makeJobFilter({ locations: ['europe'] }, now)({ ...job, location: null }), true, 'no stated location means anywhere');
    assert.equal(makeJobFilter({ postedWithinDays: 3 }, now)(job), false);
    assert.equal(makeJobFilter({ onlyWithSalary: true }, now)(job), false);
});

test('the same job on both boards comes back once, preferring the copy with a salary', () => {
    const a = { source: 'remoteok', sourceName: 'Remote OK', jobId: '1', title: 'Senior Engineer', company: 'Acme Inc.', salaryMin: null, postedAt: '2026-10-24T00:00:00Z' };
    const b = { source: 'jobicy', sourceName: 'Jobicy', jobId: '2', title: 'Senior Engineer — Remote', company: 'Acme', salaryMin: 100000, postedAt: '2026-10-23T00:00:00Z' };
    const c = { source: 'jobicy', sourceName: 'Jobicy', jobId: '3', title: 'Designer', company: 'Acme', salaryMin: null, postedAt: '2026-10-22T00:00:00Z' };
    const out = dedupeJobs([a, b, c]);
    assert.equal(out.length, 2);
    const engineer = out.find((j) => /engineer/i.test(j.title));
    assert.equal(engineer.source, 'jobicy');
    assert.deepEqual(engineer.alsoListedOn, ['Remote OK']);
    assert.deepEqual(out.find((j) => j.title === 'Designer').alsoListedOn, []);
    // Two jobs with the same title on one board are both kept.
    assert.equal(dedupeJobs([a, { ...a, jobId: '9' }]).length, 2);
});

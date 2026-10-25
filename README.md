# Remote Jobs Scraper: Remote OK + Jobicy

For job boards, newsletters, recruiters and job seekers: get remote jobs from Remote OK and Jobicy in one clean format, with salaries where posted, duplicates removed, and a monitor mode that returns only the jobs posted since your last run.

## What you get

- **Two boards in one feed:** Remote OK's latest jobs (about 100) and up to 1,000 jobs from Jobicy's last 7 days, in one schema
- **Salaries you can compare:** `salaryMin`, `salaryMax`, `salaryCurrency` and `salaryPeriod` (year, month or hour) wherever the board publishes pay
- **Duplicates removed:** a job listed on both boards comes back once, and `alsoListedOn` says where else it appeared
- **Filters:** tags or categories, keyword, location, posted within N days, and only jobs with a salary
- **Monitor mode:** schedule it, and each run returns only jobs you haven't had before
- **Attribution built in:** every row carries the job's page on its board and an `attribution` line, which both boards ask for when you show their jobs

## Example output

Real output from a test run on 2026-10-25 (keyword "engineer", only jobs with a salary). It returned 200 jobs. A Jobicy row (description shortened):

```json
{
  "source": "jobicy",
  "sourceName": "Jobicy",
  "jobId": "156858",
  "title": "Senior Software Engineer (Fundraising) — Remote",
  "company": "GiveDirectly",
  "location": "Canada, UK, USA",
  "tags": ["Software Engineering"],
  "employmentType": "Full-time",
  "seniority": "Senior",
  "salaryMin": 181130,
  "salaryMax": 181130,
  "salaryCurrency": "USD",
  "salaryPeriod": "year",
  "postedAt": "2026-10-24T20:22:15.000Z",
  "description": "About GiveDirectly\n\nWhat if the most effective way to fight poverty was also the simplest...",
  "jobUrl": "https://jobicy.com/jobs/156858-senior-software-engineer-fundraising-remote",
  "applyUrl": "https://jobicy.com/jobs/156858-senior-software-engineer-fundraising-remote",
  "attribution": "Job via Jobicy: https://jobicy.com/jobs/156858-senior-software-engineer-fundraising-remote",
  "alsoListedOn": [],
  "scrapedAt": "2026-10-25T06:38:03.638Z"
}
```

A Remote OK row from the same run (tags and description shortened):

```json
{
  "source": "remoteok",
  "sourceName": "Remote OK",
  "jobId": "1137568",
  "title": "Solutions Engineer",
  "company": "Onebrief",
  "location": null,
  "tags": ["design", "ansible", "grafana", "sys admin", "infosec", "python"],
  "salaryMin": 180000,
  "salaryMax": 220000,
  "salaryCurrency": "USD",
  "salaryPeriod": "year",
  "postedAt": "2026-10-24T00:00:02.000Z",
  "jobUrl": "https://remoteOK.com/remote-jobs/remote-solutions-engineer-onebrief-1137568",
  "attribution": "Job via Remote OK: https://remoteOK.com/remote-jobs/remote-solutions-engineer-onebrief-1137568"
}
```

## What it costs

$0.007 per run on the Free plan, however many jobs it returns, and less on paid Apify plans ($0.0065 Bronze, $0.006 Silver, $0.0055 Gold and above). A run with the default settings returns 100 jobs in about 10 seconds; raise `maxItems` to get more.

## Use cases

- **Job boards and newsletters:** a fresh remote feed, with the attribution each board asks for already in every row.
- **Recruiters:** remote roles in your niche, filtered by keyword, location and seniority.
- **Job seekers and alert bots:** monitor mode on a schedule gives you "new Python jobs open to Europe" every morning.
- **Researchers:** remote pay ranges by role, location and seniority.

## Input

| Field | What it does |
|---|---|
| `sources` | `remoteok`, `jobicy`, or both (the default). |
| `tags` | Keep jobs with any of these tags or categories (Remote OK tags, Jobicy categories). Case-insensitive, matches part of a tag. |
| `search` | Keep jobs whose title, company or description contains this keyword. |
| `locations` | Keep jobs open to any of these places, e.g. `USA`, `Europe`, `Worldwide`. Jobs that don't name a location are kept. |
| `postedWithinDays` | Only jobs posted in the last N days. |
| `onlyWithSalary` | Skip jobs that don't publish pay. |
| `maxItems` | How many jobs to save, newest first. Default 100. |
| `includeDescriptionHtml` | Also return the original HTML description. |
| `mode` | `snapshot` (every matching job) or `monitor` (only jobs new since the last run). |
| `monitorStoreName` | Where monitor mode remembers the jobs it has returned. Use one name per monitor. |

A daily alert for Python jobs open to Europe (schedule it):

```json
{
  "tags": ["python"],
  "locations": ["Europe", "Worldwide"],
  "mode": "monitor",
  "monitorStoreName": "python-europe"
}
```

Paid design roles posted this week:

```json
{
  "tags": ["design"],
  "onlyWithSalary": true,
  "postedWithinDays": 7
}
```

## Related tools

- [ATS Jobs Scraper](https://apify.com/m_ctim/ats-jobs-aggregator): every open job straight from companies' own Workday, Greenhouse, Lever, Ashby or Workable boards
- [HN Who's Hiring Scraper](https://apify.com/m_ctim/hn-whos-hiring-parser): Hacker News "Who is hiring?" threads as clean job rows, with salary, remote and visa details
- [Salary Data by Occupation](https://apify.com/m_ctim/bls-occupation-wage-lookup): official US wages by job and state, to compare a posted salary with the market

## Notes

**Using the jobs you get.** Both boards let tools like this one use their listings, on conditions that pass on to you when you publish them:
- **Remote OK** asks you to link back to the job's Remote OK page (`jobUrl`), name Remote OK as the source, and not use its logo.
- **Jobicy** asks you to credit Jobicy with a clickable link, and to send apply buttons to the Jobicy job page. `applyUrl` already is that page.

**Why these two boards.** They are the remote job boards whose terms allow their jobs to be passed on like this. Other popular boards don't allow it, so they're left out.

**What each board provides.**

| Field | Remote OK | Jobicy |
|---|---|---|
| How far back | Its latest jobs (about 100) | The last 7 days (up to 1,000 per run) |
| Salary | Yearly ranges in USD, on some jobs | Min, max, currency and period, on many jobs |
| Location | Often empty | Countries or regions |
| Employment type and seniority | Not published | Yes |
| Tags | Remote OK tags | Jobicy categories |

**Locations.** Remote OK leaves the location empty on many jobs. A location filter keeps those jobs, so you don't miss ones that may be open to you; the job page has the details.

**Monitor mode.** The first run saves every matching job as the baseline and returns up to `maxItems` of them; the rest count as already seen. Later runs return only jobs that weren't there before. A run with nothing new returns one row saying so.

**Polite by design.** One request a second per board, with a user agent that names this tool. Jobicy asks that automated syncs run at most once an hour, so schedule monitors hourly or less often.

**No proxies, no logins.** It reads the public job APIs that Remote OK and Jobicy publish.

**Feedback.** Open an issue in the Issues tab if something's missing or wrong. I read every issue.

**Disclaimer.** This actor is unofficial and is not affiliated with, endorsed by, or connected to Remote OK, Jobicy or any company whose jobs it returns. Job content belongs to the companies and boards that posted it.

import fs from "node:fs/promises";
import path from "node:path";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME;

if (!token) {
  throw new Error("Missing GITHUB_TOKEN");
}
if (!username) {
  throw new Error("Missing GITHUB_USERNAME");
}

// Rolling 365-day window ending now
const now = new Date();
const from = new Date(now);
from.setUTCDate(from.getUTCDate() - 365);

const query = `
  query($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
              contributionLevel
              weekday
            }
          }
        }
      }
    }
  }
`;

const variables = {
  login: username,
  from: from.toISOString(),
  to: now.toISOString(),
};

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query, variables }),
});

if (!res.ok) {
  const text = await res.text();
  throw new Error(`GitHub API error ${res.status}: ${text}`);
}

const json = await res.json();

if (json.errors) {
  throw new Error(`GraphQL errors: ${JSON.stringify(json.errors, null, 2)}`);
}

const calendar =
  json?.data?.user?.contributionsCollection?.contributionCalendar;

if (!calendar) {
  throw new Error("No contribution calendar returned");
}

const days = calendar.weeks.flatMap((week) => week.contributionDays);

// Keep only the last 365 actual days in case the returned weeks spill over
const filteredDays = days
  .filter((d) => {
    const date = new Date(`${d.date}T00:00:00Z`);
    return date >= from && date <= now;
  })
  .sort((a, b) => a.date.localeCompare(b.date));

const output = {
  username,
  generatedAt: now.toISOString(),
  from: from.toISOString(),
  to: now.toISOString(),
  totalContributions: calendar.totalContributions,
  days: filteredDays.map((d) => ({
    date: d.date,
    count: d.contributionCount,
    level: d.contributionLevel,
    color: d.color,
    weekday: d.weekday,
  })),
};

const outDir = path.join(process.cwd(), "assets", "data");
const outFile = path.join(outDir, "contributions.json");

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outFile, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(`Wrote ${filteredDays.length} days to ${outFile}`);
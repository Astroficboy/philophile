#!/usr/bin/env node
// Crawl the Stanford Encyclopedia of Philosophy table of contents and index every
// philosopher entry into data/sep-index.json.
//
//   npm run sync               # use cached pages when fresh
//   npm run sync -- --force    # refetch everything
//   npm run sync -- --limit 50 # only the first 50 candidates (quick test)
import { runSepSync } from '../server/lib/sep-sync.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

runSepSync({ force, limit, log: (m) => console.log(m) })
  .then((index) => {
    console.log(`Wrote ${index.people.length} philosophers and ${index.topics.length} topics.`);
  })
  .catch((err) => {
    console.error('Sync failed:', err.message);
    process.exit(1);
  });

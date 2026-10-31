# Philophile

A philosophy learning app built around the people who made philosophy. It has a profile for every
philosopher, a timeline, and an era map that shows what shaped each thinker. You can read the
Stanford Encyclopedia of Philosophy inside the app, and a local AI tutor powered by Ollama answers
your questions.

## Features

- **Every SEP philosopher.** The app includes 189 curated philosophers from Greek, Roman, Chinese,
  Indian, Japanese, Islamic, Jewish, African and Western traditions, with their influences entered
  by hand. A sync step reads the Stanford Encyclopedia's table of contents and imports every person
  entry, with life dates parsed from the entry text.
- **Philosopher profiles.** Each profile has a summary, key ideas and major works. It also lists the
  philosopher's topics, who influenced them and who they influenced, with the strength of each
  influence.
- **Era map (heat map).** The map shows everything around a philosopher's life:
  - Philosophers and topics that **influenced them** are shown on a **red scale**. Stronger
    influence is a deeper red.
  - Philosophers and topics from **the same era that did not directly influence them** are shown
    in **blue**.
  - Later thinkers they **influenced** are shown in **violet**.
  - **World events** (wars, revolutions, scientific discoveries) are shown in **amber**.

  Click a philosopher tile to open their profile, with a banner that explains how they relate to
  the philosopher you came from. Click a topic tile to open that topic focused on your philosopher:
  how central the topic was to them, which influences brought it to them, and who else worked on
  it at the time. You can switch between the tile grid and a time map.
- **Timelines.** Each philosopher has a zoomable timeline of their life and works, the lifespans of
  their influences, contemporaries and followers, and world events. A global timeline shows every
  philosopher across 11 colour-coded eras. You can zoom to a single era or highlight a topic.
- **Encyclopedia reader.** SEP entries are fetched live, cached on disk, and shown with a table of
  contents. Links to other entries open inside the app. Every section has an "Ask tutor" button.
- **Local AI tutor (Ollama, `gemma4:12b` by default).**
  - Q&A that streams its answers and is grounded in the relevant SEP sections.
  - Explanations of how one philosopher or topic connects to another.
  - Generated multiple-choice quizzes.
  - Extraction of key ideas, works, topics and influences for philosophers that only exist in the
    encyclopedia index.
- **Works offline too.** If Ollama isn't running, quizzes are built from the dataset instead. The
  maps, timelines and profiles don't need the AI at all.
- **Progress tracking** in the browser. The app records the philosophers you explore and your quiz
  scores.

## Quick start

You need Node.js 20 or newer.

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000.

### Import every philosopher from the Stanford Encyclopedia

```bash
npm run sync
```

You can also go to **Settings → Import every SEP philosopher** in the app. The sync reads about
600 person entries and waits 400 ms between requests, so it takes about 5–10 minutes. Pages are
cached in `data/cache/`, so later syncs are fast. Run `npm run sync -- --force` to fetch everything
again. Influences for philosophers that aren't in the curated set are inferred from which earlier
philosophers their entry discusses most. To get richer profiles, use **Extract with local AI** on
their profile page.

### Set up the AI tutor

1. Install [Ollama](https://ollama.com).
2. Pull the model:

   ```bash
   ollama pull gemma4:12b
   ```

3. Make sure Ollama is running (`ollama serve`).

If the exact tag isn't installed, Philophile uses the closest installed model in the same family.
For example, it accepts any `gemma4:*` tag. **Settings** shows which model is in use.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server |
| `OLLAMA_MODEL` | `gemma4:12b` | Model for the tutor |
| `OLLAMA_TIMEOUT_MS` | `180000` | Timeout for each AI request |
| `SEP_BASE` | `https://plato.stanford.edu` | Encyclopedia base URL |
| `SEP_DELAY_MS` | `400` | Pause between requests during a sync |
| `SEP_CACHE_DAYS` | `30` | How long fetched pages stay cached |

## Project layout

```
server/
  data/            curated philosophers, topics, eras and world events
  lib/sep.js       Stanford Encyclopedia fetcher and parser
  lib/sep-sync.js  imports every person entry into data/sep-index.json
  lib/knowledge.js knowledge graph: merging, era heat map, timelines, topics
  lib/ollama.js    Ollama client (streaming + structured JSON)
  lib/tutor.js     grounded Q&A, connections, quizzes, AI enrichment
  routes/api.js    REST API
public/            single-page app (vanilla JS + D3)
scripts/           CLI sync
test/              node:test suites
```

Run the tests with `npm test`.

## Credits

Encyclopedia content is © the Stanford Encyclopedia of Philosophy (Metaphysics Research Lab,
Stanford University). The app fetches it live for personal study and links back to every original
entry. Please cite the SEP when you use its content.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A static student portfolio for **Вебпрограмування** (group І-23) — a sequence of course lab assignments. No build system, no package manager, no test framework, no linter. The deliverable is HTML/CSS/JS served as plain files, plus a Jupyter notebook for the ML-heavy labs.

**Language convention:** all user-facing copy, code comments, and docstrings are in Ukrainian. Keep new work in Ukrainian to match. Commit messages are mixed Ukrainian/English (both occur in history).

## Serving the site

The site must be served over HTTP — several pages `fetch()` a local JSON model, which fails under `file://`.

```bash
python3 -m http.server 8000   # from repo root
```

There is no build step. Editing a file and reloading the browser is the whole loop.

## Architecture

### The three lab families

- `lab1/`, `lab2/`, `lab3/` — course labs (HTML basics, Bootstrap, JavaScript). `lab3/` is currently empty; `index.html` links `lab4/`, `lab5/`, `lab6/` that don't exist yet.
- `lab1-hmi/`, `lab2-hmi/`, `lab3-hmi/` — "HMI" labs: ML models trained in Python, exposed to the browser as a working demo page.
- `exper/`, `trash/` — scratch and experiments, linked from the root page.
- `lab4-hmi/` — appeared after this file was written; not yet described here.

### HMI pattern (shared by `lab1-hmi/` and `lab2-hmi/`)

This is the pattern to follow for any new ML demo here. It spans a Python training step (not committed) and a JS inference step (committed):

1. **Train in Python**, export model parameters to a JSON file committed next to the JS.
2. **`code.js`** loads that JSON via `fetch()` and exposes a global `classifyTweet()`.
3. **`index.html`** is a near-identical shell: a `<textarea id="tweetInput">`, a button with `onclick="classifyTweet()"`, and a `<p id="result">`.

The two implementations differ only in the model file and the inference function:

| | `lab1-hmi/` | `lab2-hmi/` |
|---|---|---|
| Model | Logistic regression | Naive Bayes |
| JSON keys | `theta` (3×1), `freqs` | `logprior` (float), `loglikelihood` |
| `freqs` key format | `"word,1.0"` → count | `"word"` → log-prob |
| Features | `[1, Σfreqs[word,1.0], Σfreqs[word,0.0]]` | sum of per-word log-likelihoods |
| Decision | `sigmoid(dot) > 0.5` | log-odds `> 0` |

### Known bug in both HMI pages (not yet fixed)

`processTweet()` in both `code.js` files is only `tweet.toLowerCase().split(' ')`. The Python training pipeline used `process_tweet()` with stopword removal, punctuation stripping, and Porter stemming (the reference implementation is quoted in the header comment of `lab1-hmi/code.js`). The JS therefore looks up **unstemmed** words in a **stemmed** vocabulary, so most feature lookups miss and predictions degrade toward the prior. Fixing this means porting the full preprocessing to JS, or re-exporting the model keyed by unstemmed words.

Related: `lab1-hmi/code.js` and `lab2-hmi/code.js` load the model asynchronously via `fetch()` with no loading state — clicking the button before the fetch resolves classifies against `undefined` and throws.

### `lab3-hmi/` — word embeddings notebook

`lab3v0.ipynb` (43 cells) is the deliverable; it is **not yet committed**. The notebook depends on two files in the same directory:

- `ubercorpus.cased.tokenized.word2vec.300d` — 1.6 GB, 595,119 words × 300 dims, loaded via `gensim.KeyedVectors.load_word2vec_format`. Loading takes a long time and roughly several GB of RAM.
- `ubercorpus.cased.tokenized.word2vec.300d.bz2` — the 530 MB original.

Both are already present locally. Cell 23 re-downloads and re-extracts them via `wget` + `bzip2 -dk` — skip that cell if the files are present. The root `.gitignore` (added with the lab3-hmi work) excludes the model files, the `.kv`/`.npy` artifacts gensim writes, and the generated `.jsonl`.

Notebook flow: hardcoded word vectors for five Ukrainian politicians → pairwise angle; then a `test_vocabulary.txt` dataset from `lang-uk/vecs` for capital/country analogy (the `King - Man + Woman = Queen` trick via `get_country`); then PCA scatter plots.

**Performance trap:** `get_accuracy()` calls `get_country()`, which loops over all 595,119 vocabulary words computing cosine similarity — per row, over 4,271 rows. The saved cell output ends in `KeyboardInterrupt` for this reason. Vectorize it (batch `model.cosine_similarities`) before expecting it to finish.

`.remember/` inside `lab3-hmi/` is a plugin artifact directory, not part of the lab. It self-ignores via its own `.gitignore` containing `*`.

### `lab3-hmi/` — JSONL converter + load/memory measurement page

`convert_to_json.py` converts the word2vec model to JSONL (NDJSON); `index.html` + `code.js` + `style.css` are a page that uploads the converted file and measures load time and memory footprint. Two constraints drive the whole design:

- **V8 caps strings at 512 MiB** (`'x'.repeat(536870888)` is the max). The full JSON of this model is ~1.69 GB, so a monolithic JSON file *cannot* be parsed in a browser. The output format is therefore JSONL and the page reads it as a stream (`file.stream()` → `TextDecoder` → `leftover`-based line splitting → `JSON.parse` per line).
- **The metadata line carries `count` = the number of words actually written**, not the source `vocab_size`. The page allocates its `Float32Array` exactly once from `count × dim`; allocating by `vocab_size` instead costs ~6× the peak memory (798 MB vs 137 MB measured), and growing the array by doubling costs a ~1.5 GB transient peak.

Converter specifics: numbers are copied verbatim from the source text (no `float()`, no `json.dumps` on the vector) — 10× faster and byte-exact at 6 decimals. It reads plain and `.bz2` sources (`bz2.open`) and both produce identical records. Output is UTF-8, no BOM, `\n` line endings.

Measurement specifics: `performance.memory` is **bucketed** in Chrome unless `--enable-precise-memory-info` is set (without it, a real 681 MB allocation reports a 0.0 MB delta), so the page shows both the browser-measured heap and a browser-independent computed size, with a note saying which to trust. Vectors are stored as `Float32Array` (half the memory of plain arrays; 6-decimal text round-trips exactly through float32).

### Root `index.html` — the portfolio page

Renders lab cards linking into each subdirectory. Two things that are easy to get wrong:

- The local theme stylesheets `gener.css` / `gener_green.css` are **commented out** on the root page. It currently pulls nine stylesheets from `https://kdpu.edu.ua/...` (the university's Joomla template) plus Google Fonts. Uncommenting the local sheet removes the KDPU dependency.
- `gener.css` and `gener_green.css` differ in only two lines, but three distinct color values: `--primary` (`#3157d5` blue vs `#31d599` teal-green) and the header gradient's first stop (`#3157d5` vs `#6bd230` lime). Note the green theme uses *different* greens in those two places. Edit both, or add a build step.

### Asset sourcing is inconsistent across pages

Three different Bootstrap deliveries, picked per-page and not standardized: vendored locally in `bootstrap/` (used by `lab1/index.html`), the KDPU CDN (root `index.html`, `lab1-hmi/`, `lab2-hmi/`), and jsDelivr (`lab2/index.html`). `exper/index.html` uses the Tailwind browser CDN instead. Some pages also depend on a live KDPU server for fonts, icons, and jQuery — they will degrade if that host is unreachable.

`lab1/page2.html` and `lab1/page3.html` are empty (0 bytes) — placeholders for tasks not yet done.

## Working in this repo

- `index.html` at the repo root is the entry point for the whole site; each lab is a self-contained subdirectory with no cross-lab dependencies except shared CSS.
- `lab1-hmi/code.js` carries the full lab assignment text and the reference Python solution in a block comment at the bottom (402 lines total, only ~68 of them code). `lab2-hmi/code.js` is code-only — no assignment text — and carries a `// Тут явно варто її покращити` note above `processTweet` instead.
- Inline `onclick="..."` handlers are the established pattern for wiring buttons; keep it rather than switching to `addEventListener` mid-page, but do not copy it into new standalone pages if a cleaner approach fits.
- The root `index.html` card numbering is already inconsistent (three cards numbered `2`, spanning labs 1–2). The `lab3-hmi` card added alongside this work is numbered "3 (HMI)".

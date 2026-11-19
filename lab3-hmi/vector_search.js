/**
 * Автоматичне завантаження сконвертованої моделі word2vec (JSONL) з GitHub,
 * пошук векторів за словом, відбір словами для візуалізації та PCA 2D.
 *
 * Файл НЕ обирає користувач: він завантажується автоматично з media.githubusercontent.com.
 * Модель читається потоково (File.stream()/Response.body), парситься по рядках.
 */

const MODEL_URL = 'https://media.githubusercontent.com/media/ssemerikov/i23/main/lab3-hmi/ubercorpus.cased.tokenized.word2vec.300d.jsonl';

const BYTES_PER_FLOAT = 4;

const loadingOverlay = document.getElementById('loadingOverlay');
const loadingError = document.getElementById('loadingError');
const retryBtn = document.getElementById('retryBtn');
const statusText = document.getElementById('status');
const fileInfo = document.getElementById('fileInfo');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchInfo = document.getElementById('searchInfo');
const searchResults = document.getElementById('searchResults');
const selectedChips = document.getElementById('selectedChips');
const selectedCount = document.getElementById('selectedCount');
const visualizeBtn = document.getElementById('visualizeBtn');
const clearBtn = document.getElementById('clearBtn');
const plotHint = document.getElementById('plotHint');
const plotWrap = document.getElementById('plotWrap');

const resultFields = {
    words: document.getElementById('resWords'),
    dim: document.getElementById('resDim'),
    fileSize: document.getElementById('resFileSize'),
    totalTime: document.getElementById('resTotalTime'),
    throughput: document.getElementById('resThroughput'),
    computed: document.getElementById('resComputed'),
    heapDelta: document.getElementById('resHeapDelta')
};

let modelReader = null;
let modelReady = false;
let dim = 0;
let count = 0;
let vectors = null;   // Float32Array, довжина count * dim
let index = null;     // Map<string, number> слово -> позиція
let selected = new Set();
let searchMatches = [];

function showLoading() {
    loadingError.style.display = 'none';
    loadingError.textContent = '';
    retryBtn.style.display = 'none';
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function showError(message) {
    loadingError.style.display = 'block';
    loadingError.textContent = message;
    retryBtn.style.display = 'inline-block';
}

function usedHeapMB() {
    if (!performance.memory) {
        return null;
    }
    return performance.memory.usedJSHeapSize / (1024 * 1024);
}

function formatBytes(bytes) {
    if (bytes < 1024) {
        return bytes + ' Б';
    }
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
        return (mb / 1024).toFixed(2) + ' ГБ';
    }
    return mb.toFixed(1) + ' МБ';
}

function setStatus(message) {
    statusText.textContent = message;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function resetResults() {
    for (const key of Object.keys(resultFields)) {
        resultFields[key].textContent = '—';
    }
}

class ModelReader {
    constructor(retainVectors) {
        this.retainVectors = retainVectors;
        this.meta = null;
        this.count = 0;
        this.dim = 0;
        this.lineNumber = 0;
        this.index = new Map();
        this.vectors = null;
        this.metaSeen = false;
    }

    allocate(planned) {
        if (!this.retainVectors) {
            return;
        }
        this.vectors = new Float32Array(planned);
    }

    handleLine(line) {
        if (line.charCodeAt(0) === 0xFEFF) {
            line = line.slice(1);
        }
        if (line.endsWith('\r')) {
            line = line.slice(0, -1);
        }
        if (!line) {
            return;
        }
        this.lineNumber += 1;

        let record;
        try {
            record = JSON.parse(line);
        } catch (error) {
            throw new Error('Файл не є коректним NDJSON (рядок ' +
                this.lineNumber + '): ' + error.message);
        }

        if (record.meta) {
            this.meta = record.meta;
            this.metaSeen = true;
            this.dim = record.meta.dim || 0;
            this.allocate((record.meta.count || 0) * this.dim);
            return;
        }

        if (!Array.isArray(record.v) || typeof record.w !== 'string') {
            throw new Error('Рядок ' + this.lineNumber +
                ' не містить пари "w"/"v" — це не результат конвертера convert_to_json.py');
        }

        if (!this.retainVectors) {
            this.count += 1;
            return;
        }

        const needed = (this.count + 1) * this.dim;
        if (!this.vectors) {
            this.vectors = new Float32Array(needed);
        } else if (this.vectors.length < needed) {
            const grown = new Float32Array(Math.max(needed, this.vectors.length * 2));
            grown.set(this.vectors);
            this.vectors = grown;
        }

        const vector = record.v;
        const base = this.count * this.dim;
        for (let i = 0; i < this.dim; i += 1) {
            this.vectors[base + i] = vector[i];
        }
        this.index.set(record.w, this.count);
        this.count += 1;
    }
}

async function loadModel() {
    showLoading();
    modelReady = false;
    resetResults();
    plotWrap.innerHTML = '';
    plotHint.textContent = 'Оберіть від 2 до 20 слів і натисніть «Візуалізувати».';
    setStatus('Завантаження моделі…');

    const reader = new ModelReader(true);
    modelReader = reader;
    const heapBefore = usedHeapMB();
    const totalStart = performance.now();

    let readTime = 0;
    let parseTime = 0;
    let bytesRead = 0;
    let leftover = '';

    try {
        const response = await fetch(MODEL_URL, { mode: 'cors' });
        if (!response.ok) {
            throw new Error('Не вдалося завантажити модель (HTTP ' + response.status + ')');
        }
        const stream = response.body.getReader();
        const decoder = new TextDecoder();

        for (;;) {
            const readStart = performance.now();
            const { done, value } = await stream.read();
            readTime += performance.now() - readStart;
            if (done) {
                break;
            }
            bytesRead += value.byteLength;

            const parseStart = performance.now();
            const text = decoder.decode(value, { stream: true });
            const parts = (leftover + text).split('\n');
            leftover = parts.pop();
            for (const line of parts) {
                if (line) {
                    reader.handleLine(line);
                }
            }
            parseTime += performance.now() - parseStart;
        }

        const tail = decoder.decode();
        if (tail) {
            leftover += tail;
        }
        if (leftover) {
            const parseStart = performance.now();
            reader.handleLine(leftover);
            parseTime += performance.now() - parseStart;
        }

        const totalTime = performance.now() - totalStart;
        const heapAfter = usedHeapMB();

        dim = reader.dim;
        count = reader.count;
        vectors = reader.vectors;
        index = reader.index;
        modelReady = true;

        // Результати
        resultFields.words.textContent = count.toLocaleString('uk-UA');
        resultFields.dim.textContent = dim || '—';
        resultFields.fileSize.textContent = formatBytes(bytesRead);
        resultFields.totalTime.textContent = (totalTime / 1000).toFixed(2) + ' с';
        const mbPerSec = (bytesRead / (1024 * 1024)) / (totalTime / 1000);
        resultFields.throughput.textContent = mbPerSec.toFixed(1) + ' МБ/с';
        const computed = count * dim * BYTES_PER_FLOAT;
        resultFields.computed.textContent = formatBytes(computed) +
            ' (' + count.toLocaleString('uk-UA') + ' × ' + dim + ' × ' + BYTES_PER_FLOAT + ' Б)';
        if (heapBefore === null) {
            resultFields.heapDelta.textContent = 'недоступно';
        } else {
            const delta = heapAfter - heapBefore;
            resultFields.heapDelta.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' МБ';
        }

        fileInfo.textContent = 'Модель завантажено автоматично з GitHub. Вектори утримуються в пам\'яті (Float32Array).';
        setStatus('Готово: модель завантажено — ' + count.toLocaleString('uk-UA') + ' слів, розмірність ' + dim + '.');
        searchInput.focus();
        hideLoading();
    } catch (error) {
        setStatus('Помилка завантаження моделі.');
        fileInfo.textContent = '';
        showError('Помилка: ' + error.message +
            ' Перевірте з\'єднання з мережею. Повний файл завантажується з media.githubusercontent.com.');
        // Якщо частково щось є — все одно приховати індикатор лише після помилки
    }
}

retryBtn.addEventListener('click', () => {
    loadModel();
});

function findMatches(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
        return [];
    }
    const result = [];
    if (index.has(q)) {
        result.push(q);
    }
    for (const word of index.keys()) {
        if (word === q) {
            continue;
        }
        if (word.toLowerCase().includes(q)) {
            result.push(word);
            if (result.length >= 50) {
                break;
            }
        }
    }
    return result;
}

function renderSearchResults(matches) {
    searchResults.innerHTML = '';
    searchMatches = matches;
    if (!matches.length) {
        const li = document.createElement('li');
        li.className = 'list-group-item text-muted';
        li.textContent = 'Нічого не знайдено.';
        searchResults.appendChild(li);
        searchInfo.textContent = '';
        return;
    }
    searchInfo.textContent = 'Знайдено: ' + matches.length + ' (показано до 50).';

    matches.forEach((word, idx) => {
        const li = document.createElement('li');
        li.className = 'list-group-item py-1';
        const checked = selected.has(word);
        const disabled = (!checked && selected.size >= 20) ? 'disabled' : '';
        li.innerHTML =
            '<div class="form-check mb-0">' +
            '<input class="form-check-input" type="checkbox" id="sr_' + idx + '" ' + (checked ? 'checked' : '') + ' ' + disabled + ' data-word="' + escapeHtml(word) + '">' +
            '<label class="form-check-label" for="sr_' + idx + '">' + escapeHtml(word) + '</label>' +
            '</div>';
        searchResults.appendChild(li);
    });

    searchResults.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const word = cb.dataset.word;
            if (cb.checked) {
                if (selected.size >= 20) {
                    cb.checked = false;
                    alert('Можна обрати не більше 20 слів.');
                    return;
                }
                selected.add(word);
            } else {
                selected.delete(word);
            }
            renderSelected();
            updateCheckboxDisabled();
            updateVisualizeButton();
        });
    });
}

function updateCheckboxDisabled() {
    searchResults.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const word = cb.dataset.word;
        if (!selected.has(word) && selected.size >= 20) {
            cb.disabled = true;
        } else {
            cb.disabled = false;
        }
    });
}

function renderSelected() {
    selectedChips.innerHTML = '';
    if (selected.size === 0) {
        const span = document.createElement('span');
        span.className = 'text-muted';
        span.textContent = 'Список порожній.';
        selectedChips.appendChild(span);
    } else {
        for (const word of selected) {
            const badge = document.createElement('span');
            badge.className = 'badge bg-primary me-2 mb-2 selected-chip';
            badge.innerHTML = escapeHtml(word) +
                ' <button type="button" class="btn-close btn-close-white ms-1" style="font-size:0.6rem;" aria-label="Видалити" data-word="' + escapeHtml(word) + '"></button>';
            badge.querySelector('button').addEventListener('click', () => {
                selected.delete(word);
                renderSelected();
                // синхронізувати чекбокси в поточних результатах пошуку
                const cb = searchResults.querySelector('input[data-word="' + CSS.escape(word) + '"]');
                if (cb) {
                    cb.checked = false;
                }
                updateCheckboxDisabled();
                updateVisualizeButton();
            });
            selectedChips.appendChild(badge);
        }
    }
    selectedCount.textContent = selected.size;
}

function updateVisualizeButton() {
    visualizeBtn.disabled = !(selected.size >= 2 && selected.size <= 20);
}

// ---- PCA 2D ----

function getVector(word) {
    const off = index.get(word) * dim;
    const arr = new Float32Array(dim);
    for (let i = 0; i < dim; i += 1) {
        arr[i] = vectors[off + i];
    }
    return arr;
}

function normVec(v) {
    let s = 0;
    for (let i = 0; i < v.length; i += 1) {
        s += v[i] * v[i];
    }
    const n = Math.sqrt(s);
    if (n > 0) {
        for (let i = 0; i < v.length; i += 1) {
            v[i] /= n;
        }
    }
    return n;
}

function matVec(mat, v, out, d) {
    for (let i = 0; i < d; i += 1) {
        let s = 0;
        const rowBase = i * d;
        for (let j = 0; j < d; j += 1) {
            s += mat[rowBase + j] * v[j];
        }
        out[i] = s;
    }
}

function pca2D(words) {
    const k = words.length;
    const X = words.map(getVector);

    // Центрування
    const mean = new Float64Array(dim);
    for (let i = 0; i < dim; i += 1) {
        let s = 0;
        for (let r = 0; r < k; r += 1) {
            s += X[r][i];
        }
        mean[i] = s / k;
    }
    const Xc = X.map((row) => {
        const arr = new Float64Array(dim);
        for (let i = 0; i < dim; i += 1) {
            arr[i] = row[i] - mean[i];
        }
        return arr;
    });

    // Коваріаційна матриця D x D
    const C = new Float64Array(dim * dim);
    for (let r = 0; r < k; r += 1) {
        const row = Xc[r];
        for (let i = 0; i < dim; i += 1) {
            if (row[i] === 0) {
                continue;
            }
            const vi = row[i];
            const base = i * dim;
            for (let j = 0; j < dim; j += 1) {
                C[base + j] += vi * row[j];
            }
        }
    }
    const denom = k > 1 ? (k - 1) : 1;
    for (let i = 0; i < dim * dim; i += 1) {
        C[i] /= denom;
    }

    // Перша головна компонента (power iteration)
    let v1 = new Float64Array(dim);
    for (let i = 0; i < dim; i += 1) {
        v1[i] = Math.sin((i + 1) * 0.37) + 0.13 * Math.cos((i + 1) * 0.11);
    }
    normVec(v1);
    const w1 = new Float64Array(dim);
    for (let iter = 0; iter < 120; iter += 1) {
        matVec(C, v1, w1, dim);
        const n = normVec(w1);
        if (n === 0) {
            break;
        }
        // копіюємо w1 -> v1
        for (let i = 0; i < dim; i += 1) {
            v1[i] = w1[i];
        }
    }

    // Власне значення 1
    let lambda1 = 0;
    const Cv1 = new Float64Array(dim);
    matVec(C, v1, Cv1, dim);
    for (let i = 0; i < dim; i += 1) {
        lambda1 += v1[i] * Cv1[i];
    }

    // Друга компонента: дефліціюемо C
    const C2 = new Float64Array(dim * dim);
    for (let i = 0; i < dim; i += 1) {
        for (let j = 0; j < dim; j += 1) {
            C2[i * dim + j] = C[i * dim + j] - lambda1 * v1[i] * v1[j];
        }
    }

    let v2 = new Float64Array(dim);
    for (let i = 0; i < dim; i += 1) {
        v2[i] = Math.cos((i + 1) * 0.37) + 0.17 * Math.sin((i + 1) * 0.19);
    }
    // ортогоналізуємо стартовий вектор до v1
    let dot0 = 0;
    for (let i = 0; i < dim; i += 1) {
        dot0 += v2[i] * v1[i];
    }
    for (let i = 0; i < dim; i += 1) {
        v2[i] -= dot0 * v1[i];
    }
    normVec(v2);

    const w2 = new Float64Array(dim);
    for (let iter = 0; iter < 120; iter += 1) {
        matVec(C2, v2, w2, dim);
        const n = normVec(w2);
        if (n === 0) {
            break;
        }
        for (let i = 0; i < dim; i += 1) {
            v2[i] = w2[i];
        }
        // тримаємо ортогональність до v1
        let dot = 0;
        for (let i = 0; i < dim; i += 1) {
            dot += v2[i] * v1[i];
        }
        for (let i = 0; i < dim; i += 1) {
            v2[i] -= dot * v1[i];
        }
        normVec(v2);
    }

    // Проєкція
    const pts = words.map((word, r) => {
        const row = Xc[r];
        let x = 0;
        let y = 0;
        for (let i = 0; i < dim; i += 1) {
            x += row[i] * v1[i];
            y += row[i] * v2[i];
        }
        return { word: word, x: x, y: y };
    });

    return pts;
}

function renderPlot(pts) {
    const width = 720;
    const height = 480;
    const pad = 48;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    let minX = Math.min.apply(null, xs);
    let maxX = Math.max.apply(null, xs);
    let minY = Math.min.apply(null, ys);
    let maxY = Math.max.apply(null, ys);
    if (maxX - minX < 1e-12) { maxX = minX + 1; }
    if (maxY - minY < 1e-12) { maxY = minY + 1; }
    // додати трохи полів
    const rx = (maxX - minX) * 0.12 || 1;
    const ry = (maxY - minY) * 0.12 || 1;
    minX -= rx; maxX += rx;
    minY -= ry; maxY += ry;

    const sx = function (x) { return pad + (x - minX) / (maxX - minX) * (width - 2 * pad); };
    const sy = function (y) { return height - pad - (y - minY) / (maxY - minY) * (height - 2 * pad); };

    let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PCA 2D">';
    // фон
    svg += '<rect x="0" y="0" width="' + width + '" height="' + height + '" fill="#f8f9fa"/>';
    // осі
    const originX = sx(0);
    const originY = sy(0);
    if (originX > pad && originX < width - pad) {
        svg += '<line x1="' + originX + '" y1="' + pad + '" x2="' + originX + '" y2="' + (height - pad) + '" stroke="#dee2e6" stroke-width="1"/>';
    }
    if (originY > pad && originY < height - pad) {
        svg += '<line x1="' + pad + '" y1="' + originY + '" x2="' + (width - pad) + '" y2="' + originY + '" stroke="#dee2e6" stroke-width="1"/>';
    }
    // рамка
    svg += '<rect x="' + pad + '" y="' + pad + '" width="' + (width - 2 * pad) + '" height="' + (height - 2 * pad) + '" fill="none" stroke="#adb5bd" stroke-width="1"/>';

    // кольори за індексом
    const palette = ['#0d6efd', '#198754', '#dc3545', '#fd7e14', '#6f42c1', '#20c997', '#e83e8c', '#0dcaf0'];
    pts.forEach((p, i) => {
        const x = sx(p.x);
        const y = sy(p.y);
        const color = palette[i % palette.length];
        svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6" fill="' + color + '" stroke="#fff" stroke-width="1.5"/>';
        svg += '<text x="' + (x + 9).toFixed(1) + '" y="' + (y - 7).toFixed(1) + '" font-size="12" fill="#212529">' + escapeHtml(p.word) + '</text>';
    });

    // підписи осей
    svg += '<text x="' + (width / 2) + '" y="' + (height - 10) + '" text-anchor="middle" font-size="12" fill="#495057">PC1</text>';
    svg += '<text x="14" y="' + (height / 2) + '" text-anchor="middle" font-size="12" fill="#495057" transform="rotate(-90,14,' + (height / 2) + ')">PC2</text>';
    svg += '</svg>';
    plotWrap.innerHTML = svg;
}

// ---- Обробники ----

searchBtn.addEventListener('click', () => {
    if (!modelReady) {
        alert('Модель ще завантажується. Зачекайте завершення.');
        return;
    }
    const q = searchInput.value.trim();
    if (!q) {
        return;
    }
    const matches = findMatches(q);
    renderSearchResults(matches);
});

searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        searchBtn.click();
    }
});

clearBtn.addEventListener('click', () => {
    selected.clear();
    renderSelected();
    updateCheckboxDisabled();
    updateVisualizeButton();
    // синхронізуємо чекбокси
    searchResults.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
    });
});

visualizeBtn.addEventListener('click', () => {
    if (selected.size < 2 || selected.size > 20) {
        plotHint.textContent = 'Оберіть від 2 до 20 слів.';
        return;
    }
    visualizeBtn.disabled = true;
    plotHint.textContent = 'Обчислення PCA…';
    plotWrap.innerHTML = '';

    try {
        const words = Array.from(selected);
        const pts = pca2D(words);
        renderPlot(pts);
        const note = 'Побудовано проєкцію ' + pts.length + ' слів на перші дві головні компоненти (PCA).';
        plotHint.textContent = note;
    } catch (error) {
        plotHint.textContent = 'Помилка під час PCA: ' + error.message;
    } finally {
        updateVisualizeButton();
    }
});

renderSelected();
updateVisualizeButton();
showLoading();
// Запускаємо завантаження після відмальовки сторінки, щоб індикатор встиг з'явитися.
setTimeout(() => {
    loadModel();
}, 50);

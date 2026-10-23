/**
 * Завантаження сконвертованого файлу word2vec (JSONL) та вимірювання
 * часу завантаження і обсягу пам'яті.
 *
 * Файл читається потоково: File.stream() -> TextDecoderStream -> розбір
 * рядків по черзі. Це принципово, бо повний JSON цієї моделі займає ~1.7 ГБ,
 * а V8 обмежує довжину рядка 512 МБ — монолітний JSON у браузері не читається.
 *
 * Пам'ять вимірюється через performance.memory (Chrome). Значення округлені,
 * якщо браузер запущено без --enable-precise-memory-info, тому поруч із
 * виміряним показником показується обчислений обсяг структури.
 */

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const statusText = document.getElementById('status');
const modeHint = document.getElementById('modeHint');
const memNote = document.getElementById('memNote');

const resultFields = {
    words: document.getElementById('resWords'),
    dim: document.getElementById('resDim'),
    fileSize: document.getElementById('resFileSize'),
    readTime: document.getElementById('resReadTime'),
    parseTime: document.getElementById('resParseTime'),
    totalTime: document.getElementById('resTotalTime'),
    throughput: document.getElementById('resThroughput'),
    heap: document.getElementById('resHeap'),
    heapDelta: document.getElementById('resHeapDelta'),
    computed: document.getElementById('resComputed'),
    retained: document.getElementById('resRetained')
};

// Скільки байтів займає одне значення у Float32Array.
const BYTES_PER_FLOAT = 4;

let selectedFile = null;

/**
 * Поточний обсяг використаної JS-пам'яті в МБ, або null, якщо браузер
 * не підтримує performance.memory.
 */
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

function resetResults() {
    for (const key of Object.keys(resultFields)) {
        resultFields[key].textContent = '—';
    }
}

function updateModeHint() {
    if (document.getElementById('modeLoad').checked) {
        modeHint.textContent = 'Вектори буде утримуватися в пам\'яті у вигляді ' +
            'Float32Array. Для повного словника це близько 735 МБ.';
    } else {
        modeHint.textContent = 'Вектори розбираються та відкидаються — ' +
            'вимірюється час читання й розбору без накопичення пам\'яті.';
    }
}

/**
 * Розбирає рядки NDJSON. Перший рядок — метадані, решта — записи "слово + вектор".
 */
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

    /**
     * Виділяє масив векторів рівно один раз, за розміром, указаним у метаданих.
     * Подвоєння масиву дає транзиторний пік у ~1.5 ГБ, тому уникаємо його.
     */
    allocate(planned) {
        if (!this.retainVectors) {
            return;
        }
        this.vectors = new Float32Array(planned);
    }

    handleLine(line) {
        // BOM на початку файлу ламає JSON.parse — зрізаємо його.
        if (line.charCodeAt(0) === 0xFEFF) {
            line = line.slice(1);
        }
        // Файл, збережений у Windows, має закінчення рядків CRLF.
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
            // count у метаданих — це число фактично записаних слів, а не
            // розмір словника джерела. Саме за ним ми виділяємо пам'ять один раз.
            this.allocate((record.meta.count || 0) * this.dim);
            return;
        }

        // Запис має вигляд {"w": ..., "v": [...]}. Якщо цих полів немає,
        // перед нами не результат конвертера, а якийсь інший JSON.
        if (!Array.isArray(record.v) || typeof record.w !== 'string') {
            throw new Error('Рядок ' + this.lineNumber +
                ' не містить пари "w"/"v" — це не результат конвертера ' +
                'convert_to_json.py');
        }

        if (!this.retainVectors) {
            this.count += 1;
            return;
        }

        // Файл виявився більшим за метадані — довиділяємо масив.
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

/**
 * Читає файл потоково та вимірює час і пам'ять.
 */
async function measure(file, retainVectors) {
    const reader = new ModelReader(retainVectors);
    const decoder = new TextDecoder();
    const stream = file.stream().getReader();

    const heapBefore = usedHeapMB();
    const totalStart = performance.now();

    let readTime = 0;
    let parseTime = 0;
    let bytesRead = 0;
    let leftover = '';
    let lastUpdate = 0;

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
        // Рядок може бути розірваний між чанками — хвост переносимо в наступний.
        const parts = (leftover + text).split('\n');
        leftover = parts.pop();
        for (const line of parts) {
            if (line) {
                reader.handleLine(line);
            }
        }
        parseTime += performance.now() - parseStart;

        // Прогрес оновлюємо не частіше ніж раз на 200 мс, щоб не гальмувати розбір.
        const now = performance.now();
        if (now - lastUpdate > 200) {
            lastUpdate = now;
            setStatus('Оброблено ' + reader.count.toLocaleString('uk-UA') +
                ' слів… (' + formatBytes(bytesRead) + ')');
        }
    }

    // Декодер.flush() потрібен, якщо файл обірвано на середині багатобайтового
    // символу — інакше ці байти просто загубилися б.
    const tail = decoder.decode();
    if (tail) {
        leftover += tail;
    }

    // Останній рядок може не мати символу нового рядка в кінці файлу.
    if (leftover) {
        const parseStart = performance.now();
        reader.handleLine(leftover);
        parseTime += performance.now() - parseStart;
    }

    const totalTime = performance.now() - totalStart;
    const heapAfter = usedHeapMB();

    return {
        words: reader.count,
        dim: reader.dim,
        meta: reader.meta,
        metaSeen: reader.metaSeen,
        readTime,
        parseTime,
        totalTime,
        bytesRead,
        heapBefore,
        heapAfter,
        retainedBytes: reader.vectors ? reader.vectors.byteLength : 0,
        indexSize: reader.index.size
    };
}

/**
 * Виводить результати вимірювання у статичні елементи сторінки.
 */
function renderResults(result, retainVectors) {
    resultFields.words.textContent = result.words.toLocaleString('uk-UA');
    resultFields.dim.textContent = result.dim || '—';
    resultFields.fileSize.textContent = formatBytes(result.bytesRead);

    resultFields.readTime.textContent = (result.readTime / 1000).toFixed(2) + ' с';
    resultFields.parseTime.textContent = (result.parseTime / 1000).toFixed(2) + ' с';
    resultFields.totalTime.textContent = (result.totalTime / 1000).toFixed(2) + ' с';

    const mbPerSec = (result.bytesRead / (1024 * 1024)) / (result.totalTime / 1000);
    resultFields.throughput.textContent = mbPerSec.toFixed(1) + ' МБ/с';

    if (result.heapBefore === null) {
        resultFields.heap.textContent = 'браузер не підтримує performance.memory';
        resultFields.heapDelta.textContent = '—';
    } else {
        resultFields.heap.textContent = result.heapBefore.toFixed(1) + ' МБ → ' +
            result.heapAfter.toFixed(1) + ' МБ';
        const delta = result.heapAfter - result.heapBefore;
        resultFields.heapDelta.textContent = (delta >= 0 ? '+' : '') + delta.toFixed(1) + ' МБ' +
            (retainVectors ? '' : ' (не прибирається збиральником сміття)');
    }

    // Обчислений обсяг — незалежно від браузера.
    const computed = result.words * result.dim * BYTES_PER_FLOAT;
    resultFields.computed.textContent = formatBytes(computed) +
        ' (' + result.words.toLocaleString('uk-UA') + ' × ' + result.dim + ' × ' +
        BYTES_PER_FLOAT + ' Б)';

    if (retainVectors) {
        resultFields.retained.textContent = formatBytes(result.retainedBytes) +
            ' (Float32Array) + ' + result.indexSize.toLocaleString('uk-UA') +
            ' записів у Map';
    } else {
        resultFields.retained.textContent = 'не утримується (режим «лише виміряти»)';
    }
}

/**
 * Обробляє обраний файл: вимірює та показує результати.
 */
async function handleFile(file) {
    if (!file) {
        return;
    }

    const retainVectors = document.getElementById('modeLoad').checked;

    selectedFile = file;
    fileInfo.textContent = 'Обрано файл: ' + file.name + ' (' + formatBytes(file.size) + ')';
    resetResults();
    setStatus('Читання та розбір…');
    memNote.textContent = '';

    try {
        const result = await measure(file, retainVectors);
        renderResults(result, retainVectors);

        setStatus('Готово: оброблено ' + result.words.toLocaleString('uk-UA') + ' слів за ' +
            (result.totalTime / 1000).toFixed(2) + ' с.');

        if (result.heapBefore !== null) {
            memNote.textContent = 'Примітка: показники пам\'яті у Chrome округлені, ' +
                'якщо браузер запущено без --enable-precise-memory-info. ' +
                'У такому разі орієнтуйтеся на «обчислений обсяг» — ' +
                'він не залежить від браузера.';
        } else {
            memNote.textContent = 'Ваш браузер не підтримує performance.memory, ' +
                'тому вимірювання пам\'яті недоступне. Дивіться «обчислений обсяг».';
        }

        if (!result.metaSeen) {
            memNote.textContent += ' Рядок метаданих не знайдено — файл створено не ' +
                'конвертером або в ньому немає опису розмірності.';
        }

        // Без метаданих немає розмірності — отже й обчисленого обсягу.
        if (!result.dim) {
            resultFields.computed.textContent = 'невідомо ( немає рядка метаданих)';
        }
    } catch (error) {
        setStatus('Помилка: ' + error.message);
        memNote.textContent = 'Перевірте, що файл має формат JSONL, створений конвертером ' +
            'convert_to_json.py.';
    }
}

// Вибір файлу через input.
fileInput.addEventListener('change', (event) => {
    handleFile(event.target.files[0]);
});

// Клік по зоні відкриває діалог вибору файлу.
dropZone.addEventListener('click', () => {
    fileInput.click();
});

dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
    }
});

// Перетягування файлу в зону.
dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('drag-over');
    if (event.dataTransfer.files.length) {
        handleFile(event.dataTransfer.files[0]);
    }
});

// Зміна режиму обробки перезапускає вимірювання для вже обраного файлу.
for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener('change', () => {
        updateModeHint();
        if (selectedFile) {
            handleFile(selectedFile);
        }
    });
}

updateModeHint();

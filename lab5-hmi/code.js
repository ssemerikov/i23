// Словник ймовірностей слів (Map захищає від службових ключів Object.prototype)
let probs = new Map();
// Алфавіт для операцій заміни та вставки (визначається зі словника)
let letters = '';

const statusEl = document.getElementById('status');
const textInput = document.getElementById('textInput');
const correctBtn = document.getElementById('correctBtn');
const resultEl = document.getElementById('result');
const changesEl = document.getElementById('changes');

// Завантаження експортованого словника із файлу JSON
fetch('vocab.json')
    .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    })
    .then((data) => {
        probs = new Map(Object.entries(data));
        // Формуємо алфавіт із літер усіх слів словника
        const chars = new Set([...probs.keys()].join('').replace(/[\d_]/g, ''));
        letters = [...chars].join('');
        statusEl.textContent = `Словник завантажено (${probs.size} слів).`;
        correctBtn.disabled = false;
    })
    .catch((err) => {
        statusEl.textContent = `Не вдалося завантажити vocab.json (${err.message}).`;
    });

// Викликає fn для кожного слова на відстані 1 редагування (видалення, перестановка, заміна, вставка)
function forEachEdit(word, fn) {
    for (let i = 0; i <= word.length; i++) {
        const left = word.slice(0, i);
        const right = word.slice(i);
        if (right) fn(left + right.slice(1));
        if (right.length > 1) fn(left + right[1] + right[0] + right.slice(2));
        for (const ch of letters) {
            if (right) fn(left + ch + right.slice(1));
            fn(left + ch + right);
        }
    }
}

// Повертає слово з найвищою ймовірністю (точний збіг або відстань 1 чи 2 редагування)
function bestCorrection(word) {
    if (probs.has(word)) return word;

    let best = '';
    let bestProb = -1;
    const oneEdits = new Set();

    const check = (cand) => {
        const p = probs.get(cand);
        if (p !== undefined && p > bestProb) {
            bestProb = p;
            best = cand;
        }
    };

    // Пошук кандидатів на відстані 1 редагування
    forEachEdit(word, (cand) => {
        oneEdits.add(cand);
        check(cand);
    });
    if (best) return best;

    // Пошук кандидатів на відстані 2 редагувань
    for (const w1 of oneEdits) {
        forEachEdit(w1, check);
    }
    return best || word;
}

// Виправляє слова у введеному тексті та підсвічує заміни
function correctText() {
    const text = textInput.value;
    resultEl.textContent = '';
    const fixedList = [];
    let lastIndex = 0;

    // Шукаємо окремі слова (латиниця та кирилиця), зберігаючи пунктуацію й пробіли
    for (const match of text.matchAll(/\p{L}+/gu)) {
        const orig = match[0];
        const start = match.index;

        if (start > lastIndex) {
            resultEl.append(text.slice(lastIndex, start));
        }

        const lower = orig.toLowerCase();
        const corr = bestCorrection(lower);

        if (corr !== lower) {
            // Зберігаємо велику першу літеру, якщо в оригіналі слово починалося з неї
            const formatted = orig[0] === orig[0].toUpperCase()
                ? corr[0].toUpperCase() + corr.slice(1)
                : corr;
            const mark = document.createElement('mark');
            mark.textContent = formatted;
            resultEl.append(mark);
            fixedList.push(`${orig} → ${formatted}`);
        } else {
            resultEl.append(orig);
        }
        lastIndex = start + orig.length;
    }

    if (lastIndex < text.length) {
        resultEl.append(text.slice(lastIndex));
    }

    changesEl.textContent = fixedList.length
        ? `Виправлено (${fixedList.length}): ${fixedList.join(', ')}`
        : 'Помилок не знайдено.';
}

correctBtn.addEventListener('click', correctText);

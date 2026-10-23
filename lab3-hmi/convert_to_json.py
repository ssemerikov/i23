#!/usr/bin/env python3
"""
Конвертер моделі word2vec у формат JSONL (NDJSON).

Вихідний файл має простий текстовий формат:
    перший рядок  — розмір словника та розмірність вектора ("595119 300")
    наступні рядки — слово та його вектор, розділені пробілами

    595119 300
    в 0.897821 0.706130 1.761643 ... (300 значень)
    на -2.282477 0.506786 1.782956 ... (300 значень)

Чому JSONL, а не один великий JSON-об'єкт: повний JSON цієї моделі займає
близько 1.7 ГБ, а V8 (JavaScript-двигун браузерів) обмежує довжину рядка
512 МБ. Тому монолітний JSON у браузері просто не прочитається. Натомість
построчковий формат дозволяє читати файл потоково, обробляючи рядок за рядком.

Чому числа копіюються дослівно, а не через float(): значення у джерелі мають
рівно 6 знаків після коми, тому копіювання тексту зберігає їх побайтово
і при цьому у ~10 разів швидше за перетворення через float() та json.dumps.

Використання:
    python3 convert_to_json.py --input ubercorpus.cased.tokenized.word2vec.300d \\
        --output model.jsonl --limit 200000
"""

import argparse
import bz2
import json
import os
import sys
import time

DEFAULT_SOURCE = 'ubercorpus.cased.tokenized.word2vec.300d'
DEFAULT_OUTPUT = 'ubercorpus.cased.tokenized.word2vec.300d.jsonl'


def open_source(path):
    """Відкриває джерело для читання: .bz2 розпаковується на льоту."""
    if path.endswith('.bz2'):
        return bz2.open(path, 'rt', encoding='utf-8')
    return open(path, 'r', encoding='utf-8')


def parse_header(line):
    """Розбирає рядок заголовка у пару (розмір словника, розмірність вектора)."""
    parts = line.split()
    if len(parts) != 2:
        raise ValueError('Некоректний заголовок: %r' % line)
    try:
        return int(parts[0]), int(parts[1])
    except ValueError:
        raise ValueError('Заголовок має містити два ціли числа: %r' % line)


def convert(source, output, limit=None, dim=None, progress_every=50_000):
    """
    Конвертує модель word2vec у JSONL.

    source        — шлях до вихідного файлу (.txt або .bz2)
    output        — шлях до результату
    limit         — скільки слів записати (None — усе словникове)
    dim           — розмірність, яку перевірити (None — не перевіряти)
    progress_every — як часто друкувати прогрес (0 — не друкувати)
    """
    started = time.time()

    with open_source(source) as fin:
        header = fin.readline()
        vocab_size, source_dim = parse_header(header)

        if dim is not None and dim != source_dim:
            raise ValueError(
                'Задана розмірність %d не збігається з розмірністю у джерелі (%d)'
                % (dim, source_dim)
            )

        # Число слів знаємо наперед: без обмеження це весь словник,
        # з обмеженням — мінімум із розміром словника.
        count = min(limit, vocab_size) if limit is not None else vocab_size

        meta = {
            'vocab_size': vocab_size,
            'dim': source_dim,
            'count': count,
            'format': 'jsonl',
            'source': os.path.basename(source),
        }

        written = 0
        with open(output, 'w', encoding='utf-8', newline='\n') as fout:
            # Метадані йдуть першим рядком — саме з них браузер дізнається,
            # скільки пам'яті виділити під вектори.
            fout.write(json.dumps({'meta': meta}, ensure_ascii=False) + '\n')

            for line in fin:
                if written >= count:
                    break

                parts = line.split()
                if not parts:
                    continue

                word = json.dumps(parts[0], ensure_ascii=False)
                # Значення копіюємо як є — без float(), щоб не втратити точність
                # і не витрачати час на перетворення.
                fout.write('{"w":%s,"v":[%s]}\n' % (word, ','.join(parts[1:])))

                written += 1
                if progress_every and written % progress_every == 0:
                    elapsed = time.time() - started
                    print('%d/%d слів, %.1f с' % (written, count, elapsed),
                          file=sys.stderr, flush=True)

    elapsed = time.time() - started
    size_mb = os.path.getsize(output) / (1024 * 1024)
    print('Записано %d слів за %.1f с (%.1f МБ) -> %s'
          % (written, elapsed, size_mb, output), file=sys.stderr)
    return written


def main():
    parser = argparse.ArgumentParser(
        description='Конвертує модель word2vec у формат JSONL (NDJSON).',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--input', default=DEFAULT_SOURCE,
                        help='вихідний файл моделі (.bz2 підтримується) '
                             '[за замовчуванням: %s]' % DEFAULT_SOURCE)
    parser.add_argument('--output', default=DEFAULT_OUTPUT,
                        help='файл результату [за замовчуванням: %s]' % DEFAULT_OUTPUT)
    parser.add_argument('--limit', type=int, default=None,
                        help='скільки слів записати (за замовчуванням — усе словникове)')
    parser.add_argument('--dim', type=int, default=None,
                        help='перевірити розмірність вектора у джерелі')
    parser.add_argument('--progress-every', type=int, default=50_000,
                        help='як часто друкувати прогрес, у словах (0 — не друкувати)')
    args = parser.parse_args()

    try:
        convert(args.input, args.output, args.limit, args.dim, args.progress_every)
    except (OSError, ValueError) as error:
        print('Помилка: %s' % error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())

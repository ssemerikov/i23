/**
 * У code.js додав extract_features і чисельно стійку sigmoid. logisticRegressionPredict тепер формує вектор ознак [1, позитивна_частотність, негативна_частотність], обчислює скалярний добуток із вагами моделі та повертає ймовірність. Також виправив поріг класифікації на 0.5.

Перевірив витягування ознак, sigmoid на звичайних і граничних значеннях та прогноз із тестовими вагами; перевірка синтаксису й пробілів пройшла.

Зауваження: наявна processTweet досі лише переводить текст у нижній регістр і розбиває за пробілами. Вона не повторює передобробку з Python-коментарів — зокрема, видалення стоп-слів і Porter stemming, — тому ознаки для частини слів можуть не збігатися з тренувальними.

Робоче дерево вже містить змінений index.html і невідстежувану Git папку lab1-hmi/; їх не змінював і не очищав.
 * 
 */

        let theta;
        let freqs;

        // Завантажити навчену модель із файлу JSON 
        fetch('logistic_model.json')
            .then(response => response.json())
            .then(data => {
                theta = data.theta;
                freqs = data.freqs;
            });

        // Опрацювання повідомлення
        function processTweet(tweet) {
            // Тут явно варто її покращити
            return tweet.toLowerCase().split(' ');
        }

        function extract_features(tweet, freqs) {
            const words = processTweet(tweet);
            const features = [1, 0, 0];

            for (const word of words) {
                features[1] += freqs[`${word},1.0`] ?? 0;
                features[2] += freqs[`${word},0.0`] ?? 0;
            }

            return features;
        }

        function sigmoid(z) {
            if (z >= 0) {
                return 1 / (1 + Math.exp(-z));
            }

            const expZ = Math.exp(z);
            return expZ / (1 + expZ);
        }

        // Класифікатор логістичної регресії

        function logisticRegressionPredict(tweet, theta, freqs) {
            const features = extract_features(tweet, freqs);
            const z = features.reduce(
                (sum, feature, index) => sum + feature * theta[index][0],
                0
            );

            return sigmoid(z);
        }

        function classifyTweet() {
            const tweet = document.getElementById('tweetInput').value;
            const prediction = logisticRegressionPredict(tweet, theta, freqs);
            const sentiment = prediction > 0.5 ? 'позитивна' : 'негативна';
            document.getElementById('result').textContent = `Визначена тональність: ${sentiment}`;
        }

/*
Лабораторна робота № 1

Тема: Застосування логістичної регресії для аналізу тональності текстів

Мета роботи: Навчитися використовувати логістичну регресію для аналізу тональності текстів, розробити модель класифікації тональності, оцінити її ефективність.

Завдання:
1. Обрати корпус текстів для аналізу тональності відповідно до варіанту.  
2. Виконати попередню обробку текстів - токенізацію, видалення стоп-слів, стемінг.
3. Побудувати словник частотності слів для позитивного і негативного класів. 
4. Реалізувати логістичну регресію з градієнтним спуском для класифікації тональності.
5. Навчити модель на тренувальній вибірці та оцінити її точність на тестовій.
6. Проаналізувати результати, дослідити вплив гіперпараметрів на якість моделі.
7. Завантажити код та результати на GitHub, надайте посилання на них у Moodle.

Теоретичні відомості:

Аналіз тональності тексту (Sentiment Analysis) - це галузь обробки природної мови (Natural Language Processing, NLP), яка вивчає думки, почуття, оцінки, відносини та емоції людей стосовно об'єктів, таких як продукти, сервіси, організації, персони, проблеми, події, теми та їх атрибути. 

Основне завдання аналізу тональності - класифікувати полярність тексту на рівні документу, речення чи об'єкту/ознаки, тобто визначити, чи виражена думка в документі, реченні або об'єкті/ознаці є позитивною, негативною чи нейтральною.

Логістична регресія - це алгоритм машинного навчання, який використовується для вирішення задач бінарної класифікації. Цей метод базується на функції логістичної сигмоїди:



де z - це лінійна комбінація ознак:



Вихід функції сигмоїди інтерпретується як ймовірність приналежності об'єкту до класу 1. Якщо ймовірність більше 0.5, передбачається, що об'єкт належить до класу 1, інакше - до класу 0.

Для тренування логістичної регресії використовується метод максимальної правдоподібності. Функцією втрат є логарифмічна функція втрат (log loss):



де m - кількість прикладів у тренувальній вибірці. Її векторний запис:



Мінімізація цієї функції відбувається за допомогою методу градієнтного спуску. На кожній ітерації ваги оновлюються за формулами:




де α - швидкість навчання. У векторній формі формула матиме вигляд:



Рекомендації:

1. Завантажте та встановіть необхідні бібліотеки.

Наприклад, для набору даних twitter_samples зі складу nltk:

import nltk
import numpy as np
import pandas as pd
from nltk.corpus import twitter_samples 
from utils import process_tweet, build_freqs

2. Завантажте набір даних відповідно до варіанту. Розділіть дані на тренувальну та тестову вибірки.

Приклад для twitter_samples:

all_positive_tweets = twitter_samples.strings('positive_tweets.json')
all_negative_tweets = twitter_samples.strings('negative_tweets.json')  

test_pos = all_positive_tweets[4000:]
train_pos = all_positive_tweets[:4000]
test_neg = all_negative_tweets[4000:]
train_neg = all_negative_tweets[:4000]

train_x = train_pos + train_neg 
test_x = test_pos + test_neg

train_y = np.append(np.ones(len(train_pos)), np.zeros(len(train_neg)))
test_y = np.append(np.ones(len(test_pos)), np.zeros(len(test_neg)))

Приклад для довільного набору даних:

import numpy as np

# Читаємо файл
with open('sentiment labelled sentences/imdb_labelled.txt', 'r', encoding='utf-8') as file:
    lines = file.readlines()

# Ініціалізація списків
sentences = []
scores = []

# Обробка кожного рядка
for line in lines:
    # Розділяємо рядок на текст і оцінку за табуляцією
    parts = line.strip().split('\t')
    if len(parts) == 2:  # Перевірка, чи рядок має два елементи
        sentence, score = parts
        sentences.append(sentence)
        scores.append(float(score))  # Перетворюємо оцінку в число

# Результат
#print("Sentences:", sentences[:5])  # Виводимо перші 5 для перевірки
#print("Scores:", scores[:5])

# 80% - training set, 20% - test (validation) set

train_x = sentences[:round(len(sentences)*0.8)]
test_x = sentences[round(len(sentences)*0.8):]


train_size = round(len(scores)*0.8)
test_size = len(scores) - train_size

train_y = np.asarray(scores[:train_size]).reshape((train_size, 1))
test_y = np.asarray(scores[train_size:]).reshape((test_size, 1))


3. Виконайте попередню обробку текстів та побудуйте словник частотності слів.

Приклад з бібліотеки nltk:

import re
import string
import numpy as np

from nltk.corpus import stopwords
from nltk.stem import PorterStemmer
from nltk.tokenize import TweetTokenizer


def process_tweet(tweet):
    """Process tweet function.
    Input:
        tweet: a string containing a tweet
    Output:
        tweets_clean: a list of words containing the processed tweet

    """
    stemmer = PorterStemmer()
    stopwords_english = stopwords.words('english')
    # remove stock market tickers like $GE
    tweet = re.sub(r'\$\w*', '', tweet)
    # remove old style retweet text "RT"
    tweet = re.sub(r'^RT[\s]+', '', tweet)
    # remove hyperlinks    
    tweet = re.sub(r'https?://[^\s\n\r]+', '', tweet)
    # remove hashtags
    # only removing the hash # sign from the word
    tweet = re.sub(r'#', '', tweet)
    # tokenize tweets
    tokenizer = TweetTokenizer(preserve_case=False, strip_handles=True,
                               reduce_len=True)
    tweet_tokens = tokenizer.tokenize(tweet)

    tweets_clean = []
    for word in tweet_tokens:
        if (word not in stopwords_english and  # remove stopwords
                word not in string.punctuation):  # remove punctuation
            # tweets_clean.append(word)
            stem_word = stemmer.stem(word)  # stemming word
            tweets_clean.append(stem_word)

    return tweets_clean


def build_freqs(tweets, ys):
    """Build frequencies.
    Input:
        tweets: a list of tweets
        ys: an m x 1 array with the sentiment label of each tweet
            (either 0 or 1)
    Output:
        freqs: a dictionary mapping each (word, sentiment) pair to its
        frequency
    """
    # Convert np array to list since zip needs an iterable.
    # The squeeze is necessary or the list ends up with one element.
    # Also note that this is just a NOP if ys is already a list.
    yslist = np.squeeze(ys).tolist()

    # Start with an empty dictionary and populate it by looping over all tweets
    # and over all processed words in each tweet.
    freqs = {}
    for y, tweet in zip(yslist, tweets):
        for word in process_tweet(tweet):
            pair = (word, y)
            if pair in freqs:
                freqs[pair] += 1
            else:
                freqs[pair] = 1

    return freqs

Функція process_tweet виконує наступні операції:
- Токенізація - розбиття тексту на окремі слова або токени 
- Видалення стоп-слів - виключення службових частин мови (сполучники, прийменники тощо)
- Стемінг - приведення слів до їх основи шляхом відкидання закінчень

Словник freqs містить частотності слів для позитивного та негативного класів. Ключі словника - це кортежі (слово, мітка класу), а значення - кількість разів, коли це слово зустрічалося з цією міткою в тренувальному корпусі.

freqs = build_freqs(train_x, train_y)

# Приклад обробленого твіту
print(process_tweet(train_pos[0])) 


4. Реалізуйте сигмоїдну функцію та функцію логістичної регресії з градієнтним спуском

Приклад з розбору лекційного матеріалу:

def sigmoid(z): 
    h = 1 / (1 + np.exp(-z))
    return h

def gradientDescent(x, y, theta, alpha, num_iters):
    m = x.shape[0]
    
    # Переконаємося, що y має правильну форму (m,1)
    if y.ndim == 1:
        y = y.reshape(-1, 1)
    
    for i in range(0, num_iters):
        # Обчислюємо гіпотезу
        z = np.dot(x, theta)
        h = sigmoid(z)
        
        # Обчислюємо функцію втрат - скалярне значення
        # Використовуємо поелементне множення і сумування
        epsilon = 1e-15  # Маленька константа для уникнення log(0)
        h_safe = np.clip(h, epsilon, 1 - epsilon)
        J = (-1/m) * np.sum(y * np.log(h_safe) + (1-y) * np.log(1 - h_safe))
        
        # Оновлюємо параметри
        theta = theta - (alpha/m) * np.dot(x.T, (h-y))
        
        # Виводимо значення помилки (опціонально)
        if i % 10 == 0:
            print(i, J)
    import json

# Перетворюємо кортежі (word, label) у стрічки "word,label"
freqs_json = {f"{word},{label}": count for (word, label), count in freqs.items()}

data = {
    'theta': theta.tolist(),
    'freqs': freqs_json
}

with open('logistic_model.json', 'w', encoding='utf-8') as outfile:
    json.dump(data, outfile, ensure_ascii=False, indent=4)
    return J, theta

5. Реалізуйте функцію вилучення ознак на основі частотностей слів та функцію передбачення

Приклад з розбору лекційного матеріалу:

def extract_features(tweet, freqs):
    word_l = process_tweet(tweet)
    x = np.zeros((1, 3)) 
    x[0,0] = 1  
    for word in word_l:
        if (word, 1.0) in freqs:
            x[0,1] += freqs[(word, 1.0)]
        if (word, 0.0) in freqs:
            x[0,2] += freqs[(word, 0.0)]
    return x

Функція extract_features формує вектор ознак для одного твіту. Перша ознака - це bias (завжди дорівнює 1), друга - кількість позитивних слів у твіті (згідно словника freqs), третя - кількість негативних слів.

def predict_tweet(tweet, freqs, theta):
    x = extract_features(tweet, freqs)
    y_pred = sigmoid(np.dot(x, theta))
    return y_pred

Функція predict_tweet робить передбачення тональності для одного твіту за допомогою натренованої моделі. Вона повертає ймовірність приналежності до позитивного класу.

6. Навчіть модель логістичної регресії на тренувальних даних, виведіть результати

X = np.zeros((len(train_x), 3))
for i in range(len(train_x)):
    X[i, :]= extract_features(train_x[i], freqs)

Y = train_y
J, theta = gradientDescent(X, Y, np.zeros((3, 1)), 1e-9, 1500)
print(f"Помилка після навчання: {J:.8f}.")
print(f"Вектор вагових коефіцієнтів: {[round(t, 8) for t in np.squeeze(theta)]}")  


7. Протестуйте модель на тестовій вибірці, розрахуйте точність

def test_logistic_regression(test_x, test_y, freqs, theta):
    y_hat = []
    for tweet in test_x:
        y_pred = predict_tweet(tweet, freqs, theta)
        if y_pred > 0.5:
            y_hat.append(1)
        else:
            y_hat.append(0)
    accuracy = (np.sum(np.array(y_hat)==np.squeeze(test_y)))/len(test_x)  
    return accuracy

tmp_accuracy = test_logistic_regression(test_x, test_y, freqs, theta)
print(f"Точність логістичної регресії: {tmp_accuracy:.4f}")


8. Перевірте модель на власних прикладах

my_tweet = 'Цей фільм чудовий! Я отримав неймовірне задоволення від перегляду.'
print(process_tweet(my_tweet))
y_hat = predict_tweet(my_tweet, freqs, theta)
print(y_hat)
if y_hat > 0.5:
    print('Позитивна тональність')
else:
    print('Негативна тональність')

9. Проаналізуйте результати. Дослідіть вплив розміру вибірки, коефіцієнту швидкості навчання, кількості ітерацій градієнтного спуску на точність моделі. 

10. Завантажте код лабораторної роботи та результати виконання на GitHub. Додайте пояснення до п. 9.


import json

# Перетворюємо кортежі (word, label) у стрічки "word,label"
freqs_json = {f"{word},{label}": count for (word, label), count in freqs.items()}

data = {
    'theta': theta.tolist(),
    'freqs': freqs_json
}

with open('logistic_model.json', 'w', encoding='utf-8') as outfile:
    json.dump(data, outfile, ensure_ascii=False, indent=4)

*/
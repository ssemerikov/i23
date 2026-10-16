        let logprior;
        let loglikelihood;

        // Завантажити навчену модель із файлу JSON 
        fetch('naive_bayes_model.json')
            .then(response => response.json())
            .then(data => {
                logprior = data.logprior;
                loglikelihood = data.loglikelihood;
            });

        // Опрацювання повідомлення
        function processTweet(tweet) {
            // Тут явно варто її покращити
            return tweet.toLowerCase().split(' ');
        }

        // Наївний баєсів класифікатор

        function naiveBayesPredict(tweet, logprior, loglikelihood) {
            const words = processTweet(tweet);
            let p = logprior;

            for (const word of words) {
                if (word in loglikelihood) {
                    p += loglikelihood[word];
                }
            }

            return p;
        }

        function classifyTweet() {
            const tweet = document.getElementById('tweetInput').value;
            const prediction = naiveBayesPredict(tweet, logprior, loglikelihood);
            const sentiment = prediction > 0 ? 'позитивна' : 'негативна';
            document.getElementById('result').textContent = `Визначена тональність: ${sentiment}`;
        }

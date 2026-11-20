export function convertCurrency() {
    let amount = document.getElementById("inputField").value;
    let currency = document.getElementById("currencySelector").value;
    let result=0;

    const url = "https://api.frankfurter.dev/v2/rates?quotes=uah,"+currency+"&base=uah";

    let country = "ukraine";
    if (currency == "usd")
        country = "united-states";
    else if (currency == "eur")
        country = "european-union";
    else if (currency == "gbp")
        country = "united-kingdom";
    else if (currency == "krw")
        country = "south-corea";

    //console.log("URL: " + url);
    fetch(url)
        .then(response => response.json())
        .then(data => {
            /*
            const rate = data.rates[currency.toUpperCase()];
            result = amount * rate;
            displayResult(result, currency);
            */
           //console.log("Exchange rates data:", data);
           let rate = 0;
           for (let element of data) {
                //console.log("Element:", element);
                if(element["quote"] === currency.toUpperCase())
                    rate = element["rate"];
            }
           result = amount * rate;
           document.getElementById("result").textContent = `Результат: ${result.toFixed(2)} ${currency.toUpperCase()}`;                                                         

           const API_key = "rc_live_7d319ef06ae0405686b117d5476c0b17";
           // curl "https://api.restcountries.com/countries/v5?q=canada&pretty=1" -H "Authorization: Bearer rc_live_7d319ef06ae0405686b117d5476c0b17"
           fetch('https://api.restcountries.com/countries/v5?q=' + country,
                { headers: { 'Authorization': 'Bearer ' + API_key } })
                .then(function (response) { return response.json(); })
                .then(function (data) { console.log(data); });
            })
            .catch(error => {
                console.error("Error fetching exchange rates:", error);
                document.getElementById("result").textContent = error + ' ' + url;
            });
}

document.getElementById("convertButton").addEventListener("click", convertCurrency);
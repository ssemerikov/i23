    //alert("Привіт! Це тестовий файл для перевірки виконання JavaScript.");
    setTimeout(function () {
        let p = document.getElementById("browser-version");
        if (p) {
            p.textContent = "Версія веб-браузера: " + navigator.userAgent;
        }
    }, 2000);

    setInterval(function () {
        const col = document.getElementById("browser-version").style.color;
        //console.log("col", col);

        if(col == "red") {
            document.getElementById("browser-version").style.color = "blue";
        } else {        
            document.getElementById("browser-version").style.color = "red";
        }
    }, 5000);

    const ani = document.getElementById("browser-version").style;
    ani.position = "absolute";
    let pos = 200;

    setInterval(function () {
        ani.top = pos+"px";
        pos += 1;
        if(pos > 800) {
            pos = 200;
        }
    }, 10);


    const printLines = function (count) {
        let text = "";
        for (let i = 0; i < count; i++) {
            text += "Рядок " + (i + 1) + "<br>";
        }
        document.getElementById("our_text").innerHTML = text;
    }

    const handleFormSubmit = (event) => {
        //console.log("event", event);
        // Скасовуємо відправку формы (щоб сторінка не перезавантажувалася)
        event.preventDefault(); 
        
        // Зчитуємо значення з поля введення
        let countInput = document.getElementById("line-count");
        let count = countInput.value;

        printLines(count);
    }

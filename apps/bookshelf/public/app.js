const API_URL = 'http://localhost:3001/api/books';

document.addEventListener('DOMContentLoaded', loadBooks);

async function loadBooks() {
    try {
        const response = await fetch(API_URL);
        const books = await response.json();
        renderBooks(books);
    } catch (error) {
        showStatus('Помилка завантаження книг: ' + error.message, 'error');
    }
}

async function addBook(event) {
    const titleInput = document.getElementById('title');
    const authorInput = document.getElementById('author');

    const title = titleInput.value.trim();
    const author = authorInput.value.trim();

    if (!title || !author) {
        showStatus('Заповність всі поля.', 'error');
        return;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, author })
        });
        
        if (response.ok) {
            await loadBooks();
            showStatus('Книга успішно додана.', 'success');
            titleInput.value = '';
            authorInput.value = '';
        }
    }
    catch (error) {
            showStatus('Помилка додавання книги: ' + error.message, 'error');
    }
}

async function deleteBook(id) {
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadBooks();
            showStatus('Книга успішно видалена.', 'success');
        }
    }
    catch (error) {
        showStatus('Помилка видалення книги: ' + error.message, 'error');
    }
}

function renderBooks(books) {
    const booksList = document.getElementById('books-list');
    
    if(books.length === 0) {
        booksList.innerHTML = '<p>Немає доступних книг.</p>';
        return;
    }

    booksList.innerHTML = '';
    books.forEach(book => {
        const bookItem = document.createElement('div');
        bookItem.className = 'book-item';
        bookItem.innerHTML = `
            <strong>${book.title}</strong> by ${book.author}
            <button onclick="deleteBook(${book.id})">Видалити</button>
        `;
        booksList.appendChild(bookItem);
    });
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`; // 'success' or 'error'
    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'status';
    }, 5000);
}

//console.log('Hello, World!');

const http = require('node:http');

//const hostname = '127.0.0.1';
const port = 3000;

let books = [
    { id: 1, title: 'Saga of Seven Suns', author: 'Kevin J. Anderson' },
    { id: 2, title: 'Saga of Honor', author: 'David Weber' },
    { id: 3, title: 'The Long Way to a Small, Angry Planet', author: 'Becky Chambers' }
];

const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow requests from any origin
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Allow specific HTTP methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Allow specific headers
    let pathname;
    try {
        if (typeof req.url !== 'string') {
            throw new TypeError('Request URL is missing');
        }
        pathname = req.url === '*' ? '*' : new URL(req.url, 'http://localhost').pathname;
    } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid request URL' }));
        return;
    }
    const method = req.method;

    console.log(`Data: ${method} ${pathname}`);

    if(method === 'OPTIONS') {
        //res.writeHead(204);
        res.statusCode = 204;
        res.end();
        return;
    }

    if (pathname === '/api/books' && method === 'GET') {
        res.end(JSON.stringify(books));
        return;
    }
    if (pathname === '/api/books' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const newBook = JSON.parse(body);
                newBook.id = books.length + 1;
                books.push(newBook);
                res.statusCode = 201;
                res.end(JSON.stringify(newBook));
            } catch (error) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }
    if (pathname.startsWith('/api/books/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/')[3]);
        const index = books.findIndex(book => book.id === id);
        if (index !== -1) {
            const deletedBook = books.splice(index, 1)[0];
            res.end(JSON.stringify(deletedBook));
        } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Book not found' }));
        }
        return;
    }
    if(pathname === "/api/status" && method === "GET") {
        res.end(JSON.stringify({ status: 'OK', timestamp: new Date().toISOString() }));
        return;
    }                
    else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});

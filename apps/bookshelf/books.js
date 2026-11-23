//console.log('Hello, World!');

const http = require('http');
const fs = require('fs');
const path = require('path');
const URL = require('url');

//const hostname = '127.0.0.1';
const port = Number(process.env.PORT) || 3000;

let books = [
    { id: 1, title: 'Saga of Seven Suns', author: 'Kevin J. Anderson' },
    { id: 2, title: 'Saga of Honor', author: 'David Weber' },
    { id: 3, title: 'The Long Way to a Small, Angry Planet', author: 'Becky Chambers' }
];

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
    const parsedUrl = URL.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    //res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*'); // Allow requests from any origin
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); // Allow specific HTTP methods
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); // Allow specific headers
    
    console.log(`Data: ${method} ${pathname}`);

    if(method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    // API routes
    if (pathname === '/api/books' && method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(books));
        return;
    }
    if (pathname === '/api/books' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            //try {
                const newBook = JSON.parse(body);
                newBook.id = books.length + 1;
                books.push(newBook);
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 201;
                res.end(JSON.stringify(newBook));
            //} catch (error) {
            //    res.statusCode = 400;
            //    res.end(JSON.stringify({ error: 'Invalid JSON' }));
            //}
        });
        return;
    }
    if (pathname.startsWith('/api/books/') && method === 'DELETE') {
        const id = parseInt(pathname.split('/')[3]);
        const index = books.findIndex(book => book.id === id);
        if (index !== -1) {
            const deletedBook = books.splice(index, 1)[0];
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(deletedBook));
        } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Book not found' }));
        }
        return;
    }
    if(pathname === "/api/status" && method === "GET") {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'OK', timestamp: new Date().toISOString() }));
        return;
    }
    
    // Serve static files
    const relativePath = pathname === '/'
        ? 'index.html'
        : pathname.replace(/^\/public\//, '').replace(/^\/+/, '');
    const publicDir = path.join(__dirname, 'public');
    const filePath = path.resolve(publicDir, relativePath);

    if (filePath !== publicDir && !filePath.startsWith(publicDir + path.sep)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/html');
        res.end('<h1>403 Forbidden</h1>');
        return;
    }

    const extname = path.extname(filePath);
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/html');
                res.end('<h1>404 Not Found</h1>');
            } else {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/html');
                res.end('<h1>500 Internal Server Error</h1>');
            }
        } else {
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.end(data);
        }
    });
    /*
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Not found' }));
    */
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Порт ${port} зайнятий. Запустіть сервер з іншим портом: PORT=3001 npm start`);
        return;
    }
    throw error;
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});

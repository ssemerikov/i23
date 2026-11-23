const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3001;
const userroot = path.resolve(__dirname, 'userroot');
const windows1252Bytes = new Map([
    ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85],
    ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a],
    ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92],
    ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
    ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c],
    ['ž', 0x9e], ['Ÿ', 0x9f]
]);

function recoverMojibake(value) {
    const bytes = [];

    for (const character of value) {
        const code = character.codePointAt(0);
        const byte = code <= 0xff ? code : windows1252Bytes.get(character);
        if (byte === undefined)
            return null;
        bytes.push(byte);
    }

    const buffer = Buffer.from(bytes);
    const recovered = buffer.toString('utf8');
    return Buffer.from(recovered, 'utf8').equals(buffer) ? recovered : null;
}

function resolveUserPath(requestPath) {
    const resolved = path.resolve(userroot, `.${requestPath}`);
    const relative = path.relative(userroot, resolved);

    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        return null;
    return resolved;
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function encodePath(value) {
    return value.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
    '.webm': 'video/webm',
    '.ogg': 'application/ogg',
    '.epub': 'application/epub+zip',
    '.ts': 'video/mp2t',
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.7z': 'application/x-7z-compressed',
    '.rar': 'application/vnd.rar',
    '.iso': 'application/x-iso9660-image',
    '.dmg': 'application/x-apple-diskimage'
};
const videoExtensions = new Set([
    '.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm',
    '.ts', '.m3u8', '.m4v', '.3gp'
]);
const fileTypeExtensions = {
    image: new Set(['.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']),
    audio: new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav']),
    document: new Set(['.doc', '.docx', '.epub', '.odt', '.pdf', '.ppt', '.pptx', '.rtf', '.txt', '.xls', '.xlsx']),
    archive: new Set(['.7z', '.bz2', '.dmg', '.gz', '.iso', '.rar', '.tar', '.zip']),
    code: new Set(['.c', '.css', '.go', '.html', '.htm', '.java', '.js', '.json', '.jsx', '.md', '.php', '.py', '.rb', '.sh', '.sql', '.ts', '.tsx', '.xml', '.yaml', '.yml'])
};
const directoryStyles = `
    <style>
        :root { color-scheme: light; font-family: system-ui, sans-serif; color: #172033; background: #f3f6fb; }
        body { max-width: 900px; margin: 0 auto; padding: 2rem 1.25rem; }
        h1 { overflow-wrap: anywhere; font-size: 1.5rem; }
        ul { display: grid; gap: .55rem; margin: 1.5rem 0; padding: 0; list-style: none; }
        .entry { display: flex; align-items: center; gap: .7rem; min-width: 0; padding: .8rem 1rem; border: 1px solid #dce3ee; border-left: 4px solid #8290a5; border-radius: .65rem; background: #fff; }
        .entry::before { flex: 0 0 1.5rem; font-size: 1.2rem; text-align: center; }
        .entry a { min-width: 0; overflow-wrap: anywhere; color: #26344c; text-decoration: none; }
        .entry a:hover { text-decoration: underline; }
        .entry::after { margin-left: auto; padding: .2rem .55rem; border-radius: 999px; background: #eef1f6; color: #526078; content: "Файл"; font-size: .75rem; white-space: nowrap; }
        .entry--directory { border-left-color: #d69a16; background: #fffaf0; }
        .entry--directory::before { content: "📁"; }
        .entry--directory::after { background: #fff0c7; color: #795300; content: "Каталог"; }
        .entry--image { border-left-color: #8b5cf6; }
        .entry--image::before { content: "🖼️"; }
        .entry--image::after { content: "Зображення"; }
        .entry--video { border-left-color: #e5484d; }
        .entry--video::before { content: "🎬"; }
        .entry--video::after { background: #ffe8e8; color: #a32126; content: "Відео"; }
        .entry--audio { border-left-color: #0e9f8a; }
        .entry--audio::before { content: "🎵"; }
        .entry--audio::after { content: "Аудіо"; }
        .entry--document { border-left-color: #3981d3; }
        .entry--document::before { content: "📄"; }
        .entry--document::after { content: "Документ"; }
        .entry--archive { border-left-color: #8a6d3b; }
        .entry--archive::before { content: "🗜️"; }
        .entry--archive::after { content: "Архів"; }
        .entry--code { border-left-color: #74839b; }
        .entry--code::before { content: "⌨️"; }
        .entry--code::after { content: "Код"; }
        .entry--up::before { content: "↩️"; }
        .entry--up::after { content: "Назад"; }
        .player { display: grid; gap: 1rem; }
        .player video { width: 100%; max-height: 75vh; background: #111; }
        .player a { color: #3157d5; }
    </style>`;

function getFileType(extension) {
    if (videoExtensions.has(extension))
        return 'video';
    for (const [type, extensions] of Object.entries(fileTypeExtensions)) {
        if (extensions.has(extension))
            return type;
    }
    return 'file';
}

function serveVideo(filePath, stats, req, res, contentType) {
    const range = req.headers.range;
    let start = 0;
    let end = stats.size - 1;

    if (!range && stats.size === 0) {
        res.statusCode = 200;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', 0);
        res.end();
        return;
    }

    if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stats.size}`);
            res.end();
            return;
        }

        if (!match[1]) {
            const suffixLength = Number(match[2]);
            if (suffixLength === 0 || stats.size === 0) {
                res.statusCode = 416;
                res.setHeader('Content-Range', `bytes */${stats.size}`);
                res.end();
                return;
            }
            start = Math.max(stats.size - suffixLength, 0);
        } else {
            start = Number(match[1]);
            if (match[2])
                end = Math.min(Number(match[2]), end);
        }

        if (start >= stats.size || start > end) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${stats.size}`);
            res.end();
            return;
        }
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
    } else {
        res.statusCode = 200;
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', end - start + 1);
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', error => {
        console.error(`Error streaming file ${filePath}:`, error);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.end('Error reading file');
        } else {
            res.destroy(error);
        }
    });
    stream.pipe(res);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/favicon.ico') {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET');
        res.end('Method not allowed');
        return;
    }

    let requestPath;
    try {
        requestPath = decodeURIComponent(url.pathname);
    } catch {
        res.statusCode = 400;
        res.end('Invalid URL path');
        return;
    }

    let filePath = resolveUserPath(requestPath);
    if (!filePath) {
        res.statusCode = 400;
        res.end('Invalid path');
        return;
    }

    let stats;
    try {
        stats = fs.statSync(filePath);
    } catch (error) {
        const segments = requestPath.split('/');
        const lastSegment = segments.pop();
        const recoveredSegment = recoverMojibake(lastSegment);

        if (recoveredSegment !== null && recoveredSegment !== lastSegment) {
            segments.push(recoveredSegment);
            filePath = resolveUserPath(segments.join('/'));
            if (!filePath) {
                res.statusCode = 400;
                res.end('Invalid path');
                return;
            }
            try {
                stats = fs.statSync(filePath);
            } catch (recoveredError) {
                res.statusCode = recoveredError.code === 'ENOENT' || recoveredError.code === 'ENOTDIR' ? 404 : 500;
                res.end(res.statusCode === 404 ? 'Path not found' : 'Error accessing path');
                return;
            }
        } else {
            res.statusCode = error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500;
            res.end(res.statusCode === 404 ? 'Path not found' : 'Error accessing path');
            return;
        }
    }

    if (stats.isDirectory()) {
        fs.readdir(filePath, { withFileTypes: true }, (error, files) => {
            if (error) {
                res.statusCode = 500;
                res.end('Error reading directory');
                return;
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');

            const directoryPath = requestPath.endsWith('/') ? requestPath : `${requestPath}/`;
            let document = `<!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <title>Вміст каталогу</title>
                    ${directoryStyles}
                </head>
                <body>
                    <h1>Вміст каталогу: ${escapeHtml(requestPath)}</h1>
                    <ul>`;

            if (requestPath !== '/')
                document += '\n<li class="entry entry--up"><a href="..">..</a></li>\n';

            document += files.map(entry => {
                const file = entry.name;
                const extension = path.extname(file).toLowerCase();
                const isDirectory = entry.isDirectory();
                const fileType = isDirectory ? 'directory' : getFileType(extension);
                const href = encodePath(`${directoryPath}${file}`);
                const target = !isDirectory && videoExtensions.has(extension) ? `${href}?player=1` : href;
                return `<li class="entry entry--${fileType}"><a href="${escapeHtml(target)}">${escapeHtml(file)}</a></li>`;
            }).join('');
            document += `
                    </ul>
                </body>
                </html>`;
            res.end(document);
        });
        return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType = contentTypes[extension] || 'text/plain; charset=utf-8';
    if (videoExtensions.has(extension)) {
        if (url.searchParams.get('raw') === '1') {
            serveVideo(filePath, stats, req, res, contentType);
            return;
        }

        const videoUrl = `${escapeHtml(encodePath(requestPath))}?raw=1`;
        const parentPath = path.dirname(requestPath);
        const parentUrl = parentPath === '/' ? '/' : `${encodePath(parentPath)}/`;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!DOCTYPE html>
            <html lang="uk">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>${escapeHtml(path.basename(filePath))}</title>
                ${directoryStyles}
            </head>
            <body class="player">
                <h1>${escapeHtml(path.basename(filePath))}</h1>
                <video controls autoplay playsinline>
                    <source src="${videoUrl}" type="${escapeHtml(contentType)}">
                    Ваш браузер не підтримує відтворення цього відео.
                </video>
                <a href="${escapeHtml(parentUrl)}">Повернутися до каталогу</a>
            </body>
            </html>`);
        return;
    }

    res.setHeader('Content-Type', contentType);
    console.log(`Serving file: ${filePath}`);
    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.statusCode = 500;
            res.end('Error reading file');
            return;
        }
        res.statusCode = 200;
        res.end(data);
    });
});

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});

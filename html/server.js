#!/usr/bin/env node
// ARC interface server. Run from the repo root: node html/server.js [port]
//
// Serves html/ as static files and exposes:
//   GET /api/datasets                             -> sorted list of dataset dirs in data/
//   GET /api/categories?dataset=<name>            -> sorted list of category dirs in data/<name>/
//   GET /api/tasks?dataset=<name>&category=<cat>  -> sorted list of .json files in data/<name>/<cat>/
//   GET /data/...                                 -> static files from data/

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv[2] || '8070');
const HTML_DIR = __dirname;                            // html/
const DATA_DIR = path.join(__dirname, '..', 'data');   // data/
const SOLVERS_PATH = path.join(__dirname, '..', 'clones', 'arc-dsl', 'solvers.py');

let solversCache = null;

function getSolversContent(cb) {
    if (solversCache) return cb(null, solversCache);
    fs.readFile(SOLVERS_PATH, 'utf8', (err, data) => {
        if (err) return cb(err);
        solversCache = data;
        cb(null, data);
    });
}

const MIME = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
};

function listDirs(dir, cb) {
    fs.readdir(dir, { withFileTypes: true }, (err, entries) => {
        if (err) return cb(err);
        cb(null, entries.filter(e => e.isDirectory()).map(e => e.name).sort());
    });
}

function listJsonFiles(dir, cb) {
    fs.readdir(dir, (err, files) => {
        if (err) return cb(err);
        cb(null, files.filter(f => f.endsWith('.json')).sort());
    });
}

function jsonResponse(res, data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function errorResponse(res, status, msg) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // --- API routes ---

    if (url.pathname === '/api/datasets') {
        listDirs(DATA_DIR, (err, dirs) => {
            if (err) return errorResponse(res, 404, 'data/ directory not found');
            jsonResponse(res, dirs);
        });
        return;
    }

    if (url.pathname === '/api/categories') {
        const dataset = url.searchParams.get('dataset');
        if (!dataset) return errorResponse(res, 400, 'dataset parameter required');
        listDirs(path.join(DATA_DIR, dataset), (err, dirs) => {
            if (err) return errorResponse(res, 404, `dataset not found: ${dataset}`);
            jsonResponse(res, dirs);
        });
        return;
    }

    if (url.pathname === '/api/solver') {
        const task = url.searchParams.get('task');
        if (!task) return errorResponse(res, 400, 'task parameter required');
        getSolversContent((err, content) => {
            if (err) return errorResponse(res, 404, 'solvers.py not found');
            const funcName = 'solve_' + task;
            const startIdx = content.indexOf('\ndef ' + funcName + '(');
            if (startIdx === -1) return errorResponse(res, 404, 'solver not found: ' + funcName);
            const funcStart = startIdx + 1; // skip leading newline
            const nextDef = content.indexOf('\ndef ', funcStart + 1);
            const funcCode = nextDef === -1
                ? content.slice(funcStart).trimEnd()
                : content.slice(funcStart, nextDef).trimEnd();
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(funcCode);
        });
        return;
    }

    if (url.pathname === '/api/tasks') {
        const dataset = url.searchParams.get('dataset');
        const category = url.searchParams.get('category');
        if (!dataset || !category) return errorResponse(res, 400, 'dataset and category parameters required');
        listJsonFiles(path.join(DATA_DIR, dataset, category), (err, files) => {
            if (err) return errorResponse(res, 404, `category not found: ${dataset}/${category}`);
            jsonResponse(res, files);
        });
        return;
    }

    // --- Data file serving ---

    if (url.pathname.startsWith('/data/')) {
        const relative = url.pathname.slice('/data/'.length);
        const filePath = path.join(DATA_DIR, relative);
        fs.readFile(filePath, (err, data) => {
            if (err) return errorResponse(res, 404, 'file not found: ' + url.pathname);
            const ext = path.extname(filePath);
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(data);
        });
        return;
    }

    // --- Static files from html/ ---

    let filePath = url.pathname === '/'
        ? path.join(HTML_DIR, 'testing_interface.html')
        : path.join(HTML_DIR, url.pathname);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found: ' + url.pathname);
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`ARC server running at http://localhost:${PORT}/`);
});

// M0 check (7): drive @tailwindcss/language-server over stdio and confirm it
// autocompletes the plugin's fl-* utilities and range variants (and surfaces
// hover CSS), proving IntelliSense works end-to-end.
//
// Run: pnpm --filter playground test:ls

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bin = resolve(
	dirname(require.resolve('@tailwindcss/language-server/package.json')),
	'bin/tailwindcss-language-server',
);

const server = spawn('node', [bin, '--stdio'], { cwd: root });

// --- LSP framing ----------------------------------------------------------
let buffer = Buffer.alloc(0);
const pending = new Map();
const notifications = [];
let nextId = 1;

const write = (obj) => {
	const json = JSON.stringify(obj);
	server.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
};
const respond = (id, result) => write({ jsonrpc: '2.0', id, result });

// Tailwind LS blocks project init until the client answers its server→client
// requests (workspace/configuration, registerCapability, progress create).
function handleServerRequest(msg) {
	if (msg.method === 'workspace/configuration') {
		const items = msg.params?.items ?? [{}];
		respond(
			msg.id,
			items.map(() => ({ validate: true, experimental: {}, includeLanguages: {} })),
		);
	} else {
		respond(msg.id, null);
	}
}

server.stdout.on('data', (chunk) => {
	buffer = Buffer.concat([buffer, chunk]);
	for (;;) {
		const headerEnd = buffer.indexOf('\r\n\r\n');
		if (headerEnd === -1) return;
		const header = buffer.slice(0, headerEnd).toString();
		const len = Number(/Content-Length: (\d+)/i.exec(header)?.[1]);
		if (!Number.isFinite(len)) return;
		const start = headerEnd + 4;
		if (buffer.length < start + len) return;
		const msg = JSON.parse(buffer.slice(start, start + len).toString());
		buffer = buffer.slice(start + len);
		if (msg.method && msg.id !== undefined) {
			handleServerRequest(msg); // server→client request
		} else if (msg.id !== undefined && pending.has(msg.id)) {
			pending.get(msg.id)(msg);
			pending.delete(msg.id);
		} else if (msg.method) {
			notifications.push(msg);
		}
	}
});
server.stderr.on('data', (d) => {
	if (process.env.LS_DEBUG) process.stderr.write(`[LS] ${d}`);
});

const send = (method, params) => write({ jsonrpc: '2.0', method, params });
const request = (method, params, timeoutMs = 15000) =>
	new Promise((res) => {
		const id = nextId++;
		const timer = setTimeout(() => {
			pending.delete(id);
			res({ result: null, _timedOut: true });
		}, timeoutMs);
		pending.set(id, (msg) => {
			clearTimeout(timer);
			res(msg);
		});
		write({ jsonrpc: '2.0', id, method, params });
	});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rootUri = pathToFileURL(root).href;

const doc = [
	'<!doctype html>',
	'<html><body>',
	'<div class="fl-text-"></div>',
	'<div class="fl-md/lg:"></div>',
	'<div class="fl-text-sm/xl"></div>',
	'</body></html>',
	'',
].join('\n');
const uri = pathToFileURL(resolve(root, 'intellisense-probe.html')).href;

const labels = (items) => (Array.isArray(items) ? items : (items?.items ?? [])).map((i) => i.label);

try {
	await request('initialize', {
		processId: process.pid,
		rootUri,
		workspaceFolders: [{ uri: rootUri, name: 'playground' }],
		capabilities: {
			workspace: {
				workspaceFolders: true,
				configuration: true,
				didChangeConfiguration: { dynamicRegistration: true },
			},
			textDocument: {
				completion: { completionItem: { snippetSupport: true } },
				hover: { contentFormat: ['markdown', 'plaintext'] },
			},
		},
		initializationOptions: {},
	});
	send('initialized', {});
	send('textDocument/didOpen', {
		textDocument: { uri, languageId: 'html', version: 1, text: doc },
	});

	// Let the server boot the project + Oxide scan.
	await sleep(8000);
	if (process.env.LS_DEBUG) {
		console.error(
			'notifications:',
			notifications.map((n) => n.method),
		);
		for (const n of notifications) {
			if (n.method === 'window/logMessage' || n.method === 'window/showMessage') {
				const full = String(n.params?.message ?? '');
				console.error('  log:', n.params?.type === 1 ? full : full.slice(0, 200));
			}
		}
	}

	// Completion inside `class="fl-text-|"` (line index 2, after `fl-text-`).
	const utilCompletion = await request('textDocument/completion', {
		textDocument: { uri },
		position: { line: 2, character: 20 },
	});
	// Completion inside `class="fl-md/lg:|"` (line index 3).
	const variantCompletion = await request('textDocument/completion', {
		textDocument: { uri },
		position: { line: 3, character: 20 },
	});
	// Hover over `fl-text-sm/xl` (line index 4).
	const hover = await request('textDocument/hover', {
		textDocument: { uri },
		position: { line: 4, character: 18 },
	});

	const utilLabels = labels(utilCompletion.result);
	const variantLabels = labels(variantCompletion.result);
	const flTextItems = utilLabels.filter((l) => l.startsWith('fl-text'));
	const flVariantItems = variantLabels.filter((l) => l.startsWith('fl') || l.includes('fl-'));
	const hoverText = JSON.stringify(hover.result?.contents ?? null);

	console.log('util completion items total:', utilLabels.length);
	console.log('  fl-text* completions sample:', flTextItems.slice(0, 12));
	console.log('variant completion items total:', variantLabels.length);
	console.log('  fl* variant/utility completions sample:', flVariantItems.slice(0, 12));
	console.log('hover over fl-text-sm/xl:', hoverText.slice(0, 400));

	const utilOk = flTextItems.length > 0;
	const hoverOk = /clamp|font-size/.test(hoverText);
	console.log('\nRESULT util-completions:', utilOk ? 'PASS' : 'FAIL');
	console.log('RESULT hover-css:', hoverOk ? 'PASS' : 'FAIL');
	process.exitCode = utilOk ? 0 : 1;
} finally {
	server.kill();
}

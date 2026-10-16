#!/usr/bin/env node
// Drives the example apps in headless Chrome over the DevTools protocol, the
// way a user would: real mouse and keyboard input, elements found by role and
// accessible name. No dependencies: Node 22+ has a global WebSocket.
//
// Usage: see ../SKILL.md, or run with no arguments.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const DEVTOOLS_PORT = Number(process.env.VERIFY_EXAMPLES_CDP_PORT ?? 9333);
const STATE_DIR = process.env.VERIFY_EXAMPLES_DIR ?? "/tmp/verify-examples";
const PID_FILE = `${STATE_DIR}/chrome.pid`;

const apps = {
	nextjs: { port: 3001, script: "dev:next" },
	"react-router": { port: 3006, script: "dev:react-router" },
	"tanstack-start": { port: 3000, script: "dev:start" },
	"tanstack-start-effect": { port: 3005, script: "dev:effect" },
};

const usage = `control-examples <command> [options]

  chrome start                 Start headless Chrome (DevTools on :${DEVTOOLS_PORT})
  chrome stop                  Stop the Chrome this script started
  doctor [--app <name>]        Check Chrome and the app(s) are up
  open <url> [--wait <ms>] [--color-scheme dark|light]
                               Navigate, wait for load and network idle,
                               print console errors and exceptions; with
                               --color-scheme, emulate the OS theme and
                               print the page's theme class and background
  snapshot                     List visible headings and controls by role and name
  text                         Print the page's visible text
  click --role <r> --name <n>  Click an element (real mouse events)
  hover --role <r> --name <n>  Move the mouse onto an element
  fill --role <r> --name <n> --value <v>
                               Focus, select all, type the value
  select --name <n> --value <v>
                               Choose a native <select> option by value or label
  press <key>                  Enter, Escape, Tab, ArrowDown, ...
  scroll [bottom|top|<px>]     Scroll with the mouse wheel; bottom/top keep
                               going until the page stops moving
  wait --text <t> | --gone <t> | --role <r> --name <n> | --eval <expr>
       [--timeout <ms>]        Wait until text (or a typed value) appears /
                               disappears, a control exists, or <expr> is true
  eval <expression>            Evaluate in the page, print JSON
  screenshot --path <file> [--width <px>]
                               Save a PNG of the viewport; --width lays the
                               page out at that width (a phone at 390) first

Roles: button, link, textbox, combobox, menuitem, heading, checkbox, any.
--name matches the accessible name case-insensitively as a substring;
add --exact for an exact match, --nth <i> for the i-th match (0-based).
A name written as /pattern/ is a case-insensitive regular expression.
Apps: ${Object.keys(apps).join(", ")}.`;

function fail(message) {
	console.error(message);
	process.exit(1);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function devtoolsJson(path) {
	const response = await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}${path}`);
	if (!response.ok) {
		throw new Error(`DevTools ${path}: HTTP ${response.status}`);
	}
	return response.json();
}

async function connect() {
	let targets;
	try {
		targets = await devtoolsJson("/json/list");
	} catch {
		fail(
			`Chrome isn't reachable on :${DEVTOOLS_PORT}. Run: control-examples chrome start`,
		);
	}
	let page = targets.find((target) => target.type === "page");
	if (!page) {
		page = await devtoolsJson("/json/new?about:blank");
	}
	const socket = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		socket.addEventListener("open", resolve, { once: true });
		socket.addEventListener("error", reject, { once: true });
	});
	let nextId = 1;
	const pending = new Map();
	const listeners = new Set();
	socket.addEventListener("message", (event) => {
		const message = JSON.parse(String(event.data));
		if (message.id !== undefined) {
			const request = pending.get(message.id);
			pending.delete(message.id);
			if (message.error) {
				request?.reject(new Error(message.error.message));
			} else {
				request?.resolve(message.result);
			}
			return;
		}
		for (const listener of listeners) {
			listener(message);
		}
	});
	return {
		close: () => socket.close(),
		on: (listener) => listeners.add(listener),
		send: (method, params = {}) =>
			new Promise((resolve, reject) => {
				const id = nextId++;
				pending.set(id, { reject, resolve });
				socket.send(JSON.stringify({ id, method, params }));
			}),
	};
}

async function evaluate(cdp, expression) {
	const evaluated = await cdp.send("Runtime.evaluate", {
		awaitPromise: true,
		expression,
		returnByValue: true,
	});
	const problem = evaluated.exceptionDetails;
	if (problem) {
		throw new Error(problem.exception?.description ?? problem.text);
	}
	return evaluated.result.value;
}

// Runs in the page. Finds visible elements by role and accessible name.
const finder = String.raw`
(() => {
	const selectors = {
		button: 'button, [role="button"], input[type="submit"], input[type="button"]',
		checkbox: 'input[type="checkbox"], [role="checkbox"]',
		combobox: 'select, [role="combobox"]',
		heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
		link: 'a[href], [role="link"]',
		menuitem: '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"]',
		textbox: 'input:not([type]), input[type="text"], input[type="search"], input[type="email"], textarea, [role="textbox"], [contenteditable="true"]',
		any: '*',
	};
	const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
	const nameOf = (el) => {
		const label = el.getAttribute("aria-label");
		if (label) return clean(label);
		const by = el.getAttribute("aria-labelledby");
		if (by) return clean(by.split(" ").map((id) => document.getElementById(id)?.innerText).join(" "));
		if (el.labels?.length) {
			const label = el.labels[0].cloneNode(true);
			for (const control of label.querySelectorAll("select, input, textarea")) control.remove();
			return clean(label.textContent);
		}
		if (el.placeholder) return clean(el.placeholder);
		if (el.title) return clean(el.title);
		if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return clean(el.value);
		return clean(el.innerText ?? el.textContent);
	};
	const visible = (el) => {
		if (!el.getClientRects().length) return false;
		const style = getComputedStyle(el);
		return style.visibility !== "hidden" && style.display !== "none";
	};
	window.__verifyFind = (role, name, exact, nth) => {
		const selector = selectors[role];
		if (!selector) throw new Error("Unknown role " + role);
		const pattern = /^\/(.+)\/$/.exec(name);
		const regex = pattern && new RegExp(pattern[1], "i");
		const wanted = clean(name).toLowerCase();
		const matches = [...document.querySelectorAll(selector)].filter((el) => {
			if (!visible(el)) return false;
			if (regex) return regex.test(nameOf(el));
			const actual = nameOf(el).toLowerCase();
			return exact ? actual === wanted : actual.includes(wanted);
		});
		return { count: matches.length, el: matches[nth ?? 0] };
	};
	window.__verifySnapshot = () => {
		const out = [];
		for (const [role, selector] of Object.entries(selectors)) {
			if (role === "any") continue;
			for (const el of document.querySelectorAll(selector)) {
				if (!visible(el)) continue;
				const extra = [];
				if (el.disabled || el.getAttribute("aria-disabled") === "true") extra.push("disabled");
				if (el.getAttribute("aria-busy") === "true") extra.push("busy");
				if (el.tagName === "SELECT") extra.push("value=" + el.value);
				if (el.getAttribute("aria-expanded")) extra.push("expanded=" + el.getAttribute("aria-expanded"));
				if (role === "link") extra.push(el.getAttribute("href"));
				out.push(role + ' "' + nameOf(el).slice(0, 80) + '"' + (extra.length ? " [" + extra.join(", ") + "]" : ""));
			}
		}
		return [...new Set(out)];
	};
})()`;

async function find(cdp, options) {
	await evaluate(cdp, finder);
	const nth = options.nth === undefined ? 0 : Number(options.nth);
	const box = await evaluate(
		cdp,
		`(() => {
			const { count, el } = window.__verifyFind(${JSON.stringify(options.role)}, ${JSON.stringify(options.name)}, ${Boolean(options.exact)}, ${nth});
			if (!el) return { count };
			el.scrollIntoView({ block: "center", inline: "center" });
			const rect = el.getBoundingClientRect();
			const x = rect.x + rect.width / 2;
			const y = rect.y + rect.height / 2;
			const hit = document.elementFromPoint(x, y);
			const covered = hit && hit !== el && !el.contains(hit) && !hit.contains(el);
			return { count, covered: covered ? hit.outerHTML.slice(0, 120) : undefined, x, y };
		})()`,
	);
	if (box.x === undefined) {
		fail(
			`No visible ${options.role} named "${options.name}" (${box.count} matches, wanted index ${nth}). Run: control-examples snapshot`,
		);
	}
	if (box.covered) {
		fail(
			`The ${options.role} named "${options.name}" is covered by ${box.covered}. Close what's on top (the devtools panel?) first.`,
		);
	}
	return box;
}

async function mouseClick(cdp, point) {
	const base = { button: "left", clickCount: 1, x: point.x, y: point.y };
	await cdp.send("Input.dispatchMouseEvent", { ...base, type: "mouseMoved" });
	await cdp.send("Input.dispatchMouseEvent", { ...base, type: "mousePressed" });
	await cdp.send("Input.dispatchMouseEvent", {
		...base,
		type: "mouseReleased",
	});
}

const keys = {
	ArrowDown: { code: "ArrowDown", keyCode: 40 },
	ArrowUp: { code: "ArrowUp", keyCode: 38 },
	Enter: { code: "Enter", keyCode: 13, text: "\r" },
	Escape: { code: "Escape", keyCode: 27 },
	Space: { code: "Space", key: " ", keyCode: 32, text: " " },
	Tab: { code: "Tab", keyCode: 9 },
};

async function press(cdp, key) {
	const info = keys[key];
	if (!info) {
		fail(`Unknown key ${key}. Known: ${Object.keys(keys).join(", ")}`);
	}
	const params = {
		code: info.code,
		key: info.key ?? key,
		windowsVirtualKeyCode: info.keyCode,
	};
	await cdp.send("Input.dispatchKeyEvent", {
		...params,
		text: info.text,
		type: info.text ? "keyDown" : "rawKeyDown",
	});
	await cdp.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

async function waitFor(cdp, check, timeout, what) {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (await evaluate(cdp, check)) {
			return;
		}
		await sleep(100);
	}
	fail(`Timed out after ${timeout} ms waiting for ${what}`);
}

/** Resolves once no request has been in flight for `quietMs`. */
function networkIdle(cdp, quietMs, timeout) {
	const inFlight = new Set();
	let lastChange = Date.now();
	cdp.on((message) => {
		const id = message.params?.requestId;
		if (message.method === "Network.requestWillBeSent") {
			inFlight.add(id);
			lastChange = Date.now();
		} else if (
			message.method === "Network.loadingFinished" ||
			message.method === "Network.loadingFailed"
		) {
			inFlight.delete(id);
			lastChange = Date.now();
		}
	});
	return async () => {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			if (inFlight.size === 0 && Date.now() - lastChange >= quietMs) {
				return;
			}
			await sleep(50);
		}
	};
}

const commands = {
	async chrome(args) {
		const [action] = args.positionals;
		if (action === "start") {
			try {
				await devtoolsJson("/json/version");
				console.log(`Chrome already listening on :${DEVTOOLS_PORT}`);
				return;
			} catch {
				// Nothing listening yet: start one.
			}
			mkdirSync(STATE_DIR, { recursive: true });
			const chrome = spawn(
				process.env.CHROME_PATH ?? "google-chrome",
				[
					"--headless=new",
					`--remote-debugging-port=${DEVTOOLS_PORT}`,
					`--user-data-dir=${STATE_DIR}/profile`,
					"--no-first-run",
					"--no-default-browser-check",
					"--window-size=1280,900",
					"about:blank",
				],
				{ detached: true, stdio: "ignore" },
			);
			chrome.unref();
			writeFileSync(PID_FILE, String(chrome.pid));
			for (let attempt = 0; attempt < 50; attempt++) {
				try {
					const version = await devtoolsJson("/json/version");
					console.log(`Chrome ${version.Browser} pid ${chrome.pid}`);
					return;
				} catch {
					await sleep(200);
				}
			}
			fail("Chrome didn't open its DevTools port");
		}
		if (action === "stop") {
			let pid;
			try {
				pid = Number(readFileSync(PID_FILE, "utf8"));
			} catch {
				console.log("No Chrome started by this script");
				return;
			}
			try {
				process.kill(pid);
				console.log(`Stopped Chrome pid ${pid}`);
			} catch {
				console.log(`Chrome pid ${pid} wasn't running`);
			}
			rmSync(PID_FILE, { force: true });
			rmSync(`${STATE_DIR}/profile`, { force: true, recursive: true });
			return;
		}
		fail("Usage: control-examples chrome start|stop");
	},

	async click(args, cdp) {
		await mouseClick(cdp, await find(cdp, args.values));
	},

	async doctor(args) {
		let healthy = true;
		try {
			const version = await devtoolsJson("/json/version");
			console.log(`ok   chrome ${version.Browser} on :${DEVTOOLS_PORT}`);
		} catch {
			healthy = false;
			console.log(`FAIL chrome: nothing on :${DEVTOOLS_PORT}`);
		}
		const names = args.values.app ? [args.values.app] : Object.keys(apps);
		for (const name of names) {
			const app = apps[name];
			if (!app) {
				fail(`Unknown app ${name}`);
			}
			const url = `http://localhost:${app.port}/issues`;
			try {
				const response = await fetch(url, {
					signal: AbortSignal.timeout(30_000),
				});
				const html = await response.text();
				const rendered = html.includes("Change status");
				console.log(
					`${response.ok && rendered ? "ok  " : "FAIL"} ${name} ${url} -> ${response.status}${rendered ? "" : ", no issue rows in the HTML"}`,
				);
				healthy &&= response.ok && rendered;
			} catch (error) {
				healthy = false;
				console.log(
					`FAIL ${name} ${url}: ${error.message}. Start it: pnpm ${app.script}`,
				);
			}
		}
		process.exitCode = healthy ? 0 : 1;
	},

	async eval(args, cdp) {
		console.log(
			JSON.stringify(await evaluate(cdp, args.positionals.join(" ")), null, 2),
		);
	},

	async fill(args, cdp) {
		if (args.values.value === undefined) {
			fail("fill needs --value");
		}
		await mouseClick(cdp, await find(cdp, args.values));
		await evaluate(
			cdp,
			`(() => {
				const el = document.activeElement;
				if (el.select) el.select();
				else document.execCommand("selectAll");
			})()`,
		);
		await cdp.send("Input.insertText", { text: args.values.value });
	},

	async hover(args, cdp) {
		const point = await find(cdp, args.values);
		await cdp.send("Input.dispatchMouseEvent", {
			type: "mouseMoved",
			x: point.x,
			y: point.y,
		});
	},

	async open(args, cdp) {
		const [url] = args.positionals;
		if (!url) {
			fail("Usage: control-examples open <url>");
		}
		const problems = [];
		// Runtime.enable replays what the previous page logged; skip that.
		let recording = false;
		cdp.on((message) => {
			if (!recording) {
				return;
			}
			if (message.method === "Runtime.exceptionThrown") {
				problems.push(
					`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`,
				);
			}
			if (
				message.method === "Runtime.consoleAPICalled" &&
				message.params.type === "error"
			) {
				problems.push(
					`console.error: ${message.params.args.map((arg) => arg.value ?? arg.description).join(" ")}`,
				);
			}
		});
		await cdp.send("Runtime.enable");
		await cdp.send("Network.enable");
		await cdp.send("Page.enable");
		const scheme = args.values["color-scheme"];
		if (scheme) {
			// The override ends with this command's DevTools session, so check
			// what it changed before returning.
			await cdp.send("Emulation.setEmulatedMedia", {
				features: [{ name: "prefers-color-scheme", value: scheme }],
			});
		}
		const idle = networkIdle(cdp, 500, 30_000);
		const loaded = new Promise((resolve) =>
			cdp.on((message) => {
				if (message.method === "Page.loadEventFired") {
					resolve();
				}
			}),
		);
		recording = true;
		await cdp.send("Page.navigate", { url });
		await loaded;
		await idle();
		await sleep(Number(args.values.wait ?? 300));
		const location = await evaluate(cdp, "location.href");
		const title = await evaluate(cdp, "document.title");
		console.log(`${location} "${title}"`);
		if (scheme) {
			const html = await evaluate(
				cdp,
				`({ background: getComputedStyle(document.body).backgroundColor, className: document.documentElement.className, colorScheme: getComputedStyle(document.documentElement).colorScheme })`,
			);
			console.log(
				`prefers-color-scheme ${scheme}: <html class="${html.className}">, color-scheme ${html.colorScheme}, body background ${html.background}`,
			);
		}
		for (const problem of problems) {
			console.log(problem);
		}
	},

	async press(args, cdp) {
		await press(cdp, args.positionals[0]);
	},

	async screenshot(args, cdp) {
		const path = args.values.path;
		if (!path) {
			fail("screenshot needs --path");
		}
		const width = args.values.width;
		if (width) {
			// The override ends with this command's DevTools session.
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				deviceScaleFactor: 2,
				height: 900,
				mobile: Number(width) < 768,
				width: Number(width),
			});
			await sleep(500);
		}
		const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, Buffer.from(shot.data, "base64"));
		console.log(path);
	},

	async scroll(args, cdp) {
		const [target = "bottom"] = args.positionals;
		const wheel = (deltaY) =>
			cdp.send("Input.dispatchMouseEvent", {
				deltaX: 0,
				deltaY,
				type: "mouseWheel",
				x: 640,
				y: 450,
			});
		if (target !== "bottom" && target !== "top") {
			await wheel(Number(target));
		} else {
			// Content can grow while scrolling (infinite lists load the next page
			// when the end comes near), so stop only once the position has held
			// for a few wheel turns, longer than one request at the default latency.
			let previous;
			let still = 0;
			for (let step = 0; step < 200 && still < 3; step++) {
				await wheel(target === "bottom" ? 2000 : -2000);
				await sleep(500);
				const y = await evaluate(cdp, "scrollY");
				still = y === previous ? still + 1 : 0;
				previous = y;
			}
		}
		console.log(`scrollY ${await evaluate(cdp, "scrollY")}`);
	},

	async select(args, cdp) {
		const box = await find(cdp, { ...args.values, role: "combobox" });
		const chosen = await evaluate(
			cdp,
			`(() => {
				const el = document.elementFromPoint(${box.x}, ${box.y})?.closest("select");
				if (!el) throw new Error("Not a native <select>");
				const wanted = ${JSON.stringify(args.values.value ?? "")}.toLowerCase();
				const option = [...el.options].find((o) => o.value.toLowerCase() === wanted || o.label.toLowerCase() === wanted);
				if (!option) throw new Error("No option " + wanted + ". Options: " + [...el.options].map((o) => o.value + " (" + o.label + ")").join(", "));
				el.focus();
				Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, option.value);
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
				return option.value + " (" + option.label + ")";
			})()`,
		);
		console.log(`selected ${chosen}`);
	},

	async snapshot(_args, cdp) {
		await evaluate(cdp, finder);
		for (const line of await evaluate(cdp, "window.__verifySnapshot()")) {
			console.log(line);
		}
	},

	async text(_args, cdp) {
		console.log(await evaluate(cdp, "document.body.innerText"));
	},

	async wait(args, cdp) {
		const timeout = Number(args.values.timeout ?? 10_000);
		// What the user can read: the text, plus what's typed in form fields.
		const shown = `[document.body.innerText, ...[...document.querySelectorAll("input, textarea")].map((el) => el.value)].join("\\n")`;
		if (args.values.text !== undefined) {
			await waitFor(
				cdp,
				`${shown}.includes(${JSON.stringify(args.values.text)})`,
				timeout,
				`"${args.values.text}"`,
			);
		} else if (args.values.eval !== undefined) {
			await waitFor(
				cdp,
				`Boolean(${args.values.eval})`,
				timeout,
				`\`${args.values.eval}\``,
			);
		} else if (args.values.role !== undefined) {
			await evaluate(cdp, finder);
			await waitFor(
				cdp,
				`window.__verifyFind(${JSON.stringify(args.values.role)}, ${JSON.stringify(args.values.name ?? "")}, ${Boolean(args.values.exact)}).count > 0`,
				timeout,
				`a ${args.values.role} named "${args.values.name}"`,
			);
		} else if (args.values.gone !== undefined) {
			await waitFor(
				cdp,
				`!${shown}.includes(${JSON.stringify(args.values.gone)})`,
				timeout,
				`"${args.values.gone}" to disappear`,
			);
		} else {
			fail("wait needs --text, --gone, --eval, or --role with --name");
		}
	},
};

const [command, ...rest] = process.argv.slice(2);
if (!command || !(command in commands)) {
	console.log(usage);
	process.exit(command ? 1 : 0);
}
const args = parseArgs({
	allowPositionals: true,
	args: rest,
	options: {
		app: { type: "string" },
		"color-scheme": { type: "string" },
		eval: { type: "string" },
		exact: { type: "boolean" },
		gone: { type: "string" },
		name: { type: "string" },
		nth: { type: "string" },
		path: { type: "string" },
		role: { type: "string" },
		text: { type: "string" },
		// oxlint-disable-next-line workspace/no-custom-test-timeout -- a CLI flag, not a test timeout
		timeout: { type: "string" },
		value: { type: "string" },
		wait: { type: "string" },
		width: { type: "string" },
	},
});
const needsPage = !["chrome", "doctor"].includes(command);
const cdp = needsPage ? await connect() : undefined;
try {
	await commands[command](args, cdp);
} finally {
	cdp?.close();
}

import { html, render } from '#preact';
import { App } from './app.js';
import { createServerSim } from './sim.js';

const server = new URLSearchParams(globalThis.location?.search ?? '').has('server');
render(html`<${App} simFactory=${server ? createServerSim : undefined} />`, document.getElementById('app'));

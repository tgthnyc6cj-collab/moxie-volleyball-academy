const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(__dirname + '/interest-form.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

function setup(fetchImpl = async () => ({ ok: true, json: async () => ({ success: true }) })) {
  const handlers = {};
  const field = (name, value) => ({ name, value, readOnly: false, validity: '', setCustomValidity(message) { this.validity = message; } });
  const fields = {
    name: field('name', '  Synthetic Test  '), email: field('email', 'synthetic@example.com'), athlete: field('athlete', '2030'),
    _subject: field('_subject', 'New Moxie Keep Me Posted signup'), _template: field('_template', 'table'), _url: field('_url', 'https://moxievba.com/#contact'), _honey: field('_honey', ''),
  };
  const button = { disabled: false, textContent: 'KEEP ME POSTED →' };
  const status = { textContent: '', dataset: {} };
  const attributes = {};
  const requests = [];
  let timeout;
  const form = {
    action: 'https://formsubmit.co/CoachJojo@moxievba.com',
    elements: { namedItem: name => fields[name] },
    querySelector: selector => selector.startsWith('button') ? button : status,
    addEventListener: (event, callback) => { handlers[event] = callback; },
    reportValidity: () => !Object.values(fields).some(field => field.validity) && Boolean(fields.name.value && fields.email.value),
    setAttribute: (key, value) => { attributes[key] = value; },
    removeAttribute: key => { delete attributes[key]; },
    reset: () => { for (const name of ['name', 'email', 'athlete', '_honey']) fields[name].value = ''; },
  };
  vm.runInNewContext(source, {
    document: { querySelector: () => form },
    fetch: async (...args) => { requests.push(args); return fetchImpl(...args); },
    AbortController,
    setTimeout: callback => { timeout = callback; return 1; }, clearTimeout: () => { timeout = undefined; },
  });
  return { fields, button, status, attributes, requests, submit: () => handlers.submit({ preventDefault() {} }), input: () => handlers.input(), timeout: () => timeout() };
}

test('HTML routes native POST to approved inbox and has accessible named fields', () => {
  assert.match(html, /action="https:\/\/formsubmit.co\/CoachJojo@moxievba.com" method="post"/);
  assert.doesNotMatch(html, /onsubmit=/);
  for (const name of ['name', 'email', 'athlete']) {
    assert.match(html, new RegExp(`id="interest-${name}" name="${name}"`));
    assert.match(html, new RegExp(`label for="interest-${name}"`));
  }
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /retains submissions for 30 days/);
  assert.match(html, /mailto:CoachJojo@moxievba.com/);
  assert.doesNotMatch(html, /You’re on the Moxie list/);
});

test('blank name is rejected before transmission', async () => {
  const app = setup(); app.fields.name.value = '   '; await app.submit();
  assert.equal(app.requests.length, 0); assert.match(app.fields.name.validity, /name/);
  app.fields.name.value = 'Synthetic Test'; app.input(); assert.equal(app.fields.name.validity, '');
});

test('payload contains only intended named fields and goes to the exact AJAX endpoint', async () => {
  const app = setup(); await app.submit();
  const [url, options] = app.requests[0];
  assert.equal(url, 'https://formsubmit.co/ajax/CoachJojo@moxievba.com');
  assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
  assert.deepEqual(JSON.parse(options.body), { name: 'Synthetic Test', email: 'synthetic@example.com', athlete: '2030', _subject: 'New Moxie Keep Me Posted signup', _template: 'table', _url: 'https://moxievba.com/#contact', _honey: '' });
});

for (const success of [true, 'true']) test(`explicit provider acknowledgement ${JSON.stringify(success)} is required for success`, async () => {
  const app = setup(async () => ({ ok: true, json: async () => ({ success }) })); await app.submit();
  assert.equal(app.status.dataset.state, 'success'); assert.equal(app.fields.name.value, ''); assert.equal(app.button.disabled, true);
  app.fields.name.value = 'New Synthetic Test'; app.input(); assert.equal(app.button.disabled, false);
});

for (const success of [false, 'false', undefined, 1, 'yes']) test(`unconfirmed response ${JSON.stringify(success)} retains details`, async () => {
  const app = setup(async () => ({ ok: true, json: async () => ({ success }) })); await app.submit();
  assert.equal(app.status.dataset.state, 'error'); assert.equal(app.fields.name.value, '  Synthetic Test  '); assert.equal(app.button.disabled, false);
});

test('HTTP failure cannot become success even when its body claims success', async () => {
  const app = setup(async () => ({ ok: false, json: async () => ({ success: true }) })); await app.submit(); assert.equal(app.status.dataset.state, 'error');
});

test('HTML/error page or invalid JSON retains inputs', async () => {
  const app = setup(async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } })); await app.submit();
  assert.equal(app.status.dataset.state, 'error'); assert.equal(app.fields.email.value, 'synthetic@example.com');
});

test('double submit is ignored while pending; fields and button recover after network failure', async () => {
  let reject;
  const app = setup(() => new Promise((_, rejectPromise) => { reject = rejectPromise; }));
  const pending = app.submit();
  assert.equal(app.button.disabled, true); assert.equal(app.fields.name.readOnly, true); assert.equal(app.attributes['aria-busy'], 'true');
  await app.submit(); assert.equal(app.requests.length, 1);
  reject(new Error('network')); await pending;
  assert.equal(app.button.disabled, false); assert.equal(app.fields.name.readOnly, false); assert.equal(app.attributes['aria-busy'], undefined);
  assert.equal(app.status.dataset.state, 'error'); assert.match(app.status.textContent, /email link/);
});

test('timeout aborts request and never claims success', async () => {
  const app = setup((_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
  const pending = app.submit(); app.timeout(); await pending;
  assert.equal(app.status.dataset.state, 'error'); assert.equal(app.button.disabled, false); assert.equal(app.fields.email.value, 'synthetic@example.com');
});

(() => {
  const form = document.querySelector('#interest-form');
  if (!form) return;

  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('#interest-status');
  const fields = ['name', 'email', 'athlete'].map(name => form.elements.namedItem(name));
  let pending = false;
  button.disabled = false;

  form.addEventListener('input', () => {
    fields.forEach(field => field.setCustomValidity(''));
    if (!pending) {
      button.disabled = false;
      status.textContent = '';
      delete status.dataset.state;
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || button.disabled) return;

    const payload = Object.fromEntries(fields.map(field => [field.name, field.value.trim()]));
    if (!payload.name) fields[0].setCustomValidity('Please enter your name.');
    if (!form.reportValidity()) return;

    pending = true;
    button.disabled = true;
    button.textContent = 'SENDING…';
    form.setAttribute('aria-busy', 'true');
    fields.forEach(field => { field.readOnly = true; });
    status.textContent = 'Sending your interest…';
    delete status.dataset.state;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(form.action.replace('formsubmit.co/', 'formsubmit.co/ajax/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'omit',
        redirect: 'error',
        body: JSON.stringify({
          ...payload,
          _subject: form.elements.namedItem('_subject').value,
          _template: form.elements.namedItem('_template').value,
          _url: form.elements.namedItem('_url').value,
          _honey: form.elements.namedItem('_honey').value,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || ![true, 'true'].includes(result?.success)) throw new Error('Submission not confirmed');

      form.reset();
      status.dataset.state = 'success';
      status.textContent = 'Thank you! Your interest was submitted.';
      // A new input re-enables the button; repeated clicks cannot resubmit.
    } catch {
      status.dataset.state = 'error';
      status.textContent = 'We couldn’t confirm your sign-up. Your details are still here. Please try again or use the direct email link.';
      button.disabled = false;
    } finally {
      clearTimeout(timeout);
      pending = false;
      button.textContent = 'KEEP ME POSTED →';
      form.removeAttribute('aria-busy');
      fields.forEach(field => { field.readOnly = false; });
    }
  });
})();

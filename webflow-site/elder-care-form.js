(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.initElderCareForm({ document: root.document, fetchImpl: root.fetch.bind(root), locationHref: root.location.href });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function initElderCareForm({
    document,
    fetchImpl,
    locationHref,
    timeoutMs = 15000,
    formDataFactory = (form) => new FormData(form),
    createAbortController = () => new AbortController(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    const form = document.getElementById('familyLeadForm');
    if (!form) return null;

    const submit = async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();

      const button = form.querySelector('button[type="submit"]');
      if (button.disabled) return;

      const priorError = form.querySelector('.form-submit-error');
      if (priorError) priorError.remove();

      const data = new URLSearchParams(formDataFactory(form));
      const city = document.getElementById('lf-city').value;
      data.set('company', city ? `Family care enquiry · ${city}` : 'Family care enquiry');
      data.set('page', locationHref);
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');

      const controller = createAbortController();
      const timer = setTimer(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: data,
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Submission failed');
        form.style.display = 'none';
        const success = form.parentElement.querySelector('.form-success');
        success.classList.add('is-visible');
        success.focus();
      } catch {
        button.disabled = false;
        let message = form.querySelector('.form-submit-error');
        if (!message) {
          message = document.createElement('p');
          message.className = 'form-submit-error';
          message.setAttribute('role', 'alert');
          form.appendChild(message);
        }
        message.textContent = 'We could not submit your request. Please email sales@anara.health directly.';
      } finally {
        clearTimer(timer);
        button.removeAttribute('aria-busy');
      }
    };

    form.addEventListener('submit', submit);
    return { form, submit };
  }

  return { initElderCareForm };
});

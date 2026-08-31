import { icon } from '../core/icons.js';
import { $, e, html, readForm, trapFocus } from '../core/dom.js';

let current = null;

export function openModal({
  title,
  description = '',
  body = '',
  confirmLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  size = 'md',
  onConfirm,
  onClose,
}) {
  closeModal();

  const opener = document.activeElement;
  const root = document.getElementById('modal-root');

  const sizeClass = size === 'lg' ? ' modal-lg' : size === 'sm' ? ' modal-sm' : '';

  const backdrop = html(`
    <div class="modal-backdrop">
      <div class="modal${sizeClass}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <form class="modal-form" novalidate>
          <div class="modal-header">
            <div>
              <h2 id="modal-title">${e(title)}</h2>
              ${description ? `<p>${e(description)}</p>` : ''}
            </div>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Fechar">
              ${icon('x')}
            </button>
          </div>
          <div class="modal-body">${body}</div>
          <div class="modal-footer">
            <button type="button" class="btn" data-close>${e(cancelLabel)}</button>
            <button type="submit" class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}">
              ${e(confirmLabel)}
            </button>
          </div>
        </form>
      </div>
    </div>
  `);

  const form = $('.modal-form', backdrop);
  const releaseFocus = trapFocus(backdrop);

  function close() {
    if (current?.backdrop !== backdrop) return;
    releaseFocus();
    document.removeEventListener('keydown', onKeydown);
    backdrop.remove();
    current = null;
    onClose?.();
    if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKeydown);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = onConfirm?.(readForm(form), { close, root: backdrop });
    if (result !== false) close();
  });

  root.append(backdrop);
  current = { backdrop, close };

  requestAnimationFrame(() => {
    const first = $('.modal-body input, .modal-body select, .modal-body textarea', backdrop);
    (first ?? $('[type="submit"]', backdrop))?.focus();
  });

  return current;
}

export function closeModal() {
  current?.close();
}

export function confirmDialog({
  title = 'Confirmar acao',
  message = 'Deseja continuar?',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
} = {}) {
  return new Promise((resolve) => {
    let confirmed = false;
    openModal({
      title,
      body: `<p class="muted">${e(message)}</p>`,
      confirmLabel,
      cancelLabel,
      tone,
      size: 'sm',
      onConfirm: () => { confirmed = true; },
      onClose: () => resolve(confirmed),
    });
  });
}

export function setFieldError(root, fieldName, message) {
  const field = $(`[name="${fieldName}"]`, root);
  if (!field) return;

  field.setAttribute('aria-invalid', 'true');
  const wrapper = field.closest('.field');
  let node = wrapper?.querySelector('.error-text');
  if (!node && wrapper) {
    node = document.createElement('span');
    node.className = 'error-text';
    wrapper.append(node);
  }
  if (node) node.textContent = message;
  field.focus();
}

export function invalid(root, fieldName, message) {
  setFieldError(root, fieldName, message);
  return false;
}

export function clearFieldErrors(root) {
  for (const field of root.querySelectorAll('[aria-invalid="true"]')) {
    field.removeAttribute('aria-invalid');
  }
  for (const node of root.querySelectorAll('.error-text')) node.remove();
}

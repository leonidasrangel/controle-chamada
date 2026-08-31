/**
 * modal.js — modais e dialogos de confirmacao.
 *
 * Um modal por vez. Ao abrir, o foco vai para o primeiro campo e fica preso
 * dentro do dialogo; ao fechar, volta para o elemento que o abriu — o padrao
 * esperado por quem navega so pelo teclado.
 *
 * Em telas estreitas o CSS transforma o mesmo componente em um drawer
 * ancorado na base, sem nenhuma mudanca de JavaScript.
 */

import { icon } from '../core/icons.js';
import { $, e, html, readForm, trapFocus } from '../core/dom.js';

let current = null;

/**
 * Abre um modal.
 *
 * @param {object} options
 * @param {string}  options.title
 * @param {string} [options.description]
 * @param {string}  options.body          markup interno (ja escapado pelo chamador)
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @param {'default'|'danger'} [options.tone]
 * @param {'sm'|'md'|'lg'} [options.size]
 * @param {(data: object, ctx: { close: () => void, root: HTMLElement }) => boolean|void} [options.onConfirm]
 *        Retornar `false` mantem o modal aberto (usado para exibir erros de validacao).
 * @returns {{ close: () => void, root: HTMLElement }}
 */
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
  closeModal(); // garante um unico modal ativo

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
    // Devolve o foco a quem abriu o modal
    if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  // Fechar: botoes marcados e clique fora do dialogo
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

  // Foco no primeiro campo util (ou no botao de confirmar, se nao houver campos)
  requestAnimationFrame(() => {
    const first = $('.modal-body input, .modal-body select, .modal-body textarea', backdrop);
    (first ?? $('[type="submit"]', backdrop))?.focus();
  });

  return current;
}

export function closeModal() {
  current?.close();
}

/**
 * Dialogo de confirmacao. Resolve `true` se o usuario confirmar.
 * @returns {Promise<boolean>}
 */
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

/** Mostra uma mensagem de erro de validacao dentro do modal aberto. */
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

/**
 * Marca um campo como invalido e devolve `false`, que e o valor que o
 * `onConfirm` do modal interpreta como "nao feche, ha erro".
 *
 *   if (!data.name) return invalid(root, 'name', 'Informe o nome.');
 */
export function invalid(root, fieldName, message) {
  setFieldError(root, fieldName, message);
  return false;
}

/** Limpa marcacoes de erro antes de uma nova validacao. */
export function clearFieldErrors(root) {
  for (const field of root.querySelectorAll('[aria-invalid="true"]')) {
    field.removeAttribute('aria-invalid');
  }
  for (const node of root.querySelectorAll('.error-text')) node.remove();
}

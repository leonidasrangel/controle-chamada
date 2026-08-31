/**
 * dom.js — utilitarios minimos de DOM.
 *
 * A aplicacao renderiza HTML como string e delega eventos, entao a regra
 * mais importante deste modulo e `escapeHtml`: TODO dado vindo do usuario
 * (nome de aluno, observacao, sala...) precisa passar por ele antes de ser
 * interpolado em um template, sob pena de XSS.
 */

/**
 * Escapa os cinco caracteres que quebram contexto HTML/atributo.
 * Use sempre que interpolar dados do usuario em um template literal.
 */
export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Alias curto para uso dentro de templates: `${e(aluno.nome)}`. */
export const e = escapeHtml;

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

/** Converte uma string de HTML no primeiro elemento correspondente. */
export function html(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

/** Converte uma string de HTML em um fragmento (varios nos irmaos). */
export function fragment(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content;
}

/**
 * Delegacao de eventos: um unico listener no container atende a todas as
 * linhas de uma lista, mesmo as que ainda nao existem.
 *
 * @returns {() => void} funcao para remover o listener
 */
export function delegate(root, eventName, selector, handler) {
  const listener = (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(eventName, listener);
  return () => root.removeEventListener(eventName, listener);
}

/** Substitui todo o conteudo de um container por novo markup. */
export function render(container, markup) {
  container.replaceChildren(fragment(markup));
  return container;
}

/**
 * Le um <form> como objeto simples, aplicando trim em strings.
 * Campos `multiple` (ex: select de disciplinas) viram arrays.
 */
export function readForm(form) {
  const data = {};
  for (const element of form.elements) {
    if (!element.name || element.disabled) continue;

    if (element.type === 'checkbox') {
      // Checkboxes com o mesmo name formam um array de valores marcados
      if (element.dataset.group) {
        data[element.name] ??= [];
        if (element.checked) data[element.name].push(element.value);
      } else {
        data[element.name] = element.checked;
      }
      continue;
    }

    if (element.multiple && element.tagName === 'SELECT') {
      data[element.name] = [...element.selectedOptions].map((option) => option.value);
      continue;
    }

    data[element.name] = typeof element.value === 'string' ? element.value.trim() : element.value;
  }
  return data;
}

/** Mantem o foco preso dentro de um container (usado por modais). */
export function trapFocus(container) {
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const onKeydown = (event) => {
    if (event.key !== 'Tab') return;
    const items = $$(FOCUSABLE, container).filter((el) => el.offsetParent !== null);
    if (!items.length) return;

    const first = items[0];
    const last = items.at(-1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeydown);
  return () => container.removeEventListener('keydown', onKeydown);
}

/** Dispara o download de um arquivo gerado em memoria. */
export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  // Libera a URL no proximo tick, depois que o navegador iniciou o download
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

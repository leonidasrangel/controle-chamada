import { icon } from '../core/icons.js';
import { e, html } from '../core/dom.js';

const ICONS = {
  success: 'circle-check',
  error: 'circle-alert',
  info: 'info',
};

export function toast(title, { description = '', type = 'success', duration = 3200 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const node = html(`
    <div class="toast toast-${type}" role="alert">
      ${icon(ICONS[type] ?? ICONS.info, { size: 17 })}
      <div class="grow">
        <div class="title">${e(title)}</div>
        ${description ? `<div class="desc">${e(description)}</div>` : ''}
      </div>
    </div>
  `);

  root.append(node);

  const dismiss = () => {
    node.classList.add('leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  };

  const timer = setTimeout(dismiss, duration);

  node.addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
  });
}

export const toastSuccess = (title, description) => toast(title, { description, type: 'success' });
export const toastError = (title, description) => toast(title, { description, type: 'error', duration: 5000 });
export const toastInfo = (title, description) => toast(title, { description, type: 'info' });

// CodeMirror 5 se c'è (file locali del kit), altrimenti una textarea: il laboratorio funziona lo stesso.
export function createEditor({ container, value = '', onChange = () => {} } = {}) {
  if (!container) throw new Error('editor: manca il contenitore');
  const area = document.createElement('textarea');
  area.value = value;
  area.spellcheck = false;
  area.setAttribute('aria-label', 'Codice della scena');
  container.appendChild(area);
  let cm = null;
  const CodeMirror = globalThis.CodeMirror;
  if (CodeMirror?.fromTextArea) {
    cm = CodeMirror.fromTextArea(area, {
      mode: 'javascript', lineNumbers: true, lineWrapping: false, tabSize: 2, indentUnit: 2,
    });
    cm.on('change', () => onChange(cm.getValue()));
    cm.setSize('100%', '100%');
  } else {
    area.className = 'editor-fallback';
    area.addEventListener('input', () => onChange(area.value));
  }

  return {
    getValue: () => (cm ? cm.getValue() : area.value),
    setValue(next) {
      const text = String(next ?? '');
      if (cm) {
        cm.setValue(text);
        cm.clearHistory?.();
      } else {
        area.value = text;
      }
    },
    insert(snippet) {
      const text = String(snippet ?? '');
      if (cm) {
        cm.replaceSelection(text);
        cm.focus();
        return;
      }
      const start = area.selectionStart ?? area.value.length;
      const end = area.selectionEnd ?? start;
      area.value = area.value.slice(0, start) + text + area.value.slice(end);
      area.selectionStart = area.selectionEnd = start + text.length;
      area.dispatchEvent(new Event('input', { bubbles: true }));
      area.focus();
    },
    refresh() { cm?.refresh(); },
    focus() { cm ? cm.focus() : area.focus(); },
    destroy() {
      if (cm) {
        const text = cm.getValue();
        cm.toTextArea?.();
        area.value = text;
      }
      container.innerHTML = '';
    },
  };
}

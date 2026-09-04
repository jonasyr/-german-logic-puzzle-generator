/** Tiny DOM helpers shared by every screen. */

export const el = id => document.getElementById(id);

export function setHint(id, message, isError = false) {
    const node = el(id);
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', isError);
}

export function clear(node) {
    node.replaceChildren();
    return node;
}

/** Creates an element with optional class, text and attributes in one call. */
export function make(tag, { className, text, attrs } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
}

export function fillRange(select, min, max, selected) {
    clear(select);
    for (let value = min; value <= max; value++) {
        const option = make('option', { text: String(value) });
        option.value = String(value);
        option.selected = value === selected;
        select.append(option);
    }
}

export function fillOptions(select, entries) {
    clear(select);
    for (const { value, label } of entries) {
        const option = make('option', { text: label });
        option.value = value;
        select.append(option);
    }
}

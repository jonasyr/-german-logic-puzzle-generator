/**
 * The armed marking tool, shared by both views.
 *
 * It used to live inside the overview while the pager cycled on tap. A note mark
 * made that split untenable - the pager could not place or clear one - and a
 * four-state cycle is worse than a three-state one. One tool, one behaviour,
 * whichever view you are looking at.
 */

/** Tool id -> the mark it writes. `clear` erases. */
const WRITES = { no: 'no', yes: 'yes', maybe: 'maybe', clear: null };

/**
 * What a tap on a cell should set.
 *
 * `undefined` means "leave the cell exactly as it is", which is how an unarmed
 * tool inspects without changing anything. `null` means "erase".
 */
export function nextMark(current, tool) {
    if (!tool) return undefined;
    const target = WRITES[tool];
    // Armed on the value the cell already holds, a tap takes it back off.
    return current === target && target !== null ? null : target;
}

export function createMarkTool({ buttons, onChange }) {
    /** Crosses dominate a solved grid four to one, so start on one. */
    let tool = 'no';
    let disabled = false;

    function render() {
        for (const button of buttons) {
            const active = !disabled && button.dataset.tool === tool;
            button.disabled = disabled;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        }
        onChange?.(tool);
    }

    const handlers = buttons.map(button => {
        const handler = () => {
            if (disabled) return;
            // Pressing the armed tool disarms it, which is the inspect mode.
            tool = button.dataset.tool === tool ? null : button.dataset.tool;
            render();
        };
        button.addEventListener('click', handler);
        return { button, handler };
    });

    render();

    return {
        current: () => tool,
        setDisabled(next) { disabled = next; render(); },
        destroy() {
            for (const { button, handler } of handlers) button.removeEventListener('click', handler);
        },
    };
}

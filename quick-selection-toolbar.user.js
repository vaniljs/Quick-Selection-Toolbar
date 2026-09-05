// ==UserScript==
// @name         Quick Selection Toolbar
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Миниатюрные иконки «Копировать», «Поиск в Google» и «Закрыть» с позиционированием строго у курсора мыши при любом направлении выделения
// @author       Antigravity
// @match        *://*/*
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // Создаем изолированный контейнер через Shadow DOM
    const host = document.createElement('div');
    host.id = 'tm-selection-toolbar-host';
    host.style.all = 'initial';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // Стили
    const style = document.createElement('style');
    style.textContent = `
        :host {
            all: initial;
            z-index: 2147483647;
            position: absolute;
            top: 0;
            left: 0;
            pointer-events: none;
        }

        .toolbar {
            position: absolute;
            display: inline-flex;
            align-items: center;
            gap: 2px;
            padding: 2.5px 4px;
            background: rgba(30, 31, 35, 0.94);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.13);
            border-radius: 7px;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35), 0 2px 5px rgba(0, 0, 0, 0.18);
            pointer-events: auto;
            user-select: none;
            visibility: hidden;
        }

        .toolbar.visible {
            visibility: visible;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 23px;
            height: 23px;
            padding: 0;
            border: 1px solid transparent;
            background: transparent;
            color: #d1d2d6;
            border-radius: 5px;
            cursor: pointer;
            outline: none;
        }

        .btn:hover {
            background: rgba(255, 255, 255, 0.14);
            color: #ffffff;
        }

        .btn:active {
            transform: scale(0.92);
        }

        .btn svg {
            width: 13px;
            height: 13px;
            fill: currentColor;
            pointer-events: none;
        }

        /* --- Кнопка закрытия (×) --- */
        .btn-close:hover {
            background: rgba(239, 68, 68, 0.22);
            color: #f87171;
        }

        .btn-close svg {
            width: 11.5px;
            height: 11.5px;
        }

        /* --- Успешное копирование --- */
        .btn-copy.success {
            background: rgba(16, 185, 129, 0.25) !important;
            border-color: rgba(16, 185, 129, 0.55) !important;
            color: #34d399 !important;
            box-shadow: 0 0 8px rgba(16, 185, 129, 0.35);
        }

        .btn-copy.success svg {
            fill: #34d399 !important;
        }

        .divider {
            width: 1px;
            height: 12px;
            background: rgba(255, 255, 255, 0.14);
            margin: 0 1px;
        }

        .toolbar.copied-mode .divider,
        .toolbar.copied-mode .btn-search,
        .toolbar.copied-mode .btn-close {
            opacity: 0.25;
            pointer-events: none;
        }
    `;

    // Разметка кнопок
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `
        <button class="btn btn-copy" title="Скопировать" aria-label="Скопировать">
            <svg viewBox="0 0 24 24">
                <path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 4 6 4.9 6 6v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H8V6h11v14z"/>
            </svg>
        </button>
        <div class="divider"></div>
        <button class="btn btn-search" title="Поиск в Google" aria-label="Поиск в Google">
            <svg viewBox="0 0 24 24">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
        </button>
        <div class="divider"></div>
        <button class="btn btn-close" title="Закрыть" aria-label="Закрыть">
            <svg viewBox="0 0 24 24">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
            </svg>
        </button>
    `;

    shadow.appendChild(style);
    shadow.appendChild(toolbar);

    const btnCopy = toolbar.querySelector('.btn-copy');
    const copyIcon = btnCopy.querySelector('svg');
    const btnSearch = toolbar.querySelector('.btn-search');
    const btnClose = toolbar.querySelector('.btn-close');

    const defaultCopySvg = copyIcon.innerHTML;
    const checkSvg = `<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>`;

    let selectedText = '';
    let dismissedText = '';
    let hideTimeout = null;
    let showTimeout = null;
    let lastMousePos = null;

    toolbar.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    function triggerCopySuccess() {
        toolbar.classList.add('copied-mode');
        btnCopy.classList.add('success');
        btnCopy.setAttribute('title', 'Скопировано!');
        copyIcon.innerHTML = checkSvg;

        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            hideToolbar();
            setTimeout(resetCopyButton, 50);
        }, 150);
    }

    btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedText) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(selectedText)
                .then(triggerCopySuccess)
                .catch(() => {
                    fallbackCopy(selectedText);
                    triggerCopySuccess();
                });
        } else {
            fallbackCopy(selectedText);
            triggerCopySuccess();
        }
    });

    btnSearch.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedText) return;
        const query = encodeURIComponent(selectedText);
        window.open(`https://www.google.com/search?q=${query}`, '_blank');
        hideToolbar();
    });

    btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissedText = selectedText;
        clearTimeout(showTimeout);
        hideToolbar();
    });

    function fallbackCopy(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
            return;
        }
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }

    function resetCopyButton() {
        toolbar.classList.remove('copied-mode');
        btnCopy.classList.remove('success');
        btnCopy.setAttribute('title', 'Скопировать');
        copyIcon.innerHTML = defaultCopySvg;
    }

    function hideToolbar() {
        toolbar.classList.remove('visible');
    }

    // Определение выделения, направления и строки курсора
    function getSelectionInfo(mousePos) {
        const selection = window.getSelection();
        let text = selection ? selection.toString().trim() : '';

        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

        if (isInput && typeof activeEl.selectionStart === 'number') {
            const inputSelected = activeEl.value.substring(activeEl.selectionStart, activeEl.selectionEnd).trim();
            if (inputSelected) {
                text = inputSelected;
            }
        }

        if (!text) return null;

        let rects = [];
        let isMultiLine = false;

        if (isInput) {
            const r = activeEl.getBoundingClientRect();
            rects = [r];
            isMultiLine = text.includes('\n');
        } else if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rawRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
            if (rawRects.length === 0) {
                const bounding = range.getBoundingClientRect();
                if (bounding.width > 0 && bounding.height > 0) {
                    rawRects.push(bounding);
                }
            }
            rects = rawRects;

            if (rects.length > 1) {
                const firstTop = rects[0].top;
                const lastTop = rects[rects.length - 1].top;
                if (Math.abs(lastTop - firstTop) > 6) {
                    isMultiLine = true;
                }
            }
        }

        if (rects.length === 0) return null;

        // Вычисляем, где именно находился курсор (начало или конец выделения)
        let cursorRect = rects[rects.length - 1];
        let cursorX = cursorRect.right;
        let isCursorAtTop = false;

        if (mousePos) {
            // Ищем строку, ближайшую к координате мыши Y
            let minDist = Infinity;
            for (const r of rects) {
                const dist = (mousePos.y >= r.top && mousePos.y <= r.bottom) ? 0 :
                             Math.min(Math.abs(mousePos.y - r.top), Math.abs(mousePos.y - r.bottom));
                if (dist < minDist) {
                    minDist = dist;
                    cursorRect = r;
                }
            }
            // Ограничиваем X позицией внутри найденной строки
            cursorX = Math.max(cursorRect.left, Math.min(mousePos.x, cursorRect.right));
            isCursorAtTop = (cursorRect === rects[0]);
        } else {
            // Если выделение сделано с клавиатуры, проверяем обратное направление
            let isBackward = false;
            try {
                if (selection && selection.anchorNode && selection.focusNode) {
                    const position = selection.anchorNode.compareDocumentPosition(selection.focusNode);
                    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
                        isBackward = true;
                    } else if (selection.anchorNode === selection.focusNode && selection.focusOffset < selection.anchorOffset) {
                        isBackward = true;
                    }
                }
            } catch (e) {}

            if (isBackward) {
                cursorRect = rects[0];
                cursorX = cursorRect.left;
                isCursorAtTop = true;
            } else {
                cursorRect = rects[rects.length - 1];
                cursorX = cursorRect.right;
                isCursorAtTop = false;
            }
        }

        return {
            text,
            firstRect: rects[0],
            lastRect: rects[rects.length - 1],
            cursorRect,
            cursorX,
            isCursorAtTop,
            isMultiLine
        };
    }

    function handleSelection(mousePos) {
        if (btnCopy.classList.contains('success')) return;

        const info = getSelectionInfo(mousePos);
        if (!info) {
            dismissedText = '';
            hideToolbar();
            return;
        }

        if (info.text === dismissedText) {
            return;
        }
        dismissedText = '';

        selectedText = info.text;
        resetCopyButton();

        const tbWidth = toolbar.offsetWidth || 84;
        const tbHeight = toolbar.offsetHeight || 29;

        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

        // Центрируем блок точно по реальному положению курсора
        let left = info.cursorX + scrollX - (tbWidth / 2);

        // Предотвращение выхода за границы экрана
        const padding = 8;
        const maxLeft = scrollX + window.innerWidth - tbWidth - padding;
        const minLeft = scrollX + padding;
        left = Math.max(minLeft, Math.min(left, maxLeft));

        let top;
        const offset = 6;

        if (info.isMultiLine) {
            // Если выделяли снизу вверх (курсор на верхней строке) — выводим сверху, чтобы не закрывать текст ниже
            if (info.isCursorAtTop) {
                top = info.cursorRect.top + scrollY - tbHeight - offset;
                if (info.cursorRect.top - tbHeight - offset < 0) {
                    top = info.cursorRect.bottom + scrollY + offset;
                }
            } else {
                // Если выделяли сверху вниз (курсор на нижней строке) — выводим снизу
                top = info.cursorRect.bottom + scrollY + offset;
                if (info.cursorRect.bottom + offset + tbHeight > window.innerHeight) {
                    top = info.cursorRect.top + scrollY - tbHeight - offset;
                }
            }
        } else {
            // 1 строка: всегда сверху над строкой у курсора
            top = info.cursorRect.top + scrollY - tbHeight - offset;
            if (info.cursorRect.top - tbHeight - offset < 0) {
                top = info.cursorRect.bottom + scrollY + offset;
            }
        }

        toolbar.style.left = `${Math.round(left)}px`;
        toolbar.style.top = `${Math.round(top)}px`;
        toolbar.classList.add('visible');
    }

    // Сохраняем реальную точку отпускания мыши
    document.addEventListener('mouseup', (e) => {
        if (e.composedPath().includes(host) || e.composedPath().includes(toolbar)) {
            return;
        }
        lastMousePos = { x: e.clientX, y: e.clientY };
        clearTimeout(showTimeout);
        showTimeout = setTimeout(() => handleSelection(lastMousePos), 70);
    });

    document.addEventListener('keyup', (e) => {
        if (['Shift', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            clearTimeout(showTimeout);
            showTimeout = setTimeout(() => handleSelection(null), 70);
        }
    });

    document.addEventListener('mousedown', (e) => {
        clearTimeout(showTimeout);
        if (e.composedPath().includes(host) || e.composedPath().includes(toolbar)) {
            return;
        }
        hideToolbar();
    });
})();

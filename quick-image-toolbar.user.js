// ==UserScript==
// @name         Quick Image Toolbar
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Миниатюрные иконки «Копировать», «Поиск по картинке в Google» и «Закрыть» для всех форматов изображений (JPG, PNG, WebP, AVIF, SVG, GIF)
// @author       Antigravity
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // Создаем изолированный Shadow DOM
    const host = document.createElement('div');
    host.id = 'tm-image-toolbar-host';
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

    // Разметка кнопок: Копировать, Поиск по картинке, Закрыть
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `
        <button class="btn btn-copy" title="Скопировать изображение" aria-label="Скопировать изображение">
            <svg viewBox="0 0 24 24">
                <path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zm3 4H8C6.9 4 6 4.9 6 6v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H8V6h11v14z"/>
            </svg>
        </button>
        <div class="divider"></div>
        <button class="btn btn-search" title="Поиск по картинке в Google" aria-label="Поиск по картинке в Google">
            <svg viewBox="0 0 24 24">
                <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
                <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
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

    let currentImg = null;
    let dismissedImg = null;
    let showTimeout = null;
    let hideTimeout = null;
    let copyStatusTimeout = null;

    toolbar.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    toolbar.addEventListener('mouseenter', () => {
        clearTimeout(hideTimeout);
    });

    toolbar.addEventListener('mouseleave', () => {
        scheduleHide();
    });

    function triggerCopySuccess() {
        toolbar.classList.add('copied-mode');
        btnCopy.classList.add('success');
        btnCopy.setAttribute('title', 'Скопировано!');
        copyIcon.innerHTML = checkSvg;

        clearTimeout(copyStatusTimeout);
        copyStatusTimeout = setTimeout(() => {
            hideToolbar();
            setTimeout(resetCopyButton, 50);
        }, 150);
    }

    // Универсальное копирование любых форматов (JPG, JPEG, PNG, WebP, AVIF, SVG, GIF, Data URL)
    async function copyImageToClipboard(img) {
        const src = img.currentSrc || img.src;
        if (!src) return;

        // Способ 1: Прямой захват через Canvas (самый быстрый, работает для любых форматов если нет CORS)
        try {
            const width = img.naturalWidth || img.width || 300;
            const height = img.naturalHeight || img.height || 300;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            if (blob) {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                triggerCopySuccess();
                return;
            }
        } catch (e) {
            // Если Canvas заблокирован политикой CORS страницы — используем загрузку через Tampermonkey
        }

        // Вспомогательная функция обработки загруженного бинарного Blob (любого формата)
        const processBlob = async (blob) => {
            try {
                let imgSource;
                try {
                    // Декодируем JPG, WebP, AVIF, GIF, PNG
                    imgSource = await createImageBitmap(blob);
                } catch (err) {
                    // Fallback для векторного SVG или форматов без поддержки createImageBitmap
                    imgSource = await new Promise((resolve, reject) => {
                        const tempImg = new Image();
                        const blobUrl = URL.createObjectURL(blob);
                        tempImg.onload = () => {
                            URL.revokeObjectURL(blobUrl);
                            resolve(tempImg);
                        };
                        tempImg.onerror = reject;
                        tempImg.src = blobUrl;
                    });
                }

                const canvas = document.createElement('canvas');
                canvas.width = imgSource.naturalWidth || imgSource.width;
                canvas.height = imgSource.naturalHeight || imgSource.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgSource, 0, 0);

                // Браузеры помещают изображения в буфер обмена в стандартном формате image/png
                const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
                triggerCopySuccess();
            } catch (err) {
                // Если буфер системы заблокировал бинарные данные — копируем ссылку
                fallbackCopyText(src);
            }
        };

        // Если это Data URL (base64)
        if (src.startsWith('data:')) {
            try {
                const res = await fetch(src);
                const blob = await res.blob();
                await processBlob(blob);
            } catch (e) {
                fallbackCopyText(src);
            }
            return;
        }

        // Способ 2: Загрузка через GM_xmlhttpRequest в обход всех CORS-ограничений сайта
        if (typeof GM_xmlhttpRequest === 'function') {
            GM_xmlhttpRequest({
                method: 'GET',
                url: src,
                responseType: 'blob',
                onload: (res) => processBlob(res.response),
                onerror: () => fallbackCopyText(src)
            });
        } else {
            try {
                const res = await fetch(src, { mode: 'cors' });
                const blob = await res.blob();
                await processBlob(blob);
            } catch (e) {
                fallbackCopyText(src);
            }
        }
    }

    function fallbackCopyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(triggerCopySuccess);
        } else if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
            triggerCopySuccess();
        }
    }

    btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentImg) {
            copyImageToClipboard(currentImg);
        }
    });

    // Поиск по картинке через Google Lens
    btnSearch.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentImg) return;
        const src = currentImg.currentSrc || currentImg.src;
        if (!src) return;

        if (src.startsWith('http://') || src.startsWith('https://')) {
            window.open(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(src)}`, '_blank');
        } else {
            window.open(src, '_blank');
        }
        hideToolbar();
    });

    // Кнопка закрытия (×)
    btnClose.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissedImg = currentImg;
        clearTimeout(showTimeout);
        hideToolbar();
    });

    function resetCopyButton() {
        toolbar.classList.remove('copied-mode');
        btnCopy.classList.remove('success');
        btnCopy.setAttribute('title', 'Скопировать изображение');
        copyIcon.innerHTML = defaultCopySvg;
    }

    function hideToolbar() {
        toolbar.classList.remove('visible');
    }

    function scheduleHide() {
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(hideToolbar, 120);
    }

    function positionToolbar(img) {
        const rect = img.getBoundingClientRect();

        // Пропускаем слишком мелкие иконки (< 50x50px)
        if (rect.width < 50 || rect.height < 50) {
            hideToolbar();
            return;
        }

        const tbWidth = toolbar.offsetWidth || 84;
        const tbHeight = toolbar.offsetHeight || 29;

        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

        // Внутри картинки: слева внизу с отступом 8px
        const offset = 8;
        const left = rect.left + scrollX + offset;
        const top = rect.bottom + scrollY - tbHeight - offset;

        toolbar.style.left = `${Math.round(left)}px`;
        toolbar.style.top = `${Math.round(top)}px`;
        toolbar.classList.add('visible');
    }

    // Отслеживание наведения на изображения
    document.addEventListener('mouseover', (e) => {
        const target = e.target;
        if (!target || target.tagName !== 'IMG') return;

        if (target === dismissedImg) return;

        currentImg = target;
        clearTimeout(hideTimeout);
        clearTimeout(showTimeout);

        showTimeout = setTimeout(() => {
            if (currentImg === target) {
                resetCopyButton();
                positionToolbar(target);
            }
        }, 70);
    });

    document.addEventListener('mouseout', (e) => {
        const target = e.target;
        if (target && target.tagName === 'IMG' && target === currentImg) {
            dismissedImg = null;
            scheduleHide();
        }
    });

    // Обновление позиции при скролле
    window.addEventListener('scroll', () => {
        if (toolbar.classList.contains('visible') && currentImg) {
            positionToolbar(currentImg);
        }
    }, { passive: true });
})();

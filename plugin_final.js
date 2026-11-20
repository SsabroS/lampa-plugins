(function () {
    'use strict';

    if (!window.Lampa || window.dashenkaDashaLoaderReady) return;
    window.dashenkaDashaLoaderReady = true;

    var skazUrl = 'https://cdn.jsdelivr.net/gh/SsabroS/lampa-plugins@149884ac17a7d9886cc3ef8a9340d5f0b4b768f5/plugin_final.js';
    var xsenaUrl = 'https://e.xsena.red/';

    function renameMenuItems() {
        renameItem('sisi', 'Дашенька');
        renameItem('xsena', 'Даша');
    }

    function renameItem(action, name) {
        var labels = document.querySelectorAll(
            '.menu [data-action="' + action + '"] .menu__text'
        );

        for (var index = 0; index < labels.length; index++) {
            if (labels[index].textContent !== name) {
                labels[index].textContent = name;
            }
        }
    }

    function loadPlugin(url, name, onComplete) {
        var script = document.createElement('script');
        script.src = url;

        script.onload = function () {
            renameMenuItems();
            if (onComplete) onComplete();
        };

        script.onerror = function () {
            console.error('Lampa: не удалось загрузить «' + name + '»');
            if (onComplete) onComplete();
        };

        document.head.appendChild(script);
    }

    function start() {
        var style = document.createElement('style');
        style.textContent = '.ad-preroll { display: none !important; }';
        document.head.appendChild(style);

        var observer = new MutationObserver(renameMenuItems);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        loadPlugin(skazUrl, 'Дашенька', function () {
            loadPlugin(xsenaUrl, 'Даша');
        });
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();

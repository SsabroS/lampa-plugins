(function () {
    'use strict';

    if (!window.Lampa || window.dashenkaUnifiedStarted) return;
    window.dashenkaUnifiedStarted = true;

    var adapters = {};
    window.dashenkaUnifiedAdapters = adapters;

    var sources = [
        {
            id: 'skaz',
            name: 'Skaz',
            url: 'https://cdn.jsdelivr.net/gh/SsabroS/lampa-plugins@149884ac17a7d9886cc3ef8a9340d5f0b4b768f5/plugin_final.js'
        },
        {
            id: 'xsena',
            name: 'Xsena',
            url: 'https://e.xsena.red/'
        }
    ];

    function prepareScript(code, source) {
        var menuBlock = /function add\(\)\s*\{[\s\S]*?function init\(\)\s*\{([\s\S]*?)(?=\r?\n\s*if \(window\.appready\) init\(\);)/;
        var entryPoint = 'function startPlugin() {';

        if (!menuBlock.test(code) || code.indexOf(entryPoint) === -1) {
            throw new Error('Изменилась структура плагина ' + source.name);
        }

        code = code.replace(menuBlock, function (block, initBody) {
            if (source.id === 'xsena') {
                return 'function init() { addFilter(); addSettings(); }';
            }

            return 'function init() {' + initBody.replace(/^\s*add\(\);/, '');
        });

        if (source.id === 'xsena') {
            code = code
                .replace(/lampac_sisiname/g, 'xsena_sisiname')
                .replace(/sisi_add_param_ready/g, 'xsena_add_param_ready')
                .replace(/component: 'sisi'/g, "component: 'xsena'")
                .replace(/sisi_preview/g, 'xsena_preview')
                .replace(/sisi_history/g, 'xsena_history');
        } else {
            code = code.replace(/Клубничка/g, 'Дашенька');
        }

        return code.replace(entryPoint, function () {
            return entryPoint +
                '\nwindow.dashenkaUnifiedAdapters[' + JSON.stringify(source.id) + '] = {' +
                'menu: function (ok, fail) { Api.menu(ok, fail); },' +
                'key: Defined.use_api,' +
                'format: Utils.sourceTitle' +
                (source.id === 'xsena' ? ', showError: modal' : '') +
                '};';
        });
    }

    function installSource(source) {
        return fetch(source.url).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.text();
        }).then(function (code) {
            var prepared = prepareScript(code, source);

            return new Promise(function (resolve, reject) {
                var url = URL.createObjectURL(new Blob([prepared], {
                    type: 'application/javascript'
                }));
                var script = document.createElement('script');

                function finish(error) {
                    URL.revokeObjectURL(url);
                    if (script.parentNode) script.parentNode.removeChild(script);
                    if (error) reject(error);
                    else resolve();
                }

                script.src = url;
                script.onload = function () {
                    finish(adapters[source.id] ? null : new Error('Источник не зарегистрирован'));
                };
                script.onerror = function () {
                    finish(new Error('Не удалось запустить скрипт'));
                };
                document.head.appendChild(script);
            });
        }).catch(function (error) {
            console.error('Дашенька: ' + source.name, error);
        });
    }

    function readSites(source) {
        return new Promise(function (resolve) {
            var adapter = adapters[source.id];

            function unavailable(message) {
                resolve([{
                    title: source.name + ' — сведения о доступе',
                    open: function () {
                        if (adapter && adapter.showError && typeof message === 'string') {
                            adapter.showError(message);
                        } else {
                            Lampa.Noty.show(
                                typeof message === 'string' ? message : 'Источник недоступен'
                            );
                        }
                    }
                }]);
            }

            if (!adapter) {
                unavailable();
                return;
            }

            var timer = setTimeout(unavailable, 10000);

            try {
                adapter.menu(function (sites) {
                    clearTimeout(timer);
                    if (!Array.isArray(sites)) {
                        unavailable();
                        return;
                    }

                    resolve(sites.map(function (site) {
                        var title = typeof site.title === 'string' && site.title
                            ? adapter.format(site.title)
                            : source.name;

                        return {
                            title: title,
                            open: function () {
                                Lampa.Activity.push({
                                    url: site.playlist_url || '',
                                    title: title,
                                    component: (site.playlist_url ? 'sisi_view_' : 'sisi_') + adapter.key,
                                    page: 1
                                });
                            }
                        };
                    }));
                }, function (message) {
                    clearTimeout(timer);
                    unavailable(message);
                });
            } catch (error) {
                clearTimeout(timer);
                unavailable();
            }
        });
    }

    var opening = false;

    function openMenu() {
        if (opening) return;
        opening = true;

        Promise.all(sources.map(readSites)).then(function (groups) {
            opening = false;
            var items = [].concat.apply([], groups);

            if (!items.length) {
                Lampa.Noty.show('Список сайтов пуст');
                return;
            }

            Lampa.Select.show({
                title: 'Дашенька',
                items: items,
                onSelect: function (item) { item.open(); },
                onBack: function () { Lampa.Controller.toggle('menu'); }
            });
        });
    }

    function start() {
        var style = document.createElement('style');
        style.textContent = '.ad-preroll { display: none !important; }';
        document.head.appendChild(style);

        Promise.all(sources.map(installSource)).then(function () {
            Lampa.Menu.addButton('<span aria-hidden="true">★</span>', 'Дашенька', function () {
                var control = Lampa.ParentalControl;
                if (control && typeof control.query === 'function') {
                    control.query(openMenu, function () {});
                } else {
                    openMenu();
                }
            });
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

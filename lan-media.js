
(function () {
    'use strict';

    if (window.lan_media_initialized) return;
    window.lan_media_initialized = true;

    var VERSION = '0.5.0';
    var STORAGE_KEY = 'lan_media_devices';

    var DEFAULT_DEVICES = [
        {
            id: 'synology',
            name: 'Synology DS118',
            type: 'synology',
            ip: '192.168.1.118',
            port: '5000'
        },
        {
            id: 'qnap',
            name: 'QNAP TS-462',
            type: 'qnap',
            ip: '192.168.1.62',
            port: '8080'
        }
    ];

    var devices = [];

    function loadDevices() {
        try {
            var saved = Lampa.Storage.get(STORAGE_KEY);
            devices = saved && Array.isArray(saved)
                ? saved
                : DEFAULT_DEVICES.slice();
        } catch (e) {
            devices = DEFAULT_DEVICES.slice();
        }
    }

    function saveDevices() {
        try {
            Lampa.Storage.set(STORAGE_KEY, devices);
        } catch (e) {
            console.log('[LAN Media] Storage error:', e);
        }
    }

    function getDevice(id) {
        return devices.find(function (device) {
            return device.id === id;
        });
    }

    function notify(message) {
        Lampa.Noty.show(message, { time: 3500 });
    }

    function getURL(device) {
        return 'http://' + device.ip + ':' + device.port;
    }

    // --------------------------------------------------
    // HTTP-запросы к NAS
    // --------------------------------------------------

    function request(url, callback) {
        if (!$ || !$.ajax) {
            callback('jQuery AJAX недоступен');
            return;
        }

        $.ajax({
            url: url,
            method: 'GET',
            dataType: 'text',
            timeout: 10000,
            cache: false,

            success: function (response) {
                callback(null, response);
            },

            error: function (xhr, status, error) {
                callback(
                    error ||
                    status ||
                    'Ошибка HTTP: ' + xhr.status
                );
            }
        });
    }

    function checkSynology(device, callback) {
        var url = getURL(device) +
            '/webapi/entry.cgi' +
            '?api=SYNO.API.Info' +
            '&version=1' +
            '&method=query' +
            '&query=SYNO.API.Auth,SYNO.FileStation.List';

        request(url, function (error, response) {
            if (error) {
                callback({
                    ok: false,
                    message: 'Не удалось обратиться к DSM API',
                    details: String(error)
                });
                return;
            }

            var data;

            try {
                data = JSON.parse(response);
            } catch (e) {
                callback({
                    ok: false,
                    message: 'Некорректный ответ Synology',
                    details: String(response).substring(0, 250)
                });
                return;
            }

            if (data.success === true) {
                callback({
                    ok: true,
                    message: 'DSM API доступен',
                    details: 'File Station обнаружен. Для чтения папок может потребоваться авторизация.'
                });
            } else {
                callback({
                    ok: false,
                    message: 'Synology вернул ошибку',
                    details: JSON.stringify(data)
                });
            }
        });
    }

    function checkQNAP(device, callback) {
        var url = getURL(device) +
            '/cgi-bin/filemanager/utilRequest.cgi' +
            '?func=get_tree' +
            '&is_iso=0' +
            '&node=share_root';

        request(url, function (error, response) {
            if (error) {
                callback({
                    ok: false,
                    message: 'Не удалось обратиться к QNAP',
                    details: String(error)
                });
                return;
            }

            var data;

            try {
                data = JSON.parse(response);
            } catch (e) {
                callback({
                    ok: false,
                    message: 'QNAP вернул неизвестный ответ',
                    details: String(response).substring(0, 250)
                });
                return;
            }

            if (data.success === true && String(data.status) === '0') {
                callback({
                    ok: true,
                    message: 'QNAP File Station доступен',
                    details: 'Ответ получен'
                });
            } else {
                callback({
                    ok: false,
                    message: 'QNAP ответил, но список папок не получен',
                    details: JSON.stringify(data)
                });
            }
        });
    }

    function checkDevice(device, callback) {
        if (device.type === 'synology') {
            checkSynology(device, callback);
        } else if (device.type === 'qnap') {
            checkQNAP(device, callback);
        } else {
            callback({
                ok: false,
                message: 'Неизвестный тип устройства'
            });
        }
    }

    // --------------------------------------------------
    // Интерфейс
    // --------------------------------------------------

    function addStyles() {
        if ($('#lan-media-styles').length) return;

        $('head').append(
            '<style id="lan-media-styles">' +

            '.lan-media-page{' +
                'padding:2em;' +
                'box-sizing:border-box;' +
                'width:100%;' +
                'color:inherit;' +
            '}' +

            '.lan-media-title{' +
                'font-size:2em;' +
                'font-weight:600;' +
                'margin-bottom:.3em;' +
            '}' +

            '.lan-media-subtitle{' +
                'opacity:.65;' +
                'margin-bottom:2em;' +
            '}' +

            '.lan-media-device{' +
                'border:1px solid rgba(128,128,128,.3);' +
                'border-radius:12px;' +
                'padding:1.2em;' +
                'margin-bottom:1.2em;' +
            '}' +

            '.lan-media-device-title{' +
                'font-size:1.25em;' +
                'font-weight:600;' +
                'margin-bottom:.3em;' +
            '}' +

            '.lan-media-device-type{' +
                'font-size:.8em;' +
                'opacity:.5;' +
                'margin-bottom:1em;' +
            '}' +

            '.lan-media-fields{' +
                'display:flex;' +
                'gap:1em;' +
                'flex-wrap:wrap;' +
                'margin-bottom:1em;' +
            '}' +

            '.lan-media-field{' +
                'flex:1;' +
                'min-width:130px;' +
            '}' +

            '.lan-media-field label{' +
                'display:block;' +
                'font-size:.8em;' +
                'opacity:.6;' +
                'margin-bottom:.4em;' +
            '}' +

            '.lan-media-field input{' +
                'width:100%;' +
                'box-sizing:border-box;' +
                'padding:.8em;' +
                'border-radius:7px;' +
                'border:1px solid rgba(128,128,128,.4);' +
                'background:rgba(128,128,128,.1);' +
                'color:inherit;' +
                'font-size:1em;' +
            '}' +

            '.lan-media-button{' +
                'display:block;' +
                'width:100%;' +
                'padding:1em;' +
                'border:0;' +
                'border-radius:8px;' +
                'background:rgba(128,128,128,.2);' +
                'color:inherit;' +
                'font-size:1em;' +
                'margin-top:.7em;' +
                'text-align:center;' +
                'box-sizing:border-box;' +
            '}' +

            '.lan-media-button.focus,' +
            '.lan-media-button:focus{' +
                'background:rgba(128,128,128,.45);' +
                'outline:2px solid rgba(255,255,255,.6);' +
            '}' +

            '.lan-media-status{' +
                'margin-top:.8em;' +
                'font-size:.9em;' +
                'overflow-wrap:anywhere;' +
                'opacity:.8;' +
            '}' +

            '.lan-media-footer{' +
                'margin-top:2em;' +
                'text-align:center;' +
                'opacity:.4;' +
                'font-size:.8em;' +
            '}' +

            '</style>'
        );
    }

    function deviceHTML(device) {
        return '' +
            '<div class="lan-media-device" data-id="' +
                device.id + '">' +

                '<div class="lan-media-device-title">' +
                    device.name +
                '</div>' +

                '<div class="lan-media-device-type">' +
                    device.type.toUpperCase() +
                '</div>' +

                '<div class="lan-media-fields">' +

                    '<div class="lan-media-field">' +
                        '<label>IP-адрес</label>' +
                        '<input class="lan-media-ip" ' +
                            'value="' + device.ip + '" />' +
                    '</div>' +

                    '<div class="lan-media-field">' +
                        '<label>Порт</label>' +
                        '<input class="lan-media-port" ' +
                            'value="' + device.port + '" />' +
                    '</div>' +

                '</div>' +

                '<div class="lan-media-button selector" ' +
                    'tabindex="0" role="button" ' +
                    'data-action="test" data-id="' +
                    device.id + '">' +
                    'Проверить подключение' +
                '</div>' +

                '<div class="lan-media-status" data-status="' +
                    device.id + '">' +
                    'Ожидает проверки' +
                '</div>' +

            '</div>';
    }

    // --------------------------------------------------
    // Экран LAN Media
    // --------------------------------------------------

    function LanMedia() {
        var html;

        this.create = function () {
            addStyles();

            var content = '';

            devices.forEach(function (device) {
                content += deviceHTML(device);
            });

            html = $(
                '<div class="lan-media-page">' +

                    '<div class="lan-media-title">' +
                        '🗄 LAN Media' +
                    '</div>' +

                    '<div class="lan-media-subtitle">' +
                        'Домашняя медиатека · Версия ' +
                        VERSION +
                    '</div>' +

                    '<div class="lan-media-devices">' +
                        content +
                    '</div>' +

                    '<div class="lan-media-button selector" ' +
                        'tabindex="0" role="button" ' +
                        'data-action="scan">' +
                        '🔎 Проверить все NAS' +
                    '</div>' +

                    '<div class="lan-media-button selector" ' +
                        'tabindex="0" role="button" ' +
                        'data-action="save">' +
                        'Сохранить настройки' +
                    '</div>' +

                    '<div class="lan-media-footer">' +
                        'LAN Media · Synology / QNAP' +
                    '</div>' +

                '</div>'
            );

            bindEvents();

            return html;
        };

        this.start = function () {};
        this.render = function () {
            return html;
        };

        this.destroy = function () {
            if (html) {
                html.off();
                html.remove();
            }
        };

        function updateStatus(id, message) {
            html.find('[data-status="' + id + '"]').text(message);
        }

        function saveFields() {
            html.find('.lan-media-device').each(function () {
                var id = $(this).attr('data-id');
                var device = getDevice(id);

                if (!device) return;

                var ip = $(this).find('.lan-media-ip').val().trim();
                var port = $(this).find('.lan-media-port').val().trim();

                if (ip) device.ip = ip;
                if (port) device.port = port;
            });

            saveDevices();
        }

        function runTest(id) {
            saveFields();

            var device = getDevice(id);
            if (!device) return;

            updateStatus(id, 'Проверяем подключение...');

            checkDevice(device, function (result) {
                var message = result.ok
                    ? '✓ ' + result.message
                    : '✗ ' + result.message;

                if (result.details) {
                    message += ' — ' + result.details;
                }

                updateStatus(id, message);

                console.log('[LAN Media]', device.name, result);
                notify(device.name + ': ' + result.message);
            });
        }

        function scanAll() {
            saveFields();

            devices.forEach(function (device) {
                runTest(device.id);
            });
        }

        function handleAction(element) {
            var action = $(element).attr('data-action');
            var id = $(element).attr('data-id');

            if (action === 'test') {
                runTest(id);
            } else if (action === 'scan') {
                scanAll();
            } else if (action === 'save') {
                saveFields();
                notify('Настройки LAN Media сохранены');
            }
        }

        function bindEvents() {
            // Событие Lampa для ТВ-пульта
            html.on(
                'hover:enter',
                '.lan-media-button[data-action]',
                function () {
                    handleAction(this);
                }
            );

            // Мышь и сенсорный экран
            html.on(
                'click',
                '.lan-media-button[data-action]',
                function () {
                    handleAction(this);
                }
            );
        }
    }

    // --------------------------------------------------
    // Кнопка в главном меню Lampa
    // --------------------------------------------------

    function openLanMedia() {
        var items = [];

        devices.forEach(function (device) {
            items.push({
                title: 'Проверить ' + device.name,
                open: function () {
                    checkDevice(device, function (result) {
                        var message = result.ok
                            ? '✓ ' + result.message
                            : '✗ ' + result.message;

                        if (result.details) {
                            message += ' — ' + result.details;
                        }

                        console.log('[LAN Media]', device.name, result);
                        notify(device.name + ': ' + message);
                    });
                }
            });
        });

        items.push({
            title: 'Проверить все NAS',
            open: function () {
                devices.forEach(function (device) {
                    checkDevice(device, function (result) {
                        var message = result.ok
                            ? '✓ ' + result.message
                            : '✗ ' + result.message;

                        if (result.details) {
                            message += ' — ' + result.details;
                        }

                        console.log('[LAN Media]', device.name, result);
                        notify(device.name + ': ' + message);
                    });
                });
            }
        });

        if (Lampa.Select && typeof Lampa.Select.show === 'function') {
            Lampa.Select.show({
                title: 'LAN Media',
                items: items,
                onSelect: function (item) {
                    if (item && typeof item.open === 'function') item.open();
                },
                onBack: function () {
                    if (Lampa.Controller && typeof Lampa.Controller.toggle === 'function') {
                        Lampa.Controller.toggle('menu');
                    }
                }
            });
        } else {
            notify('В этой версии Lampa недоступен штатный список Select');
            console.error('[LAN Media] Lampa.Select.show is unavailable');
        }
    }

    function addMenuButton() {
        if (!window.Lampa || !Lampa.Menu) return;

        if (window.lan_media_menu_added) return;
        window.lan_media_menu_added = true;

        if (typeof Lampa.Menu.addButton === 'function') {
            // Тот же штатный метод, который проверен в test.js
            Lampa.Menu.addButton('🗄️', 'LAN MEDIA', function () {
                openLanMedia();
            });

            console.log('[LAN Media] Menu button added through Lampa.Menu.addButton');
        } else {
            // Резервный способ для сборок без Menu.addButton
            var button = $('<li class="menu__item selector"><div class="menu__ico">🗄️</div><div class="menu__text">LAN MEDIA</div></li>');

            button.on('hover:enter', function () {
                openLanMedia();
            });

            $('.menu .menu__list').eq(0).prepend(button);
            console.log('[LAN Media] Menu button added through jQuery fallback');
        }
    }

    // --------------------------------------------------
    // Запуск плагина
    // --------------------------------------------------

    function init() {
        if (!window.Lampa) {
            console.log('[LAN Media] Waiting for Lampa...');
            return;
        }

        loadDevices();

        Lampa.Component.add('lan_media', LanMedia);

        if (window.appready) {
            setTimeout(addMenuButton, 1000);
        } else {
            Lampa.Listener.follow('app', function (event) {
                if (event.type === 'ready') {
                    setTimeout(addMenuButton, 1000);
                }
            });
        }

        console.log('[LAN Media] Initialized. Version:', VERSION);
    }

    init();

})();

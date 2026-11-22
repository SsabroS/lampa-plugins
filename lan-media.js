
/*
 * LAN Media for Lampa
 * Version: 0.1.0
 * NAS: Synology DSM / QNAP QTS
 *
 * First stage:
 * - NAS connection diagnostics
 * - Synology API discovery
 * - QNAP File Station response
 * - Local IP/port settings
 *
 * No Windows server required.
 */

(function () {
    'use strict';

    if (window.lan_media_loaded) return;
    window.lan_media_loaded = true;

    var VERSION = '0.1.0';
    var PREFIX = 'lan_media_';

    var DEFAULT_NAS = [
        {
            id: 'synology',
            name: 'Synology DS118',
            ip: '192.168.1.118',
            port: '5000',
            type: 'synology'
        },
        {
            id: 'qnap',
            name: 'QNAP TS-462',
            ip: '192.168.1.62',
            port: '8080',
            type: 'qnap'
        }
    ];

    var NAS = [];
    var html;
    var scanning = false;

    function storageGet(key, fallback) {
        try {
            var value = Lampa.Storage.get(PREFIX + key, fallback);
            return value === undefined || value === null ? fallback : value;
        } catch (e) {
            return fallback;
        }
    }

    function storageSet(key, value) {
        try {
            Lampa.Storage.set(PREFIX + key, value);
        } catch (e) {
            console.log('[LAN Media] Storage error:', e);
        }
    }

    function loadNAS() {
        var saved = storageGet('devices', null);

        if (saved && Array.isArray(saved)) {
            NAS = saved;
        } else {
            NAS = DEFAULT_NAS.slice();
            saveNAS();
        }
    }

    function saveNAS() {
        storageSet('devices', NAS);
    }

    function baseURL(device) {
        return 'http://' + device.ip + ':' + device.port;
    }

    function notify(message) {
        try {
            Lampa.Noty.show(message, { time: 4000 });
        } catch (e) {
            console.log('[LAN Media]', message);
        }
    }

    function request(url, callback) {
        var net = new Lampa.Reguest();

        net.timeout(8000);

        net.silent(
            url,
            function (data) {
                callback(null, data);
            },
            function (error) {
                callback(error || new Error('Connection error'), null);
            },
            false,
            { dataType: 'text' }
        );
    }

    function testSynology(device, callback) {
        var url = baseURL(device) +
            '/webapi/entry.cgi' +
            '?api=SYNO.API.Info' +
            '&version=1' +
            '&method=query' +
            '&query=SYNO.API.Auth,SYNO.FileStation.List';

        request(url, function (error, response) {
            if (error) {
                return callback({
                    ok: false,
                    message: 'Нет ответа от DSM API'
                });
            }

            var data;

            try {
                data = typeof response === 'string'
                    ? JSON.parse(response)
                    : response;
            } catch (e) {
                return callback({
                    ok: false,
                    message: 'Некорректный ответ DSM'
                });
            }

            if (data && data.success === true) {
                return callback({
                    ok: true,
                    message: 'DSM API доступен',
                    details: 'File Station API обнаружен'
                });
            }

            callback({
                ok: false,
                message: 'DSM API вернул ошибку',
                details: JSON.stringify(data)
            });
        });
    }

    function testQNAP(device, callback) {
        var url = baseURL(device) +
            '/cgi-bin/filemanager/utilRequest.cgi' +
            '?func=get_tree' +
            '&is_iso=0' +
            '&node=share_root';

        request(url, function (error, response) {
            if (error) {
                return callback({
                    ok: false,
                    message: 'Нет ответа от QNAP File Station'
                });
            }

            var data;

            try {
                data = typeof response === 'string'
                    ? JSON.parse(response)
                    : response;
            } catch (e) {
                return callback({
                    ok: true,
                    message: 'HTTP отвечает',
                    details: 'Получен нестандартный ответ File Station'
                });
            }

            if (data && data.success === true) {
                if (String(data.status) === '0') {
                    return callback({
                        ok: true,
                        message: 'QNAP File Station доступен',
                        details: 'Ответ получен'
                    });
                }

                return callback({
                    ok: true,
                    message: 'QNAP отвечает',
                    details: 'Код File Station: ' + data.status +
                        '. Возможно, нужна авторизация.'
                });
            }

            callback({
                ok: false,
                message: 'Ошибка QNAP API',
                details: JSON.stringify(data)
            });
        });
    }

    function testDevice(device, callback) {
        if (device.type === 'synology') {
            testSynology(device, callback);
        } else if (device.type === 'qnap') {
            testQNAP(device, callback);
        } else {
            callback({
                ok: false,
                message: 'Неизвестный тип NAS'
            });
        }
    }

    function render() {
        var devicesHTML = '';

        NAS.forEach(function (device) {
            devicesHTML +=
                '<div class="lan-media-device" data-id="' +
                device.id + '">' +

                    '<div class="lan-media-device__header">' +
                        '<div>' +
                            '<div class="lan-media-device__name">' +
                                device.name +
                            '</div>' +
                            '<div class="lan-media-device__type">' +
                                device.type.toUpperCase() +
                            '</div>' +
                        '</div>' +
                        '<div class="lan-media-status" data-status="' +
                            device.id + '">' +
                            'Не проверен' +
                        '</div>' +
                    '</div>' +

                    '<div class="lan-media-fields">' +
                        '<div class="lan-media-field">' +
                            '<span>IP-адрес</span>' +
                            '<input class="lan-media-ip" value="' +
                                device.ip + '" />' +
                        '</div>' +

                        '<div class="lan-media-field">' +
                            '<span>Порт</span>' +
                            '<input class="lan-media-port" value="' +
                                device.port + '" />' +
                        '</div>' +
                    '</div>' +

                    '<div class="lan-media-result" data-result="' +
                        device.id + '">' +
                    '</div>' +

                    '<button class="lan-media-test selector" data-test="' +
                        device.id + '">' +
                        'Проверить подключение' +
                    '</button>' +

                '</div>';
        });

        html = $(
            '<div class="lan-media-page">' +

                '<div class="lan-media-heading">' +
                    '<div class="lan-media-title">LAN Media</div>' +
                    '<div class="lan-media-version">Версия ' +
                        VERSION + '</div>' +
                '</div>' +

                '<div class="lan-media-description">' +
                    'Домашняя медиатека Synology и QNAP' +
                '</div>' +

                '<div class="lan-media-devices">' +
                    devicesHTML +
                '</div>' +

                '<button class="lan-media-save selector">' +
                    'Сохранить настройки' +
                '</button>' +

                '<div class="lan-media-footer">' +
                    'LAN Media · SMB / HTTP API' +
                '</div>' +

            '</div>'
        );

        addStyles();
        bindEvents();

        return html;
    }

    function addStyles() {
        if ($('#lan-media-styles').length) return;

        $('head').append(
            '<style id="lan-media-styles">' +

            '.lan-media-page{' +
                'padding:2em;' +
                'width:100%;' +
                'box-sizing:border-box;' +
                'color:inherit;' +
            '}' +

            '.lan-media-heading{' +
                'display:flex;' +
                'align-items:center;' +
                'justify-content:space-between;' +
                'flex-wrap:wrap;' +
                'margin-bottom:0.5em;' +
            '}' +

            '.lan-media-title{' +
                'font-size:2em;' +
                'font-weight:600;' +
            '}' +

            '.lan-media-version{' +
                'opacity:.55;' +
                'font-size:.9em;' +
            '}' +

            '.lan-media-description{' +
                'opacity:.65;' +
                'margin-bottom:2em;' +
            '}' +

            '.lan-media-device{' +
                'padding:1.2em;' +
                'margin-bottom:1.2em;' +
                'border:1px solid rgba(128,128,128,.3);' +
                'border-radius:12px;' +
            '}' +

            '.lan-media-device__header{' +
                'display:flex;' +
                'justify-content:space-between;' +
                'align-items:center;' +
                'gap:1em;' +
                'margin-bottom:1em;' +
            '}' +

            '.lan-media-device__name{' +
                'font-size:1.25em;' +
                'font-weight:600;' +
            '}' +

            '.lan-media-device__type{' +
                'font-size:.75em;' +
                'opacity:.5;' +
                'margin-top:.3em;' +
            '}' +

            '.lan-media-status{' +
                'font-size:.9em;' +
                'opacity:.7;' +
            '}' +

            '.lan-media-fields{' +
                'display:flex;' +
                'gap:1em;' +
                'flex-wrap:wrap;' +
                'margin-bottom:1em;' +
            '}' +

            '.lan-media-field{' +
                'display:flex;' +
                'flex-direction:column;' +
                'gap:.4em;' +
                'flex:1;' +
                'min-width:150px;' +
            '}' +

            '.lan-media-field span{' +
                'font-size:.8em;' +
                'opacity:.65;' +
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

            '.lan-media-test,.lan-media-save{' +
                'display:block;' +
                'width:100%;' +
                'padding:.9em;' +
                'margin-top:.8em;' +
                'border:0;' +
                'border-radius:8px;' +
                'background:rgba(128,128,128,.2);' +
                'color:inherit;' +
                'font-size:1em;' +
            '}' +

            '.lan-media-result{' +
                'font-size:.85em;' +
                'opacity:.75;' +
                'margin-top:.7em;' +
                'overflow-wrap:anywhere;' +
            '}' +

            '.lan-media-footer{' +
                'text-align:center;' +
                'opacity:.4;' +
                'font-size:.8em;' +
                'margin-top:2em;' +
            '}' +

            '</style>'
        );
    }

    function bindEvents() {
        html.find('.lan-media-save').on('hover:enter click', function () {
            saveFields();
            notify('LAN Media: настройки сохранены');
        });

        html.find('.lan-media-test').on('hover:enter click', function () {
            var id = $(this).attr('data-test');
            var device = getDevice(id);

            if (!device) return;

            saveFields();

            device = getDevice(id);

            var status = html.find('[data-status="' + id + '"]');
            var result = html.find('[data-result="' + id + '"]');

            status.text('Проверка...');
            result.text('');

            testDevice(device, function (answer) {
                status.text(answer.ok ? 'Доступен' : 'Ошибка');

                result.text(
                    answer.message +
                    (answer.details ? ' — ' + answer.details : '')
                );

                console.log('[LAN Media]', device.name, answer);

                if (answer.ok) {
                    notify(device.name + ': ' + answer.message);
                } else {
                    notify(device.name + ': ' + answer.message);
                }
            });
        });
    }

    function getDevice(id) {
        for (var i = 0; i < NAS.length; i++) {
            if (NAS[i].id === id) return NAS[i];
        }

        return null;
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

        saveNAS();
    }

    function LanMedia() {
        this.create = function () {
            return render();
        };

        this.start = function () {};

        this.stop = function () {};

        this.pause = function () {};

        this.resume = function () {};

        this.render = function () {
            return html;
        };

        this.destroy = function () {
            if (html) html.remove();
        };
    }

    function addMenuButton() {
        var menu = $('.menu .menu__list').eq(0);

        if (!menu.length) return;

        if (menu.find('.lan-media-menu').length) return;

        var button = $(
            '<li class="menu__item selector lan-media-menu">' +
                '<div class="menu__ico">' +
                    '<svg viewBox="0 0 24 24" fill="currentColor">' +
                        '<path d="M4 4h16v5H4zm0 7h16v9H4zm2 2v5h12v-5z"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="menu__text">LAN Media</div>' +
            '</li>'
        );

        button.on('hover:enter click', function () {
            Lampa.Activity.push({
                title: 'LAN Media',
                component: 'lan_media',
                page: 1
            });
        });

        menu.append(button);
    }

    function init() {
        if (!window.Lampa) return;

        loadNAS();

        Lampa.Component.add('lan_media', LanMedia);

        addMenuButton();

        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                addMenuButton();
            }
        });

        console.log(
            '[LAN Media] Loaded. Version:',
            VERSION
        );
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    }

})();

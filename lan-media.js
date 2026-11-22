(function () {
    'use strict';

    if (!window.Lampa || window.lan_media_initialized) return;
    window.lan_media_initialized = true;

    var VERSION = '0.6.0';
    var STORAGE_KEY = 'lan_media_devices';
    var opening = false;

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
            devices = saved && Array.isArray(saved) && saved.length
                ? saved
                : DEFAULT_DEVICES.slice();
        } catch (error) {
            devices = DEFAULT_DEVICES.slice();
        }
    }

    function saveDevices() {
        try {
            Lampa.Storage.set(STORAGE_KEY, devices);
        } catch (error) {
            console.log('[LAN Media] Storage error:', error);
        }
    }

    function notify(message) {
        Lampa.Noty.show(message, { time: 5000 });
    }

    function getURL(device) {
        return 'http://' + device.ip + ':' + device.port;
    }

    function request(url, callback) {
        if (typeof $ === 'undefined' || !$.ajax) {
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
                callback(error || status || ('HTTP ' + xhr.status));
            }
        });
    }

    function checkSynology(device, callback) {
        var url = getURL(device) +
            '/webapi/entry.cgi?api=SYNO.API.Info&version=1&method=query&query=SYNO.API.Auth,SYNO.FileStation.List';

        request(url, function (error, response) {
            if (error) {
                callback({
                    ok: false,
                    message: 'Нет доступа к DSM API',
                    details: String(error)
                });
                return;
            }

            var data;
            try {
                data = JSON.parse(response);
            } catch (parseError) {
                callback({
                    ok: false,
                    message: 'Synology вернул не JSON',
                    details: String(response).substring(0, 180)
                });
                return;
            }

            if (data && data.success === true && data.data) {
                callback({
                    ok: true,
                    message: 'DSM API доступен',
                    details: 'File Station API найден. Для просмотра файлов потребуется отдельная авторизация.'
                });
            } else {
                callback({
                    ok: false,
                    message: 'Ошибка ответа Synology',
                    details: JSON.stringify(data)
                });
            }
        });
    }

    function checkQNAP(device, callback) {
        var url = getURL(device) +
            '/cgi-bin/filemanager/utilRequest.cgi?func=get_tree&is_iso=0&node=share_root';

        request(url, function (error, response) {
            if (error) {
                callback({
                    ok: false,
                    message: 'Нет доступа к QNAP File Station',
                    details: String(error)
                });
                return;
            }

            var data;
            try {
                data = JSON.parse(response);
            } catch (parseError) {
                callback({
                    ok: false,
                    message: 'QNAP вернул не JSON',
                    details: String(response).substring(0, 180)
                });
                return;
            }

            if (data && data.success === true && String(data.status) === '0') {
                callback({
                    ok: true,
                    message: 'QNAP File Station ответил успешно',
                    details: 'Запрос дерева папок выполнен.'
                });
            } else {
                callback({
                    ok: false,
                    message: 'QNAP ответил, но дерево папок не выдал',
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
                message: 'Неизвестный тип NAS',
                details: device.type
            });
        }
    }

    function showResult(device, result) {
        var message = (result.ok ? '✓ ' : '✗ ') +
            device.name + ': ' + result.message;

        if (result.details) message += '. ' + result.details;

        console.log('[LAN Media ' + VERSION + ']', device.name, result);
        notify(message);
    }

    function testOne(device) {
        notify('Проверяем ' + device.name + '…');
        checkDevice(device, function (result) {
            showResult(device, result);
        });
    }

    function testAll() {
        var remaining = devices.length;
        var results = [];

        if (!remaining) {
            notify('NAS не настроены');
            return;
        }

        notify('Проверяем все NAS…');

        devices.forEach(function (device) {
            checkDevice(device, function (result) {
                results.push({
                    name: device.name,
                    result: result
                });

                remaining--;

                if (remaining === 0) {
                    var summary = results.map(function (entry) {
                        return (entry.result.ok ? '✓ ' : '✗ ') +
                            entry.name + ': ' + entry.result.message;
                    }).join(' | ');

                    console.log('[LAN Media ' + VERSION + '] Scan:', results);
                    notify(summary);
                }
            });
        });
    }

    function showMenu() {
        if (opening) return;
        opening = true;

        var items = devices.map(function (device) {
            return {
                title: device.name + '  ·  ' + device.ip,
                open: function () {
                    testOne(device);
                }
            };
        });

        items.push({
            title: 'Проверить оба NAS',
            open: testAll
        });

        items.push({
            title: 'Информация о LAN Media',
            open: function () {
                notify('LAN Media ' + VERSION + '. Управление — штатным списком Lampa. Проверка API пока не означает, что SMB-каталог уже доступен.');
            }
        });

        if (!Lampa.Select || typeof Lampa.Select.show !== 'function') {
            opening = false;
            notify('В этой сборке Lampa нет штатного Select');
            console.error('[LAN Media] Lampa.Select.show unavailable');
            return;
        }

        Lampa.Select.show({
            title: 'LAN Media',
            items: items,
            onSelect: function (item) {
                if (item && typeof item.open === 'function') item.open();
            },
            onBack: function () {
                opening = false;
                if (Lampa.Controller && typeof Lampa.Controller.toggle === 'function') {
                    Lampa.Controller.toggle('menu');
                }
            }
        });

        opening = false;
    }

    function addMenuButton() {
        if (!window.Lampa || !Lampa.Menu ||
            typeof Lampa.Menu.addButton !== 'function') return;

        if (window.lan_media_menu_added) return;
        window.lan_media_menu_added = true;

        Lampa.Menu.addButton('🗄️', 'LAN MEDIA', showMenu);
        console.log('[LAN Media] Menu button added. Version:', VERSION);
    }

    function init() {
        loadDevices();
        saveDevices();

        if (window.appready) {
            setTimeout(addMenuButton, 1500);
        } else if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
            Lampa.Listener.follow('app', function (event) {
                if (event.type === 'ready') setTimeout(addMenuButton, 1500);
            });
        } else {
            setTimeout(addMenuButton, 2500);
        }

        console.log('[LAN Media] Initialized. Version:', VERSION);
    }

    init();
})();
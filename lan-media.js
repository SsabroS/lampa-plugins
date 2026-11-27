/* LAN Media Plugin for Lampa
   Checks user-provided external HTTP servers.
*/

(function() {
    'use strict';

    if (window.lan_media_ready) return;
    window.lan_media_ready = true;

    const STORAGE_KEY = 'lan_media_server';

    // User servers
    const SERVERS = [
        { name: 'Server :8080', url: 'http://ssabros.crazedns.ru:8080' },
        { name: 'Server :5000', url: 'http://ssabros.crazedns.ru:5000' }
    ];

    function getServer() {
        return Lampa.Storage.get(STORAGE_KEY, '');
    }

    function setServer(url) {
        Lampa.Storage.set(STORAGE_KEY, url);
    }

    function checkServers(callback) {
        const found = [];
        let checked = 0;

        Lampa.Noty.show('Проверка серверов...');

        SERVERS.forEach(server => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', server.url, true);
            xhr.timeout = 4000;
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 400) {
                    found.push(server);
                }
                checked++;
                if (checked >= SERVERS.length) callback(found);
            };
            xhr.onerror = xhr.ontimeout = function() {
                checked++;
                if (checked >= SERVERS.length) callback(found);
            };
            xhr.send();
        });
    }

    function LanMediaComponent() {
        const scroll = new Lampa.Scroll({ mask: true, over: true });

        this.create = function() {
            const checkBtn = $('<div class="selector" style="padding:15px;background:#222;margin:10px;border-radius:8px;"><div>Проверить серверы</div></div>');
            checkBtn.on('hover:enter', () => {
                checkServers(function(servers) {
                    scroll.clear();
                    if (!servers.length) {
                        Lampa.Noty.show('Серверы не ответили');
                        return;
                    }
                    servers.forEach(s => {
                        const item = $('<div class="selector" style="padding:12px;margin:8px;background:#1a1a1a;border-radius:6px;"><div>' + s.name + '</div><div style="font-size:0.8em;opacity:0.7;">' + s.url + '</div></div>');
                        item.on('hover:enter', () => {
                            setServer(s.url);
                            Lampa.Noty.show('Выбран: ' + s.name);
                            Lampa.Activity.backward();
                        });
                        scroll.append(item);
                    });
                });
            });

            scroll.append(checkBtn);

            const server = getServer();
            if (server) {
                scroll.append($('<div style="padding:15px;opacity:0.7;">Текущий сервер: ' + server + '</div>'));
            }

            return this.render();
        };

        this.start = function() {
            Lampa.Controller.add('content', {
                toggle: () => {
                    Lampa.Controller.collectionSet(scroll.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                back: () => Lampa.Activity.backward()
            });
            Lampa.Controller.toggle('content');
        };

        this.render = function() { return scroll.render(); };
        this.destroy = function() { scroll.destroy(); };
    }

    function addMenuButton() {
        if ($('.menu__item.lan-media-btn').length) return;

        const btn = $('<li class="menu__item selector lan-media-btn"><div class="menu__text">Мои фильмы (LAN)</div></li>');
        btn.on('hover:enter', () => {
            Lampa.Activity.push({
                url: '',
                title: 'Мои фильмы (LAN)',
                component: 'lan_media',
                page: 1
            });
        });

        const list = $('.menu .menu__list').eq(0);
        if (list.length) {
            list.append(btn);
        } else {
            $('.menu__list').first().append(btn);
        }
    }

    function init() {
        Lampa.Component.add('lan_media', LanMediaComponent);

        if (window.appready) {
            setTimeout(addMenuButton, 300);
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') {
                    setTimeout(addMenuButton, 600);
                }
            });
        }
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });

})();

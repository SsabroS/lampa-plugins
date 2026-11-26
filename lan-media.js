/* LAN Media Plugin for Lampa
   Discovers Jellyfin servers on local network.
*/

(function() {
    'use strict';

    if (window.lan_media_ready) return;
    window.lan_media_ready = true;

    const STORAGE_KEY = 'lan_media_server';

    function getServer() {
        return Lampa.Storage.get(STORAGE_KEY, '');
    }

    function setServer(url) {
        Lampa.Storage.set(STORAGE_KEY, url);
    }

    function scanNetwork(callback) {
        const found = [];
        const ranges = ['192.168.0.', '192.168.1.', '10.0.0.'];
        let checked = 0;
        const total = ranges.length * 15;

        Lampa.Noty.show('Сканирование сети...');

        ranges.forEach(prefix => {
            for (let i = 1; i <= 15; i++) {
                const ip = prefix + i;
                const url = 'http://' + ip + ':8096/System/Info/Public';
                
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 600;
                xhr.onload = function() {
                    if (xhr.status === 200) {
                        try {
                            const info = JSON.parse(xhr.responseText);
                            if (info.ServerName || info.Version) {
                                found.push({
                                    name: info.ServerName || 'Jellyfin',
                                    url: 'http://' + ip + ':8096'
                                });
                            }
                        } catch(e) {}
                    }
                    checked++;
                    if (checked >= total) callback(found);
                };
                xhr.onerror = xhr.ontimeout = function() {
                    checked++;
                    if (checked >= total) callback(found);
                };
                xhr.send();
            }
        });
    }

    function LanMediaComponent() {
        const scroll = new Lampa.Scroll({ mask: true, over: true });

        this.create = function() {
            const scanBtn = $('<div class="selector" style="padding:15px;background:#222;margin:10px;border-radius:8px;"><div>Найти серверы Jellyfin</div></div>');
            scanBtn.on('hover:enter', () => {
                scanNetwork(function(servers) {
                    scroll.clear();
                    if (!servers.length) {
                        Lampa.Noty.show('Серверы не найдены');
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

            scroll.append(scanBtn);

            const server = getServer();
            if (server) {
                scroll.append($('<div style="padding:15px;opacity:0.7;">Текущий: ' + server + '</div>'));
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

        // Correct selector used by most working plugins
        const list = $('.menu .menu__list').eq(0);
        if (list.length) {
            list.append(btn);
        } else {
            $('.menu__list').first().append(btn);
        }
    }

    function init() {
        Lampa.Component.add('lan_media', LanMediaComponent);

        // Settings entry (always visible)
        Lampa.SettingsApi.addComponent({
            component: 'lan_media',
            name: 'Мои фильмы (LAN)',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'
        });

        Lampa.SettingsApi.addParam({
            component: 'lan_media',
            param: {
                name: 'open_lan',
                type: 'button',
                values: '',
                default: ''
            },
            field: {
                name: 'Открыть сканирование',
                description: 'Найти Jellyfin в локальной сети'
            },
            onChange: function() {
                Lampa.Activity.push({
                    url: '',
                    title: 'Мои фильмы (LAN)',
                    component: 'lan_media',
                    page: 1
                });
            }
        });

        // Menu button
        if (window.appready) {
            setTimeout(addMenuButton, 500);
        } else {
            Lampa.Listener.follow('app', function(e) {
                if (e.type === 'ready') {
                    setTimeout(addMenuButton, 800);
                }
            });
        }
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });

})();

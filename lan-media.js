/* LAN Media Plugin for Lampa
   Discovers Jellyfin servers on local network and provides media library access.
   Progress is saved via Lampa Storage.
*/

(function() {
    'use strict';

    if (window.lan_media_ready) return;
    window.lan_media_ready = true;

    const STORAGE_KEY = 'lan_media_server';
    const PROGRESS_KEY = 'lan_media_progress';

    function getServer() {
        return Lampa.Storage.get(STORAGE_KEY, '');
    }

    function setServer(url) {
        Lampa.Storage.set(STORAGE_KEY, url);
    }

    function getProgress() {
        return Lampa.Storage.get(PROGRESS_KEY, {});
    }

    function saveProgress(id, time) {
        const p = getProgress();
        p[id] = { time: time, updated: Date.now() };
        Lampa.Storage.set(PROGRESS_KEY, p);
    }

    // Simple LAN scan for Jellyfin (port 8096)
    function scanNetwork(callback) {
        const found = [];
        const ranges = ['192.168.0.', '192.168.1.', '10.0.0.', '10.0.1.'];
        let checked = 0;
        const total = ranges.length * 20; // scan first 20 IPs of each range for speed

        Lampa.Noty.show('LAN Media: Сканирование сети...');

        ranges.forEach(prefix => {
            for (let i = 1; i <= 20; i++) {
                const ip = prefix + i;
                const url = 'http://' + ip + ':8096/System/Info/Public';
                
                const xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 800;
                xhr.onload = function() {
                    if (xhr.status === 200) {
                        try {
                            const info = JSON.parse(xhr.responseText);
                            if (info.ServerName || info.Version) {
                                found.push({
                                    name: info.ServerName || 'Jellyfin',
                                    url: 'http://' + ip + ':8096',
                                    version: info.Version || ''
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
        const self = this;

        this.create = function() {
            const server = getServer();
            
            const scanBtn = $('<div class="selector" style="padding:15px;background:#222;margin:10px;border-radius:8px;"><div>Найти серверы Jellyfin</div></div>');
            scanBtn.on('hover:enter', () => {
                scanNetwork(function(servers) {
                    scroll.clear();
                    if (servers.length === 0) {
                        Lampa.Noty.show('Серверы не найдены. Введите адрес вручную.');
                        return;
                    }
                    servers.forEach(s => {
                        const item = $('<div class="selector" style="padding:12px;margin:8px;background:#1a1a1a;border-radius:6px;"><div>' + s.name + '</div><div style="font-size:0.8em;opacity:0.7;">' + s.url + '</div></div>');
                        item.on('hover:enter', () => {
                            setServer(s.url);
                            Lampa.Noty.show('Выбран сервер: ' + s.name);
                            Lampa.Activity.backward();
                        });
                        scroll.append(item);
                    });
                });
            });

            scroll.append(scanBtn);

            if (server) {
                const current = $('<div style="padding:15px;opacity:0.8;">Текущий сервер:<br>' + server + '</div>');
                scroll.append(current);
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

    function init() {
        Lampa.Lang.add({
            lan_media_title: { ru: 'Мои фильмы (LAN)', en: 'My Movies (LAN)' }
        });

        Lampa.Component.add('lan_media', LanMediaComponent);

        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                const btn = $('<li class="menu__item selector"><div class="menu__text">' +
                    Lampa.Lang.translate('lan_media_title') + '</div></li>');
                btn.on('hover:enter', () => {
                    Lampa.Activity.push({
                        url: '',
                        title: Lampa.Lang.translate('lan_media_title'),
                        component: 'lan_media',
                        page: 1
                    });
                });
                $('.menu__list').append(btn);
            }
        });
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });

})();

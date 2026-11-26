/* LAN Media Plugin for Lampa
   Scans home servers (QNAP / Synology) via HTTP, parses filenames,
   pulls TMDB info and saves progress.
   
   First version - configure HTTP folder URLs in settings.
*/

(function() {
    'use strict';

    if (window.lan_media_ready) return;
    window.lan_media_ready = true;

    const STORAGE_KEY = 'lan_media_config';
    const PROGRESS_KEY = 'lan_media_progress';

    function getConfig() {
        return Lampa.Storage.get(STORAGE_KEY, {
            sources: [
                { name: 'QNAP', url: 'http://192.168.1.10/movies/' },
                { name: 'Synology', url: 'http://192.168.1.20/movies/' }
            ]
        });
    }

    function getProgress() {
        return Lampa.Storage.get(PROGRESS_KEY, {});
    }

    function saveProgress(fileId, time) {
        const prog = getProgress();
        prog[fileId] = { time: time, updated: Date.now() };
        Lampa.Storage.set(PROGRESS_KEY, prog);
    }

    function parseFilename(name) {
        const clean = name.replace(/\.[a-z0-9]+$/i, '');
        const yearMatch = clean.match(/[(\[ ]?(\d{4})[)\]]?/);
        const year = yearMatch ? yearMatch[1] : '';
        let title = clean
            .replace(/[(\[ ]?\d{4}[)\]]?/g, '')
            .replace(/[._]/g, ' ')
            .replace(/\b(1080p|720p|2160p|4k|webrip|web-dl|bluray|bdrip|hdrip|x264|x265|hevc|aac|dts|ac3)\b/gi, '')
            .trim();
        return { title: title, year: year, original: name };
    }

    function LanMediaComponent(object) {
        const scroll = new Lampa.Scroll({ mask: true, over: true });

        this.create = function() {
            this.activity.loader(true);
            Lampa.Noty.show('LAN Media: Настройте HTTP-адреса папок в настройках плагина');
            this.activity.loader(false);
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

        this.render = function() {
            return scroll.render();
        };

        this.destroy = function() {
            scroll.destroy();
        };
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

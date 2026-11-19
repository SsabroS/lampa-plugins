(function () {
    'use strict';

    var lampa = window.Lampa;
    var flagId = 'lampa-ip-country-flag';
    var started = false;
    var pending = false;

    function showFlag(country) {
        var flag = document.getElementById(flagId);

        if (!/^[A-Z]{2}$/.test(country)) {
            if (flag) flag.style.display = 'none';
            return;
        }

        if (!flag) {
            var actions = document.querySelector('.head .head__actions');
            if (!actions) return;

            flag = document.createElement('img');
            flag.id = flagId;
            flag.style.cssText = 'display:none;width:1.5em;height:auto;' +
                'max-height:1.15em;object-fit:contain;margin:0 .45em;flex-shrink:0';
            flag.onload = function () { flag.style.display = 'block'; };
            flag.onerror = function () { flag.style.display = 'none'; };
            actions.insertBefore(flag, actions.firstChild);
        }

        var url = 'https://flagcdn.com/w80/' + country.toLowerCase() + '.png';
        if (flag.src !== url || !flag.naturalWidth) {
            flag.style.display = 'none';
            flag.alt = flag.title = 'Страна по IP · ' + country;
            flag.src = url;
        } else {
            flag.style.display = 'block';
        }
    }

    function refresh() {
        if (pending || document.hidden) return;

        var request = new XMLHttpRequest();
        request.open('GET', 'https://api.country.is/', true);
        request.timeout = 8000;
        request.onload = function () {
            pending = false;
            var country = '';
            if (request.status === 200) {
                try {
                    country = JSON.parse(request.responseText).country || '';
                } catch (error) {
                    country = '';
                }
            }
            showFlag(country);
        };
        request.onerror = request.ontimeout = function () {
            pending = false;
            showFlag('');
        };
        pending = true;
        request.send();
    }

    function start() {
        if (started) return;
        started = true;
        refresh();
        document.addEventListener('visibilitychange', refresh);
        window.setInterval(refresh, 5 * 60 * 1000);
    }

    if (!lampa || window.lampaIpCountryFlag) return;
    window.lampaIpCountryFlag = true;

    if (window.appready) start();
    else window.Lampa.Listener.follow('app', function (event) {
        if (event.type === 'ready') start();
    });
})();

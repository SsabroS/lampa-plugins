(function () {
    'use strict';

    var flagId = 'lampa-ip-country-flag';
    var russianFlag = 'data:image/png;base64,' +
        'iVBORw0KGgoAAAANSUhEUgAAAB4AAAASCAIAAADDkPmOAAAAJklEQVR4nGP4TzPAMGr0sDCawXIZrdCo0cPC6KvacjRCo0YPC6MBBFl/9k4DtwIAAAAASUVORK5CYII=';
    var started = false;
    var pending = false;

    function validCountry(country) {
        return typeof country === 'string' && /^[A-Z]{2}$/.test(country);
    }

    function showFlag(country) {
        var flag = document.getElementById(flagId);
        var detected = validCountry(country);

        if (!flag) {
            var actions = document.querySelector('.head .head__actions');
            if (!actions) return;

            flag = document.createElement('img');
            flag.id = flagId;
            flag.style.cssText = 'display:none;align-self:center;width:2.05em;height:1.4em;' +
                'object-fit:contain;margin:0 .45em;flex-shrink:0';

            flag.onload = function () {
                flag.style.display = 'block';
            };
            flag.onerror = function () {
                flag.style.display = 'none';
            };

            actions.insertBefore(flag, actions.firstChild);
        }

        var url = !detected || country === 'RU'
            ? russianFlag
            : 'https://flagcdn.com/w80/' + country.toLowerCase() + '.png';

        flag.alt = flag.title = detected
            ? 'Страна по IP · ' + country
            : 'Страна по IP не определена';

        if (flag.src !== url || !flag.naturalWidth) {
            flag.style.display = 'none';
            flag.src = url;
        } else {
            flag.style.display = 'block';
        }
    }

    function lookup(url, parseCountry, onResult) {
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.timeout = 5000;

        request.onload = function () {
            var country = '';

            if (request.status === 200) {
                try {
                    country = parseCountry(request.responseText);
                } catch (error) {
                    country = '';
                }
            }

            onResult(validCountry(country) ? country : '');
        };

        request.onerror = request.ontimeout = function () {
            onResult('');
        };

        request.send();
    }

    function refresh() {
        if (pending || document.hidden) return;
        pending = true;

        function finish(country) {
            pending = false;
            showFlag(country);
        }

        lookup('https://ipinfo.io/country', function (body) {
            return body.trim().toUpperCase();
        }, function (country) {
            if (country) {
                finish(country);
                return;
            }

            lookup('https://api.country.is/', function (body) {
                return JSON.parse(body).country;
            }, finish);
        });
    }

    function start() {
        if (started) return;
        started = true;

        refresh();
        document.addEventListener('visibilitychange', refresh);
        window.setInterval(refresh, 5 * 60 * 1000);
    }

    if (!window.Lampa || window.lampaIpCountryFlag) return;
    window.lampaIpCountryFlag = true;

    if (window.appready) {
        start();
    } else {
        window.Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') start();
        });
    }
})();

function refresh() {
    if (pending || document.hidden) return;
    pending = true;

    function finish(country) {
        pending = false;
        showFlag(country);
    }

    function lookup(url, parseCountry, onFailure) {
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

            if (typeof country === 'string' && /^[A-Z]{2}$/.test(country)) {
                finish(country);
            } else {
                onFailure();
            }
        };

        request.onerror = request.ontimeout = onFailure;
        request.send();
    }

    lookup('https://ipinfo.io/country', function (body) {
        return body.trim().toUpperCase();
    }, function () {
        lookup('https://api.country.is/', function (body) {
            return JSON.parse(body).country;
        }, function () {
            finish('');
        });
    });
}

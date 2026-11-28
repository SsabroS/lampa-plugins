(function () {
'use strict';

if (!window.Lampa || window.lan_media_initialized) return;
window.lan_media_initialized = true;

var VERSION = '0.10.0-qnap-only';
var NAS = {
  qnap: { name: 'QNAP TS-462', type: 'qnap', host: 'http://192.168.1.62:8080' }
};
var credentials = {};
var sessions = {};
var activeNas = null;
var network = (window.Lampa && Lampa.Reguest) ? new Lampa.Reguest() : null;

function note(message) {
  Lampa.Noty.show(String(message), { time: 15000 });
}
function errorToString(err, code) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message && typeof err.message === 'string') return err.message;
  // Lampa / jQuery style
  var parts = [];
  if (err.status !== undefined) parts.push('status ' + err.status);
  if (err.statusText) parts.push(err.statusText);
  if (err.responseText) parts.push(String(err.responseText).slice(0, 180));
  if (err.responseJSON) parts.push(JSON.stringify(err.responseJSON).slice(0, 180));
  if (code) parts.push('code ' + code);
  if (err.exception) parts.push(String(err.exception));
  try {
    if (parts.length) return parts.join(' | ');
    return JSON.stringify(err).slice(0, 300);
  } catch (e) {
    return String(err);
  }
}
function request(options, callback) {
  var url = options.url;
  if (options.data && typeof options.data === 'object') {
    var qs = Object.keys(options.data).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(String(options.data[k]));
    }).join('&');
    url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }
  var timeout = options.timeout || 18000;

  if (network && typeof network.native === 'function') {
    try { network.timeout(timeout); } catch (e) {}
    network.native(url, function (raw) {
      callback(null, raw);
    }, function (err, code) {
      var msg = errorToString(err, code);
      if (!code && /0|timeout|network|CORS|failed|status 0/i.test(msg)) {
        msg += ' — возможна CORS или сеть (на Android используется native)';
      }
      console.error('[LAN Media] native error details:', err, code);
      callback(new Error(msg));
    }, null, { dataType: 'text' });
    return;
  }

  if (window.$ && $.ajax) {
    options.timeout = timeout;
    options.cache = false;
    options.dataType = options.dataType || 'text';
    options.success = function (data) { callback(null, data); };
    options.error = function (xhr, status, error) {
      var detail = errorToString(xhr, status) || error || status || 'Ошибка запроса';
      if (xhr && xhr.status === 0) detail = 'CORS или сеть недоступна (status 0). На веб-версии Lampa нужен прокси или Android-приложение.';
      callback(new Error(detail));
    };
    $.ajax(options);
    return;
  }
  callback(new Error('Lampa.Reguest и jQuery недоступны'));
}
function parseJson(raw, callback) {
  if (raw && typeof raw === 'object') {
    callback(null, raw);
    return;
  }
  try {
    callback(null, JSON.parse(String(raw)));
  } catch (e) {
    callback(new Error('Ответ не JSON: ' + String(raw).slice(0, 280)));
  }
}
function askCredentials(nas) {
  var previous = credentials[nas.type] || {};
  var user = prompt('Логин NAS: ' + nas.name, previous.user || 'SsabroS');
  if (user === null) return false;
  var password = prompt('Пароль NAS: ' + nas.name, '');
  if (password === null) return false;
  credentials[nas.type] = { user: user, password: password };
  return true;
}
function showError(stage, error) {
  var message = '[' + stage + '] ' + errorToString(error);
  console.error('[LAN Media ' + VERSION + '] ' + message, error);
  note(message);
}
function qnapLogin(callback) {
  var nas = NAS.qnap;
  var auth = credentials.qnap;
  var encoded;
  try {
    encoded = btoa(unescape(encodeURIComponent(auth.password)));
  } catch (e) {
    callback(new Error('Не удалось закодировать пароль для QNAP'));
    return;
  }
  request({
    url: nas.host + '/cgi-bin/authLogin.cgi',
    method: 'GET',
    data: { user: auth.user, pwd: encoded, serviceKey: 1 }
  }, function (error, raw) {
    if (error) { callback(error); return; }
    var xml = String(raw);
    var passed = (xml.match(/<authPassed[^>]*>([\\s\\S]*?)<\\/authPassed>/i) || [])[1];
    var sid = (xml.match(/<authSid[^>]*>([\\s\\S]*?)<\\/authSid>/i) || [])[1];
    sid = sid ? sid.replace(/<!\\[CDATA\\[|\\]\\]>/g, '').trim() : '';
    // Never write the QNAP session token to logs.
    console.log('[LAN Media] QNAP auth response: authPassed=' + String(passed || 'missing').trim() + ', authSid=' + (sid ? 'present' : 'missing'));
    if (String(passed || '').trim() !== '1' || !sid) {
      var safeXml = xml.replace(/(<authSid[^>]*>)[\\s\\S]*?(<\\/authSid>)/i, '$1[REDACTED]$2');
      callback(new Error('QNAP login не удался. Ответ: ' + safeXml.slice(0, 320)));
      return;
    }
    sessions.qnap = sid;
    callback(null);
  });
}
function qnapTree(node, callback) {
  request({
    url: NAS.qnap.host + '/cgi-bin/filemanager/utilRequest.cgi',
    method: 'GET',
    data: { func: 'get_tree', sid: sessions.qnap, is_iso: 0, node: node }
  }, function (error, raw) {
    if (error) { callback(error); return; }
    parseJson(raw, function (parseError, data) {
      if (parseError) { callback(new Error('QNAP get_tree: ' + parseError.message)); return; }
      var entries = Array.isArray(data) ? data :
        (data && Array.isArray(data.data) ? data.data :
        (data && Array.isArray(data.tree) ? data.tree : null));
      if (!entries) {
        callback(new Error('QNAP ответил, но формат дерева неизвестен: ' + JSON.stringify(data).slice(0, 300)));
        return;
      }
      callback(null, entries.map(function (entry) {
        return {
          name: entry.text || entry.name || entry.label || entry.id || 'Без имени',
          path: entry.id || entry.path || entry.node,
          dir: entry.isdir !== false
        };
      }));
    });
  });
}
function showEntries(title, entries, backAction) {
  var items = [];
  if (backAction) items.push({ title: '← Назад', action: backAction });
  entries.forEach(function (entry) {
    items.push({
      title: (entry.dir ? '📁 ' : '🎬 ') + entry.name,
      action: function () {
        if (entry.dir) openFolder(entry);
        else note('Файл найден: ' + entry.name + '. Запуск видео будет следующим этапом.');
      }
    });
  });
  if (!entries.length) items.push({ title: 'Список пуст' });
  Lampa.Select.show({
    title: title,
    items: items,
    onSelect: function (item) { if (item && item.action) item.action(); },
    onBack: function () { mainMenu(); }
  });
}
function openFolder(entry) {
  if (!activeNas) return;
  qnapTree(entry.path, function (error, entries) {
    if (error) { showError('QNAP: чтение папки', error); return; }
    showEntries(entry.name, entries, function () { connectQnap(); });
  });
}
function connectQnap() {
  activeNas = NAS.qnap;
  note('Подключение к QNAP…');
  qnapLogin(function (error) {
    if (error) { showError('QNAP авторизация', error); return; }
    qnapTree('share_root', function (treeError, entries) {
      if (treeError) { showError('QNAP список общих папок', treeError); return; }
      showEntries('QNAP — общие папки', entries, mainMenu);
    });
  });
}
function mainMenu() {
  Lampa.Select.show({
    title: 'LAN Media ' + VERSION,
    items: [
      { title: 'QNAP TS-462 — ' + NAS.qnap.host, action: function () {
        if (askCredentials(NAS.qnap)) connectQnap();
      }},
      { title: 'Проверить HTTP-доступ к QNAP', action: testHosts },
      { title: 'Информация', action: function () {
        note('Версия ' + VERSION + '. Только QNAP TS-462. Адрес: ' + NAS.qnap.host + '. Пароль хранится только в памяти.');
      }}
    ],
    onSelect: function (item) { if (item && item.action) item.action(); },
    onBack: function () { Lampa.Controller.toggle('menu'); }
  });
}
function testHosts() {
  request({ url: NAS.qnap.host + '/', method: 'GET' }, function (error) {
    note('QNAP HTTP: ' + (error ? errorToString(error) : 'HTTP-ответ получен'));
  });
}
function addButton() {
  if (!Lampa.Menu || typeof Lampa.Menu.addButton !== 'function' || window.lan_media_menu_added) return;
  window.lan_media_menu_added = true;
  Lampa.Menu.addButton('🗄️', 'LAN MEDIA', mainMenu);
  console.log('[LAN Media] ' + VERSION + ' initialized');
}
if (window.appready) setTimeout(addButton, 1500);
else if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
  Lampa.Listener.follow('app', function (event) {
    if (event.type === 'ready') setTimeout(addButton, 1500);
  });
} else setTimeout(addButton, 2500);
})();

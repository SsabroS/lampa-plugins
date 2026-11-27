(function () {
'use strict';

if (!window.Lampa || window.lan_media_initialized) return;
window.lan_media_initialized = true;

var VERSION = '0.9.1-debug';
var NAS = {
  synology: { name: 'Synology DS118', type: 'synology', host: 'http://ssabros.crazedns.ru:5000' },
  qnap: { name: 'QNAP TS-462', type: 'qnap', host: 'http://ssabros.crazedns.ru:8080' }
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
function synLogin(callback) {
  var nas = NAS.synology;
  var auth = credentials.synology;
  request({
    url: nas.host + '/webapi/auth.cgi',
    method: 'GET',
    data: {
      api: 'SYNO.API.Auth',
      version: 7,
      method: 'login',
      account: auth.user,
      passwd: auth.password,
      session: 'FileStation',
      format: 'sid'
    }
  }, function (error, raw) {
    if (error) { callback(error); return; }
    parseJson(raw, function (parseError, data) {
      if (parseError) { callback(parseError); return; }
      console.log('[LAN Media] Synology login response:', data);
      if (!data.success || !data.data || !data.data.sid) {
        callback(new Error('DSM отклонил вход. API error code: ' + (data.error && data.error.code || 'не указан') + ' | ответ: ' + JSON.stringify(data).slice(0, 200)));
        return;
      }
      sessions.synology = data.data.sid;
      callback(null);
    });
  });
}
function synCall(params, callback) {
  params._sid = sessions.synology;
  request({
    url: NAS.synology.host + '/webapi/entry.cgi',
    method: 'GET',
    data: params
  }, function (error, raw) {
    if (error) { callback(error); return; }
    parseJson(raw, function (parseError, data) {
      if (parseError) { callback(parseError); return; }
      if (!data.success) {
        callback(new Error('FileStation API error code: ' + (data.error && data.error.code || 'не указан')));
        return;
      }
      callback(null, data.data || {});
    });
  });
}
function synShares(callback) {
  synCall({ api: 'SYNO.FileStation.List', version: 2, method: 'list_share' }, function (error, data) {
    if (error) { callback(error); return; }
    callback(null, (data.shares || []).map(function (share) {
      return { name: share.name, path: share.path, dir: true };
    }));
  });
}
function synFolder(path, callback) {
  synCall({
    api: 'SYNO.FileStation.List',
    version: 2,
    method: 'list',
    folder_path: path,
    offset: 0,
    limit: 500,
    sort_by: 'name',
    sort_direction: 'asc'
  }, function (error, data) {
    if (error) { callback(error); return; }
    callback(null, (data.files || []).map(function (file) {
      return { name: file.name, path: file.path, dir: !!file.isdir };
    }));
  });
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
    console.log('[LAN Media] QNAP login raw:', xml.slice(0, 400));
    var passed = (xml.match(/<authPassed[^>]*>([\s\S]*?)<\/authPassed>/i) || [])[1];
    var sid = (xml.match(/<authSid[^>]*>([\s\S]*?)<\/authSid>/i) || [])[1];
    sid = sid ? sid.replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    if (String(passed || '').trim() !== '1' || !sid) {
      callback(new Error('QNAP login не удался. Ответ: ' + xml.slice(0, 320)));
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
  if (activeNas.type === 'synology') {
    synFolder(entry.path, function (error, entries) {
      if (error) { showError('Synology: чтение папки', error); return; }
      showEntries(entry.name, entries, function () { connectSynology(); });
    });
  } else {
    qnapTree(entry.path, function (error, entries) {
      if (error) { showError('QNAP: чтение папки', error); return; }
      showEntries(entry.name, entries, function () { connectQnap(); });
    });
  }
}
function connectSynology() {
  activeNas = NAS.synology;
  note('Подключение к Synology…');
  synLogin(function (error) {
    if (error) { showError('Synology авторизация', error); return; }
    synShares(function (shareError, shares) {
      if (shareError) { showError('Synology список общих папок', shareError); return; }
      showEntries('Synology — общие папки', shares, mainMenu);
    });
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
      { title: 'Synology DS118 — ' + NAS.synology.host, action: function () {
        if (askCredentials(NAS.synology)) connectSynology();
      }},
      { title: 'QNAP TS-462 — ' + NAS.qnap.host, action: function () {
        if (askCredentials(NAS.qnap)) connectQnap();
      }},
      { title: 'Проверить HTTP-доступ без входа', action: testHosts },
      { title: 'Информация', action: function () {
        note('Версия ' + VERSION + '. На Android используется native-запросы. Пароль только в памяти.');
      }}
    ],
    onSelect: function (item) { if (item && item.action) item.action(); },
    onBack: function () { Lampa.Controller.toggle('menu'); }
  });
}
function testHosts() {
  var pending = 2;
  var results = [];
  [NAS.synology, NAS.qnap].forEach(function (nas) {
    request({ url: nas.host + '/', method: 'GET' }, function (error, raw) {
      results.push(nas.name + ': ' + (error ? errorToString(error) : 'HTTP ответ получен'));
      pending--;
      if (!pending) note(results.join(' | '));
    });
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

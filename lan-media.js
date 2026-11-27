(function () {
'use strict';

if (!window.Lampa || window.lan_media_initialized) return;
window.lan_media_initialized = true;

var VERSION = '0.8.0-http-test';
var NAS = {
  synology: { name: 'Synology DS118', type: 'synology', host: 'http://ssabros.crazedns.ru:5000' },
  qnap: { name: 'QNAP TS-462', type: 'qnap', host: 'http://ssabros.crazedns.ru:8080' }
};
var credentials = {};
var sessions = {};
var activeNas = null;

function note(message) {
  Lampa.Noty.show(String(message), { time: 9000 });
}
function request(options, callback) {
  if (!window.$ || !$.ajax) {
    callback(new Error('Lampa AJAX/jQuery недоступен'));
    return;
  }
  options.timeout = 18000;
  options.cache = false;
  options.success = function (data) { callback(null, data); };
  options.error = function (xhr, status, error) {
    var detail = error || status || 'Ошибка запроса';
    if (xhr && xhr.status) detail += ' (HTTP ' + xhr.status + ')';
    if (xhr && xhr.responseText) detail += ': ' + String(xhr.responseText).slice(0, 220);
    callback(new Error(detail));
  };
  $.ajax(options);
}
function parseJson(raw, callback) {
  if (raw && typeof raw === 'object') {
    callback(null, raw);
    return;
  }
  try {
    callback(null, JSON.parse(String(raw)));
  } catch (e) {
    callback(new Error('Ответ не JSON: ' + String(raw).slice(0, 220)));
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
  var message = '[' + stage + '] ' + (error && error.message ? error.message : String(error));
  console.error('[LAN Media ' + VERSION + '] ' + message);
  note(message);
}
function synLogin(callback) {
  var nas = NAS.synology;
  var auth = credentials.synology;
  request({
    url: nas.host + '/webapi/auth.cgi',
    method: 'GET',
    dataType: 'text',
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
      if (!data.success || !data.data || !data.data.sid) {
        callback(new Error('DSM отклонил вход. API error code: ' + (data.error && data.error.code || 'не указан')));
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
    dataType: 'text',
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
    dataType: 'text',
    data: { user: auth.user, pwd: encoded }
  }, function (error, raw) {
    if (error) { callback(error); return; }
    var xml = String(raw);
    var passed = (xml.match(/<authPassed[^>]*>([\\s\\S]*?)<\\/authPassed>/i) || [])[1];
    var sid = (xml.match(/<authSid[^>]*>([\\s\\S]*?)<\\/authSid>/i) || [])[1];
    sid = sid ? sid.replace(/<!\\[CDATA\\[|\\]\\]>/g, '').trim() : '';
    if (String(passed || '').trim() !== '1' || !sid) {
      callback(new Error('QNAP login response не распознан: ' + xml.slice(0, 260)));
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
    dataType: 'text',
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
      title: (entry.dir ? '📁 ' : '🎞️ ') + entry.name,
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
        note('Экспериментальная версия. Пароль хранится только в памяти до перезапуска Lampa. HTTP не шифрует данные.');
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
    request({ url: nas.host + '/', method: 'GET', dataType: 'text' }, function (error, raw) {
      results.push(nas.name + ': ' + (error ? error.message : 'HTTP ответ получен'));
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
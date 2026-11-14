(function() {
  'use strict';
  
  function addButton() {
    if (window.Lampa && Lampa.Menu && typeof Lampa.Menu.addButton === 'function') {
      // Официальный метод Lampa (для новых версий)
      Lampa.Menu.addButton('🧪', 'ТЕСТ', function() {
        Lampa.Noty.show('Кнопка ТЕСТ работает!', { time: 3000 });
      });
      console.log('Кнопка добавлена через Lampa.Menu.addButton');
    } else {
      // Резервный метод для старых версий через jQuery
      var btn = $('<li class="menu__item selector"><div class="menu__ico">🧪</div><div class="menu__text">ТЕСТ</div></li>');
      btn.on('hover:enter', function() {
        Lampa.Noty.show('Кнопка ТЕСТ работает!', { time: 3000 });
      });
      $('.menu .menu__list').eq(0).prepend(btn);
      console.log('Кнопка добавлена через jQuery');
    }
  }

  if (window.appready) {
    setTimeout(addButton, 1500);
  } else {
    Lampa.Listener.follow('app', function(e) {
      if (e.type == 'ready') setTimeout(addButton, 1500);
    });
  }
})();

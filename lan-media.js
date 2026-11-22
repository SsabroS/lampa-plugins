(function () {
'use strict';
if (!window.Lampa || window.lan_media_initialized) return;
window.lan_media_initialized = true;

var VERSION = '0.7.0-test';
var NAS = {
 synology:{name:'Synology DS118',type:'synology',host:'http://192.168.1.118:5000'},
 qnap:{name:'QNAP TS-462',type:'qnap',host:'http://192.168.1.62:8080'}
};
var credentials = {};
var sessions = {};

function note(s){Lampa.Noty.show(s,{time:7000});}
function request(options,cb){
 if(!window.$ || !$.ajax){cb(new Error('jQuery AJAX недоступен'));return;}
 options.timeout=15000; options.cache=false;
 options.success=function(data){cb(null,data);};
 options.error=function(xhr,status,error){cb(new Error((error||status||'Ошибка сети')+(xhr&&xhr.status?' HTTP '+xhr.status:'')));};
 $.ajax(options);
}
function parse(data,cb){
 if(typeof data==='object' && data!==null){cb(null,data);return;}
 try{cb(null,JSON.parse(data));}catch(e){cb(new Error('Ответ не JSON: '+String(data).slice(0,200)));}
}
function askCredentials(nas){
 var user=prompt('Логин для '+nas.name, credentials[nas.type]?credentials[nas.type].user:'SsabroS');
 if(user===null)return false;
 var pass=prompt('Пароль для '+nas.name,'');
 if(pass===null)return false;
 credentials[nas.type]={user:user,password:pass};
 return true;
}
function synLogin(cb){
 var nas=NAS.synology,c=credentials.synology;
 request({url:nas.host+'/webapi/auth.cgi',method:'GET',dataType:'text',data:{
  api:'SYNO.API.Auth',version:7,method:'login',account:c.user,passwd:c.password,session:'FileStation',format:'sid'
 }},function(err,res){
  if(err){cb(err);return;}
  parse(res,function(e,d){
   if(e){cb(e);return;}
   if(!d.success||!d.data||!d.data.sid){cb(new Error('DSM отказал в авторизации. Код '+(d.error&&d.error.code||'?')));return;}
   sessions.synology=d.data.sid;cb(null);
  });
 });
}
function synCall(params,cb){
 params._sid=sessions.synology;
 request({url:NAS.synology.host+'/webapi/entry.cgi',method:'GET',dataType:'text',data:params},function(err,res){
  if(err){cb(err);return;}
  parse(res,function(e,d){
   if(e){cb(e);return;}
   if(!d.success){cb(new Error('Synology API error '+(d.error&&d.error.code||'?')));return;}
   cb(null,d.data||{});
  });
 });
}
function synShares(cb){
 synCall({api:'SYNO.FileStation.List',version:2,method:'list_share'},function(err,d){
  if(err){cb(err);return;}
  cb(null,(d.shares||[]).map(function(x){return {name:x.name,path:x.path,dir:true};}));
 });
}
function synFolder(path,cb){
 synCall({api:'SYNO.FileStation.List',version:2,method:'list',folder_path:path,offset:0,limit:500,sort_by:'name',sort_direction:'asc'},function(err,d){
  if(err){cb(err);return;}
  cb(null,(d.files||[]).map(function(x){return {name:x.name,path:x.path,dir:!!x.isdir};}));
 });
}
function qnapLogin(cb){
 var nas=NAS.qnap,c=credentials.qnap;
 var encoded;
 try{encoded=btoa(unescape(encodeURIComponent(c.password)));}catch(e){cb(e);return;}
 request({url:nas.host+'/cgi-bin/authLogin.cgi',method:'GET',dataType:'text',data:{user:c.user,pwd:encoded}},function(err,res){
  if(err){cb(err);return;}
  var xml=String(res);
  var ok=(xml.match(/<authPassed[^>]*>([\s\S]*?)<\/authPassed>/i)||[])[1];
  var sid=(xml.match(/<authSid[^>]*>([\s\S]*?)<\/authSid>/i)||[])[1];
  sid=sid?sid.replace(/<!\[CDATA\[|\]\]>/g,'').trim():'';
  if(String(ok||'').trim()!=='1'||!sid){cb(new Error('QNAP не подтвердил вход: '+xml.slice(0,180)));return;}
  sessions.qnap=sid;cb(null);
 });
}
function qnapTree(node,cb){
 request({url:NAS.qnap.host+'/cgi-bin/filemanager/utilRequest.cgi',method:'GET',dataType:'text',data:{func:'get_tree',sid:sessions.qnap,is_iso:0,node:node}},function(err,res){
  if(err){cb(err);return;}
  parse(res,function(e,d){
   if(e){cb(new Error('QNAP: '+e.message+' Ответ '+String(res).slice(0,180)));return;}
   var arr=Array.isArray(d)?d:(d.data&&Array.isArray(d.data)?d.data:(d.tree&&Array.isArray(d.tree)?d.tree:null));
   if(!arr){cb(new Error('QNAP вернул структуру, которую пока не распознали: '+JSON.stringify(d).slice(0,260)));return;}
   cb(null,arr.map(function(x){return {name:x.text||x.name||x.label||x.id||'Без имени',path:x.id||x.path||x.node,dir:x.isdir!==false};}));
  });
 });
}
function select(title,entries,back){
 var items=[];
 if(back)items.push({title:'← Назад',action:back});
 entries.forEach(function(x){items.push({title:(x.dir?'📁 ':'🎞️ ')+x.name,action:function(){if(x.dir)openFolder(x);else note('Файл найден. Запуск видео добавим после настройки HTTP-доступа к NAS.');}});});
 if(!entries.length)items.push({title:'Папок и файлов не найдено'});
 Lampa.Select.show({title:title,items:items,onSelect:function(item){if(item&&item.action)item.action();},onBack:function(){menu();}});
}
function openFolder(entry){
 var nas=activeNas;
 if(nas.type==='synology'){
  synFolder(entry.path,function(err,list){if(err){fail(err);return;}select(entry.name,list,function(){connectSynology();});});
 }else{
  qnapTree(entry.path,function(err,list){if(err){fail(err);return;}select(entry.name,list,function(){connectQnap();});});
 }
}
var activeNas;
function fail(e){console.error('[LAN Media '+VERSION+']',e);note(e.message||String(e));}
function connectSynology(){
 activeNas=NAS.synology;
 synLogin(function(err){if(err){fail(err);return;}synShares(function(e,list){if(e){fail(e);return;}select('Synology — общие папки',list,function(){menu();});});});
}
function connectQnap(){
 activeNas=NAS.qnap;
 qnapLogin(function(err){if(err){fail(err);return;}qnapTree('share_root',function(e,list){if(e){fail(e);return;}select('QNAP — общие папки',list,function(){menu();});});});
}
function menu(){
 Lampa.Select.show({title:'LAN Media '+VERSION,items:[
  {title:'Synology DS118 — подключиться',action:function(){if(askCredentials(NAS.synology))connectSynology();}},
  {title:'QNAP TS-462 — подключиться',action:function(){if(askCredentials(NAS.qnap))connectQnap();}},
  {title:'О версии',action:function(){note('Тест каталогов. Видео пока не запускается: браузеру нужен HTTP-доступ к файлам NAS.');}}
 ],onSelect:function(item){if(item&&item.action)item.action();},onBack:function(){Lampa.Controller.toggle('menu');}});
}
function addButton(){
 if(!Lampa.Menu||typeof Lampa.Menu.addButton!=='function'||window.lan_media_menu_added)return;
 window.lan_media_menu_added=true;
 Lampa.Menu.addButton('🗄️','LAN MEDIA TEST',menu);
 console.log('[LAN Media] '+VERSION+' ready');
}
if(window.appready)setTimeout(addButton,1500);
else if(Lampa.Listener&&typeof Lampa.Listener.follow==='function')Lampa.Listener.follow('app',function(e){if(e.type==='ready')setTimeout(addButton,1500);});
else setTimeout(addButton,2500);
})();
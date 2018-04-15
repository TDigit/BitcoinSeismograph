var WebSocketServer = require('ws').Server;
var express = require('express');
var path = require('path');
var app = express();
var server = require('http').createServer();

var router = express.Router();

router.get('/', function(req, res) {
        res.sendFile(path.join(__dirname + '/public/index.html'));
});

router.get('/legal', function(req, res) {
        res.sendFile(path.join(__dirname + '/public/legal.html'));
});

app.use('/', router);




app.use(express.static(path.join(__dirname, '/public')));

var wss = new WebSocketServer({server: server});

wsConnection = null;

wss.on('connection', function (ws) {
  wsConnection = ws;
  sendBlockData();
  sendNodeData();
  sendEventData();
  var id = setInterval(function () {
    //ws.send(JSON.stringify(process.memoryUsage()), function () { /* ignore errors */ });
    sendNodeData();
  }, 30000);
  console.log('started client interval');
  ws.on('close', function () {
    console.log('stopping client interval');
    clearInterval(id);
  });
});

server.on('request', app);
server.listen(80, function () {
  console.log('Listening on http://localhost:80');
});


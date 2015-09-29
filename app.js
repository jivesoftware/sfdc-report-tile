var express = require('express'),
    http = require('http'),
    jive = require('jive-sdk'),
    sampleOauth = require('./services/sampleOauth.js');

var app = express();

var failServer = function(reason) {
    console.log('FATAL -', reason );
    process.exit(-1);
};

var startServer = function () {
    var server = http.createServer(app).listen( app.get('port') || 8090, function () {
        console.log("Express server listening on port " + server.address().port);
    });
};

jive.service.init(app)
.then( function() {
    return jive.service.autowire();
})
.then(function() {
    // OAuth 3-legged endpoints, invoked from tile config pages
    app.get("/oauth/authorizeUrl", sampleOauth.authorizeUrl.bind(sampleOauth));
    app.get("/oauth/oauth2Callback", sampleOauth.oauth2Callback.bind(sampleOauth));
})
.then( function() {
    return jive.service.start();
})
.then( startServer, failServer );
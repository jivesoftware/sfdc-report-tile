var jive = require("jive-sdk");

exports.route = function(req, res){
    var conf = jive.service.options;
    res.render('config.html', { host: jive.service.serviceURL(), type: req.query.type  });
};

/*
exports.get = function(req, res){
    var conf = jive.service.options;
    var baseUrl = conf.clientUrl;
    if (conf.clientPort != 80) {
        baseUrl += ":" + conf.clientPort;
    }

    res.render('salesforce-config.html', { host: baseUrl });
};
*/

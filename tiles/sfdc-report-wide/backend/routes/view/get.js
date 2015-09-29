var jive = require("jive-sdk");

exports.route = function(req, res){
    var conf = jive.service.options;
    res.render('view.html', { host: jive.service.serviceURL(), type: req.query.type  });
};

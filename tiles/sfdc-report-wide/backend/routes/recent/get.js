var jive = require("jive-sdk");
var url = require('url');
var sfdc = require(process.cwd() + '/services/sfdc-client');

exports.route = function (req, res) {
    var url_parts = url.parse(req.url, true);
    var queryPart = url_parts.query;

    var term = queryPart["term"];
    var ticketId = queryPart["ticketId"];
    if (!ticketId) {
        jive.logger.error("Received recent reports request without ticket id");
        res.send(400);
        return;
    }

    var sfdcInstanceUrl;
    sfdc.getInstanceUrl(ticketId)
    .then(function(url) {
        sfdcInstanceUrl = url;
        return sfdc.getRecentReports(ticketId);
    })
    .then(function (entity) {
        var response = {
            records: entity,
            instanceUrl: sfdcInstanceUrl
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    })
    .catch(function (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(err));
    });
};

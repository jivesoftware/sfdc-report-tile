var jive = require("jive-sdk");
var url = require('url');
var sfdc = require(process.cwd() + '/services/sfdc-client');

exports.route = function (req, res) {
    var url_parts = url.parse(req.url, true);
    var queryPart = url_parts.query;

    var reportId = queryPart["reportId"];
    var ticketId = queryPart["ticketId"];
    if (!ticketId) {
        jive.logger.error("Received report describe request without ticket id");
        res.send(400);
        return;
    }

    sfdc.getReportMetadata(reportId, ticketId).then(function (entity) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(entity));
    }).catch(function (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(err));
    });
};

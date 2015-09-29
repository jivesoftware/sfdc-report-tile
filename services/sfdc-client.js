var jive = require("jive-sdk");
var sampleOauth = require('./sampleOauth');
var db = jive.service.persistence();

var API_PATH = '/services/data/v33.0';

/**
 * This object represents errors from the salesforce module.
 *
 * @param type Specifies type of error and defines what to expect in the detail field
 * @param message String message to show
 * @param detail Object containing details depending on error type
 * @constructor
 */
var SfdcError = function(type, message, detail) {
    this.type = type;
    this.message = message;
    this.detail = detail;
};

SfdcError.RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND";
SfdcError.INTERNAL_ERROR = "INTERNAL_ERROR";
SfdcError.EXPIRED_REFRESH_TOKEN = "EXPIRED_REFRESH_TOKEN";

exports.SfdcError = SfdcError;

/**
 * Get salesforce instance url associated with oauth token for given ticket
 */
exports.getInstanceUrl = function(ticketID) {
    return getAuthToken(ticketID)
    .then(function(token) {
        return token.instanceUrl;
    });
};

/**
 * Get recent reports (up to 200), returns array of
 * {
 *       "name": "Total # Accounts",
 *       "id": "00OD0000001ZbJqMAK",
 *       "url": "/services/data/v29.0/analytics/reports/00OD0000001ZbJqMAK",
 *       "describeUrl": "/services/data/v29.0/analytics/reports/00OD0000001ZbJqMAK/describe",
 *       "instancesUrl": "/services/data/v29.0/analytics/reports/00OD0000001ZbJqMAK/instances"
 * }
 */
exports.getRecentReports = function(ticketId) {
    return doGet("/analytics/reports/", ticketId)
    .then( function(response) {
        return response.entity;
    });
};

/**
 * Execute a report, returning a promise fulfilled with report data
 * Limited to 50 reports
 */
exports.getReportsBySearchTerm = function(term, ticketId) {
    var query = "select Id, Name, Format from Report where Name like '%" + term + "%' limit 50";
    return doQuery(query, ticketId)
    .then( function(entity) {
        return entity;
    })
    .fail(function(error) {
        jive.logger.error("Failed to query for reports, term " + term);
        throw error;
    });
};

/**
 * Get metadata about report structure, groupings etc
 */
exports.getReportMetadata = function(reportId, ticketId) {
    return doGet("/analytics/reports/" + reportId + "/describe", ticketId)
    .then( function(response) {
        return response.entity;
    })
    .fail(function(error) {
        jive.logger.error("Failed to get salesforce report metadata: " + reportId);
        throw error;
    });
};

/**
 * Execute a report, returning a promise fulfilled with report data
 */
exports.getReport = function(reportId, ticketId) {
    return doGet("/analytics/reports/" + reportId + "?includeDetails=true", ticketId)
    .then( function(response) {
        return response.entity;
    })
    .fail(function(error) {
        jive.logger.error("Failed to get salesforce report: " + reportId);
        throw error;
    });
};

/**
 * Get additional properties for report, not included in metadata
 */
exports.getReportProperties = function(reportId, ticketId) {
    var query = "select Description, LastModifiedDate, LastModifiedBy.Name from Report where Id = '" + reportId + "'";
    return doQuery(query, ticketId)
    .then( function(entity) {
        var props = entity.records[0];
        return {
            description: props.Description,
            lastModified: props.LastModifiedDate,
            lastModifiedBy: props.LastModifiedBy.Name
        };
    })
    .fail(function(error) {
        jive.logger.error("Failed to query for report properties, id " + reportId);
        throw error;
    });
};

/**
 * Perform a get request to given relative URL in salesforce
 * @param ticketID ID from manually installed tile config flow. If not defined, expect req to be from automatically created tile
 * @param uri
 * @return Promise to be fulfilled with response object
 */
function doGet(uri, ticketID) {
    var tokenData;
    return getAuthToken(ticketID)
    .then(function(found) {
        if (found) {
            tokenData = found;
            var headers = {'Authorization': 'Bearer ' + found.accessToken};
            return jive.util.buildRequest(found.instanceUrl + API_PATH + uri, 'GET', null, headers, null);
        }
        else {
            throw Error('No token record found for ticket ID ' + ticketID);
        }
    })
    .fail( function(err) {
        if (err.statusCode == 401) {
            jive.logger.info("SFDC OAuth access token expired, attempting to refresh");
            return sampleOauth.refreshToken(tokenData, ticketID)
            .then(function() {
                // updated token data has been saved and will be reloaded by this retry call
                return doGet(uri, ticketID);
            })
            .fail(function(error) {
                if (error.statusCode == 400 && error.entity.error == "invalid_grant") {
                    // could not get a new access token using refresh token, and need to ask user to reconfigure tile
                    jive.logger.error("Failed to renew access token for ticket: " + ticketID + " , message: " + error.entity.error_description);
                    throw new SfdcError(SfdcError.EXPIRED_REFRESH_TOKEN, "Expired refresh token", error);
                }
                else {
                    throw error;
                }
            });
        }
        else if (err.statusCode == 404) {
            jive.logger.error('Received 404 from: ' + uri);
            throw new SfdcError(SfdcError.RESOURCE_NOT_FOUND, "Resource not found", err);
        }
        else {
            jive.logger.error('Error querying salesforce url: ' + uri);
            jive.logger.error(err);
            throw new SfdcError(SfdcError.INTERNAL_ERROR, "Failed to execute request", err);
        }
    });
}

/**
 * Find oauth token from local database based on ticket id
 */
function getAuthToken(ticketId) {
    return db.find('tokens', {'ticket': ticketId })
    .then( function(found) {
        if ( found ) {
            return found[0];
        }
        else {
            jive.logger.error("Could not find token for ticket id: " + ticketId);
        }
    });
}

/**
 * Execute a SOQL query, returning a promise fulfilled with response entity
 */
function doQuery(query, ticketId) {
    return doGet("/query?q=" + encodeURIComponent(query), ticketId)
    .then( function(response) {
        return response.entity;
    });
}
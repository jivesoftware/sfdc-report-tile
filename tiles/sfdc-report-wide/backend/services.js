var jive = require('jive-sdk');
var sfdc = require(process.cwd() + '/services/sfdc-client');

exports.processTileInstance = function(instance) {
    var reportData;
    var cfg = instance.config;

    sfdc.getReport(cfg.reportId, cfg.ticketId)
    .then(function(data) {
        reportData = data;
        return sfdc.getReportProperties(cfg.reportId, cfg.ticketId);
    })
    .then(function(properties) {
        var tileData = {
            config: instance.config,
            title: reportData.reportMetadata.name,
            type: reportData.reportMetadata.reportFormat,
            lastModified: properties.lastModified,
            lastModifiedBy: properties.lastModifiedBy,
            detailColumnInfo: [],
            groupingColumnInfo: [],
            groupingsDown: reportData.groupingsDown.groupings,
            aggregates: reportData.reportMetadata.aggregates,
            contents: reportData.factMap,
            updated: new Date().getTime()
        };

        if (properties.description) {
            tileData.description = properties.description;
        }

        // these can be fields like 'ACCOUNT.NAME': { dataType: 'string', label: 'Account Name' }
        // and the dot in json field name does not work, so we just put the values in array
        Object.keys(reportData.reportExtendedMetadata.detailColumnInfo).forEach(function(key) {
            var info = reportData.reportExtendedMetadata.detailColumnInfo[key];
            info.field = key;
            tileData.detailColumnInfo.push(info);
        });

        Object.keys(reportData.reportExtendedMetadata.groupingColumnInfo).forEach(function(key) {
            // example  { dataType: 'picklist', groupingLevel: 0, label: 'Status' }
            var info = reportData.reportExtendedMetadata.groupingColumnInfo[key];
            info.field = key;
            tileData.groupingColumnInfo.push(info);
        });

        // replace null/undefined with " "
        Object.keys(tileData.contents).forEach(function(key) {
            tileData.contents[key].rows.forEach(function(row) {
                row.dataCells.forEach(function(cell) {
                    if (cell.value) {
                    }
                    else { // replacing undefined or null to avoid jive place edit error
                        cell.value = " ";
                    }
                });
            });
        });

        return jive.tiles.pushData(instance, {data: tileData});
    })
    .fail(function(error) {
        var errorTileData = {
            config: instance.config,
            title: instance.config.reportName,
            contents: {}
        };

        if (error.type == sfdc.SfdcError.RESOURCE_NOT_FOUND) {
            // report gone from salesforce, probably deleted
            jive.logger.info("Report " + instance.config.reportId + " not found");
            errorTileData.contents.error = "NOT_FOUND";
            jive.tiles.pushData(instance, {data: errorTileData});
        }
        if (error.type == sfdc.SfdcError.EXPIRED_REFRESH_TOKEN) {
            jive.logger.info("Report " + instance.config.reportId + " needs to be reconfigured due to OAuth error");
            errorTileData.contents.error = "RECONFIGURE";
            jive.tiles.pushData(instance, {data: errorTileData});
        }
        else if (error.statusCode == 400 && error.entity && error.entity.error && error.entity.error.message) {
            // todo maybe move this clearly under pushData since it can possibly catch other errors too
            // Jive returned a 400 error code from data push, probably exceeded data size limit
            jive.logger.info("Received 400 error from Jive, report id: " + instance.config.reportId + ", message: " + error.entity.error.message);
            errorTileData.contents = {
                error: "PUSH_ERROR",
                message: "Failed to push report data, error message: '" + error.entity.error.message + "'"
            };
            jive.tiles.pushData(instance, {data: errorTileData});
        }
        else {
            jive.logger.error("Failed to process tile: " + instance.url, error);
        }
    });
};


exports.task = new jive.tasks.build(
    function() {
        jive.tiles.findByDefinitionName( 'sfdc-report-wide' ).then( function(instances) {
            var delay = 0;
            instances.forEach( function( instance ) {
                setTimeout(exports.processTileInstance, delay, instance);
                delay += 10000; // split by 10 seconds
            });
        });
    },

    120*60*1000 // 2hr interval
);

exports.eventHandlers = [{
    'event': jive.constants.globalEventNames.NEW_INSTANCE,
    'handler': function (theInstance) {
        // For some reason adding this delay reduces the chances of the initial
        // data push not getting recognized in jive. Never got any errors, but
        // without this delay the data update just does not always appear in the tile.
        setTimeout(function() { exports.processTileInstance(theInstance); }, 2000);
    }
},
{
    'event': jive.constants.globalEventNames.INSTANCE_UPDATED,
    'handler': function (theInstance) {
        exports.processTileInstance(theInstance);
    }
}];

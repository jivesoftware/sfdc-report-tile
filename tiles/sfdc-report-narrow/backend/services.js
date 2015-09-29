var jive = require('jive-sdk');
var base = require(process.cwd() + '/tiles/sfdc-report-wide/backend/services');

/**
 * This narrow tile was created to be able to handle wide vs. narrow config
 * differently. This happens by passing a query param into config url.
 * Otherwise tile config, view and backend services are identical, and
 * thats why we reference sfdc-report-wide services here.
 */
exports.task = new jive.tasks.build(
    function() {
        jive.tiles.findByDefinitionName( 'sfdc-report-narrow' ).then( function(instances) {
            var delay = 0;
            instances.forEach( function( instance ) {
                setTimeout(base.processTileInstance, delay, instance);
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
        setTimeout(function() { base.processTileInstance(theInstance); }, 2000);
    }
},
{
    'event': jive.constants.globalEventNames.INSTANCE_UPDATED,
    'handler': function (theInstance) {
        base.processTileInstance(theInstance);
    }
}];

(function() {
    jive.tile.onOpen(function(context, options) {
        var data = context.data;
        var cfg = context.data.config;

        $("#description").append(data.description);

        var lastModifiedDate = new Date(data.lastModified);
        $("#report-modified").append(lastModifiedDate.toLocaleString() + " by " + data.lastModifiedBy);

        var updated = new Date(parseInt(data.updated));
        $("#last-refresh").append(updated.toLocaleString());

        $("#sfdc-link").attr("href", cfg.instanceUrl + "/" + cfg.reportId);
        gadgets.window.adjustHeight();
    });
})();
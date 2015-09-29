(function() {
    var ticketId, reportId, reportName, sfdcInstanceUrl;

    var showOAuthInitView = function() {
        $("#j-card-authentication").show();
        $("#j-card-process-oauth").hide();
        $("#j-card-configuration").hide();
    };

    var showOAuthProcessView = function() {
        $("#j-card-authentication").hide();
        $("#j-card-process-oauth").show();
        $("#j-card-configuration").hide();
    };

    var showConfigView = function() {
        $("#j-card-authentication").hide();
        $("#j-card-process-oauth").hide();
        $("#j-card-configuration").show();

        if (!reportId) {
            // this is a new tile, automatically show report search dialog
            showReportSelectDialog();
        }
    };

    var ticketErrorCallback = function() {
        showOAuthInitView();
        alert('ticketErrorCallback error');
    };

    var jiveAuthorizeUrlErrorCallback = function() {
        showOAuthInitView();
        alert('jiveAuthorizeUrlErrorCallback error');
    };

    var preOauth2DanceCallback = function() {
        showOAuthInitView();
        gadgets.window.adjustHeight();
    };

    var escapeSearchTerm = function(term) {
        // Prepend a backslash to all SOSL reserved chars
        var pattern = /([?&|!{}\[\]()^~*:\\"'+-])/g;
        return term.replace(pattern, "\\$1");
    };

    var handleAutoCompleteSource = function( searchInput, listDataCallback ) {
        // Ampersand would cause the sosl query to return a 400 error since Jive does not escape it
        // removing ampersand as a short-term workaround
        var trimmedTerm = $.trim(searchInput.term.replace("&", " "));

        // salesforce search requires at least two chars
        if (trimmedTerm.length < 2) {
            listDataCallback();
            return;
        }

        $("#no-results").hide();
        $("#search-activity-icon").show();
        var escapedTerm = escapeSearchTerm(trimmedTerm);
        osapi.http.get({
            'href' : SERVICE_BASE_URL + '/sfdc-report-wide/search?' +
                "&nocache=" + new Date().getTime() +
                "&ticketId=" + ticketId +
                "&term=" + encodeURIComponent(escapedTerm),
            'format' : 'json',
            'authz': 'signed'
        }).execute(function( response ) {
            $("#search-activity-icon").hide();
            if ( response.status >= 400 && response.status <= 599 ) {
                alert("ERROR!", JSON.stringify(response.content));
                listDataCallback();
                return;
            }

            var reports = response.content.records;
            var listItems = [];
            $.each(reports, function(index, report) {
                listItems.push({
                    "value": report.Name,
                    "id": report.Id
                });
            });
            $("#no-results").toggle(listItems.length == 0);
            listDataCallback(listItems);
        });
    };

    var handleAutoCompleteSelect = function(event, ui) {
        reportId = ui.item.id;
        reportName = ui.item.value;
        $("#report-dialog" ).dialog("close");

        // disable Apply button until properties are verified
        $("#configure").prop("disabled", true);
        renderSelectedReport();
        verifyReportProperties();
    };

    var renderSelectedReport = function() {
        $("#report-name").text(reportName);
        $("#report-sfdc-link").attr("href", sfdcInstanceUrl + "/" + reportId);
    };

    /**
     * Check report metadata prior to allowing to apply config
     */
    var verifyReportProperties = function() {
        $("#verify-activity-icon").show();
        osapi.http.get({
            'href' : SERVICE_BASE_URL + '/sfdc-report-wide/describe?' +
                "&ts=" + new Date().getTime() +
                "&reportId=" + reportId +
                "&ticketId=" + ticketId,
            'format' : 'json',
            'authz': 'signed'
        }).execute(function( response ) {
            $("#verify-activity-icon").hide();
            var metadata = response.content.reportMetadata;
            if (metadata.reportFormat != "TABULAR" && metadata.reportFormat != "SUMMARY") {
                showError("Report format not supported: " + metadata.reportFormat +
                    ". Please select a tabular or summary report.");
            }
            else {
                $("#configure").prop("disabled", false); // report is ok
            }
        });
    };

    var showError = function(msg) {
        $("#error").append(msg).show();
    };

    var showReportSelectDialog = function() {
        // Send a request to get recent requests, and show the ui element when loaded
        $("#recent-reports").hide();
        $("#recent-list").empty();
        osapi.http.get({
            'href' : SERVICE_BASE_URL + '/sfdc-report-wide/recent?' +
                "&ts=" + new Date().getTime() +
                "&ticketId=" + ticketId,
            'format' : 'json',
            'authz': 'signed'
        }).execute(function( response ) {
            sfdcInstanceUrl = response.content.instanceUrl;
            $.each(response.content.records, function(i, report) {
                if (i > 9) {
                    return false; // limit to ten recent reports
                }
                var link = $("<a>").append(report.name).click(function() {
                    reportId = report.id;
                    reportName = report.name;
                    $("#report-dialog" ).dialog("close");

                    $("#configure").prop("disabled", true);
                    renderSelectedReport();
                    verifyReportProperties();
                });
                $("<li>").append(link).appendTo($("#recent-list"));
            });
            $("#recent-reports").show();
        });

        $("#no-results").hide();
        $("#report-dialog").dialog({
            modal: true,
            resizable: false,
            height: 350,
            width: 350,
            dialogClass: 'report-dialog'
        });

        $("#search-input").val("").autocomplete({
            source: handleAutoCompleteSource,
            select: handleAutoCompleteSelect,
            delay: 400  // ms to wait after last keystroke until querying for results
        });
    };

    var onLoadCallback = function( config, identifiers ) {
        reportId = config.reportId;
        reportName = config.reportName;
        sfdcInstanceUrl = config.instanceUrl;
        $("#search-toolbar-checkbox").prop('checked', config.showSearch);
        $("#max-height-input").val(config.maxHeight);
        renderSelectedReport();

        $("#configure").click(function() {
            var data = {
                reportId: reportId,
                reportName: reportName,
                instanceUrl: sfdcInstanceUrl,
                showSearch: $("#search-toolbar-checkbox").prop('checked'),
                ticketId: ticketId
            };

            var maxHeightOverride = $("#max-height-input").val();
            if (maxHeightOverride) {
                data.maxHeight = maxHeightOverride;
            }

            jive.tile.close(data);
        });

        $("#select-report-link").click(showReportSelectDialog);
    };

    var oauth2SuccessCallback = function(ticket) {
        if (!ticket) {
            // oauth process did not complete, user might have just closed the popup
            showOAuthInitView();
            return;
        }
        ticketId = ticket;
        showConfigView();
        gadgets.window.adjustHeight();
    };


    $(document).ready( function() {
        $("#grant-button").click(function() {
            showOAuthProcessView();
        });

        var options = {
            serviceHost: SERVICE_BASE_URL,
            grantDOMElementID: '#grant-button', // sdk creates a click handler for this element to show popup
            ticketErrorCallback: ticketErrorCallback,
            jiveAuthorizeUrlErrorCallback: jiveAuthorizeUrlErrorCallback,
            oauth2SuccessCallback: oauth2SuccessCallback,
            preOauth2DanceCallback: preOauth2DanceCallback,
            onLoadCallback: onLoadCallback,
            authorizeUrl: SERVICE_BASE_URL + '/oauth/authorizeUrl'
        };
        // this method defines a jive.tile.onOpen callback internally
        OAuth2ServerFlow( options ).launch();
    });
})();



jive.tile.onOpen(function(config, options) {
    // this prevents confusing messages in console log.. rejection tracking seems buggy?
    Q.stopUnhandledRejectionTracking();

    var app = new ReportView(config);
    app.init();
});

/**
 * Place tab which is shown on place main page, if the extended property defined
 * in app.xml is enabled in config view
 */
function ReportView(data) {
    this.data = data;
    this.rowCountIndex = -1;
    this.resizeTimer = null;

    var thisObj = this;
    $("#report-info-link").click(function() {
        jive.tile.doAction($(this), {data: thisObj.data});
    });
}

/**
 * Validate received report data
 */
ReportView.prototype.validateReportData = function() {
    if (!this.data.contents) {
        this.showError("No data yet, please wait and reload the page.");
        return false;
    }

    // check for server errors
    if (this.data.contents.error == "NOT_FOUND") {
        // Report has probably been deleted from SFDC
        this.showError("The report '" + this.data.title + "' cannot be found in Salesforce. Please check the report and reconfigure this tile if needed.");
        return false;
    }

    if (this.data.contents.error == "PUSH_ERROR") {
        // An error occurred when pushing data from backend service to Jive, most likely an exceeded tile data limit
        this.showError(this.data.contents.message);
        return false;
    }

    if (this.data.contents.error == "RECONFIGURE") {
        // SFDC OAuth refresh token has been revoked or expired and backend service cannot get report data
        this.showError("Salesforce authentication has been reset, please reconfigure this tile.");
        return false;
    }

    // validate report properties, in case it has been modified since configured
    if (this.data.type != "TABULAR" && this.data.type != "SUMMARY") {
        this.showError("Report format not supported: " + this.data.type +
            ". Please select a tabular or summary report.");
        return false;
    }

    return true;
};

/**
 * Process report data and render grid
 */
ReportView.prototype.init = function() {
    var thisObj = this;

    if (!this.validateReportData()) {
        return;
    }

    // fill out data model for jqGrid
    var gridOptions = {
        datatype: 'local', // data is populated with addRowData instead of ajax call
        ignoreCase: true,  // local search ignores case
        rowNum: 9999,      // needed to show all rows, but do NOT use -1 because it breaks toolbar search
        autowidth: true,   // grid is sized to container
        shrinkToFit: true, // scale column widths to maintain set grid width
        colNames: [],
        colModel: [],
        beforeSelectRow: function(rowid, e) {
            return false; // disable row selection and highlight
        }
    };

    if (this.data.type == "SUMMARY") {
        this.postProcessSummaryReport(); // need this done before building column model
    }

    $.each(this.data.detailColumnInfo, function (i, info) {
        gridOptions.colNames.push(info.label);
        gridOptions.colModel.push(thisObj.columnModelFromInfo(info));
        info.textLen = 0; // initialize an additional text length average property
    });

    // create a data object for each row with fields matching column model names
    var rowData = [];
    if (this.data.type == "TABULAR") {
        $.each(this.data.contents['T!T'].rows, function (n, row) {
            var d = {};
            $.each(row.dataCells, function (j, col) {
                d[thisObj.data.detailColumnInfo[j].field] = col.label;
                thisObj.data.detailColumnInfo[j].textLen += col.label.length; // sum column text length
            });
            rowData.push(d);
        });
    }
    else if (this.data.type == "SUMMARY") {
        // enable jqgrid grouping using the first level, since only one level is supported
        gridOptions.grouping = true;

        // Aggregates always contains one entry for row count, so if it has more than
        // one entry, it means there are some grouping aggregates, and we should show summary row
        var showSummaryRow = this.data.aggregates.length > 1;

        gridOptions.groupingView = {
            groupField: [this.data.groupingColumnInfo[0].field],
            groupColumnShow: [false],
            groupText: ["<b>" + this.data.groupingColumnInfo[0].label + ":</b> {0} ({1} records)"],
            groupSummary: [showSummaryRow]
        };

        // add column for the grouping field, since not included in column detail info
        // getSummaryReportData function will fill values for this column, so that jqgrid
        // can handle grouping
        gridOptions.colNames.push(this.data.groupingColumnInfo[0].label);
        gridOptions.colModel.push({
            name: this.data.groupingColumnInfo[0].field
        });

        this.getSummaryReportData(this.data.groupingsDown, rowData);
    }
    else {
        this.showError("Unknown report data type: " + this.data.type);
        return; // should not be able to get here
    }

    // average text length, and set column model widths
    $.each(this.data.detailColumnInfo, function (i, info) {
        info.textLen = info.textLen / rowData.length;
        gridOptions.colModel[i].width = Math.min(40, Math.max(10, Math.round(info.textLen)));
    });

    // set grid height options depending on row count
    if (TILE_TYPE == "narrow" && rowData.length > 10) {
        gridOptions.height = this.data.config.maxHeight || 300;
        gridOptions.scroll = true;
    }
    else if (TILE_TYPE == "wide" && rowData.length > 15) {
        gridOptions.height = this.data.config.maxHeight || 400;
        gridOptions.scroll = true;
    }
    else {
        gridOptions.height = 'auto';
    }

    // add id field required by addRowData method
    $.each(rowData, function(i, d) {
        d.rowId = i;
    });
    gridOptions.data = rowData;

    $("img.activity-load").hide();
    $("#grid-container").show();
    var grid = $("#grid");
    grid.jqGrid(gridOptions);

    if (thisObj.data.config.showSearch) {
        grid.filterToolbar({stringResult: true, searchOnEnter: false});
    }

    if (TILE_TYPE == "wide") {
        // only adjust width for wide tiles, since narrow tiles have constant width
        $(window).resize(gadgets.util.makeClosure(this, this.handleResize));
        this.handleResize();
    }
    gadgets.window.adjustHeight();
};

ReportView.prototype.showError = function(msg) {
    $("img.activity-load").hide();
    $("#grid-container").hide();
    $("#error").append(msg).show();
};

// Set grid dimensions to resized browser window (home view only)
// but only do this 1sec after last resize event occurs
ReportView.prototype.handleResize = function() {
    if (this.resizeTimer != null) {
        // Cancel function call that was queued up on previous event
        // since user is still resizing the window
        clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(gadgets.util.makeClosure(this, this.updateGridDimensions), 1000);
};

ReportView.prototype.updateGridDimensions = function() {
    // Resize grid to match app full width
    var dim = gadgets.window.getViewportDimensions();
    $("#grid").jqGrid('setGridWidth', dim.width - 5);
};


ReportView.prototype.columnModelFromInfo = function(info) {
    var thisObj = this;
    var model = {
        name: info.field,
        width: 10,
        searchoptions: {
            clearSearch: false, // disable x button to clear search
            sopt: ["cn"]        // search using contains operator
        }
    };

    if (info.dataType == "date") {
        model.sorttype = "date";
        model.datefmt = "m/d/Y";
    }

    if (info.aggregateIndex > -1) {
        model.summaryType = function(val, name, record) {
            // find grouping data matching this row
            if (!val) {
                var aggregateVal = "";
                $.each(thisObj.data.groupingsDown, function (groupIndex, grouping) {
                    if (grouping.label == record[thisObj.data.groupingColumnInfo[0].field]) {
                        var groupData = thisObj.data.contents[grouping.key + "!T"];

                        // get the aggregate value computed by salesforce
                        aggregateVal = groupData.aggregates[info.aggregateIndex].label;
                        return false;
                    }
                });
                if (aggregateVal.length == 0) {
                    console.error("Could not find grouping data for " + record[thisObj.data.groupingColumnInfo[0].field]);
                }
                return aggregateVal;
            }
            else {
                return val;
            }
        };
    }

    return model;
};


ReportView.prototype.getSummaryReportData = function(groupings, rowData, parentGroupingValue) {
    var thisObj = this;
    $.each(groupings, function(i, grouping) {
        var groupData = thisObj.data.contents[grouping.key + "!T"];

        // when this function is called with a parent grouping value, it is a recursive call for a sub
        // grouping and since jqGrid does not support multiple levels of grouping, keep the parent grouping value
        var groupingValue = parentGroupingValue || grouping.label;

        $.each(groupData.rows, function (j, row) {
            var d = {};
            // add grouping value column which is used by jqGrid to group rows and show group header row
            d[thisObj.data.groupingColumnInfo[0].field] = groupingValue;
            $.each(row.dataCells, function (k, col) {
                d[thisObj.data.detailColumnInfo[k].field] = col.label;
                thisObj.data.detailColumnInfo[k].textLen += col.label.length; // sum column text length
            });
            rowData.push(d);
        });

        // call this function recursively to get sub grouping data
        thisObj.getSummaryReportData(grouping.groupings, rowData, groupingValue);
    });
};

/**
 * Summary report data lists aggregate values, but we need to know which columns
 * they refer to. This method finds the column indexes for each aggregate.
 */
ReportView.prototype.postProcessSummaryReport = function() {
    var thisObj = this;

    // find aggregate column indexes, and builtin row count data index
    $.each(thisObj.data.aggregates, function (aggIndex, aggName) {
        if (aggName == "RowCount") {
            thisObj.rowCountIndex = aggIndex;
        }
        else {
            // aggregate name is for example: "s!Opportunity.X1_Year_Value__c"
            var sepIndex = aggName.indexOf("!");
            if (sepIndex < 0) {
                console.error("Failed to parse aggregate name: " + aggName);
            }
            else {
                var aggColumnField = aggName.substr(sepIndex+1);
                $.each(thisObj.data.detailColumnInfo, function (colIndex, elem) {
                    if (aggColumnField == elem.field) {
                        elem.aggregateIndex = aggIndex;
                        return false; // stops $.each loop
                    }
                });
            }

        }
    });
};

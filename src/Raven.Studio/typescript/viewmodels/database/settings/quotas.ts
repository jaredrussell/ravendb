import viewModelBase = require("viewmodels/viewModelBase");
import document = require("models/database/documents/document");
import database = require("models/resources/database");
import appUrl = require("common/appUrl");
import getDatabaseSettingsCommand = require("commands/resources/getDatabaseSettingsCommand");
import accessHelper = require("viewmodels/shell/accessHelper");
import eventsCollector = require("common/eventsCollector");

class quotas extends viewModelBase {
    settingsDocument = ko.observable<document>();

/*TODO
    maximumSize: configurationSetting;
    warningLimitThreshold: configurationSetting;
    maxNumberOfDocs: configurationSetting;
    warningThresholdForDocs: configurationSetting;
 
    isSaveEnabled: KnockoutComputed<boolean>;
    isForbidden = ko.observable<boolean>(false);
    

    constructor() {
        super();
        this.activeDatabase.subscribe((db: database) => this.isForbidden(!db.isAdminCurrentTenant()));
    }

    canActivate(args: any): any {
        super.canActivate(args);
        var deferred = $.Deferred();

        this.isForbidden(accessHelper.isGlobalAdmin() == false);
        if (this.isForbidden() == false) {
            var db = this.activeDatabase();
            // fetch current quotas from the database
            this.fetchQuotas(db)
                .done(() => deferred.resolve({ can: true }))
                .fail(() => deferred.resolve({ redirect: appUrl.forDatabaseRecord(this.activeDatabase()) }));
        } else {
            deferred.resolve({ can: true });
        }

        return deferred;
    }

    activate(args: any) {
        super.activate(args);
        this.updateHelpLink('594W7T');
        this.initializeDirtyFlag();
        this.isSaveEnabled = ko.computed(() => this.dirtyFlag().isDirty() === true);
    }

    private fetchQuotas(db: database, reportFetchProgress: boolean = false): JQueryPromise<any> {
        var dbSettingsTask = new getDatabaseSettingsCommand(db, reportFetchProgress)
            .execute()
            .done((doc: document) => this.settingsDocument(doc));

        var configTask = new getConfigurationSettingsCommand(db,
            ["Raven/Quotas/Size/HardLimitInKB", "Raven/Quotas/Size/SoftMarginInKB", "Raven/Quotas/Documents/HardLimit", "Raven/Quotas/Documents/SoftLimit"])
            .execute()
            .done((result: configurationSettings) => {
                this.maximumSize = result.results["Raven/Quotas/Size/HardLimitInKB"];
                this.warningLimitThreshold = result.results["Raven/Quotas/Size/SoftMarginInKB"];
                this.maxNumberOfDocs = result.results["Raven/Quotas/Documents/HardLimit"];
                this.warningThresholdForDocs = result.results["Raven/Quotas/Documents/SoftLimit"];

                var divideBy1024 = (x: KnockoutObservable<any>) => {
                    if (x()) {
                        x(x() / 1024);
                    }
                }

                divideBy1024(this.maximumSize.effectiveValue);
                divideBy1024(this.maximumSize.globalValue);
                divideBy1024(this.warningLimitThreshold.effectiveValue);
                divideBy1024(this.warningLimitThreshold.globalValue);
            });
        
        return $.when<any>(dbSettingsTask, configTask);
    }

    initializeDirtyFlag() {
        this.dirtyFlag = new ko.DirtyFlag([
            this.maximumSize.effectiveValue, this.maximumSize.localExists,
            this.warningLimitThreshold.effectiveValue, this.warningLimitThreshold.localExists,
            this.maxNumberOfDocs.effectiveValue, this.maxNumberOfDocs.localExists,
            this.warningThresholdForDocs.effectiveValue, this.warningThresholdForDocs.localExists
        ]);
    }

    saveChanges() {
        eventsCollector.default.reportEvent("quotas", "save");

        var db = this.activeDatabase();
        if (db) {
            var settingsDocument: any = this.settingsDocument();
            settingsDocument["@metadata"] = this.settingsDocument().__metadata;
            settingsDocument["@metadata"]["@etag"] = (<any>this.settingsDocument()).__metadata["@etag"];
            var doc: any = new document(settingsDocument.toDto(true));
            doc["Settings"]["Raven/Quotas/Size/HardLimitInKB"] = <any>this.maximumSize.effectiveValue() * 1024;
            doc["Settings"]["Raven/Quotas/Size/SoftMarginInKB"] = <any>this.warningLimitThreshold.effectiveValue() * 1024;
            doc["Settings"]["Raven/Quotas/Documents/HardLimit"] = this.maxNumberOfDocs.effectiveValue();
            doc["Settings"]["Raven/Quotas/Documents/SoftLimit"] = this.warningThresholdForDocs.effectiveValue();
            
            var saveTask = new saveDatabaseSettingsCommand(db, doc).execute();
            saveTask.done((saveResult: databaseDocumentSaveDto) => {
                (<any>this.settingsDocument()).__metadata["@etag"] = saveResult.ETag;
                this.dirtyFlag().reset(); //Resync Changes
            });
        }
    }*/
}

export = quotas;

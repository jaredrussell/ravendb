import app = require("durandal/app");
import appUrl = require("common/appUrl");
import viewModelBase = require("viewmodels/viewModelBase");
import router = require("plugins/router");
import ongoingTaskSqlEtlEditModel = require("models/database/tasks/ongoingTaskSqlEtlEditModel");
import getOngoingTaskInfoCommand = require("commands/database/tasks/getOngoingTaskInfoCommand");
import eventsCollector = require("common/eventsCollector");
import getConnectionStringInfoCommand = require("commands/database/settings/getConnectionStringInfoCommand");
import getConnectionStringsCommand = require("commands/database/settings/getConnectionStringsCommand");
import saveEtlTaskCommand = require("commands/database/tasks/saveEtlTaskCommand");
import generalUtils = require("common/generalUtils");
import ongoingTaskSqlEtlTransformationModel = require("models/database/tasks/ongoingTaskSqlEtlTransformationModel");
import collectionsTracker = require("common/helpers/database/collectionsTracker");
import transformationScriptSyntax = require("viewmodels/database/tasks/transformationScriptSyntax");
import ongoingTaskSqlEtlTableModel = require("models/database/tasks/ongoingTaskSqlEtlTableModel");
import connectionStringSqlEtlModel = require("models/database/settings/connectionStringSqlEtlModel");
import aceEditorBindingHandler = require("common/bindingHelpers/aceEditorBindingHandler");
import getPossibleMentorsCommand = require("commands/database/tasks/getPossibleMentorsCommand");
import jsonUtil = require("common/jsonUtil");

class editSqlEtlTask extends viewModelBase {

    static readonly scriptNamePrefix = "Script #";
    
    editedSqlEtl = ko.observable<ongoingTaskSqlEtlEditModel>();
    isAddingNewSqlEtlTask = ko.observable<boolean>(true);
    transformationScriptSelectedForEdit = ko.observable<ongoingTaskSqlEtlTransformationModel>();
    editedTransformationScriptSandbox = ko.observable<ongoingTaskSqlEtlTransformationModel>();
    editedSqlTable = ko.observable<ongoingTaskSqlEtlTableModel>();

    possibleMentors = ko.observableArray<string>([]);
    sqlEtlConnectionStringsNames = ko.observableArray<string>([]); 
    connectionStringsUrl = appUrl.forCurrentDatabase().connectionStrings();

    testConnectionResult = ko.observable<Raven.Server.Web.System.NodeConnectionTestResult>();
    
    spinners = {
        test: ko.observable<boolean>(false),
        save: ko.observable<boolean>(false)
    };
    
    fullErrorDetailsVisible = ko.observable<boolean>(false);
    shortErrorText: KnockoutObservable<string>;
    
    collectionNames: KnockoutComputed<string[]>;
    
    showAdvancedOptions = ko.observable<boolean>(false);
    showEditTransformationArea: KnockoutComputed<boolean>;
    showEditSqlTableArea: KnockoutComputed<boolean>;

    createNewConnectionString = ko.observable<boolean>(false);
    newConnectionString = ko.observable<connectionStringSqlEtlModel>(); 

    constructor() {
        super();
        this.bindToCurrentInstance("useConnectionString",
                                   "useCollection",
                                   "testConnection",
                                   "removeTransformationScript",
                                   "cancelEditedTransformation",
                                   "cancelEditedSqlTable",
                                   "saveEditedTransformation",
                                   "saveEditedSqlTable",
                                   "syntaxHelp",
                                   "toggleAdvancedArea",
                                   "deleteSqlTable",
                                   "editSqlTable");

        aceEditorBindingHandler.install();
    }

    activate(args: any) {
        super.activate(args);
        const deferred = $.Deferred<void>();

        if (args.taskId) {
            // 1. Editing an Existing task
            this.isAddingNewSqlEtlTask(false);

            getOngoingTaskInfoCommand.forSqlEtl(this.activeDatabase(), args.taskId)
                .execute()
                .done((result: Raven.Client.ServerWide.Operations.OngoingTaskSqlEtlDetails) => {
                    this.editedSqlEtl(new ongoingTaskSqlEtlEditModel(result));
                    deferred.resolve();
                })
                .fail(() => {
                    deferred.reject();
                    router.navigate(appUrl.forOngoingTasks(this.activeDatabase()));
                });
        } else {
            // 2. Creating a New task
            this.isAddingNewSqlEtlTask(true);
            this.editedSqlEtl(ongoingTaskSqlEtlEditModel.empty());
            this.editedTransformationScriptSandbox(ongoingTaskSqlEtlTransformationModel.empty());
            this.editedSqlTable(ongoingTaskSqlEtlTableModel.empty());
            deferred.resolve();
        }
        
        deferred.done(() => {
            this.initObservables();
        });

        return $.when<any>(this.getAllConnectionStrings(), this.loadPossibleMentors(), deferred);
    }

    private loadPossibleMentors() {
        return new getPossibleMentorsCommand(this.activeDatabase().name)
            .execute()
            .done(mentors => this.possibleMentors(mentors));
    }
    
    compositionComplete() {
        super.compositionComplete();

        $('.edit-raven-sql-task [data-toggle="tooltip"]').tooltip();
    }
    
    /***************************************************/
    /*** General Sql ETl Model / Page Actions Region ***/
    /***************************************************/

    private getAllConnectionStrings() {
        return new getConnectionStringsCommand(this.activeDatabase())
            .execute()
            .done((result: Raven.Client.ServerWide.Operations.ConnectionStrings.GetConnectionStringsResult) => {
                const connectionStringsNames = Object.keys(result.SqlConnectionStrings);
                this.sqlEtlConnectionStringsNames(_.sortBy(connectionStringsNames, x => x.toUpperCase()));
            });
    }

    private initObservables() {
        // Discard test connection result when connection string has changed
        this.editedSqlEtl().connectionStringName.subscribe(() => this.testConnectionResult(null));

        this.shortErrorText = ko.pureComputed(() => {
            const result = this.testConnectionResult();
            if (!result || result.Success) {
                return "";
            }
            return generalUtils.trimMessage(result.Error);
        });

        this.collectionNames = ko.pureComputed(() => {
           return collectionsTracker.default.getCollectionNames(); 
        });
        
        
        this.showEditSqlTableArea = ko.pureComputed((() => !!this.editedSqlTable()));
        this.showEditTransformationArea = ko.pureComputed(() => !!this.editedTransformationScriptSandbox());
        
        this.initDirtyFlag();
        
        this.createNewConnectionString.subscribe((createNew) => {
            if (createNew) {
                this.dirtyFlag().forceDirty();
            }
        });

        this.newConnectionString(connectionStringSqlEtlModel.empty());
    }
    
    private initDirtyFlag() {
        const innerDirtyFlag = ko.pureComputed(() => this.editedSqlEtl().dirtyFlag().isDirty());
        const editedScriptFlag = ko.pureComputed(() => !!this.editedTransformationScriptSandbox() && this.editedTransformationScriptSandbox().dirtyFlag().isDirty());
        const editedSqlTableFlag = ko.pureComputed(() => !!this.editedSqlTable() && this.editedSqlTable().dirtyFlag().isDirty());
        
        const scriptsCount = ko.pureComputed(() => this.editedSqlEtl().transformationScripts().length);
        const tablesCount = ko.pureComputed(() => this.editedSqlEtl().sqlTables().length);
        
        const hasAnyDirtyTransformationScript = ko.pureComputed(() => {
            let anyDirty = false;
            this.editedSqlEtl().transformationScripts().forEach(script => {
                if (script.dirtyFlag().isDirty()) {
                    anyDirty = true;
                    // don't break here - we want to track all dependencies
                }
            });
            return anyDirty;
        });
        
        const hasAnyDirtySqlTable = ko.pureComputed(() => {
            let anyDirty = false;
            this.editedSqlEtl().sqlTables().forEach(table => {
                if (table.dirtyFlag().isDirty()) {
                    anyDirty = true;
                    // don't break here - we want to track all dependencies
                }
            });
            return anyDirty;
        });

        this.dirtyFlag = new ko.DirtyFlag([
            innerDirtyFlag,
            editedScriptFlag,
            editedSqlTableFlag,
            scriptsCount,
            tablesCount,
            hasAnyDirtyTransformationScript,
            hasAnyDirtySqlTable,
            
        ], false, jsonUtil.newLineNormalizingHashFunction);
    }
    
    useConnectionString(connectionStringToUse: string) {
        this.editedSqlEtl().connectionStringName(connectionStringToUse);
    }

    testConnection() {
        eventsCollector.default.reportEvent("SQL-ETL-connection-string", "test-connection");
        this.spinners.test(true);
        
        // New connection string
        if (this.createNewConnectionString()) {
            this.newConnectionString()
                .testConnection(this.activeDatabase())
                .done((testResult) => this.testConnectionResult(testResult))
                .always(()=> this.spinners.test(false));
        }
        else {
            // Existing connection string
            getConnectionStringInfoCommand.forSqlEtl(this.activeDatabase(), this.editedSqlEtl().connectionStringName())
                .execute()
                .done((result: Raven.Client.ServerWide.ETL.SqlConnectionString) => {                       
                       new connectionStringSqlEtlModel(result, true, [])
                            .testConnection(this.activeDatabase())
                            .done((testResult) => this.testConnectionResult(testResult))
                            .always(() => this.spinners.test(false));
                });                        
        }    
    }

    saveSqlEtl() {
        let hasAnyErrors = false;
        this.spinners.save(true);
        
        // 1. Validate *edited sql table*
        if (this.showEditSqlTableArea()) {
            if (!this.isValid(this.editedSqlTable().validationGroup)) {                
                hasAnyErrors = true;
            } else {
                this.saveEditedSqlTable();
            }
        }
        
        // 2. Validate *edited transformation script*
        if (this.showEditTransformationArea()) {
            if (!this.isValid(this.editedTransformationScriptSandbox().validationGroup)) {
                hasAnyErrors = true;  
            } else {
                this.saveEditedTransformation();
            }
        }
        
        // 3. Validate *new connection string* (if relevant..)
        let savingNewStringAction = $.Deferred<void>();        
        if (this.createNewConnectionString()) {
            if (!this.isValid(this.newConnectionString().validationGroup)) {
                hasAnyErrors = true;  
            } 
            else {               
                // Save & use the new connection string
                this.newConnectionString()
                    .saveConnectionString(this.activeDatabase())
                    .done(() => { 
                        this.editedSqlEtl().connectionStringName(this.newConnectionString().connectionStringName());
                        savingNewStringAction.resolve();
                     });   
            } 
        } 
        else {
            savingNewStringAction.resolve();
        }       
        
        // 4. Validate *general form*
        savingNewStringAction.done(() => {
            if (!this.isValid(this.editedSqlEtl().validationGroup)) {
                hasAnyErrors = true;
            }
        });
        
        if (hasAnyErrors) {
            this.spinners.save(false);
            return false;
        }

        // 5. Validation is OK - Save opened sections (if any)        
        if (this.showEditTransformationArea()) {
            this.saveEditedTransformation();
        }
        
        if (this.showEditSqlTableArea()) {
            this.saveEditedSqlTable();
        }
        
        // 6. Convert form to dto and send collected data to server
        savingNewStringAction.done(()=> {
            const dto = this.editedSqlEtl().toDto();
            saveEtlTaskCommand.forSqlEtl(this.activeDatabase(), dto)
                .execute()
                .done(() => {
                    this.dirtyFlag().reset();
                    this.goToOngoingTasksView();
                 })    
                .always(() => this.spinners.save(false));
        });      
    }

    cancelOperation() {
        this.goToOngoingTasksView();
    }

    private goToOngoingTasksView() {
        router.navigate(appUrl.forOngoingTasks(this.activeDatabase()));
    }

    syntaxHelp() {
        const viewmodel = new transformationScriptSyntax("Sql");
        app.showBootstrapDialog(viewmodel);
    }
   
    toggleAdvancedArea() {
        this.showAdvancedOptions.toggle();
    }

    /********************************************/
    /*** Transformation Script Actions Region ***/
    /********************************************/

    useCollection(collectionToUse: string) {
        this.editedTransformationScriptSandbox().collection(collectionToUse);
    }
    
    addNewTransformation() {
        this.transformationScriptSelectedForEdit(null);
        this.editedTransformationScriptSandbox(ongoingTaskSqlEtlTransformationModel.empty());
    }

    cancelEditedTransformation() {
        this.editedTransformationScriptSandbox(null);
        this.transformationScriptSelectedForEdit(null);
    }    
    
    saveEditedTransformation() {
        const transformation = this.editedTransformationScriptSandbox();
        
        if (!this.isValid(transformation.validationGroup)) {
            return;
        }

        if (transformation.isNew()) {
            const newTransformationItem = new ongoingTaskSqlEtlTransformationModel(transformation.toDto(), false);
            newTransformationItem.name(this.findNameForNewTransformation());
            newTransformationItem.dirtyFlag().forceDirty();
            this.editedSqlEtl().transformationScripts.push(newTransformationItem);
        } else {
            const oldItem = this.editedSqlEtl().transformationScripts().find(x => x.name() === transformation.name());
            const newItem = new ongoingTaskSqlEtlTransformationModel(transformation.toDto(), false);
            
            if (oldItem.dirtyFlag().isDirty() || newItem.hasUpdates(oldItem)) {
                newItem.dirtyFlag().forceDirty();
            }

            this.editedSqlEtl().transformationScripts.replace(oldItem, newItem);
        }

        this.editedSqlEtl().transformationScripts.sort((a, b) => a.name().toLowerCase().localeCompare(b.name().toLowerCase()));
        this.editedTransformationScriptSandbox(null);
    }

    private findNameForNewTransformation() {
        const scriptsWithPrefix = this.editedSqlEtl().transformationScripts().filter(script => {
            return script.name().startsWith(editSqlEtlTask.scriptNamePrefix);
        });

        const maxNumber =  _.max(scriptsWithPrefix
            .map(x => x.name().substr(editSqlEtlTask.scriptNamePrefix.length))
            .map(x => _.toInteger(x))) || 0;

        return editSqlEtlTask.scriptNamePrefix + (maxNumber + 1);
    }


    removeTransformationScript(model: ongoingTaskSqlEtlTransformationModel) {
        this.editedSqlEtl().transformationScripts.remove(x => model.name() === x.name());
        
        if (this.transformationScriptSelectedForEdit() === model) {
            this.editedTransformationScriptSandbox(null);
            this.transformationScriptSelectedForEdit(null);
        }
    }

    editTransformationScript(model: ongoingTaskSqlEtlTransformationModel) {
        this.transformationScriptSelectedForEdit(model);
        this.editedTransformationScriptSandbox(new ongoingTaskSqlEtlTransformationModel(model.toDto(), false));
    }

    createCollectionNameAutocompleter(collectionText: KnockoutObservable<string>) {
        return ko.pureComputed(() => {
            const key = collectionText();

            const options = this.collectionNames();

            if (key) {
                return options.filter(x => x.toLowerCase().includes(key.toLowerCase()));
            } else {
                return options;
            }
        });
    }
    
    /********************************/
    /*** Sql Table Actions Region ***/
    /********************************/

    addNewSqlTable() {
        this.editedSqlTable(ongoingTaskSqlEtlTableModel.empty());
        // todo: handle dirty flag (reset) 
    }

    cancelEditedSqlTable() {
        this.editedSqlTable(null);
        // todo: handle dirty flag (reset)     
    }   
       
    saveEditedSqlTable() {
        const sqlTable = this.editedSqlTable();
        if (!this.isValid(sqlTable.validationGroup)) {
            return;
        }

        if (sqlTable.isNew()) {
            const newSqlTable = new ongoingTaskSqlEtlTableModel(sqlTable.toDto(), false);
            newSqlTable.dirtyFlag().forceDirty();
            this.editedSqlEtl().sqlTables.push(newSqlTable);
        } else {
            const oldItem = this.editedSqlEtl().sqlTables().find(x => x.tableName() === sqlTable.tableName());
            const newItem = new ongoingTaskSqlEtlTableModel(sqlTable.toDto(), false);
            
            if (oldItem.dirtyFlag().isDirty() || newItem.hasUpdates(oldItem)) {
                newItem.dirtyFlag().forceDirty();
            }
            
            this.editedSqlEtl().sqlTables.replace(oldItem,  newItem);
        }
        
        this.editedSqlEtl().sqlTables.sort((a, b) => a.tableName().toLowerCase().localeCompare(b.tableName().toLowerCase()));
        this.editedSqlTable(null);
    }
    
    deleteSqlTable(sqlTable: ongoingTaskSqlEtlTableModel) {
        this.editedSqlEtl().sqlTables.remove(x => sqlTable.tableName() === x.tableName());
    }

    editSqlTable(sqlTable: ongoingTaskSqlEtlTableModel) {
        this.editedSqlTable(new ongoingTaskSqlEtlTableModel(sqlTable.toDto(), false));
    }
}

export = editSqlEtlTask;

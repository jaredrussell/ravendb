﻿using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Raven.Client.Exceptions.Documents.Indexes;
using Raven.Server.Documents.Queries;
using Raven.Server.Json;
using Raven.Server.Routing;
using Raven.Server.ServerWide.Context;
using Sparrow.Json;
using Sparrow.Json.Parsing;

namespace Raven.Server.Documents.Handlers
{
    public class StreamingHandler : DatabaseRequestHandler
    {
        [RavenAction("/databases/*/streams/docs", "HEAD", AuthorizationStatus.ValidUser)]
        public Task StreamDocsHead()
        {
            //why is this action exists in 3.0?
            //TODO: review the need for this endpoint			
            return Task.CompletedTask;
        }

        [RavenAction("/databases/*/streams/docs", "GET", AuthorizationStatus.ValidUser)]
        public Task StreamDocsGet()
        {
            var start = GetStart();
            var pageSize = GetPageSize();

            using (Database.DocumentsStorage.ContextPool.AllocateOperationContext(out DocumentsOperationContext context))
            using (context.OpenReadTransaction())
            {
                IEnumerable<Document> documents;
                if (HttpContext.Request.Query.ContainsKey("startsWith"))
                {
                    documents = Database.DocumentsStorage.GetDocumentsStartingWith(context,
                        HttpContext.Request.Query["startsWith"],
                        HttpContext.Request.Query["matches"],
                        HttpContext.Request.Query["excludes"],
                        HttpContext.Request.Query["startAfter"],
                        start,
                        pageSize);
                }
                else // recent docs
                {
                    documents = Database.DocumentsStorage.GetDocumentsInReverseEtagOrder(context, start, pageSize);
                }

                using (var writer = new BlittableJsonTextWriter(context, ResponseBodyStream()))
                {
                    writer.WriteStartObject();
                    writer.WritePropertyName("Results");

                    writer.WriteDocuments(context, documents, metadataOnly: false, numberOfResults: out int _);

                    writer.WriteEndObject();
                }
            }

            return Task.CompletedTask;
        }

        [RavenAction("/databases/*/streams/queries", "HEAD", AuthorizationStatus.ValidUser)]
        public Task SteamQueryHead()
        {
            return Task.CompletedTask;
        }

        [RavenAction("/databases/*/streams/queries", "GET", AuthorizationStatus.ValidUser)]
        public async Task StreamQueryGet()
        {
            using (TrackRequestTime())
            using (var token = CreateTimeLimitedOperationToken())
            using (Database.DocumentsStorage.ContextPool.AllocateOperationContext(out DocumentsOperationContext context))
            {
                var query = IndexQueryServerSide.Create(HttpContext, GetStart(), GetPageSize(), context);
                var properties = GetStringValuesQueryString("field", false);
                var propertiesArray = properties.Count == 0 ? null : properties.ToArray();
                using (var writer = new StreamCsvDocumentQueryResultWriter(HttpContext.Response, ResponseBodyStream(), context, propertiesArray))
                {
                    try
                    {
                        await Database.QueryRunner.ExecuteStreamQuery(query, context, HttpContext.Response, writer, token).ConfigureAwait(false);
                    }
                    catch (IndexDoesNotExistException)
                    {
                        HttpContext.Response.StatusCode = (int)HttpStatusCode.NotFound;
                        writer.WriteError("Index " + query.Metadata.IndexName + " does not exists");
                    }
                }
            }
        }

        [RavenAction("/databases/*/streams/queries", "POST", AuthorizationStatus.ValidUser)]
        public async Task StreamQueryPost()
        {
            using (TrackRequestTime())
            using (var token = CreateTimeLimitedOperationToken())
            using (Database.DocumentsStorage.ContextPool.AllocateOperationContext(out DocumentsOperationContext context))
            {
                var stream = TryGetRequestFromStream("ExportOptions") ?? RequestBodyStream(); 
                var queryJson = await context.ReadForMemoryAsync(stream, "index/query");
                var query = IndexQueryServerSide.Create(queryJson, context, Database.QueryMetadataCache);
                var format = GetStringQueryString("format", false);
                var properties = GetStringValuesQueryString("field", false);
                var propertiesArray = properties.Count == 0 ? null : properties.ToArray();
                using (var writer = GetQueryResultWriter(format, HttpContext.Response, context, ResponseBodyStream(), propertiesArray))
                {
                    try
                    {
                        await Database.QueryRunner.ExecuteStreamQuery(query, context, HttpContext.Response, writer, token).ConfigureAwait(false);
                    }
                    catch (IndexDoesNotExistException)
                    {
                        HttpContext.Response.StatusCode = (int)HttpStatusCode.NotFound;
                        writer.WriteError("Index " + query.Metadata.IndexName + " does not exists");
                    }
                }
            }
        }

        private IStreamDocumentQueryResultWriter GetQueryResultWriter(string format, HttpResponse response, DocumentsOperationContext context, Stream responseBodyStream, string[] propertiesArray)
        {
            if (string.IsNullOrEmpty(format) == false && format.Equals("csv"))
            {
                return new StreamCsvDocumentQueryResultWriter(response, responseBodyStream, context, propertiesArray);                
            }
            
            if (propertiesArray != null)
            {
                throw new NotSupportedException("Using json output format with custom fields is not supported");
            }
            return new StreamJsonDocumentQueryResultWriter(response, responseBodyStream, context);
        }
    }
}

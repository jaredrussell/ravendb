﻿// -----------------------------------------------------------------------
//  <copyright file="RequestRouter.cs" company="Hibernating Rhinos LTD">
//      Copyright (c) Hibernating Rhinos LTD. All rights reserved.
//  </copyright>
// -----------------------------------------------------------------------

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;

using Raven.Server.Config;
using Raven.Server.Documents;
using System.Threading;
using Microsoft.AspNetCore.Http.Features.Authentication;
using Microsoft.Extensions.Primitives;
using Raven.Client;
using Raven.Client.Exceptions.Security;
using Raven.Client.Server.Operations.Certificates;
using Raven.Server.ServerWide;
using Raven.Server.ServerWide.Context;
using Raven.Server.Utils;
using Raven.Server.Web;
using Raven.Server.Web.Authentication;
using Sparrow;
using Sparrow.Json;
using Sparrow.Json.Parsing;

namespace Raven.Server.Routing
{
    public class RequestRouter
    {
        private readonly Trie<RouteInformation> _trie;
        private readonly RavenServer _ravenServer;
        private readonly MetricsCountersManager _serverMetrics;

        public RequestRouter(Dictionary<string, RouteInformation> routes, RavenServer ravenServer)
        {
            _trie = Trie<RouteInformation>.Build(routes);
            _ravenServer = ravenServer;
            _serverMetrics = ravenServer.Metrics;

        }

        public RouteInformation GetRoute(string method, string path, out RouteMatch match)
        {
            var tryMatch = _trie.TryMatch(method, path);
            match = tryMatch.Match;
            return tryMatch.Value;
        }

        public async Task<string> HandlePath(HttpContext context, string method, string path)
        {
            var tryMatch = _trie.TryMatch(method, path);
            if (tryMatch.Value == null)
            {
                context.Response.StatusCode = (int)HttpStatusCode.BadRequest;

                using (var ctx = JsonOperationContext.ShortTermSingleUse())
                using (var writer = new BlittableJsonTextWriter(ctx, context.Response.Body))
                {
                    ctx.Write(writer,
                        new DynamicJsonValue
                        {
                            ["Type"] = "Error",
                            ["Error"] = $"There is no handler for path: {method} {path}{context.Request.QueryString}"
                        });
                }
                return null;
            }

            var reqCtx = new RequestHandlerContext
            {
                HttpContext = context,
                RavenServer = _ravenServer,
                RouteMatch = tryMatch.Match,
            };

            var tuple = tryMatch.Value.TryGetHandler(reqCtx);
            var handler = tuple.Item1 ?? await tuple.Item2;

            reqCtx.Database?.Metrics?.RequestsMeter.Mark();
            _serverMetrics.RequestsMeter.Mark();

            Interlocked.Increment(ref _serverMetrics.ConcurrentRequestsCount);
            if (handler == null)
            {
                context.Response.StatusCode = (int)HttpStatusCode.BadRequest;
                using (var ctx = JsonOperationContext.ShortTermSingleUse())
                using (var writer = new BlittableJsonTextWriter(ctx, context.Response.Body))
                {
                    ctx.Write(writer,
                        new DynamicJsonValue
                        {
                            ["Type"] = "Error",
                            ["Message"] = $"There is no handler for {context.Request.Method} {context.Request.Path}"
                        });
                }
                return null;
            }

            if (tryMatch.Value.NoAuthorizationRequired == false)
            {
                var authResult = TryAuthorize(context, _ravenServer.Configuration, reqCtx.Database);
                if (authResult == false)
                    return reqCtx.Database?.Name;
            }

            if (reqCtx.Database != null)
            {
                using (reqCtx.Database.DatabaseInUse(tryMatch.Value.SkipUsagesCount))
                    await handler(reqCtx);
            }
            else
            {
                await handler(reqCtx);
            }

            Interlocked.Decrement(ref _serverMetrics.ConcurrentRequestsCount);

            return reqCtx.Database?.Name;
        }

        private bool TryAuthorize(HttpContext context, RavenConfiguration configuration, DocumentDatabase database)
        {
            if (configuration.Security.AuthenticationEnabled == false)
                return true;


            var feature = context.Features.Get<IHttpAuthenticationFeature>() as RavenServer.AuthenticateConnection;
            
            if (feature != null && feature.CanAccess(database?.Name))
                return true;

            return UnlikelyFailAuthorization(context, database, feature);
        }

        private bool UnlikelyFailAuthorization(HttpContext context, DocumentDatabase database, RavenServer.AuthenticateConnection feature)
        {
            string message;
            if (feature == null || feature.Status == AuthenticationStatus.NoCertificateProvided)
            {
                message = "This server requires client certificate for authentication, but none was provided by the client";
            }
            else if (feature.Status == AuthenticationStatus.UnfamiliarCertificate)
            {
                message = "The provided client certificate " + feature.Certificate + " is not on the allowed list of certificates that can access this server";
            }
            else if (feature.Status == AuthenticationStatus.Allowed)
            {
                message = "The provided client certificate " + feature.Certificate + " is not authorized to access " + (database?.Name ?? "the server");
            }
            else
            {
                message = "Access to this server was denied, but the reason why is confidential, you should never see this message";
            }
            context.Response.StatusCode = (int)HttpStatusCode.Forbidden;
            using (var ctx = JsonOperationContext.ShortTermSingleUse())
            using (var writer = new BlittableJsonTextWriter(ctx, context.Response.Body))
            {
                DrainRequest(ctx, context);

                string userAgent = context.Request.Headers["User-Agent"];
                if (userAgent != null && userAgent.Contains("Mozilla"))
                {
                    context.Response.StatusCode = (int)HttpStatusCode.Redirect;
                    context.Response.Headers["Location"] = "/studio/auth-error.html?err=" + Uri.EscapeDataString(message);
                    return false;
                }

                ctx.Write(writer,
                    new DynamicJsonValue
                    {
                        ["Type"] = "InvalidAuth",
                        ["Message"] = message
                    });
            }
            return false;
        }

        private void DrainRequest(JsonOperationContext ctx, HttpContext context)
        {
            if (context.Response.Headers.TryGetValue("Connection", out StringValues value) && value == "close")
                return; // don't need to drain it, the connection will close 

            using (ctx.GetManagedBuffer(out JsonOperationContext.ManagedPinnedBuffer buffer))
            {
                var requestBody = context.Request.Body;
                while (true)
                {
                    var read = requestBody.Read(buffer.Buffer.Array, buffer.Buffer.Offset, buffer.Buffer.Count);
                    if (read == 0)
                        break;
                }
            }
        }
    }
}
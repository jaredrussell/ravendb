// -----------------------------------------------------------------------
//  <copyright file="FacetQuery.cs" company="Hibernating Rhinos LTD">
//      Copyright (c) Hibernating Rhinos LTD. All rights reserved.
//  </copyright>
// -----------------------------------------------------------------------

using System.Collections.Generic;
using Raven.Client.Documents.Conventions;
using Sparrow.Json;

namespace Raven.Client.Documents.Queries.Facets
{
    public class FacetQuery : FacetQuery<Parameters>
    {
        public static FacetQuery Create(IndexQueryBase<Parameters> query, string facetSetupDoc, List<Facet> facets, int start, int? pageSize, DocumentConventions conventions)
        {
            var result = new FacetQuery
            {
                CutoffEtag = query.CutoffEtag,
                Query = query.Query,
                QueryParameters = query.QueryParameters,
                WaitForNonStaleResults = query.WaitForNonStaleResults,
                WaitForNonStaleResultsTimeout = query.WaitForNonStaleResultsTimeout,
                Start = start,
                FacetSetupDoc = facetSetupDoc,
                Facets = facets
            };

            if (pageSize.HasValue)
                result.PageSize = pageSize.Value;

            return result;
        }

        public ulong GetQueryHash(JsonOperationContext ctx)
        {
            using (var hasher = new QueryHashCalculator(ctx))
            {
                hasher.Write(Query);
                hasher.Write (WaitForNonStaleResults);
                hasher.Write(WaitForNonStaleResultsTimeout?.Ticks);
                hasher.Write(CutoffEtag);
                hasher.Write(Start);
                hasher.Write(PageSize);
                hasher.Write(QueryParameters);
                hasher.Write(FacetSetupDoc);
                hasher.Write(Facets);
                return hasher.GetHash();
            }
        }
    }

    public abstract class FacetQuery<T> : IndexQueryBase<T>
    {
        /// <summary>
        /// Id of a facet setup document that can be found in database containing facets (mutually exclusive with Facets).
        /// </summary>
        public string FacetSetupDoc { get; set; }

        /// <summary>
        /// List of facets (mutually exclusive with FacetSetupDoc).
        /// </summary>
        public IReadOnlyList<Facet> Facets { get; set; }
    }
}

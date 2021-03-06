﻿using System.Globalization;
using System.Linq;
using Raven.Client.Documents.Indexes;
using Raven.Server.Documents.Queries.AST;

namespace Raven.Server.Documents.Queries
{
    public class SelectField
    {
        public ValueTokenType? ValueTokenType;

        public QueryFieldName Name;

        public string Alias;

        public object Value;

        public string SourceAlias;

        public AggregationOperation AggregationOperation;

        public bool IsGroupByKey;

        public QueryFieldName[] GroupByKeys;

        public string[] GroupByKeyName;

        public string Function;

        public bool SourceIsArray;

        public SelectField[] FunctionArgs;

        public bool HasSourceAlias;

        private SelectField()
        {

        }

        public static SelectField Create(QueryFieldName name, string alias = null)
        {
            return new SelectField
            {
                Name = name,
                Alias = alias
            };
        }

        public static SelectField Create(QueryFieldName name, string alias, string sourceAlias, bool array, bool hasSourceAlias)
        {
            return new SelectField
            {
                Name = name,
                Alias = alias,
                SourceAlias = sourceAlias,
                SourceIsArray = array,
                HasSourceAlias = hasSourceAlias
            };
        }

        public static SelectField CreateGroupByAggregation(QueryFieldName name, string alias, AggregationOperation aggregation)
        {
            return new SelectField
            {
                Name = name,
                Alias = alias,
                AggregationOperation = aggregation
            };
        }

        public static SelectField CreateGroupByKeyField(string alias, params QueryFieldName[] groupByKeys)
        {
            return new SelectField
            {
                Alias = alias,
                GroupByKeys = groupByKeys,
                GroupByKeyName = groupByKeys.Select(x => x.Value).ToArray(),
                IsGroupByKey = true
            };
        }

        public static SelectField CreateMethodCall(string methodName, string alias, SelectField[] args)
        {
            return new SelectField
            {
                Alias = alias,
                Name = new QueryFieldName(methodName, false),
                Function = methodName,
                FunctionArgs = args
            };
        }

        public static SelectField CreateValue(string val, string alias, ValueTokenType type)
        {
            object finalVal = val;
            switch (type)
            {
                case AST.ValueTokenType.Long:
                    finalVal = long.Parse(val, CultureInfo.InvariantCulture);
                    break;
                case AST.ValueTokenType.Double:
                    finalVal = double.Parse(val, CultureInfo.InvariantCulture);
                    break;
                case AST.ValueTokenType.True:
                    finalVal = true;
                    break;
                case AST.ValueTokenType.False:
                    finalVal = false;
                    break;
                case AST.ValueTokenType.Null:
                    finalVal = null;
                    break;
            }

            return new SelectField
            {
                Value = finalVal,
                Alias = alias ?? val,
                ValueTokenType = type
            };
        }
    }
}

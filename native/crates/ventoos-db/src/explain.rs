//! EXPLAIN query parsing.
//!
//! Runs `EXPLAIN` for `PostgreSQL` / `MySQL` / `SQLite` and normalises the
//! output into a unified tree of [`ExplainNode`].

use serde_json::Value;

use crate::types::{ExplainNode, ExplainResult};

/// Parse `PostgreSQL` `EXPLAIN (FORMAT JSON, ANALYZE)` output.
pub fn parse_pg_explain(json_output: &Value) -> Result<ExplainResult, String> {
    // PG returns [ { "Plan": { ... } } ]
    let plan = json_output
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|obj| obj.get("Plan"))
        .ok_or("Invalid PostgreSQL EXPLAIN output")?;

    let root = parse_pg_plan_node(plan);

    // Extract total planning & execution time if available
    let planning_time = json_output
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|obj| obj.get("Planning Time"))
        .and_then(Value::as_f64);
    let execution_time = json_output
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|obj| obj.get("Execution Time"))
        .and_then(Value::as_f64);

    Ok(ExplainResult {
        root,
        planning_time,
        execution_time,
    })
}

fn parse_pg_plan_node(plan: &Value) -> ExplainNode {
    let node_type = plan
        .get("Node Type")
        .and_then(Value::as_str)
        .unwrap_or("Unknown")
        .to_string();
    let relation = plan
        .get("Relation Name")
        .and_then(Value::as_str)
        .map(String::from);
    let startup_cost = plan.get("Startup Cost").and_then(Value::as_f64);
    let total_cost = plan.get("Total Cost").and_then(Value::as_f64);
    let plan_rows = plan.get("Plan Rows").and_then(Value::as_u64);
    let actual_rows = plan.get("Actual Rows").and_then(Value::as_u64);
    let actual_time = plan.get("Actual Total Time").and_then(Value::as_f64);
    let plan_width = plan.get("Plan Width").and_then(Value::as_u64);

    let children = plan
        .get("Plans")
        .and_then(Value::as_array)
        .map(|plans| plans.iter().map(parse_pg_plan_node).collect())
        .unwrap_or_default();

    ExplainNode {
        node_type,
        relation,
        startup_cost,
        total_cost,
        plan_rows,
        actual_rows,
        actual_time,
        plan_width,
        children,
    }
}

/// Parse `MySQL` `EXPLAIN FORMAT=JSON` output.
pub fn parse_mysql_explain(json_output: &Value) -> Result<ExplainResult, String> {
    let query_block = json_output
        .get("query_block")
        .ok_or("Invalid MySQL EXPLAIN output: missing query_block")?;

    let root = parse_mysql_node(query_block);

    Ok(ExplainResult {
        root,
        planning_time: None,
        execution_time: None,
    })
}

fn parse_mysql_node(block: &Value) -> ExplainNode {
    // Try nested_loop first
    if let Some(nested_loop) = block.get("nested_loop").and_then(Value::as_array) {
        let children: Vec<ExplainNode> = nested_loop
            .iter()
            .filter_map(|item| item.get("table"))
            .map(parse_mysql_table_node)
            .collect();

        return ExplainNode {
            node_type: "Nested Loop".into(),
            relation: None,
            startup_cost: None,
            total_cost: block.get("cost_info")
                .and_then(|c| c.get("query_cost"))
                .and_then(Value::as_str)
                .and_then(|s| s.parse::<f64>().ok()),
            plan_rows: None,
            actual_rows: None,
            actual_time: None,
            plan_width: None,
            children,
        };
    }

    // Single table access
    if let Some(table) = block.get("table") {
        return parse_mysql_table_node(table);
    }

    // Ordering/grouping operations
    if let Some(ordering) = block.get("ordering_operation") {
        let mut node = parse_mysql_node(ordering);
        node.node_type = "Ordering".into();
        return node;
    }

    ExplainNode {
        node_type: "Query Block".into(),
        relation: None,
        startup_cost: None,
        total_cost: block.get("cost_info")
            .and_then(|c| c.get("query_cost"))
            .and_then(Value::as_str)
            .and_then(|s| s.parse::<f64>().ok()),
        plan_rows: None,
        actual_rows: None,
        actual_time: None,
        plan_width: None,
        children: vec![],
    }
}

fn parse_mysql_table_node(table: &Value) -> ExplainNode {
    let access_type = table
        .get("access_type")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    let table_name = table
        .get("table_name")
        .and_then(Value::as_str)
        .map(String::from);
    let rows_examined = table
        .get("rows_examined_per_scan")
        .and_then(Value::as_u64);
    let cost = table
        .get("cost_info")
        .and_then(|c| c.get("read_cost"))
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<f64>().ok());

    ExplainNode {
        node_type: format!("Table Scan ({access_type})"),
        relation: table_name,
        startup_cost: None,
        total_cost: cost,
        plan_rows: rows_examined,
        actual_rows: None,
        actual_time: None,
        plan_width: None,
        children: vec![],
    }
}

/// Parse `SQLite` `EXPLAIN QUERY PLAN` output (text-based).
pub fn parse_sqlite_explain(rows: &[(i64, i64, i64, String)]) -> ExplainResult {
    let children: Vec<ExplainNode> = rows
        .iter()
        .map(|(_, _, _, detail)| ExplainNode {
            node_type: detail.clone(),
            relation: None,
            startup_cost: None,
            total_cost: None,
            plan_rows: None,
            actual_rows: None,
            actual_time: None,
            plan_width: None,
            children: vec![],
        })
        .collect();

    let root = ExplainNode {
        node_type: "Query Plan".into(),
        relation: None,
        startup_cost: None,
        total_cost: None,
        plan_rows: None,
        actual_rows: None,
        actual_time: None,
        plan_width: None,
        children,
    };

    ExplainResult {
        root,
        planning_time: None,
        execution_time: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_pg_explain() {
        let input = json!([{
            "Plan": {
                "Node Type": "Seq Scan",
                "Relation Name": "users",
                "Startup Cost": 0.0,
                "Total Cost": 10.5,
                "Plan Rows": 100,
                "Plan Width": 64,
                "Actual Rows": 95,
                "Actual Total Time": 0.5,
                "Plans": []
            },
            "Planning Time": 0.1,
            "Execution Time": 0.6
        }]);

        let result = parse_pg_explain(&input).unwrap();
        assert_eq!(result.root.node_type, "Seq Scan");
        assert_eq!(result.root.relation.as_deref(), Some("users"));
        assert_eq!(result.root.plan_rows, Some(100));
        assert_eq!(result.planning_time, Some(0.1));
    }

    #[test]
    fn test_parse_sqlite_explain() {
        let rows = vec![
            (0, 0, 0, "SCAN TABLE users".to_string()),
            (0, 0, 0, "USE TEMP B-TREE FOR ORDER BY".to_string()),
        ];
        let result = parse_sqlite_explain(&rows);
        assert_eq!(result.root.children.len(), 2);
        assert_eq!(result.root.children[0].node_type, "SCAN TABLE users");
    }
}

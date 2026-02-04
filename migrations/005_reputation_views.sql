-- Derived reputation: success_rate, total_calls, avg_latency per agent (as requester) and per service

CREATE OR REPLACE VIEW agent_reputation AS
SELECT
  requester_agent_id AS agent_id,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE status = 'success') AS success_calls,
  CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) ELSE 0 END AS success_rate_pct,
  ROUND(AVG(latency_ms) FILTER (WHERE status = 'success'), 2) AS avg_latency_ms
FROM executions
GROUP BY requester_agent_id;

CREATE OR REPLACE VIEW service_reputation AS
SELECT
  service_id,
  COUNT(*) AS total_calls,
  COUNT(*) FILTER (WHERE status = 'success') AS success_calls,
  CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / COUNT(*), 2) ELSE 0 END AS success_rate_pct,
  ROUND(AVG(latency_ms) FILTER (WHERE status = 'success'), 2) AS avg_latency_ms
FROM executions
GROUP BY service_id;

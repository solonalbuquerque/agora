import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './Layout';
import Agents from './pages/Agents';
import AgentDetail from './pages/AgentDetail';
import Humans from './pages/Humans';
import HumanDetail from './pages/HumanDetail';
import Services from './pages/Services';
import ServiceDetail from './pages/ServiceDetail';
import Wallets from './pages/Wallets';
import Ledger from './pages/Ledger';
import LedgerDetail from './pages/LedgerDetail';
import Coins from './pages/Coins';
import Executions from './pages/Executions';
import ExecutionDetail from './pages/ExecutionDetail';
import Config from './pages/Config';
import Statistics from './pages/Statistics';
import TrustLevels from './pages/TrustLevels';
import Dashboard from './pages/Dashboard';
import SecurityOverview from './pages/SecurityOverview';
import RateLimits from './pages/RateLimits';
import WebhookSecurity from './pages/WebhookSecurity';
import CircuitBreakers from './pages/CircuitBreakers';
import Callbacks from './pages/Callbacks';
import Requests from './pages/Requests';
import AuditLog from './pages/AuditLog';
import Metrics from './pages/Metrics';
import DataRetention from './pages/DataRetention';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:id" element={<AgentDetail />} />
        <Route path="humans" element={<Humans />} />
        <Route path="humans/:id" element={<HumanDetail />} />
        <Route path="services" element={<Services />} />
        <Route path="services/:id" element={<ServiceDetail />} />
        <Route path="webhook-security" element={<WebhookSecurity />} />
        <Route path="circuit-breakers" element={<CircuitBreakers />} />
        <Route path="wallets" element={<Wallets />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="ledger/:id" element={<LedgerDetail />} />
        <Route path="coins" element={<Coins />} />
        <Route path="executions" element={<Executions />} />
        <Route path="executions/:id" element={<ExecutionDetail />} />
        <Route path="callbacks" element={<Callbacks />} />
        <Route path="trust-levels" element={<TrustLevels />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="security" element={<SecurityOverview />} />
        <Route path="rate-limits" element={<RateLimits />} />
        <Route path="requests" element={<Requests />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="metrics" element={<Metrics />} />
        <Route path="data-retention" element={<DataRetention />} />
        <Route path="statistics" element={<Statistics />} />
        <Route path="config" element={<Config />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

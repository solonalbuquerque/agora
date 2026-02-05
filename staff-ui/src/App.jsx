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

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="agents" replace />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:id" element={<AgentDetail />} />
        <Route path="humans" element={<Humans />} />
        <Route path="humans/:id" element={<HumanDetail />} />
        <Route path="services" element={<Services />} />
        <Route path="services/:id" element={<ServiceDetail />} />
        <Route path="wallets" element={<Wallets />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="ledger/:id" element={<LedgerDetail />} />
        <Route path="coins" element={<Coins />} />
        <Route path="executions" element={<Executions />} />
        <Route path="executions/:id" element={<ExecutionDetail />} />
        <Route path="config" element={<Config />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './Layout';
import Agents from './pages/Agents';
import Humans from './pages/Humans';
import Services from './pages/Services';
import Wallets from './pages/Wallets';
import Ledger from './pages/Ledger';
import Coins from './pages/Coins';
import Executions from './pages/Executions';
import Config from './pages/Config';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="agents" replace />} />
        <Route path="agents" element={<Agents />} />
        <Route path="humans" element={<Humans />} />
        <Route path="services" element={<Services />} />
        <Route path="wallets" element={<Wallets />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="coins" element={<Coins />} />
        <Route path="executions" element={<Executions />} />
        <Route path="config" element={<Config />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

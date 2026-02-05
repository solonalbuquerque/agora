import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('password');
  const [error, setError] = useState('');

  const handlePassword = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.login(password);
      if (res.require2fa) {
        setStep('2fa');
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err?.message || 'Invalid password');
    }
  };

  const handle2fa = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.login2fa(code);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message || 'Invalid code');
    }
  };

  if (step === '2fa') {
    return (
      <div className="login-box">
        <h1>2FA Code</h1>
        <form onSubmit={handle2fa}>
          <div className="form-row">
            <label>App code</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" maxLength={6} autoFocus />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary">Continue</button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-box">
      <h1>Staff — Login</h1>
      <form onSubmit={handlePassword}>
        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary">Log in</button>
      </form>
    </div>
  );
}

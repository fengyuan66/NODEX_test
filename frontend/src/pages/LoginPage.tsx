import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import '../styles/index.css';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const msgRef = useRef<HTMLDivElement>(null);

  const navigate = useNavigate();
  const { login, signup, loading } = useAuth();

  const showMsg = (text: string, type: 'error' | 'success') => {
    const el = msgRef.current;
    if (!el) return;
    el.className = `msg ${type}`;
    el.textContent = text;
    el.style.display = 'block';
  };

  const handleSubmit = async () => {
    if (!email || !password) { showMsg('Please fill in all fields.', 'error'); return; }
    const action = mode === 'signin' ? login : signup;
    const res = await action(email, password, remember);
    if (res.ok) {
      showMsg('Success! Redirecting…', 'success');
      setTimeout(() => navigate(res.next_url || '/'), 500);
    } else {
      showMsg(res.error || 'Something went wrong.', 'error');
    }
  };

  const switchTab = (t: 'signin' | 'signup') => {
    setMode(t);
    if (msgRef.current) msgRef.current.style.display = 'none';
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div className="bg-grid"></div>
      <div className="glow-orb"></div>
      <div className="card">
        <div className="logo">
          <div className="logo-dot"></div>
          SecondBrain
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Welcome back</h1>
        <div className="subtitle">Your knowledge graph awaits.</div>

        <div className="tabs">
          <button className={`tab${mode === 'signin' ? ' active' : ''}`} onClick={() => switchTab('signin')}>Sign In</button>
          <button className={`tab${mode === 'signup' ? ' active' : ''}`} onClick={() => switchTab('signup')}>Sign Up</button>
        </div>

        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>

        <label className="remember">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <span>Keep me signed in for 30 days</span>
        </label>

        <button className="btn" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Processing...' : (mode === 'signin' ? 'Sign In →' : 'Create Account →')}
        </button>

        <div className="msg" ref={msgRef}></div>
      </div>
    </div>
  );
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import CanvasPage from './pages/CanvasPage';
import { useAuth } from './hooks/useAuth';
import { useEffect, useState } from 'react';

function App() {
  const { checkAuth } = useAuth();
  const [init, setInit] = useState(false);

  useEffect(() => {
    checkAuth().finally(() => setInit(true));
  }, [checkAuth]);

  if (!init) return <div style={{ background: '#000', color: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<CanvasPage isShared={false} />} />
        <Route path="/shared/:shareId" element={<CanvasPage isShared={true} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

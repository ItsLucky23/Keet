import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const env = import.meta.env;

export const template = 'plain'
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (token && env.VITE_SESSION_BASED_TOKEN === 'true') {
      sessionStorage.setItem('token', token);
      globalThis.location.href = globalThis.location.pathname;
      return;
    }

    void navigate('/dashboard', { replace: true });
  }, [navigate, location]);


  return null;
}
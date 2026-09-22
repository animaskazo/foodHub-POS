import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { LoginForm } from '@/components/login-form';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import AuthLayout from '../components/AuthLayout';

export default function LoginView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      toast.success('¡Bienvenido!');
      navigate('/');
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setError(err.message === 'Invalid login credentials' ? 'Credenciales incorrectas' : err.message);
    } finally {
      setLoading(false);
    }
  };

  useDocumentTitle('FoodHub - Iniciar sesión');

  return (
    <AuthLayout>
      <LoginForm loading={loading} onSubmit={handleLogin} />
      {error && (
        <div className="mt-4 text-center text-sm text-red-600">{error}</div>
      )}
    </AuthLayout>
  );
}

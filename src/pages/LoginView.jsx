import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { LoginForm } from '@/components/login-form';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../components/AuthContext';
import AuthLayout from '../components/AuthLayout';

export default function LoginView() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { accountDisabled } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      // PIN de primer ingreso o cuenta desactivada: se resuelve antes de navegar.
      if (data.user?.user_metadata?.must_change_pin === true) {
        toast.info('Debes cambiar tu PIN para continuar');
        navigate('/update-password?first=1');
        return;
      }
      const { data: staff } = await supabase
        .from('staff')
        .select('is_active')
        .eq('id', data.user.id)
        .maybeSingle();
      if (staff && staff.is_active === false) {
        await supabase.auth.signOut();
        setError('Cuenta desactivada. Contacta a tu administrador.');
        return;
      }
      toast.success('¡Bienvenido!');
      // El landing por perfil lo resuelven los guards ('/' -> admin, resto -> /pos).
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
      {accountDisabled && !error && (
        <div className="mt-4 text-center text-sm text-red-600">Cuenta desactivada. Contacta a tu administrador.</div>
      )}
      {error && (
        <div className="mt-4 text-center text-sm text-red-600">{error}</div>
      )}
    </AuthLayout>
  );
}

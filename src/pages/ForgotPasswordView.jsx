import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import AuthLayout from '../components/AuthLayout';

export default function ForgotPasswordView() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useDocumentTitle('FoodHub - Recuperar Contraseña');

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (resetError) throw resetError;
      toast.success('Te hemos enviado un correo con las instrucciones');
      navigate('/login');
    } catch (err) {
      console.error('Error al recuperar contraseña:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form className={cn('flex flex-col gap-6')} onSubmit={handleResetPassword}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="admin@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 px-6 text-lg"
            />
          </Field>
          <Field>
            <Button type="submit" disabled={loading} className="w-full h-12 text-lg">
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </Button>
          </Field>
          <div className="text-center text-sm">
            <Link to="/login" className="font-medium underline underline-offset-4">
              Volver a iniciar sesión
            </Link>
          </div>
        </FieldGroup>
      </form>
      {error && (
        <div className="mt-4 text-center text-sm text-red-600">{error}</div>
      )}
    </AuthLayout>
  );
}

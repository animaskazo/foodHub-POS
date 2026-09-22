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

export default function UpdatePasswordView() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useDocumentTitle('FoodHub - Actualizar Contraseña');

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      toast.success('Contraseña actualizada correctamente');
      navigate('/');
    } catch (err) {
      console.error('Error al actualizar contraseña:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form className={cn('flex flex-col gap-6')} onSubmit={handleUpdate}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Nueva contraseña</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Ingresa una nueva contraseña para tu cuenta.
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="password">Nueva Contraseña</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 px-6 text-lg"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirmar Contraseña</FieldLabel>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-12 px-6 text-lg"
            />
          </Field>
          <Field>
            <Button type="submit" disabled={loading} className="w-full h-12 text-lg">
              {loading ? 'Actualizando...' : 'Actualizar contraseña'}
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

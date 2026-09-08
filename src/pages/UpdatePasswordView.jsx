import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuth } from '../components/AuthContext';
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
  const { isSuperAdmin } = useAuth();

  // Vendedores usan PIN de 6 dígitos; supremos mantienen contraseña normal.
  // ?first=1 indica primer ingreso con PIN temporal.
  const isFirstLogin = new URLSearchParams(window.location.search).get('first') === '1';
  const pinMode = isFirstLogin || !isSuperAdmin;

  useDocumentTitle(pinMode ? 'FoodHub - Cambiar PIN' : 'FoodHub - Actualizar Contraseña');

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(pinMode ? 'Los PIN no coinciden' : 'Las contraseñas no coinciden');
      return;
    }
    if (pinMode) {
      if (!/^\d{6}$/.test(password)) {
        setError('El PIN debe tener exactamente 6 dígitos');
        return;
      }
    } else if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        ...(pinMode ? { data: { must_change_pin: false } } : {}),
      });
      if (updateError) throw updateError;
      toast.success(pinMode ? 'PIN actualizado correctamente' : 'Contraseña actualizada correctamente');
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
            <h1 className="text-2xl font-bold">{pinMode ? 'Crea tu PIN' : 'Nueva contraseña'}</h1>
            <p className="text-sm text-balance text-muted-foreground">
              {pinMode
                ? (isFirstLogin ? 'Es tu primer ingreso: define un PIN de 6 dígitos para tu cuenta.' : 'Ingresa un PIN de 6 dígitos para tu cuenta.')
                : 'Ingresa una nueva contraseña para tu cuenta.'}
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="password">{pinMode ? 'PIN (6 dígitos)' : 'Nueva Contraseña'}</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              inputMode={pinMode ? 'numeric' : undefined}
              pattern={pinMode ? '\\d{6}' : undefined}
              maxLength={pinMode ? 6 : undefined}
              required
              placeholder={pinMode ? '••••••' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(pinMode ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
              className="h-12 px-6 text-lg tracking-widest text-center"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword">{pinMode ? 'Confirmar PIN' : 'Confirmar Contraseña'}</FieldLabel>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              inputMode={pinMode ? 'numeric' : undefined}
              required
              placeholder={pinMode ? '••••••' : '••••••••'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(pinMode ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
              className="h-12 px-6 text-lg tracking-widest text-center"
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

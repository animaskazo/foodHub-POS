import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import AuthLayout from '../components/AuthLayout';

export default function SignupView() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    organizationName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useDocumentTitle('FoodHub - Crear cuenta');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setError(null);
    if (formData.password !== formData.confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (formData.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    setLoading(true);
    try {
      // Sign up user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { full_name: formData.name },
          emailRedirectTo: window.location.origin,
        },
      });
      if (authError) throw authError;

      const userId = authData.user?.id;
      if (!userId) throw new Error('No se pudo crear el usuario');

      // Create organization
      const slug = formData.organizationName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert([{ name: formData.organizationName, slug }])
        .select()
        .single();
      if (orgError) throw orgError;

      // Create default branch
      const { error: branchError } = await supabase
        .from('branches')
        .insert([
          {
            organization_id: orgData.id,
            name: 'Local Principal',
            address: 'Dirección por definir',
            accepts_table: true,
            accepts_pickup: true,
          },
        ]);
      if (branchError) throw branchError;

      // Link user to organization as owner
      const { error: staffError } = await supabase
        .from('staff')
        .insert([
          {
            id: userId,
            organization_id: orgData.id,
            full_name: formData.name,
            role: 'owner',
          },
        ]);
      if (staffError) throw staffError;

      toast.success('Cuenta creada exitosamente');
      navigate('/');
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form className={cn('flex flex-col gap-6')} onSubmit={handleSignup}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Crear cuenta</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Registra tu negocio y comienza a vender.
            </p>
          </div>
          <Field>
            <FieldLabel htmlFor="name">Nombre completo</FieldLabel>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Jane Doe"
              value={formData.name}
              onChange={handleChange}
              className="h-12 px-6 text-lg"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder="admin@example.com"
              value={formData.email}
              onChange={handleChange}
              className="h-12 px-6 text-lg"
            />
          </Field>
          <Field>
            <div className="flex items-center">
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            </div>
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              className="h-12 px-6 text-lg"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword">Confirmar contraseña</FieldLabel>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              required
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="h-12 px-6 text-lg"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="organizationName">Nombre del restaurante</FieldLabel>
            <Input
              id="organizationName"
              name="organizationName"
              type="text"
              required
              placeholder="Acme Dining"
              value={formData.organizationName}
              onChange={handleChange}
              className="h-12 px-6 text-lg"
            />
          </Field>
          <Field>
            <Button type="submit" disabled={loading} className="w-full h-12 text-lg">
              {loading ? 'Creando...' : 'Crear cuenta'}
            </Button>
          </Field>
          <FieldDescription className="text-center">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-medium underline underline-offset-4">
              Inicia sesión
            </Link>
          </FieldDescription>
        </FieldGroup>
      </form>
      {error && (
        <div className="mt-4 text-center text-sm text-red-600">{error}</div>
      )}
    </AuthLayout>
  );
}

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Link } from "react-router-dom"
import { Eye, EyeOff } from "lucide-react"

export function LoginForm({ className, loading = false, onSubmit, ...props }) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <form className={cn("flex flex-col gap-6", className)} onSubmit={onSubmit} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Inicia sesión</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Ingresa tu correo y contraseña para acceder a tu cuenta.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="admin@ejemplo.com"
            required
            className="h-12 rounded-full px-6 text-lg"
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <Link
              to="/forgot-password"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              className="h-12 rounded-full px-6 pr-12 text-lg w-full"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </Field>
        <Field>
          <Button type="submit" disabled={loading} className="w-full h-12 rounded-full text-lg">
            {loading ? "Iniciando..." : "Iniciar sesión"}
          </Button>
        </Field>
        <FieldDescription className="text-center">
          ¿No tienes cuenta?{' '}
          <Link to="/signup" className="font-medium underline underline-offset-4">
            Regístrate gratis
          </Link>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}

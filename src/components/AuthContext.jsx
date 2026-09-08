import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [role, setRole] = useState(null);
  const [isStaffActive, setIsStaffActive] = useState(true);
  const [accountDisabled, setAccountDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  // Evita que el evento SIGNED_OUT del signOut() por desactivación borre el aviso.
  const disabledRef = React.useRef(false);

  useEffect(() => {
    // Check active sessions and sets the user
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        await Promise.all([
          checkSuperAdmin(currentUser.id),
          fetchOrganization(currentUser.id)
        ]);
      } else {
        setIsSuperAdmin(false);
        setOrganization(null);
        setRole(null);
        setIsStaffActive(true);
        if (!disabledRef.current) setAccountDisabled(false);
      }
      
      setLoading(false);
    };

    const checkSuperAdmin = async (userId) => {
      try {
        const { data, error } = await supabase
          .from('super_admins')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle();
        
        setIsSuperAdmin(!!data);
      } catch (err) {
        setIsSuperAdmin(false);
      }
    };

    const fetchOrganization = async (userId) => {
      try {
        const { data } = await supabase
          .from('staff')
          .select('organizations ( id, name, address, delivery_enabled, dine_in_enabled, store_lat, store_lng, delivery_radius_km, delivery_polygon, delivery_fee, delivery_min_order, prep_time, hide_cancelled_orders, uber_client_id, uber_client_secret, uber_customer_id, uber_enabled, delivery_mode ), role, is_active')
          .eq('id', userId)
          .single();

        if (data) {
          if (data.organizations) {
            setOrganization(data.organizations);
          }
          if (data.role) {
            setRole(data.role);
          }
          const active = data.is_active !== false;
          setIsStaffActive(active);
          if (!active) {
            // Cuenta desactivada: cerrar sesión y avisar en el login.
            disabledRef.current = true;
            setAccountDisabled(true);
            await supabase.auth.signOut();
            setUser(null);
            setIsSuperAdmin(false);
            setOrganization(null);
            setRole(null);
            return;
          }
        }
        disabledRef.current = false;
        setAccountDisabled(false);
      } catch (err) {
        console.error('Error fetching org:', err);
      }
    };

    checkSession();

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          await Promise.all([
            checkSuperAdmin(currentUser.id),
            fetchOrganization(currentUser.id)
          ]);
        } else {
          setIsSuperAdmin(false);
          setOrganization(null);
          setRole(null);
          setIsStaffActive(true);
          if (!disabledRef.current) setAccountDisabled(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Perfiles: solo existen Super Admin y Vendedor ──
  // can('admin') → super admin (todo lo administrativo + multi-org)
  // can('sell')  → cualquier staff activo (POS + cocina)
  const can = (action) => {
    if (action === 'admin') return isSuperAdmin;
    if (action === 'sell') return !!user && isStaffActive;
    return false;
  };

  const mustChangePin = user?.user_metadata?.must_change_pin === true;

  return (
    <AuthContext.Provider value={{ user, isSuperAdmin, organization, role, loading, isStaffActive, accountDisabled, mustChangePin, can }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

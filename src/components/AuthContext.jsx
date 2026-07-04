import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

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
      }
      
      setLoading(false);
    };

    const checkSuperAdmin = async (userId) => {
      try {
        const { data, error } = await supabase
          .from('super_admins')
          .select('user_id')
          .eq('user_id', userId)
          .single();
        
        setIsSuperAdmin(!!data);
      } catch (err) {
        setIsSuperAdmin(false);
      }
    };

    const fetchOrganization = async (userId) => {
      try {
        const { data } = await supabase
          .from('staff')
          .select('organizations ( name )')
          .eq('id', userId)
          .single();
        
        if (data && data.organizations) {
          setOrganization(data.organizations);
        }
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
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isSuperAdmin, organization, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

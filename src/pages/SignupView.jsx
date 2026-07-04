import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Store, User, Mail, Lock, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SignupView = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Create the user in Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.name,
          }
        }
      });

      if (authError) throw authError;
      
      const userId = authData.user?.id;
      if (!userId) throw new Error("Could not create user");

      // 2. Create the Organization
      const slug = formData.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert([{
          name: formData.organizationName,
          slug: slug
        }])
        .select()
        .single();

      if (orgError) throw orgError;

      // 3. Create the Staff record (link user and org)
      const { error: staffError } = await supabase
        .from('staff')
        .insert([{
          id: userId,
          organization_id: orgData.id,
          full_name: formData.name,
          role: 'owner'
        }]);

      if (staffError) throw staffError;

      // Success - Redirect to dashboard
      navigate('/');
      
    } catch (err) {
      console.error('Signup error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-black">
          <Store className="h-12 w-12" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create your free account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-black hover:text-gray-800 transition-colors">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          
          {error && (
            <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSignup}>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Full Name
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
                  placeholder="Jane Doe"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100 mt-6">
              <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700 mt-4">
                Restaurant / Business Name
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Store className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="organizationName"
                  name="organizationName"
                  type="text"
                  required
                  value={formData.organizationName}
                  onChange={handleChange}
                  className="appearance-none block w-full pl-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-black focus:border-black sm:text-sm"
                  placeholder="Acme Dining"
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">You can add more details to your business later.</p>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SignupView;

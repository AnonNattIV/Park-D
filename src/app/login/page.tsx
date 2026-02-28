'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function LoginPage() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const getRedirectPathByRole = (role?: string): string => {
    const normalizedRole = role?.toLowerCase();
    if (normalizedRole === 'admin') {
      return '/admin';
    }

    if (normalizedRole === 'owner') {
      return '/owner/home';
    }

    return '/';
  };

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!formData.username.trim() || !formData.password) {
      setErrorMessage('Username and password are required');
      return;
    }

    try {
      setIsSubmitting(true);

      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const loginResult = await loginResponse.json();
      if (!loginResponse.ok) {
        setErrorMessage(loginResult.error || 'Login failed');
        return;
      }

      const token = loginResult?.token as string | undefined;
      const userId = loginResult?.user?.id as number | undefined;
      if (!token || !userId) {
        setErrorMessage('Login response is invalid');
        return;
      }

      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(loginResult.user));

      const directRole = String(loginResult.user?.role || '').toLowerCase();
      if (directRole === 'admin') {
        setSuccessMessage('Login successful. Redirecting to /admin...');
        setTimeout(() => {
          window.location.href = '/admin';
        }, 600);
        return;
      }

      const userResponse = await fetch(`/api/USER/${userId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (userResponse.ok) {
        const userResult = await userResponse.json();
        if (userResult?.user) {
          localStorage.setItem('auth_user', JSON.stringify(userResult.user));
          const redirectPath = getRedirectPathByRole(userResult.user.role);
          setSuccessMessage(`Login successful. Redirecting to ${redirectPath}...`);
          setTimeout(() => {
            window.location.href = redirectPath;
          }, 600);
          return;
        }
      }

      const fallbackRedirectPath = getRedirectPathByRole(loginResult.user?.role);
      setSuccessMessage(`Login successful. Redirecting to ${fallbackRedirectPath}...`);
      setTimeout(() => {
        window.location.href = fallbackRedirectPath;
      }, 600);
    } catch (error) {
      console.error('Login submit error:', error);
      setErrorMessage('Unable to connect to server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialLogin = (provider: string) => {
    // TODO: Implement OAuth flow for each provider
    console.log(`Login with ${provider}`);
  };

  return (
    <div className={`min-h-screen flex overflow-hidden ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-all duration-700 ease-in-out`}>
      {/* Left Section - Welcome Area */}
      <div
        className={`
          hidden md:flex md:w-[45%]
          bg-gradient-to-br from-[#5B7CFF] to-[#4a7bff]
          flex-col items-center justify-center p-12 text-white relative overflow-hidden rounded-r-[15rem]
          transform transition-all duration-700 ease-in-out
          ${isLoaded ? 'translate-x-0 opacity-100' : 'md:-translate-x-full opacity-0'}
        `}
        style={{ willChange: 'transform, opacity' }}
      >
        {/* Decorative Circles */}
        <div
          className={`
            absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full
            -translate-x-1/2 -translate-y-1/2
            transition-all duration-600 ease-out
            ${isLoaded ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        ></div>
        <div
          className={`
            absolute bottom-0 right-0 w-48 h-48 bg-white/10 rounded-full
            translate-x-1/4 translate-y-1/4
            transition-all duration-600 ease-out delay-100
            ${isLoaded ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        ></div>

        <div
          className={`
            relative z-10 text-center
            transition-all duration-500 ease-out delay-200
            ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        >
          <Image
            src="/image/ParkD_White.png"
            alt="ParkD Logo"
            width={160.45}
            height={55.7}
            className={`
              mx-auto mb-6
              transition-all duration-500 ease-out
              ${isLoaded ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
            `}
            style={{ willChange: 'transform, opacity' }}
          />
          <h1 className="text-5xl font-bold mb-4">Welcome to Park:D</h1>
          <p className="text-lg opacity-90 mb-8">Do not have an account?</p>
          <button
            onClick={() => (window.location.href = '/register')}
            className="px-8 py-3 bg-white border-2 border-white text-[#5B7CFF] font-bold rounded-lg
              hover:bg-blue-50 hover:scale-105 hover:shadow-lg
              active:scale-95
              transition-all duration-300 ease-in-out
            "
            style={{ willChange: 'transform' }}
          >
            Register
          </button>
        </div>
      </div>

      {/* Right Section - Login Form */}
      <div
        className={`
          w-full md:w-[55%] bg-white flex flex-col items-center justify-center p-8 md:p-16
          transition-all duration-700 ease-in-out
          ${isLoaded ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        `}
        style={{ willChange: 'transform, opacity' }}
      >
        <div
          className={`
            md:hidden mb-8
            transition-all duration-500 ease-out delay-100
            ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        >
          <Image
            src="/image/ParkD.png"
            alt="ParkD Logo"
            width={140}
            height={49}
            priority
            className="mx-auto"
          />
        </div>
        <h2
          className={`
            text-4xl font-bold text-gray-800 mb-8
            transition-all duration-500 ease-out delay-100
            ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        >
          Login
        </h2>

        <form
          onSubmit={handleLogin}
          className={`
            w-full max-w-md space-y-6
            transition-all duration-500 ease-out delay-200
            ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        >
          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          {/* Username Input */}
          <div className="relative group">
            <input
              type="text"
              placeholder="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
              className="w-full px-5 py-4 bg-gray-100 rounded-xl text-gray-700 placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:bg-white
                focus:shadow-lg
                transition-all duration-300 ease-in-out
                group-hover:bg-gray-50
              "
              style={{ willChange: 'background-color, box-shadow' }}
            />
            <span
              className={`
                absolute right-4 top-1/2 -translate-y-1/2 text-gray-400
                transition-all duration-300 ease-in-out
                group-hover:text-[#5B7CFF] group-hover:scale-110
              `}
              style={{ willChange: 'transform, color' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
          </div>

          {/* Password Input */}
          <div className="relative group">
            <input
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              className="w-full px-5 py-4 bg-gray-100 rounded-xl text-gray-700 placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:bg-white
                focus:shadow-lg
                transition-all duration-300 ease-in-out
                group-hover:bg-gray-50
              "
              style={{ willChange: 'background-color, box-shadow' }}
            />
            <span
              className={`
                absolute right-4 top-1/2 -translate-y-1/2 text-gray-400
                transition-all duration-300 ease-in-out
                group-hover:text-[#5B7CFF] group-hover:scale-110
              `}
              style={{ willChange: 'transform, color' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
          </div>

          {/* Forgot Password Link */}
          <div className="text-center">
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600 hover:underline
                transition-all duration-300 ease-in-out"
            >
              Forgot password?
            </button>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-4 bg-[#5B7CFF] text-white font-bold rounded-xl
              hover:bg-[#4a6bef] hover:scale-[1.02] hover:shadow-xl
              active:scale-95
              disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100
              transition-all duration-300 ease-in-out
            "
            style={{ willChange: 'transform, background-color, box-shadow' }}
          >
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Social Login Divider */}
        <div
          className={`
            w-full max-w-md mt-8
            transition-all duration-500 ease-out delay-300
            ${isLoaded ? 'opacity-100' : 'opacity-0'}
          `}
          style={{ willChange: 'opacity' }}
        >
        </div>

        {/* Social Icons */}
        <div
          className={`
            flex gap-4 mt-6
            transition-all duration-500 ease-out delay-400
            ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        >          
        </div>
      </div>
    </div>
  );
}


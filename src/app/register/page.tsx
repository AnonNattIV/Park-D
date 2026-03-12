'use client';

import { useState, useEffect } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      if (!response.ok) {
        setErrorMessage(result.error || 'Registration failed');
        return;
      }

      const verificationEmail =
        typeof result?.user?.email === 'string' ? result.user.email : formData.email.trim();
      setSuccessMessage('Registration successful. Redirecting to email verification...');
      setTimeout(() => {
        window.location.href = `/verify-email?email=${encodeURIComponent(verificationEmail)}`;
      }, 1200);
    } catch (error) {
      console.error('Register submit error:', error);
      setErrorMessage('Unable to connect to server');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSocialRegister = (provider: string) => {
    // TODO: Implement OAuth flow for each provider
    console.log(`Register with ${provider}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br bg-gray-50 flex items-center justify-center p-4">
      {/* Glass Card Container */}
      <div
        className={`
          w-full max-w-4xl flex flex-col md:flex-row-reverse
          backdrop-blur-xl bg-white/20 border border-white/20
          shadow-2xl rounded-3xl overflow-hidden
          transition-all duration-500 ease-in-out
          ${isLoaded ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8'}
        `}
      >
        {/* Welcome Section - Left Section (Top on mobile) */}
        <div
          className={`
            flex flex-col items-center justify-center
            w-full md:w-[45%]
            bg-gradient-to-br from-[#5B7CFF] to-[#4a7bff]
            text-white relative overflow-hidden
            rounded-b-[10rem] md:rounded md:rounded-l-[12rem]
            p-8 md:p-12
            transition-all duration-700 ease-in-out
            ${isLoaded ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-50'}
          `}
        >
          {/* Decorative Circles */}
          <div
            className={`
              absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full
              -translate-x-1/2 -translate-y-1/2
              transition-all duration-600 ease-out
              ${isLoaded ? 'translate-y-0 opacity-100' : '-translate-y-8 opacity-0'}
            `}
          ></div>
          <div
            className={`
              absolute bottom-0 right-0 w-48 h-48 bg-white/10 rounded-full
              translate-x-1/4 translate-y-1/4
              transition-all duration-600 ease-out delay-100
              ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}
            `}
          ></div>

          <div
            className={`
              relative z-10 text-center
              transition-all duration-500 ease-out delay-200
              ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
            `}
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Welcome Back!</h1>
            <p className="text-lg opacity-90 mb-8">Already have an account?</p>
            <button
              onClick={() => (window.location.href = '/login')}
              className="px-8 py-3 bg-transparent border-2 border-white text-white font-bold rounded-xl
                hover:bg-white hover:text-[#5B7CFF] hover:scale-105 hover:shadow-lg
                active:scale-95
                transition-all duration-300 ease-in-out
              "
            >
              Login
            </button>
          </div>
        </div>

        {/* Registration Form - Right Section (Bottom on mobile) */}
        <div
          className={`
            w-full md:w-[55%] bg-white/10 backdrop-blur-sm
            flex flex-col items-center justify-center
            p-8 md:p-12
            transition-all duration-700 ease-in-out
            ${isLoaded ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}
          `}
        >
          <div
            className={`
              md:hidden mb-6
              transition-all duration-500 ease-out delay-100
              ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
            `}
          >
            <h2
              className={`
                text-3xl md:text-4xl font-bold text-gray-800 mb-2
                transition-all duration-500 ease-out delay-100
                ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
              `}
            >
              Registration
            </h2>
          </div>
          <h2
            className={`
              hidden md:block text-3xl md:text-4xl font-bold text-gray-800 mb-8
              transition-all duration-500 ease-out delay-100
              ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
            `}
          >
            Registration
          </h2>

          <form
            onSubmit={handleRegister}
            className={`
              w-full max-w-md space-y-5
              transition-all duration-500 ease-out delay-200
              ${isLoaded ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
            `}
          >
            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50/80 backdrop-blur-sm px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="rounded-xl border border-green-200 bg-green-50/80 backdrop-blur-sm px-4 py-3 text-sm text-green-700">
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
                className="w-full px-5 py-4 bg-white/60 backdrop-blur-sm rounded-xl text-gray-700 placeholder-gray-400 border border-white/30
                  focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:bg-white/90
                  focus:shadow-lg
                  transition-all duration-300 ease-in-out
                  group-hover:bg-white/70
                "
              />
              <span
                className={`
                  absolute right-4 top-1/2 -translate-y-1/2 text-gray-400
                  transition-all duration-300 ease-in-out
                  group-hover:text-[#5B7CFF] group-hover:scale-110
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
            </div>

            {/* Email Input */}
            <div className="relative group">
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full px-5 py-4 bg-white/60 backdrop-blur-sm rounded-xl text-gray-700 placeholder-gray-400 border border-white/30
                  focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:bg-white/90
                  focus:shadow-lg
                  transition-all duration-300 ease-in-out
                  group-hover:bg-white/70
                "
              />
              <span
                className={`
                  absolute right-4 top-1/2 -translate-y-1/2 text-gray-400
                  transition-all duration-300 ease-in-out
                  group-hover:text-[#5B7CFF] group-hover:scale-110
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
            </div>

            {/* Password Input */}
            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="w-full px-5 py-4 pr-14 bg-white/60 backdrop-blur-sm rounded-xl text-gray-700 placeholder-gray-400 border border-white/30
                  focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:bg-white/90
                  focus:shadow-lg
                  transition-all duration-300 ease-in-out
                  group-hover:bg-white/70
                "
              />
              <button
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
                className={`
                  absolute inset-y-0 right-4 flex items-center text-gray-400
                  transition-all duration-300 ease-in-out
                  group-hover:text-[#5B7CFF] group-hover:scale-110
                `}
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Confirm Password Input */}
            <div className="relative group">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                className="w-full px-5 py-4 pr-14 bg-white/60 backdrop-blur-sm rounded-xl text-gray-700 placeholder-gray-400 border border-white/30
                  focus:outline-none focus:ring-2 focus:ring-[#5B7CFF] focus:bg-white/90
                  focus:shadow-lg
                  transition-all duration-300 ease-in-out
                  group-hover:bg-white/70
                "
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className={`
                  absolute inset-y-0 right-4 flex items-center text-gray-400
                  transition-all duration-300 ease-in-out
                  group-hover:text-[#5B7CFF] group-hover:scale-110
                `}
              >
                {showConfirmPassword ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Register Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-gradient-to-r from-[#5B7CFF] to-[#4a7bff] text-white font-bold rounded-xl
                hover:from-[#4a6bef] hover:to-[#3a5adf] hover:scale-[1.02] hover:shadow-xl
                active:scale-95
                disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100
                transition-all duration-300 ease-in-out
              "
            >
              {isSubmitting ? 'Registering...' : 'Register'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

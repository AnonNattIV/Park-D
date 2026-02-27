'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function LoginPage() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Connect to your authentication API
    console.log('Login attempt:', formData);
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
          flex-col items-center justify-center p-12 text-white relative overflow-hidden
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
            src="/image/ParkD_white.png"
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
          {/* Username Input */}
          <div className="relative group">
            <input
              type="text"
              placeholder="Username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
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
            className="w-full py-4 bg-[#5B7CFF] text-white font-bold rounded-xl
              hover:bg-[#4a6bef] hover:scale-[1.02] hover:shadow-xl
              active:scale-95
              transition-all duration-300 ease-in-out
            "
            style={{ willChange: 'transform, background-color, box-shadow' }}
          >
            Login
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

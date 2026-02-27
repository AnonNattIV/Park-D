'use client';

import { useState, useEffect } from 'react';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match!');
      return;
    }

    if (formData.password.length < 8) {
      alert('Password must be at least 8 characters!');
      return;
    }

    // TODO: Connect to your registration API
    console.log('Registration attempt:', formData);
  };

  const handleSocialRegister = (provider: string) => {
    // TODO: Implement OAuth flow for each provider
    console.log(`Register with ${provider}`);
  };

  return (
    <div className={`min-h-screen flex relative bg-[#f0f4f8] ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-all duration-700 ease-in-out`}>
      {/* Left Column - Registration Form */}
      <div
        className={`
          w-full md:w-[45%] bg-white flex flex-col items-center justify-center p-8 md:p-16
          relative z-10 transition-all duration-700 ease-in-out
          ${isLoaded ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}
        `}
        style={{ willChange: 'transform, opacity' }}
      >
        <h2
          className={`
            text-4xl font-bold text-gray-800 mb-8
            transition-all duration-500 ease-out delay-100
            ${isLoaded ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        >
          Registration
        </h2>

        <form
          onSubmit={handleRegister}
          className={`
            w-full max-w-md space-y-6
            transition-all duration-500 ease-out delay-200
            ${isLoaded ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}
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
              className="w-full px-5 py-4 bg-[#f0f4f8] rounded-xl text-gray-700 placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-[#4a7bff] focus:bg-white
                focus:shadow-lg
                transition-all duration-300 ease-in-out
                group-hover:bg-[#e8f0fa]
              "
              style={{ willChange: 'background-color, box-shadow' }}
            />
            <span
              className={`
                absolute right-4 top-1/2 -translate-y-1/2 text-gray-400
                transition-all duration-300 ease-in-out
                group-hover:text-[#4a7bff] group-hover:scale-110
              `}
              style={{ willChange: 'transform, color' }}
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
              className="w-full px-5 py-4 bg-[#f0f4f8] rounded-xl text-gray-700 placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-[#4a7bff] focus:bg-white
                focus:shadow-lg
                transition-all duration-300 ease-in-out
                group-hover:bg-[#e8f0fa]
              "
              style={{ willChange: 'background-color, box-shadow' }}
            />
            <span
              className={`
                absolute right-4 top-1/2 -translate-y-1/2 text-gray-400
                transition-all duration-300 ease-in-out
                group-hover:text-[#4a7bff] group-hover:scale-110
              `}
              style={{ willChange: 'transform, color' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
              className="w-full px-5 py-4 bg-[#f0f4f8] rounded-xl text-gray-700 placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-[#4a7bff] focus:bg-white
                focus:shadow-lg
                transition-all duration-300 ease-in-out
                group-hover:bg-[#e8f0fa]
              "
              style={{ willChange: 'background-color, box-shadow' }}
            />
            <span
              className={`
                absolute right-4 top-1/2 -translate-y-1/2 text-gray-400
                transition-all duration-300 ease-in-out
                group-hover:text-[#4a7bff] group-hover:scale-110
              `}
              style={{ willChange: 'transform, color' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
          </div>

          {/* Confirm Password Input */}
          <div className="relative group">
            <input
              type="password"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="w-full px-5 py-4 bg-[#f0f4f8] rounded-xl text-gray-700 placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-[#4a7bff] focus:bg-white
                focus:shadow-lg
                transition-all duration-300 ease-in-out
                group-hover:bg-[#e8f0fa]
              "
              style={{ willChange: 'background-color, box-shadow' }}
            />
            <span
              className={`
                absolute right-4 top-1/2 -translate-y-1/2 text-gray-400
                transition-all duration-300 ease-in-out
                group-hover:text-[#4a7bff] group-hover:scale-110
              `}
              style={{ willChange: 'transform, color' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0m-6 4h16m-7 4h7a2 2 0 002-2v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            </span>
          </div>

          {/* Register Button */}
          <button
            type="submit"
            className="w-full py-4 bg-[#4a7bff] text-white font-bold rounded-xl
              hover:bg-[#3a6bef] hover:scale-[1.02] hover:shadow-xl
              active:scale-95
              transition-all duration-300 ease-in-out
            "
            style={{ willChange: 'transform, background-color, box-shadow' }}
          >
            Register
          </button>
        </form>
      </div>

      {/* Right Column - Welcome Section */}
      <div
        className={`
          hidden md:flex md:w-[55%] bg-[#4a7bff]
          flex-col items-center justify-center p-12 text-white relative overflow-hidden
          transition-all duration-700 ease-in-out
          ${isLoaded ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        `}
        style={{ willChange: 'transform, opacity' }}
      >
        {/* Decorative Circles */}
        <div
          className={`
            absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-[500px] h-[500px] bg-white/10 rounded-full
            transition-all duration-600 ease-out
            ${isLoaded ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
          `}
          style={{ willChange: 'transform, opacity' }}
        ></div>
        <div
          className={`
            absolute top-1/3 right-1/4
            w-32 h-32 bg-white/5 rounded-full
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
          <h1 className="text-5xl font-bold mb-4">Welcome Back!</h1>
          <p className="text-lg opacity-90 mb-8">Already have an account?</p>
          <button
            onClick={() => (window.location.href = '/login')}
            className="px-8 py-3 bg-white text-[#4a7bff] font-bold rounded-lg
              hover:bg-blue-50 hover:scale-105 hover:shadow-lg
              active:scale-95
              transition-all duration-300 ease-in-out
            "
            style={{ willChange: 'transform' }}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}

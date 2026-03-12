'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [sendCodeCooldownSeconds, setSendCodeCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (sendCodeCooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setSendCodeCooldownSeconds((previous) => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [sendCodeCooldownSeconds]);

  const handleRequestCode = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!identifier.trim()) {
      setErrorMessage('Email or username is required');
      return;
    }
    if (sendCodeCooldownSeconds > 0) {
      setErrorMessage(`Please wait ${sendCodeCooldownSeconds}s before requesting a new code`);
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      };

      if (!response.ok) {
        if (response.status === 429 && Number(result.retryAfterSeconds || 0) > 0) {
          setSendCodeCooldownSeconds(Number(result.retryAfterSeconds || 0));
        }
        throw new Error(result.error || 'Unable to request reset code');
      }

      setRequested(true);
      setSendCodeCooldownSeconds(Math.max(Number(result.retryAfterSeconds || 60), 60));
      setSuccessMessage(result.message || 'Reset code sent. Please check your email.');
    } catch (error) {
      console.error('Forgot password request failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to request reset code');
    } finally {
      setIsSending(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!identifier.trim() || !code.trim() || !newPassword || !confirmPassword) {
      setErrorMessage('Email/username, code, and password fields are required');
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: identifier.trim(),
          code: code.trim(),
          newPassword,
          confirmPassword,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || 'Unable to reset password');
      }

      setSuccessMessage(result.message || 'Password reset successful. You can login now.');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        router.push('/login');
      }, 1200);
    } catch (error) {
      console.error('Reset password failed:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Forgot Password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Request a reset code and set a new password.
        </p>

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email or Username
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
              placeholder="your@email.com or your_username"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              void handleRequestCode();
            }}
            disabled={isSending || sendCodeCooldownSeconds > 0}
            className="w-full rounded-lg border border-[#5B7CFF] bg-white px-4 py-2 text-sm font-semibold text-[#5B7CFF] transition hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending
              ? 'Sending...'
              : sendCodeCooldownSeconds > 0
                ? `Send again in ${sendCodeCooldownSeconds}s`
                : 'Send Reset Code'}
          </button>

          {requested ? (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Reset Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                  placeholder="6-digit code"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleResetPassword();
                }}
                disabled={isResetting}
                className="w-full rounded-lg bg-[#5B7CFF] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4a6bef] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResetting ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-5 text-center text-sm">
          <Link href="/login" className="font-semibold text-[#5B7CFF] hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function VerifyEmailPage() {
  const router = useRouter();
  const autoVerifyTriggeredRef = useRef(false);

  const [email, setEmail] = useState('');
  const [verificationCodeFromLink, setVerificationCodeFromLink] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const verifyEmail = useCallback(
    async (targetEmail: string, verificationCode: string, fromLink: boolean) => {
      setErrorMessage('');
      setSuccessMessage('');
      setIsVerifying(true);

      try {
        const response = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: targetEmail,
            code: verificationCode,
          }),
        });

        const result = (await response.json()) as {
          success?: boolean;
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(
            result.error ||
              (fromLink
                ? 'Verification link is invalid or expired. Please resend verification email.'
                : 'Unable to verify email')
          );
        }

        setSuccessMessage(
          result.message ||
            (fromLink
              ? 'Email verified from validation link. Redirecting to login...'
              : 'Email verified successfully.')
        );
        setTimeout(() => {
          router.push('/login');
        }, 1200);
      } catch (error) {
        console.error('Verify email failed:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Unable to verify email right now');
      } finally {
        setIsVerifying(false);
      }
    },
    [router]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const queryEmail = (params.get('email') || '').trim().toLowerCase();
    const queryCode = (params.get('code') || '').trim();

    if (queryEmail) {
      setEmail(queryEmail);
    }
    if (queryCode) {
      setVerificationCodeFromLink(queryCode);
    }
  }, []);

  useEffect(() => {
    if (resendCooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendCooldownSeconds((previous) => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [resendCooldownSeconds]);

  useEffect(() => {
    if (autoVerifyTriggeredRef.current) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    const hasCodeInQuery = Boolean(new URLSearchParams(window.location.search).get('code'));
    if (!hasCodeInQuery || !email.trim() || !verificationCodeFromLink.trim()) {
      return;
    }

    autoVerifyTriggeredRef.current = true;
    void verifyEmail(email.trim().toLowerCase(), verificationCodeFromLink.trim(), true);
  }, [email, verificationCodeFromLink, verifyEmail]);

  const handleResend = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!email.trim()) {
      setErrorMessage('Email is required');
      return;
    }

    setIsResending(true);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        retryAfterSeconds?: number;
      };

      if (!response.ok) {
        if (response.status === 429 && Number(result.retryAfterSeconds || 0) > 0) {
          setResendCooldownSeconds(Number(result.retryAfterSeconds || 0));
        }
        throw new Error(result.error || 'Unable to resend verification email');
      }

      setSuccessMessage(result.message || 'Verification email sent.');
      setResendCooldownSeconds(
        Math.max(Number(result.retryAfterSeconds || 60), resendCooldownSeconds)
      );
    } catch (error) {
      console.error('Resend verification failed:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to resend verification email right now'
      );
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Verify Email</h1>
        <p className="mt-1 text-sm text-slate-500">
          Verify by clicking the validation link in your email.
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#5B7CFF] focus:outline-none focus:ring-2 focus:ring-[#5B7CFF]/20"
              placeholder="your@email.com"
            />
          </div>

          {isVerifying ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Verifying link...
            </div>
          ) : null}

          {!verificationCodeFromLink ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Open this page from the verification link in your email.
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void handleResend();
            }}
            disabled={isResending || resendCooldownSeconds > 0}
            className="w-full rounded-lg border border-[#5B7CFF] bg-white px-4 py-2 text-sm font-semibold text-[#5B7CFF] transition hover:bg-[#EEF2FF] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResending
              ? 'Sending...'
              : resendCooldownSeconds > 0
                ? `Resend in ${resendCooldownSeconds}s`
                : 'Resend Verification Email'}
          </button>
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

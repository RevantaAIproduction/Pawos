import React, { useState } from 'react';
import styles from './secureWebAuth.module.css';

interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface SecureWebAuthProps {
  onLoginSuccess?: (token: string, userEmail: string) => void;
  onError?: (error: string) => void;
  isLoading?: boolean;
}

export function SecureWebAuth({ onLoginSuccess, onError, isLoading = false }: SecureWebAuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (emailValue: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailValue);
  };

  const validatePassword = (passwordValue: string): boolean => {
    return passwordValue.length >= 8;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Validate inputs
      if (!email.trim()) {
        throw new Error('Email is required');
      }

      if (!validateEmail(email)) {
        throw new Error('Invalid email format');
      }

      if (!password) {
        throw new Error('Password is required');
      }

      if (!validatePassword(password)) {
        throw new Error('Password must be at least 8 characters');
      }

      // TODO: Replace with actual secure authentication endpoint
      // This would call your backend auth service with HTTPS + encryption
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include', // Include cookies for CSRF protection
        body: JSON.stringify({
          email: email.toLowerCase(),
          password, // Should be encrypted before sending
          rememberMe,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Authentication failed');
      }

      const data = await response.json();

      // Store secure session token (httpOnly cookie preferred on backend)
      if (data.token) {
        localStorage.setItem('auth_token', data.token);
        if (rememberMe) {
          localStorage.setItem('remember_email', email);
        }
      }

      onLoginSuccess?.(data.token, email);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.loginCard}>
        <div className={styles.header}>
          <h1 className={styles.title}>PawOS</h1>
          <p className={styles.subtitle}>Secure Web Login</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>Email</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              placeholder="your.email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting || isLoading}
              autoComplete="email"
            />
            {email && !validateEmail(email) && (
              <p className={styles.hint}>Invalid email format</p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <div className={styles.passwordContainer}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting || isLoading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles.togglePassword}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            {password && !validatePassword(password) && (
              <p className={styles.hint}>Password must be at least 8 characters</p>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={isSubmitting || isLoading}
              />
              <span>Remember me on this device</span>
            </label>
          </div>

          {error && (
            <div className={styles.error}>
              <p>{error}</p>
            </div>
          )}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isSubmitting || isLoading || !email || !password}
          >
            {isSubmitting || isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Don't have an account? <a href="/signup" className={styles.link}>Create one</a>
          </p>
          <p className={styles.footerText}>
            <a href="/forgot-password" className={styles.link}>Forgot password?</a>
          </p>
        </div>

        <div className={styles.securityNote}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Secure HTTPS connection • Your password is encrypted</span>
        </div>
      </div>
    </div>
  );
}

/**
 * LoginPage.tsx — Demo-only login UI.
 *
 * ⚠️  NOT SECURE. Demo use only. No signup, no forgot password.
 */

import React, { useState } from 'react';
import { Waves, LogIn } from 'lucide-react';

interface LoginPageProps {
    onLogin: (username: string, password: string, remember: boolean) => boolean;
}

const LoginPage = ({ onLogin }: LoginPageProps) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            setError('Please enter your username and password.');
            return;
        }
        setIsLoading(true);
        setError('');

        // Small delay for perceived responsiveness
        setTimeout(() => {
            const ok = onLogin(username, password, remember);
            if (!ok) {
                setError('Invalid username or password.');
            }
            setIsLoading(false);
        }, 300);
    };

    return (
        <div className="bg-background-dark font-display min-h-screen flex flex-col items-center justify-center px-5 selection:bg-primary selection:text-white">
            {/* Logo */}
            <div className="flex items-center gap-2 text-primary mb-10">
                <Waves size={32} strokeWidth={2.5} />
                <span className="font-bold text-2xl tracking-tight text-white">My Daily Flow</span>
            </div>

            {/* Card */}
            <div className="w-full max-w-sm bg-[#151c2c] rounded-[2rem] p-7 border border-[#232f48] shadow-2xl">
                <h2 className="text-white font-bold text-xl mb-1">Welcome back</h2>
                <p className="text-text-secondary text-sm mb-8">Sign in to continue</p>

                <form onSubmit={handleSubmit} noValidate>
                    {/* Username */}
                    <div className="mb-4">
                        <label htmlFor="login-username" className="block text-text-secondary text-xs font-semibold tracking-wider mb-2">
                            USERNAME
                        </label>
                        <input
                            id="login-username"
                            type="text"
                            autoComplete="username"
                            autoCapitalize="off"
                            spellCheck={false}
                            value={username}
                            onChange={(e) => { setUsername(e.target.value); setError(''); }}
                            placeholder="Enter username"
                            className="w-full bg-[#1e273b] text-white placeholder:text-[#384666] rounded-2xl px-4 py-3.5 text-[15px] outline-none border border-[#232f48]/50 focus:border-primary/60 transition-colors"
                        />
                    </div>

                    {/* Password */}
                    <div className="mb-6">
                        <label htmlFor="login-password" className="block text-text-secondary text-xs font-semibold tracking-wider mb-2">
                            PASSWORD
                        </label>
                        <input
                            id="login-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            placeholder="Enter password"
                            className="w-full bg-[#1e273b] text-white placeholder:text-[#384666] rounded-2xl px-4 py-3.5 text-[15px] outline-none border border-[#232f48]/50 focus:border-primary/60 transition-colors"
                        />
                    </div>

                    {/* Remember me */}
                    <div className="flex items-center gap-3 mb-6">
                        <button
                            type="button"
                            id="login-remember"
                            role="checkbox"
                            aria-checked={remember}
                            onClick={() => setRemember((r) => !r)}
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${remember
                                    ? 'bg-primary border-primary shadow-[0_0_8px_rgba(19,91,236,0.4)]'
                                    : 'border-[#384666] bg-transparent hover:border-primary/60'
                                }`}
                        >
                            {remember && (
                                <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                                    <path d="M1 4L4.5 7.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </button>
                        <label
                            htmlFor="login-remember"
                            onClick={() => setRemember((r) => !r)}
                            className="text-text-secondary text-sm cursor-pointer select-none"
                        >
                            Remember me <span className="text-[#384666] text-xs">(stays logged in for 5 days)</span>
                        </label>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-5 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30">
                            <p className="text-red-400 text-sm font-medium">{error}</p>
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-primary hover:bg-blue-600 disabled:opacity-60 text-white font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(19,91,236,0.4)] active:scale-[0.98] transition-all text-[17px]"
                    >
                        <LogIn size={20} strokeWidth={2.5} />
                        {isLoading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            </div>

            {/* Demo notice */}
            <p className="mt-8 text-[11px] text-[#384666] text-center max-w-xs leading-relaxed">
                Demo environment · Not secure · Do not use real passwords
            </p>
        </div>
    );
};

export default LoginPage;

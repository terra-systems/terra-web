'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { initiateGitHubOAuth, getGitHubToken } from '@/lib/github';

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    // If user is already authenticated, redirect to repos
    const token = getGitHubToken();
    if (token) {
      router.push('/auth/github');
    }
  }, [router]);

  const handleGitHubConnect = () => {
    initiateGitHubOAuth();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="glass-panel max-w-2xl w-full p-12 text-center">
        <h1 className="text-6xl font-bold text-white mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Terra
        </h1>
        <p className="text-xl text-gray-300 mb-8">
          Connect your GitHub repo, visualize your infrastructure, and deploy with AI-powered configurations
        </p>
        <div className="space-y-4">
          <button
            onClick={handleGitHubConnect}
            className="btn-primary px-8 py-4 text-lg font-semibold"
          >
            Connect with GitHub
          </button>
          <p className="text-sm text-gray-400">
            Analyze your codebase • Generate Terraform configs • Deploy to GCP, AWS, or Azure
          </p>
        </div>
      </div>
    </div>
  );
}

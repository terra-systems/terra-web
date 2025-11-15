'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getGitHubRepos, getGitHubToken, GitHubRepo, clearGitHubToken } from '@/lib/github';

export default function GitHubAuthPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getGitHubToken();
    if (!token) {
      // No token, redirect to landing page
      router.push('/');
      return;
    }

    // Fetch real repositories from GitHub
    const fetchRepos = async () => {
      try {
        const repositories = await getGitHubRepos();
        setRepos(repositories);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching repos:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch repositories');
        setLoading(false);

        // Clear token if unauthorized
        if (err instanceof Error && err.message.includes('401')) {
          clearGitHubToken();
          setTimeout(() => router.push('/'), 2000);
        }
      }
    };

    fetchRepos();
  }, [router]);

  const handleSelectRepo = async (repoFullName: string) => {
    setSelectedRepo(repoFullName);

    const [owner, name] = repoFullName.split('/');

    try {
      // Create project with selected repo
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          repo_url: `https://github.com/${repoFullName}`,
          repo_full_name: repoFullName,
          provider: 'gcp'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const project = await response.json();

      // Trigger analysis with GitHub token
      const token = getGitHubToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${project.id}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Token': token || ''
        },
        body: JSON.stringify({
          repo_full_name: repoFullName,
        }),
      });

      // Navigate to project
      router.push(`/project/${project.id}`);
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setSelectedRepo('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="glass-panel p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="text-white mt-4">Connecting to GitHub...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="glass-panel p-8 mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Select a Repository</h1>
          <p className="text-gray-300">Choose a repository to analyze and generate infrastructure configs</p>
        </div>

        {error && (
          <div className="glass-panel p-4 mb-4 bg-red-500/20 border border-red-500">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {repos.length === 0 && !error && (
            <div className="glass-panel p-8 text-center">
              <p className="text-gray-400">No repositories found. Make sure you have repositories in your GitHub account.</p>
            </div>
          )}

          {repos.map((repo) => (
            <button
              key={repo.id}
              onClick={() => handleSelectRepo(repo.full_name)}
              disabled={selectedRepo === repo.full_name}
              className="glass-panel p-6 w-full text-left hover:bg-white/20 transition-all duration-200 disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-2">{repo.full_name}</h3>
                  <p className="text-gray-300">{repo.description || 'No description'}</p>
                  {selectedRepo === repo.full_name && (
                    <p className="text-blue-400 mt-2">Analyzing repository...</p>
                  )}
                </div>
                {repo.private && (
                  <span className="ml-4 px-3 py-1 bg-yellow-500/20 text-yellow-400 text-sm rounded-full">Private</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// GitHub OAuth and API utilities

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  default_branch: string;
  private: boolean;
}

export interface GitHubFile {
  name: string;
  path: string;
  content?: string;
  sha: string;
  type?: string;
  encoding?: string;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
  };
}

// Store GitHub token (in production, use httpOnly cookies or secure storage)
export function setGitHubToken(token: string) {
  localStorage.setItem('github_token', token);
}

export function getGitHubToken(): string | null {
  return localStorage.getItem('github_token');
}

export function clearGitHubToken() {
  localStorage.removeItem('github_token');
}

// Initiate GitHub OAuth flow
export function initiateGitHubOAuth() {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI || `${window.location.origin}/auth/callback`;
  const scope = 'repo,user';

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
  window.location.href = authUrl;
}

// GitHub API helper
async function githubApi(endpoint: string, options: RequestInit = {}) {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('No GitHub token found');
  }

  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return response.json();
}

// Get authenticated user
export async function getGitHubUser(): Promise<GitHubUser> {
  return githubApi('/user');
}

// Get user repositories
export async function getGitHubRepos(): Promise<GitHubRepo[]> {
  return githubApi('/user/repos?sort=updated&per_page=100');
}

// Get repository branches
export async function getRepoBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
  return githubApi(`/repos/${owner}/${repo}/branches`);
}

// Get file from repository
export async function getRepoFile(owner: string, repo: string, path: string, branch?: string): Promise<GitHubFile> {
  const ref = branch ? `?ref=${branch}` : '';
  const data = await githubApi(`/repos/${owner}/${repo}/contents/${path}${ref}`);

  // Decode base64 content
  if (data.content && data.encoding === 'base64') {
    data.content = atob(data.content);
  }

  return data;
}

// Get directory contents
export async function getRepoContents(owner: string, repo: string, path: string = '', branch?: string): Promise<GitHubFile[]> {
  const ref = branch ? `?ref=${branch}` : '';
  return githubApi(`/repos/${owner}/${repo}/contents/${path}${ref}`);
}

// Update file in repository
export async function updateRepoFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha: string,
  branch: string
): Promise<any> {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('No GitHub token found');
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: btoa(content), // Base64 encode content
      sha,
      branch,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to update file: ${response.statusText}`);
  }

  return response.json();
}

// Create a new branch
export async function createBranch(
  owner: string,
  repo: string,
  newBranchName: string,
  fromBranch: string
): Promise<GitHubBranch> {
  const token = getGitHubToken();
  if (!token) {
    throw new Error('No GitHub token found');
  }

  // First, get the SHA of the from branch
  const fromBranchData = await githubApi(`/repos/${owner}/${repo}/git/refs/heads/${fromBranch}`);
  const sha = fromBranchData.object.sha;

  // Create the new branch
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: `refs/heads/${newBranchName}`,
      sha,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create branch: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    name: newBranchName,
    commit: { sha: data.object.sha },
  };
}

// Analyze repository for infrastructure files
export interface RepoAnalysis {
  hasDockerCompose: boolean;
  hasDockerfile: boolean;
  hasTerraform: boolean;
  hasKubernetes: boolean;
  dockerComposeFile?: GitHubFile;
  dockerfiles: GitHubFile[];
  terraformFiles: GitHubFile[];
  kubernetesFiles: GitHubFile[];
}

export async function analyzeRepository(owner: string, repo: string, branch?: string): Promise<RepoAnalysis> {
  const analysis: RepoAnalysis = {
    hasDockerCompose: false,
    hasDockerfile: false,
    hasTerraform: false,
    hasKubernetes: false,
    dockerfiles: [],
    terraformFiles: [],
    kubernetesFiles: [],
  };

  try {
    // Get root directory contents
    const rootContents = await getRepoContents(owner, repo, '', branch);

    for (const file of rootContents) {
      // Check for docker-compose
      if (file.name.match(/^docker-compose\.(yml|yaml)$/)) {
        analysis.hasDockerCompose = true;
        analysis.dockerComposeFile = await getRepoFile(owner, repo, file.path, branch);
      }

      // Check for Dockerfile
      if (file.name === 'Dockerfile' || file.name.startsWith('Dockerfile.')) {
        analysis.hasDockerfile = true;
        const dockerfileContent = await getRepoFile(owner, repo, file.path, branch);
        analysis.dockerfiles.push(dockerfileContent);
      }

      // Check for Terraform
      if (file.name.endsWith('.tf')) {
        analysis.hasTerraform = true;
        const tfContent = await getRepoFile(owner, repo, file.path, branch);
        analysis.terraformFiles.push(tfContent);
      }

      // Check for Kubernetes
      if (file.name.includes('k8s') || file.name.includes('kubernetes')) {
        analysis.hasKubernetes = true;
        if (file.type === 'file') {
          const k8sContent = await getRepoFile(owner, repo, file.path, branch);
          analysis.kubernetesFiles.push(k8sContent);
        }
      }
    }
  } catch (error) {
    console.error('Error analyzing repository:', error);
  }

  return analysis;
}

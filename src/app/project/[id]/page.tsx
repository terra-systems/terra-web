'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import FileModificationDialog from '@/components/FileModificationDialog';
import { getGitHubToken, getRepoBranches, updateRepoFile, createBranch } from '@/lib/github';

// Node data types
interface NodeData extends Record<string, unknown> {
  label: string;
  type: string;
  details?: string;
  serviceName?: string;
  dockerComposeConfig?: any;
}

// Custom node component
function ServiceNode({ data }: { data: NodeData }) {
  return (
    <div className="node-card border-blue-500 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
        <h3 className="font-semibold text-white">{data.label}</h3>
      </div>
      <p className="text-sm text-gray-300">{data.type}</p>
      {data.details && (
        <p className="text-xs text-gray-400 mt-1">{data.details}</p>
      )}
    </div>
  );
}

function DatabaseNode({ data }: { data: NodeData }) {
  return (
    <div className="node-card border-green-500 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <h3 className="font-semibold text-white">{data.label}</h3>
      </div>
      <p className="text-sm text-gray-300">{data.type}</p>
      {data.details && (
        <p className="text-xs text-gray-400 mt-1">{data.details}</p>
      )}
    </div>
  );
}

function StorageNode({ data }: { data: NodeData }) {
  return (
    <div className="node-card border-purple-500 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
        <h3 className="font-semibold text-white">{data.label}</h3>
      </div>
      <p className="text-sm text-gray-300">{data.type}</p>
      {data.details && (
        <p className="text-xs text-gray-400 mt-1">{data.details}</p>
      )}
    </div>
  );
}

const nodeTypes = {
  service: ServiceNode,
  database: DatabaseNode,
  storage: StorageNode,
};

interface Project {
  id: string;
  name: string;
  repo_url: string;
  repo_full_name: string;
  provider: string;
}

interface FileChange {
  path: string;
  oldContent: string;
  newContent: string;
  description: string;
}

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [activeTab, setActiveTab] = useState<'graph' | 'chat'>('graph');
  const [project, setProject] = useState<Project | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // File modification dialog state
  const [showModificationDialog, setShowModificationDialog] = useState(false);
  const [pendingFileChange, setPendingFileChange] = useState<FileChange | null>(null);
  const [branches, setBranches] = useState<Array<{ name: string }>>([]);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node<NodeData>[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node as Node<NodeData>);
  }, []);

  // Load project and analysis
  useEffect(() => {
    async function loadProjectData() {
      try {
        setAnalysisLoading(true);

        // Load project details
        const projectRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`);
        if (!projectRes.ok) throw new Error('Failed to load project');
        const projectData = await projectRes.json();
        setProject(projectData);

        // Load analysis results
        const analysisRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/analysis`);
        if (!analysisRes.ok) throw new Error('Analysis not found');
        const analysisData = await analysisRes.json();

        if (analysisData.nodes && analysisData.edges) {
          setNodes(analysisData.nodes);
          setEdges(analysisData.edges);
        }

        // Load branches if we have a repo
        if (projectData.repo_full_name) {
          const [owner, repo] = projectData.repo_full_name.split('/');
          try {
            const repoBranches = await getRepoBranches(owner, repo);
            setBranches(repoBranches);
          } catch (err) {
            console.error('Failed to load branches:', err);
          }
        }

        // Add welcome message
        setChatMessages([
          {
            role: 'assistant',
            content: `Hi! I analyzed your repository "${projectData.name}" and created this infrastructure graph. You can ask me to modify resources, add new services, or explain any part of the setup. Try: "Update postgres version to 15" or "Explain the database setup"`,
          },
        ]);

        setAnalysisLoading(false);
      } catch (err) {
        console.error('Error loading project:', err);
        setError(err instanceof Error ? err.message : 'Failed to load project');
        setAnalysisLoading(false);
      }
    }

    loadProjectData();
  }, [projectId, setNodes, setEdges]);

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = chatInput;
    setChatInput('');
    setLoading(true);

    // Add user message
    setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      // Call AI service via backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          message: userMessage,
          context: { nodes, edges, project },
        }),
      });

      if (!response.ok) throw new Error('Chat request failed');

      const data = await response.json();

      // Add AI response
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response || 'I can help you modify your infrastructure. What would you like to change?' },
      ]);

      // Apply any graph changes
      if (data.changes?.nodes) {
        setNodes((nds) => [...nds, ...data.changes.nodes]);
      }
      if (data.changes?.edges) {
        setEdges((eds) => [...eds, ...data.changes.edges]);
      }

      // Check if there's a file modification
      if (data.file_change) {
        setPendingFileChange(data.file_change);
        setShowModificationDialog(true);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleExplainResource = async () => {
    if (!selectedNode) return;

    setActiveTab('chat');
    setChatInput(`Explain the ${selectedNode.data.label} resource`);

    // Trigger send after a small delay to allow UI to update
    setTimeout(() => {
      handleSendMessage();
    }, 100);
  };

  const handleModifyResource = async () => {
    if (!selectedNode) return;

    setActiveTab('chat');
    setChatInput(`How can I modify the ${selectedNode.data.label} configuration?`);

    setTimeout(() => {
      handleSendMessage();
    }, 100);
  };

  const handleCommitChanges = async (
    branch: string,
    createNew: boolean,
    newBranchName?: string
  ) => {
    if (!pendingFileChange || !project) return;

    try {
      const [owner, repo] = project.repo_full_name.split('/');
      let targetBranch = branch;

      // Create new branch if requested
      if (createNew && newBranchName) {
        await createBranch(owner, repo, newBranchName, branch);
        targetBranch = newBranchName;
      }

      // Get current file SHA (you'll need to fetch this)
      const fileResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${pendingFileChange.path}?ref=${targetBranch}`,
        {
          headers: {
            Authorization: `Bearer ${getGitHubToken()}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      if (!fileResponse.ok) throw new Error('Failed to get file');
      const fileData = await fileResponse.json();

      // Update the file
      await updateRepoFile(
        owner,
        repo,
        pendingFileChange.path,
        pendingFileChange.newContent,
        `Update ${pendingFileChange.path}: ${pendingFileChange.description}

🤖 Generated with Terra
https://github.com/terraform-on-cloud/terra`,
        fileData.sha,
        targetBranch
      );

      // Show success message
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `✅ Successfully committed changes to ${targetBranch}! You can view the changes at https://github.com/${owner}/${repo}/tree/${targetBranch}`,
        },
      ]);

      // Close dialog
      setShowModificationDialog(false);
      setPendingFileChange(null);
    } catch (err) {
      console.error('Commit error:', err);
      throw err;
    }
  };

  if (analysisLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="glass-panel p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="text-white mt-4">Loading project and analyzing repository...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="glass-panel max-w-md w-full p-8">
          <h1 className="text-2xl font-bold text-red-400 mb-4">Error Loading Project</h1>
          <p className="text-white mb-6">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="btn-primary px-6 py-2 w-full"
          >
            Go Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="glass-panel p-8">
          <p className="text-white">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
      {/* Header */}
      <div className="glass-panel m-4 p-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          <p className="text-gray-300 text-sm">{project.repo_full_name} • {project.provider}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === 'graph' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-300'
            }`}
          >
            Graph
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === 'chat' ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-300'
            }`}
          >
            Chat
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 m-4 mt-0 glass-panel overflow-hidden flex">
        {activeTab === 'graph' ? (
          <>
            {/* Graph */}
            <div className="flex-1 relative">
              {nodes.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-gray-400 text-lg mb-4">
                      No infrastructure detected in this repository
                    </p>
                    <p className="text-gray-500 text-sm">
                      Make sure your repository has a docker-compose.yml file
                    </p>
                  </div>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  nodeTypes={nodeTypes}
                  fitView
                  className="bg-slate-900/50"
                >
                  <Controls />
                  <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                </ReactFlow>
              )}
            </div>

            {/* Node Inspector */}
            {selectedNode && (
              <div className="w-80 bg-slate-800/50 backdrop-blur-sm border-l border-white/10 p-6 overflow-y-auto">
                <h2 className="text-xl font-bold text-white mb-4">Node Details</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400">Name</label>
                    <p className="text-white font-semibold">{selectedNode.data.label}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Type</label>
                    <p className="text-white">{selectedNode.data.type}</p>
                  </div>
                  {selectedNode.data.details && (
                    <div>
                      <label className="text-sm text-gray-400">Details</label>
                      <p className="text-white">{selectedNode.data.details}</p>
                    </div>
                  )}
                  {selectedNode.data.serviceName && (
                    <div>
                      <label className="text-sm text-gray-400">Service Name</label>
                      <p className="text-white font-mono text-sm">{selectedNode.data.serviceName}</p>
                    </div>
                  )}
                  <button
                    onClick={handleExplainResource}
                    className="btn-primary w-full px-4 py-2 mt-4"
                  >
                    Explain this resource
                  </button>
                  <button
                    onClick={handleModifyResource}
                    className="btn-secondary w-full px-4 py-2"
                  >
                    Modify configuration
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Chat Interface */
          <div className="flex-1 flex flex-col">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] p-4 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/10 text-gray-100'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/10 text-gray-100 p-4 rounded-lg">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-6 border-t border-white/10">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !loading && handleSendMessage()}
                  placeholder="Ask me to modify your infrastructure... (e.g., 'Update postgres to version 15')"
                  className="input-field flex-1"
                  disabled={loading}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={loading || !chatInput.trim()}
                  className="btn-primary px-6 py-2 disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Try: "Update postgres version to 15" or "Explain the database setup"
              </p>
            </div>
          </div>
        )}
      </div>

      {/* File Modification Dialog */}
      {showModificationDialog && pendingFileChange && (
        <FileModificationDialog
          isOpen={showModificationDialog}
          onClose={() => {
            setShowModificationDialog(false);
            setPendingFileChange(null);
          }}
          fileChange={pendingFileChange}
          repoFullName={project.repo_full_name}
          currentBranch={branches[0]?.name || 'main'}
          branches={branches}
          onConfirm={handleCommitChanges}
        />
      )}
    </div>
  );
}

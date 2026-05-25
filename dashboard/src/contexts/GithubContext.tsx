import React, { createContext, useContext, useState, useEffect } from 'react';

interface GithubContextType {
  pat: string;
  setPat: (pat: string) => void;
  dispatchWorkflow: (workflowId: string, inputs: Record<string, string>) => Promise<boolean>;
  getWorkflowRuns: (workflowId?: string) => Promise<any[]>;
}

const GithubContext = createContext<GithubContextType | undefined>(undefined);

const OWNER = 'usermuneeb1';
const REPO = 'Stream-Recorder';

export const GithubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pat, setPatState] = useState<string>(() => {
    return localStorage.getItem('gh_pat') || '';
  });

  const setPat = (newPat: string) => {
    setPatState(newPat);
    if (newPat) {
      localStorage.setItem('gh_pat', newPat);
    } else {
      localStorage.removeItem('gh_pat');
    }
  };

  const dispatchWorkflow = async (workflowId: string, inputs: Record<string, string>) => {
    if (!pat) throw new Error('GitHub PAT not set');
    try {
      const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflowId}/dispatches`, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${pat}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref: 'main', // Defaulting to main branch as requested
          inputs: inputs
        })
      });
      return response.ok;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  const getWorkflowRuns = async (workflowId?: string) => {
    if (!pat) return [];
    try {
      const url = workflowId 
        ? `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflowId}/runs`
        : `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs`;
        
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${pat}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      if (response.ok) {
        const data = await response.json();
        return data.workflow_runs || [];
      }
      return [];
    } catch (error) {
      console.error(error);
      return [];
    }
  };

  return (
    <GithubContext.Provider value={{ pat, setPat, dispatchWorkflow, getWorkflowRuns }}>
      {children}
    </GithubContext.Provider>
  );
};

export const useGithub = () => {
  const context = useContext(GithubContext);
  if (!context) throw new Error('useGithub must be used within GithubProvider');
  return context;
};

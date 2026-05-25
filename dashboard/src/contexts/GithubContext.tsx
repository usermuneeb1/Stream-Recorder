import React, { createContext, useContext, useState, useEffect } from 'react';

interface GithubContextType {
  pat: string;
  setPat: (newPat: string) => Promise<boolean>;
  dispatchWorkflow: (workflowId: string, inputs: Record<string, string>) => Promise<boolean>;
  getWorkflowRuns: (workflowId?: string) => Promise<any[]>;
}

const GithubContext = createContext<GithubContextType>({
  pat: '',
  setPat: async () => false,
  dispatchWorkflow: async () => false,
  getWorkflowRuns: async () => [],
});

const OWNER = 'usermuneeb1';
const REPO = 'Stream-Recorder';

export const GithubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pat, setPatState] = useState<string>(() => {
    return localStorage.getItem('gh_pat') || '';
  });

  const setPat = async (newPat: string): Promise<boolean> => {
    if (!newPat) {
      setPatState('');
      localStorage.removeItem('gh_pat');
      return true;
    }

    try {
      // Validate PAT
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${newPat}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (res.ok) {
        setPatState(newPat);
        localStorage.setItem('gh_pat', newPat);
        return true;
      } else {
        return false;
      }
    } catch (e) {
      return false;
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

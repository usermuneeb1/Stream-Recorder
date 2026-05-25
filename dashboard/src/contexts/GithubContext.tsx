import React, { createContext, useContext, useState, useEffect } from 'react';

interface GithubContextType {
  pat: string;
  setPat: (newPat: string) => Promise<boolean>;
  dispatchWorkflow: (workflowId: string, inputs: Record<string, string>) => Promise<boolean>;
  getWorkflowRuns: (workflowId?: string) => Promise<any[]>;
  addManualEntry: (entry: any) => Promise<boolean>;
}

const GithubContext = createContext<GithubContextType>({
  pat: '',
  setPat: async () => false,
  dispatchWorkflow: async () => false,
  getWorkflowRuns: async () => [],
  addManualEntry: async () => false,
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
          ref: 'master', // Repo default branch
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

  const addManualEntry = async (entry: any): Promise<boolean> => {
    try {
      // 1. Fetch current recordings.json
      const getRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/recordings.json`, {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (!getRes.ok) return false;
      const getJson = await getRes.json();
      
      // decode base64 utf-8 safely
      const text = decodeURIComponent(escape(atob(getJson.content)));
      const recordings = JSON.parse(text);

      // 2. Prepend or Append new entry
      recordings.unshift(entry);

      // 3. Encode and Update
      // encode safely for utf-8
      const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(recordings, null, 2))));
      const putRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/data/recordings.json`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: '📝 Manual Cloud Link Entry from Dashboard',
          content: newContent,
          sha: getJson.sha,
        }),
      });

      return putRes.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  return (
    <GithubContext.Provider value={{ pat, setPat, dispatchWorkflow, getWorkflowRuns, addManualEntry }}>
      {children}
    </GithubContext.Provider>
  );
};

export const useGithub = () => {
  const context = useContext(GithubContext);
  if (!context) throw new Error('useGithub must be used within GithubProvider');
  return context;
};

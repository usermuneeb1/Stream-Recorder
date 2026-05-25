import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { GithubProvider } from './contexts/GithubContext.tsx'
import { HashRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <ThemeProvider>
        <GithubProvider>
          <App />
        </GithubProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>,
)

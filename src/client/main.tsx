import React from 'react'
import ReactDOM from 'react-dom/client'

function App() {
  return (
    <main>
      <h1>OpenClaw AgentOps Console</h1>
      <p>Shared contracts are scaffolded. UI slices land next.</p>
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

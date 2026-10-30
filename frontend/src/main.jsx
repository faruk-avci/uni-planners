import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/schibsted-grotesk/400.css'
import '@fontsource/schibsted-grotesk/500.css'
import '@fontsource/schibsted-grotesk/600.css'
import '@fontsource/schibsted-grotesk/700.css'
import '@fontsource/schibsted-grotesk/800.css'
import App from './App.jsx'
import './analytics.js'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

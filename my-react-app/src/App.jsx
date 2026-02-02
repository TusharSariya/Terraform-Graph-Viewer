import { useState, useEffect } from 'react'
import CanvasPage from './CanvasPage'
import SvgPage from './SvgPage'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [data, setData] = useState([])
  const [currentPage, setCurrentPage] = useState('home')

  useEffect(() => {
    fetch('http://localhost:8000/api/data')
      .then(res => res.json())
      .then(data => setData(data.data))
      .catch(err => console.error("Error fetching data:", err))
  }, [])

  return (
    <>
      <nav style={{ marginBottom: '20px' }}>
        <button onClick={() => setCurrentPage('home')} style={{ marginRight: '10px' }}>Home</button>
        <button onClick={() => setCurrentPage('canvas')} style={{ marginRight: '10px' }}>Canvas Demo</button>
        <button onClick={() => setCurrentPage('svg')}>SVG Demo</button>
      </nav>

      {currentPage === 'home' && (
        <>
          <div>
            <a href="https://vite.dev" target="_blank">
              <img src={viteLogo} className="logo" alt="Vite logo" />
            </a>
            <a href="https://react.dev" target="_blank">
              <img src={reactLogo} className="logo react" alt="React logo" />
            </a>
          </div>
          <h1>Vite + React + Flask</h1>
          <div className="card">
            <button onClick={() => setCount((count) => count + 1)}>
              count is {count}
            </button>
            <p>
              Edit <code>src/App.jsx</code> and save to test HMR
            </p>

            {/* Display Fetched Data */}
            <div style={{ marginTop: '20px', textAlign: 'left' }}>
              <h3>Data from Flask:</h3>
              <ul>
                {data.map(item => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            </div>

          </div>
          <p className="read-the-docs">
            Click on the Vite and React logos to learn more
          </p>
        </>
      )}

      {currentPage === 'canvas' && <CanvasPage />}

      {currentPage === 'svg' && <SvgPage />}
    </>
  )
}

export default App

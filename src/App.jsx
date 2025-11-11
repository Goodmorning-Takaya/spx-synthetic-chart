import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import LiveSP500Canvas from './LiveSP500canvas'

function App() {
  const [count, setCount] = useState(0)

  return <LiveSP500Canvas />;
}

export default App

import { useState } from 'react'
export default function Welcome() {
  const [msg, setMsg] = useState('Hello World!')

  return (
    <>
      <h1>{msg}</h1>
      <input value={msg} onChange={(e) => setMsg(e.target.value)} />
    </>
  )
}

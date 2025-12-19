import { invoke } from "@tauri-apps/api/core"
import { createSignal } from "solid-js"

import "./styles/App.css"

function App() {
  const [greetMsg, setGreetMsg] = createSignal("")
  const [name, setName] = createSignal("")

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name: name() }))
  }

  return (
    <main class="m-0 pt-[20vh] flex flex-col justify-center text-center">
      <h1 class="text-indigo-400 text-center text-2xl"> Welcome to Mind Flayer </h1>

      <form
        class="flex justify-center mt-10"
        onSubmit={e => {
          e.preventDefault()
          greet()
        }}>
        <input
          id="greet-input"
          onChange={e => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <button type="submit">Greet</button>
      </form>
      <p>{greetMsg()}</p>
    </main>
  )
}

export default App

import { A } from "@solidjs/router"
import { invoke } from "@tauri-apps/api/core"
import { createSignal } from "solid-js"

function Home() {
  const [greetMsg, setGreetMsg] = createSignal("")
  const [name, setName] = createSignal("")

  async function greet() {
    setGreetMsg(await invoke("greet", { name: name() }))
  }

  return (
    <main class="m-0 pt-[20vh] flex flex-col justify-center text-center">
      <h1 class="text-indigo-400 text-center text-2xl">Welcome to Mind Flayer</h1>

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

      <nav class="mt-8">
        <A href="/about" class="text-blue-500 hover:text-blue-700">
          Go to About
        </A>
      </nav>
    </main>
  )
}

export default Home

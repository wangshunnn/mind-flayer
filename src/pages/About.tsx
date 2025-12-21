import { A } from "@solidjs/router"

function About() {
  return (
    <main class="m-0 pt-[20vh] flex flex-col justify-center text-center">
      <h1 class="text-indigo-400 text-center text-2xl">About Mind Flayer</h1>
      <p class="mt-4 text-gray-600">
        A powerful open-source cross-platform desktop AI assistant app.
      </p>

      <nav class="mt-8">
        <A href="/" class="text-blue-500 hover:text-blue-700">
          Back to Home
        </A>
      </nav>
    </main>
  )
}

export default About

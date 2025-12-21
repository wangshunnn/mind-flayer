import { Link } from "@tanstack/react-router"

function About() {
  return (
    <main className="m-0 pt-[20vh] flex flex-col justify-center text-center">
      <h1 className="text-indigo-400 text-center text-2xl">About Mind Flayer</h1>
      <p className="mt-4 text-gray-600">
        A powerful open-source cross-platform desktop AI assistant app.
      </p>

      <nav className="mt-8">
        <Link to="/" className="text-blue-500 hover:text-blue-700">
          Back to Home
        </Link>
      </nav>
    </main>
  )
}

export default About
